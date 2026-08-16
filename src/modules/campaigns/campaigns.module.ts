import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CampaignsService } from './campaigns.service';
import { RenewalReminderService } from './renewal-reminder.service';
import { RenewalReminderProcessor } from './renewal-reminder.processor';
import { EnquiryMessageService } from './enquiry-message.service';
import { OffersService } from './offers.service';
import { OfferGroupsService } from './offer-groups.service';
import { OfferSendProcessor } from './offer-send.processor';
import { CampaignsController } from './campaigns.controller';
import { OffersController } from './offers.controller';
import { OfferGroupsController } from './offer-groups.controller';
import { SubscriptionModule } from '../subscription/subscription.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'campaigns' }, { name: 'offers' }),
    SubscriptionModule,
    NotificationsModule,
    AuditLogModule,
  ],
  controllers: [CampaignsController, OffersController, OfferGroupsController],
  providers: [
    CampaignsService,
    RenewalReminderService,
    RenewalReminderProcessor,
    EnquiryMessageService,
    OffersService,
    OfferGroupsService,
    OfferSendProcessor,
  ],
})
export class CampaignsModule implements OnModuleInit {
  constructor(@InjectQueue('campaigns') private readonly campaignsQueue: Queue) {}

  async onModuleInit() {
    // Once daily at 09:00 server time — deduped by jobId so re-deploys don't create extra schedules.
    await this.campaignsQueue.add(
      'renewal-reminders',
      {},
      { repeat: { pattern: '0 9 * * *' }, jobId: 'renewal-reminders-daily' },
    );
  }
}
