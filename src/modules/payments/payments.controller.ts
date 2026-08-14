import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { PaymentStatus, PaymentType, UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { RazorpayService } from '../../common/services/razorpay.service';

@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly auditLogService: AuditLogService,
    private readonly razorpayService: RazorpayService,
  ) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Get('admin/payments')
  list(@Query('status') status?: PaymentStatus, @Query('skip') skip?: string, @Query('take') take?: string) {
    return this.paymentsService.list({
      status,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Get('admin/clients/:clientId/payments')
  listForClient(@Param('clientId') clientId: string) {
    return this.paymentsService.listForClient(clientId);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post('admin/clients/:clientId/payments')
  async recordPayment(
    @Param('clientId') clientId: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    const payment = await this.paymentsService.recordPayment(clientId, dto);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'PAYMENT_RECORDED',
      targetType: 'Client',
      targetId: clientId,
      metadata: { paymentId: payment.id, amount: payment.amount.toString(), type: payment.type },
      ipAddress: req.ip,
    });
    return payment;
  }

  @Roles(UserRole.CLIENT)
  @Get('client/payments')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.listForClient(user.clientId!);
  }

  @Roles(UserRole.CLIENT)
  @Get('client/payments/config')
  getCheckoutConfig() {
    return { available: this.razorpayService.isReadyForCheckout(), keyId: this.razorpayService.getPublicKeyId() };
  }

  /**
   * Client self-service purchase of one extra WhatsApp account slot beyond
   * their plan's limit. (Renewals/plan changes go through
   * SubscriptionController instead — that flow also has to extend the
   * subscription dates, not just mark a payment paid.) Effective account
   * limit already counts SUCCESS ADDITIONAL_ACCOUNT payments live
   * (WhatsappAccountsService.getEffectiveLimit), so nothing else needs to
   * happen once this payment clears.
   */
  @Roles(UserRole.CLIENT)
  @Post('client/payments/additional-account/checkout')
  async checkoutAdditionalAccount(@Body() dto: CreateCheckoutDto, @CurrentUser() user: AuthenticatedUser) {
    if (!this.razorpayService.isReadyForCheckout()) {
      throw new BadRequestException('Online payments are not configured yet — contact support.');
    }

    const { payment, finalAmount, currency } = await this.paymentsService.createPendingPayment(
      user.clientId!,
      PaymentType.ADDITIONAL_ACCOUNT,
      undefined,
      dto.voucherCode,
    );
    const order = await this.razorpayService.createOrder({ amountRupees: finalAmount, currency, receipt: payment.id });
    await this.paymentsService.attachOrderId(payment.id, order.id);

    return {
      paymentId: payment.id,
      orderId: order.id,
      amount: finalAmount,
      currency,
      keyId: this.razorpayService.getPublicKeyId(),
    };
  }

  /**
   * Client's browser reports the Razorpay Checkout success callback. The
   * signature is the actual proof of payment here — HMAC-SHA256(order_id|payment_id)
   * signed with the key secret, which only Razorpay could have produced.
   */
  @Roles(UserRole.CLIENT)
  @Post('client/payments/:id/verify')
  async verify(@Param('id') id: string, @Body() dto: VerifyPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    const payment = await this.paymentsService.getOwnedPendingPayment(user.clientId!, id);
    if (payment.gatewayRef !== dto.razorpayOrderId) {
      throw new BadRequestException('This order does not match the pending payment.');
    }

    const valid = this.razorpayService.verifyPaymentSignature(
      dto.razorpayOrderId,
      dto.razorpayPaymentId,
      dto.razorpaySignature,
    );
    if (!valid) {
      await this.paymentsService.markPaymentFailed(user.clientId!, id);
      throw new BadRequestException('Payment verification failed.');
    }

    return this.paymentsService.markPaymentSuccess(id, dto.razorpayPaymentId);
  }
}
