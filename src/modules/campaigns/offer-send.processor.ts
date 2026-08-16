import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OffersService, OfferTarget } from './offers.service';
import { OfferPhoneRecipient } from './dto/send-offer.dto';

export interface OfferSendJobData {
  campaignId: string;
  target: OfferTarget;
  message: string;
  /** Only set when target is SPECIFIC_CLIENTS. */
  clientIds?: string[];
  /** Only set when target is PHONE_NUMBERS. */
  phoneNumbers?: OfferPhoneRecipient[];
  /** Only set when target is GROUP. */
  groupId?: string;
}

@Processor('offers')
export class OfferSendProcessor extends WorkerHost {
  private readonly logger = new Logger(OfferSendProcessor.name);

  constructor(private readonly offersService: OffersService) {
    super();
  }

  async process(job: Job<OfferSendJobData>): Promise<void> {
    if (job.name !== 'send-offer') return;
    const { campaignId, target, message, clientIds, phoneNumbers, groupId } = job.data;
    const result = await this.offersService.executeSend(campaignId, target, message, clientIds, phoneNumbers, groupId);
    this.logger.log(`Offer campaign ${campaignId} complete: ${JSON.stringify(result)}`);
  }
}
