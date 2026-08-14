import { Body, Controller, Get, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { SubscriptionService } from './subscription.service';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

@Controller('client/subscription')
@Roles(UserRole.CLIENT)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionService.getForClient(user.clientId!);
  }

  @Post('checkout')
  checkout(@CurrentUser() user: AuthenticatedUser, @Body() dto: RenewSubscriptionDto) {
    return this.subscriptionService.createRenewalCheckout(user.clientId!, dto.planId, dto.voucherCode);
  }

  @Post('verify')
  verify(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyPaymentDto) {
    return this.subscriptionService.verifyRenewalPayment(user.clientId!, dto);
  }

  @Post('checkout-failed')
  checkoutFailed(@CurrentUser() user: AuthenticatedUser, @Body('paymentId') paymentId: string) {
    return this.subscriptionService.markCheckoutFailed(user.clientId!, paymentId);
  }
}
