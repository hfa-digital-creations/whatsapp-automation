import { Module } from '@nestjs/common';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { PaymentsModule } from '../payments/payments.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [PaymentsModule, SubscriptionModule],
  controllers: [RazorpayWebhookController],
})
export class WebhooksModule {}
