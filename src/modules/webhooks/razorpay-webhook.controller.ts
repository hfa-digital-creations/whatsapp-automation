import { BadRequestException, Controller, Headers, Post, Req } from '@nestjs/common';
import { PaymentType } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { RazorpayService } from '../../common/services/razorpay.service';
import { PaymentsService } from '../payments/payments.service';
import { SubscriptionService } from '../subscription/subscription.service';

/**
 * Server-to-server confirmation from Razorpay, independent of whether the
 * client's browser stayed open long enough to call /verify (e.g. it was
 * closed right after paying). Idempotent with the client-side /verify
 * callback: both only ever act on a payment that's still PENDING, so
 * whichever arrives first wins and the other becomes a no-op.
 */
@Controller('webhooks/razorpay')
export class RazorpayWebhookController {
  constructor(
    private readonly razorpayService: RazorpayService,
    private readonly paymentsService: PaymentsService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Public()
  @Post()
  async handle(@Req() req: any, @Headers('x-razorpay-signature') signature?: string) {
    const rawBody = (req.rawBody as Buffer | undefined)?.toString('utf8') ?? '';
    if (!signature || !this.razorpayService.verifyWebhookSignature(rawBody, signature)) {
      throw new BadRequestException('Invalid webhook signature.');
    }

    const event = req.body;
    if (event?.event === 'payment.captured') {
      const orderId = event.payload?.payment?.entity?.order_id;
      const razorpayPaymentId = event.payload?.payment?.entity?.id;
      if (orderId && razorpayPaymentId) {
        const pending = await this.paymentsService.findPendingByOrderId(orderId);
        if (pending) {
          const updated = await this.paymentsService.markPaymentSuccess(pending.id, razorpayPaymentId);
          if (updated.type === PaymentType.RENEWAL) {
            await this.subscriptionService.applyRenewalIfNeeded(updated);
          }
        }
      }
    }

    return { received: true };
  }
}
