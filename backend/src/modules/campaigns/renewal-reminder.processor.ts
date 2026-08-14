import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RenewalReminderService } from './renewal-reminder.service';

@Processor('campaigns')
export class RenewalReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(RenewalReminderProcessor.name);

  constructor(private readonly renewalReminderService: RenewalReminderService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'renewal-reminders') return;
    const result = await this.renewalReminderService.run();
    this.logger.log(`Renewal reminder job complete: ${JSON.stringify(result)}`);
  }
}
