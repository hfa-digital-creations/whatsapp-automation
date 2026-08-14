import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Client, DurationType, Payment, PaymentType, Plan, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { RazorpayService } from '../../common/services/razorpay.service';

export type SubscriptionStatus = 'NOT_ACTIVATED' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED';

const EXPIRING_SOON_WINDOW_DAYS = 7;

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly razorpayService: RazorpayService,
  ) {}

  async getForClient(clientId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, include: { plan: true } });
    if (!client) throw new NotFoundException('Client not found.');
    return {
      plan: client.plan,
      subscriptionStart: client.subscriptionStart,
      subscriptionEnd: client.subscriptionEnd,
      status: this.computeStatus(client),
      remainingDays: this.remainingDays(client),
    };
  }

  /**
   * Client-initiated renewal (spec §20): starts a Razorpay checkout for the
   * renewal amount. The subscription is NOT extended here — only once
   * verifyRenewalPayment confirms the signature, so a client can never grant
   * themselves a free renewal by calling this endpoint alone.
   */
  async createRenewalCheckout(clientId: string, planId: string | undefined, voucherCode: string | undefined) {
    if (!this.razorpayService.isReadyForCheckout()) {
      throw new BadRequestException('Online payments are not configured yet. Please contact support to renew.');
    }

    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found.');

    const targetPlanId = planId ?? client.planId ?? undefined;
    if (!targetPlanId) throw new NotFoundException('No plan selected for renewal.');

    const { payment, finalAmount, currency } = await this.paymentsService.createPendingPayment(
      clientId,
      PaymentType.RENEWAL,
      targetPlanId,
      voucherCode,
    );

    const order = await this.razorpayService.createOrder({
      amountRupees: finalAmount,
      currency,
      receipt: payment.id,
    });
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
   * Verifies the Razorpay checkout.js callback signature, then — and only
   * then — extends the subscription from max(currentExpiry, now). Never
   * simply reset the subscription date (spec §20).
   */
  async verifyRenewalPayment(
    clientId: string,
    params: { paymentId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  ) {
    const payment = await this.paymentsService.getOwnedPendingPayment(clientId, params.paymentId);
    if (payment.gatewayRef !== params.razorpayOrderId) {
      throw new BadRequestException('Order mismatch — cannot verify this payment.');
    }
    const valid = this.razorpayService.verifyPaymentSignature(
      params.razorpayOrderId,
      params.razorpayPaymentId,
      params.razorpaySignature,
    );
    if (!valid) throw new BadRequestException('Payment verification failed.');

    const updated = await this.paymentsService.markPaymentSuccess(payment.id, params.razorpayPaymentId);
    await this.applyRenewalIfNeeded(updated);

    return this.getForClient(clientId);
  }

  /**
   * Extends the subscription for a RENEWAL payment that has already been
   * marked SUCCESS. Split out from verifyRenewalPayment so the Razorpay
   * webhook (which confirms payment independently of whether the client's
   * browser stuck around to call /verify) can apply the same effect —
   * otherwise a payment could clear while the subscription dates never move.
   */
  async applyRenewalIfNeeded(payment: Payment) {
    if (payment.type !== PaymentType.RENEWAL || !payment.planId) return;

    const plan = await this.prisma.plan.findUniqueOrThrow({ where: { id: payment.planId } });
    const client = await this.prisma.client.findUniqueOrThrow({ where: { id: payment.clientId } });

    const renewalStart = this.calculateRenewalStart(client);
    const newEnd = this.calculateEndDate(renewalStart, plan);

    await this.prisma.client.update({
      where: { id: payment.clientId },
      data: {
        planId: plan.id,
        subscriptionStart: client.subscriptionStart ?? renewalStart,
        subscriptionEnd: newEnd,
      },
    });
  }

  /** Marks a declined/abandoned checkout as FAILED — the client retries by starting a fresh checkout. */
  async markCheckoutFailed(clientId: string, paymentId: string) {
    await this.paymentsService.markPaymentFailed(clientId, paymentId);
    return { failed: true };
  }

  /**
   * Adds a plan's duration to a start date. This — not the frontend — is the
   * single source of truth for subscription end dates (spec Rule 3).
   */
  calculateEndDate(startDate: Date, plan: Pick<Plan, 'durationValue' | 'durationType'>): Date {
    const end = new Date(startDate);
    switch (plan.durationType) {
      case DurationType.DAYS:
        end.setDate(end.getDate() + plan.durationValue);
        break;
      case DurationType.MONTHS:
        end.setMonth(end.getMonth() + plan.durationValue);
        break;
      case DurationType.YEARS:
        end.setFullYear(end.getFullYear() + plan.durationValue);
        break;
    }
    return end;
  }

  /**
   * Always computed live from stored dates — never read a cached "is active" flag.
   * Used for every enforcement decision (WhatsApp account limits, feature access).
   */
  computeStatus(client: Pick<Client, 'subscriptionStart' | 'subscriptionEnd'>): SubscriptionStatus {
    if (!client.subscriptionStart || !client.subscriptionEnd) return 'NOT_ACTIVATED';

    const now = new Date();
    if (client.subscriptionEnd < now) return 'EXPIRED';

    const soonThreshold = new Date(now);
    soonThreshold.setDate(soonThreshold.getDate() + EXPIRING_SOON_WINDOW_DAYS);
    if (client.subscriptionEnd <= soonThreshold) return 'EXPIRING_SOON';

    return 'ACTIVE';
  }

  remainingDays(client: Pick<Client, 'subscriptionEnd'>): number | null {
    if (!client.subscriptionEnd) return null;
    const diffMs = client.subscriptionEnd.getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  /**
   * Renewal always extends from the later of (current expiry, now) — spec §20.
   * If already expired, renewal starts fresh from today.
   */
  calculateRenewalStart(client: Pick<Client, 'subscriptionEnd'>): Date {
    const now = new Date();
    if (client.subscriptionEnd && client.subscriptionEnd > now) {
      return client.subscriptionEnd;
    }
    return now;
  }

  /**
   * Daily sweep: flips the display-level User.status to EXPIRED once a
   * subscription lapses. This is a convenience label for admin filtering —
   * every real authorization check calls computeStatus() live, not this field.
   */
  async refreshExpiredClients() {
    const candidates = await this.prisma.client.findMany({
      where: {
        subscriptionEnd: { lt: new Date() },
        user: { status: UserStatus.ACTIVE },
      },
      select: { id: true, userId: true },
    });

    if (candidates.length === 0) return { updated: 0 };

    await this.prisma.user.updateMany({
      where: { id: { in: candidates.map((c) => c.userId) } },
      data: { status: UserStatus.EXPIRED },
    });

    return { updated: candidates.length };
  }
}
