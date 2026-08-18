import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DigestService } from './digest.service';

@Processor('digest')
export class DigestSenderProcessor extends WorkerHost {
  private readonly logger = new Logger(DigestSenderProcessor.name);

  constructor(private readonly digestService: DigestService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'check-daily-digest') return;
    await this.digestService.sendDailyReportIfDue().catch((err) =>
      this.logger.error(`Daily digest send check failed: ${err.message}`, err.stack),
    );
  }
}
