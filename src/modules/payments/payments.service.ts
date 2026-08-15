import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentStatus, PaymentType } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { PAYMENT_SUCCEEDED_EVENT } from '../../common/constants';

interface ComputedAmount {
  baseAmount: number;
  finalAmount: number;
  planId: string | null;
  currency: string;
  voucherId: string | null;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vouchersService: VouchersService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Shared by both payment paths: the amount is ALWAYS derived server-side from
   * the plan price / additional-account price, never trusted from the frontend
   * (spec §4, §6). Voucher validity is checked here too, but usage is only
   * recorded once a payment actually succeeds — see markPaymentSuccess.
   */
  private async computeAmount(
    clientId: string,
    type: PaymentType,
    planId: string | undefined,
    voucherCode: string | undefined,
  ): Promise<ComputedAmount> {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, include: { plan: true } });
    if (!client) throw new NotFoundException('Client not found.');

    let baseAmount: number;
    let resolvedPlanId: string | null = null;
    let currency = 'INR';

    if (type === PaymentType.ADDITIONAL_ACCOUNT) {
      if (!client.plan) throw new BadRequestException('Client has no active plan to purchase an add-on account against.');
      baseAmount = Number(client.plan.additionalAccountPrice);
      resolvedPlanId = client.plan.id;
      currency = client.plan.currency;
    } else {
      const plan = await this.prisma.plan.findUnique({ where: { id: planId ?? client.planId ?? undefined } });
      if (!plan) throw new BadRequestException('A valid planId is required for subscription/renewal payments.');
      baseAmount = Number(plan.price);
      resolvedPlanId = plan.id;
      currency = plan.currency;
    }

    let finalAmount = baseAmount;
    let voucherId: string | null = null;

    if (voucherCode) {
      const result = await this.vouchersService.validateAndCalculate(voucherCode, clientId, baseAmount);
      finalAmount = result.finalAmount;
      voucherId = result.voucher.id;
    }

    return { baseAmount, finalAmount, planId: resolvedPlanId, currency, voucherId };
  }

  /**
   * Admin records a payment against a client (manual/offline flow — cash, bank
   * transfer, or anything settled outside Razorpay). The admin is asserting the
   * money was already received, so this marks SUCCESS immediately.
   */
  async recordPayment(clientId: string, dto: RecordPaymentDto) {
    const computed = await this.computeAmount(clientId, dto.type, dto.planId, dto.voucherCode);

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          clientId,
          planId: computed.planId,
          voucherId: computed.voucherId,
          amount: computed.finalAmount,
          currency: computed.currency,
          status: PaymentStatus.SUCCESS,
          type: dto.type,
          gateway: dto.gateway ?? 'MANUAL',
          gatewayRef: dto.gatewayRef,
          requestedActivation: true,
          paidAt: new Date(),
        },
      });

      if (computed.voucherId) {
        await this.vouchersService.recordUsage(computed.voucherId, clientId, computed.finalAmount, tx);
      }

      return created;
    });

    this.events.emit(PAYMENT_SUCCEEDED_EVENT, { paymentId: payment.id });
    return payment;
  }

  /**
   * Creates a PENDING payment ahead of a Razorpay checkout. Voucher usage is
   * NOT recorded yet — only once the checkout is actually verified as paid, so
   * an abandoned checkout doesn't burn the client's voucher allocation.
   */
  async createPendingPayment(clientId: string, type: PaymentType, planId?: string, voucherCode?: string) {
    const computed = await this.computeAmount(clientId, type, planId, voucherCode);

    const payment = await this.prisma.payment.create({
      data: {
        clientId,
        planId: computed.planId,
        voucherId: computed.voucherId,
        amount: computed.finalAmount,
        currency: computed.currency,
        status: PaymentStatus.PENDING,
        type,
        gateway: 'RAZORPAY',
      },
    });

    return { payment, finalAmount: computed.finalAmount, currency: computed.currency };
  }

  /** Attaches the Razorpay order id to a pending payment so verify() can cross-check it later. */
  async attachOrderId(paymentId: string, orderId: string) {
    await this.prisma.payment.update({ where: { id: paymentId }, data: { gatewayRef: orderId } });
  }

  /** Used by the Razorpay webhook to find the payment a server-to-server event refers to. */
  findPendingByOrderId(orderId: string) {
    return this.prisma.payment.findFirst({ where: { gatewayRef: orderId, status: PaymentStatus.PENDING } });
  }

  async getOwnedPendingPayment(clientId: string, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.clientId !== clientId) throw new NotFoundException('Payment not found.');
    if (payment.status !== PaymentStatus.PENDING) throw new BadRequestException('This payment has already been processed.');
    return payment;
  }

  /** Marks a checkout-verified payment SUCCESS and records voucher usage now that it's real. */
  async markPaymentSuccess(paymentId: string, razorpayPaymentId: string) {
    const payment = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.SUCCESS, gatewayRef: razorpayPaymentId, paidAt: new Date(), requestedActivation: true },
      });

      if (updated.voucherId) {
        await this.vouchersService.recordUsage(updated.voucherId, updated.clientId, Number(updated.amount), tx);
      }

      return updated;
    });

    this.events.emit(PAYMENT_SUCCEEDED_EVENT, { paymentId: payment.id });
    return payment;
  }

  /**
   * Marks an abandoned/declined checkout as FAILED so it stops showing as an
   * open PENDING payment — the client retries by starting a fresh checkout,
   * which creates its own new payment + order.
   */
  async markPaymentFailed(clientId: string, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.clientId !== clientId) throw new NotFoundException('Payment not found.');
    if (payment.status !== PaymentStatus.PENDING) return payment;
    return this.prisma.payment.update({ where: { id: paymentId }, data: { status: PaymentStatus.FAILED } });
  }

  listForClient(clientId: string) {
    return this.prisma.payment.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } });
  }

  list(params: { status?: PaymentStatus; skip?: number; take?: number }) {
    const { status, skip = 0, take = 50 } = params;
    return this.prisma.payment.findMany({
      where: { status },
      include: { client: { include: { user: { select: { email: true } } } }, plan: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }
}
