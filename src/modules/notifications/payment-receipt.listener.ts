import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/services/prisma.service';
import { NotificationsService } from './notifications.service';
import { PAYMENT_SUCCEEDED_EVENT, PaymentSucceededEvent } from '../../common/constants';

const TYPE_LABEL: Record<string, string> = {
  SUBSCRIPTION: 'Subscription',
  RENEWAL: 'Subscription Renewal',
  ADDITIONAL_ACCOUNT: 'Additional WhatsApp Account',
};

/** Delivers a payment receipt via email + WhatsApp whenever a payment clears — manual or Razorpay-verified alike. */
@Injectable()
export class PaymentReceiptListener {
  private readonly logger = new Logger(PaymentReceiptListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @OnEvent(PAYMENT_SUCCEEDED_EVENT)
  async handle(event: PaymentSucceededEvent) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: event.paymentId },
      include: { client: { include: { user: true } }, plan: true },
    });
    if (!payment) return;

    const { client } = payment;
    const label = TYPE_LABEL[payment.type] ?? payment.type;
    const amount = `${payment.currency} ${Number(payment.amount).toFixed(2)}`;
    // The container runs in UTC regardless of host — toLocaleString needs an explicit
    // timeZone or it silently formats in UTC, showing a time ~5.5 hours off from IST.
    const paidAt = (payment.paidAt ?? new Date()).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    });

    const emailHtml = `
      <p>Hi ${client.businessName},</p>
      <p>We've received your payment. Here's your receipt:</p>
      <table cellpadding="6" style="border-collapse:collapse">
        <tr><td>Receipt No.</td><td><strong>${payment.id}</strong></td></tr>
        <tr><td>Type</td><td>${label}</td></tr>
        ${payment.plan ? `<tr><td>Plan</td><td>${payment.plan.title}</td></tr>` : ''}
        <tr><td>Amount Paid</td><td><strong>${amount}</strong></td></tr>
        <tr><td>Payment Reference</td><td>${payment.gatewayRef ?? '—'}</td></tr>
        <tr><td>Date</td><td>${paidAt}</td></tr>
      </table>
      <p>Thank you for your business.</p>
    `;

    const whatsappMessage =
      `Payment received, ${client.businessName}!\n\n` +
      `Receipt: ${payment.id}\n` +
      `Type: ${label}\n` +
      (payment.plan ? `Plan: ${payment.plan.title}\n` : '') +
      `Amount: ${amount}\n` +
      `Reference: ${payment.gatewayRef ?? '—'}\n` +
      `Date: ${paidAt}\n\n` +
      `Thank you for your business.`;

    const { emailSent, whatsappSent } = await this.notificationsService.sendCustom({
      email: client.user.email,
      phone: client.user.phone,
      subject: `Payment Receipt — ${amount}`,
      emailHtml,
      whatsappMessage,
    });

    await this.notificationsService.notifyInApp(
      client.userId,
      'PAYMENT_RECEIPT',
      'Payment received',
      `${label} payment of ${amount} received successfully.`,
    );

    if (!emailSent && !whatsappSent) {
      this.logger.warn(`Could not deliver payment receipt for payment ${payment.id} via email or WhatsApp.`);
    }
  }
}
