import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OffersService, OfferTarget } from './offers.service';

export interface OfferSendJobData {
  campaignId: string;
  target: OfferTarget;
  message: string;
}

@Processor('offers')
export class OfferSendProcessor extends WorkerHost {
  private readonly logger = new Logger(OfferSendProcessor.name);

  constructor(private readonly offersService: OffersService) {
    super();
  }

  async process(job: Job<OfferSendJobData>): Promise<void> {
    if (job.name !== 'send-offer') return;
    const { campaignId, target, message } = job.data;
    const result = await this.offersService.executeSend(campaignId, target, message);
    this.logger.log(`Offer campaign ${campaignId} complete: ${JSON.stringify(result)}`);
  }
}
