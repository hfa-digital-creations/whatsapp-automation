import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SubscriptionService } from '../subscription/subscription.service';

@Processor('subscription')
export class SubscriptionProcessor extends WorkerHost {
  private readonly logger = new Logger(SubscriptionProcessor.name);

  constructor(private readonly subscriptionService: SubscriptionService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'refresh-expired') return;
    // Idempotent by nature — re-running only ever flips ACTIVE users whose
    // subscription has already lapsed, so a worker restart can't double-act.
    const result = await this.subscriptionService.refreshExpiredClients();
    this.logger.log(`Subscription refresh: ${result.updated} client(s) marked EXPIRED`);
  }
}
