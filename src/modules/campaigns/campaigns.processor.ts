import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RenewalReminderService } from './renewal-reminder.service';
import { EnquiryFollowUpService } from './enquiry-followup.service';

/**
 * One processor per queue, dispatching by job.name — never split a queue's jobs across
 * multiple @Processor classes. BullMQ runs each @Processor as its own independent Worker,
 * and multiple Workers on the same queue name race for whichever job comes up next
 * regardless of name; a second class here would sometimes grab the other job kind and
 * silently no-op it (see the identical reasoning already applied on the 'offers' queue
 * in OfferSendProcessor, which handles 'send-offer' and 'retry-failed' the same way).
 */
@Processor('campaigns')
export class CampaignsProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignsProcessor.name);

  constructor(
    private readonly renewalReminderService: RenewalReminderService,
    private readonly enquiryFollowUpService: EnquiryFollowUpService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'renewal-reminders') {
      const result = await this.renewalReminderService.run();
      this.logger.log(`Renewal reminder job complete: ${JSON.stringify(result)}`);
      return;
    }
    if (job.name === 'enquiry-followups') {
      const result = await this.enquiryFollowUpService.run();
      this.logger.log(`Enquiry follow-up job complete: ${JSON.stringify(result)}`);
    }
  }
}
