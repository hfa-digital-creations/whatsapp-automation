import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CampaignStatus, CampaignType, MessageStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CampaignsService } from './campaigns.service';
import { batchPauseMs, humanSendDelayMs, sleep } from '../../common/utils/throttle';

export type OfferTarget = 'ALL_CLIENTS' | 'ACTIVE_CLIENTS';

/** Batch size and rationale in throttle.ts — keeps hourly volume well under WhatsApp's ~60/hr automated-behavior threshold. */
const BATCH_SIZE = 5;

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    private readonly notificationsService: NotificationsService,
    private readonly campaignsService: CampaignsService,
  ) {}

  create(name: string, message: string) {
    return this.campaignsService.create(CampaignType.OFFER, name, { message });
  }

  list() {
    return this.campaignsService.list(CampaignType.OFFER);
  }

  getMessages(campaignId: string) {
    return this.campaignsService.listMessages(campaignId);
  }

  /**
   * Validates a send request up front (before it's handed to the background queue) so
   * the admin gets an immediate, synchronous error for anything wrong with the campaign
   * itself, rather than finding out minutes later once the batched job has started.
   */
  async prepareSend(campaignId: string, messageOverride?: string) {
    const campaign = await this.campaignsService.getById(campaignId);
    if (campaign.type !== CampaignType.OFFER) throw new BadRequestException('Not an offer campaign.');
    if (campaign.status === CampaignStatus.RUNNING) {
      throw new BadRequestException('This campaign is already being sent.');
    }
    if (campaign.status === CampaignStatus.COMPLETED) {
      throw new BadRequestException('This campaign has already been sent.');
    }
    const message = messageOverride ?? (campaign.config as { message?: string } | null)?.message;
    if (!message) throw new BadRequestException('Campaign has no message content.');
    await this.campaignsService.updateStatus(campaignId, CampaignStatus.RUNNING);
    return { message };
  }

  /**
   * Runs the actual batched send — invoked by the offers queue processor, never directly
   * from the controller, since a real client list at 5-per-batch with multi-minute pauses
   * between batches can take well beyond any acceptable HTTP request timeout.
   *
   * Safe to re-run on the same campaignId after a crash/restart: clients who already have
   * a SENT CampaignMessage for this campaign are skipped, so nothing is sent twice and no
   * client is silently missed (spec: "no data should be loss").
   */
  async executeSend(campaignId: string, target: OfferTarget, message: string) {
    const campaign = await this.campaignsService.getById(campaignId);

    const [clients, alreadySent] = await Promise.all([
      this.prisma.client.findMany({ where: { user: { status: UserStatus.ACTIVE } }, include: { user: true } }),
      this.prisma.campaignMessage.findMany({
        where: { campaignId, status: MessageStatus.SENT },
        select: { clientId: true },
      }),
    ]);
    const alreadySentIds = new Set(alreadySent.map((m) => m.clientId));

    const targetClients =
      target === 'ACTIVE_CLIENTS'
        ? clients.filter((c) => {
            const status = this.subscriptionService.computeStatus(c);
            return status === 'ACTIVE' || status === 'EXPIRING_SOON';
          })
        : clients;
    const pendingClients = targetClients.filter((c) => !alreadySentIds.has(c.id));

    let sentCount = alreadySentIds.size;
    for (let i = 0; i < pendingClients.length; i += BATCH_SIZE) {
      const batch = pendingClients.slice(i, i + BATCH_SIZE);
      if (i > 0) {
        // Longer pause between batches of 5 — see throttle.ts for the WhatsApp
        // automated-behavior threshold this is sized against.
        await sleep(batchPauseMs());
      }

      for (let j = 0; j < batch.length; j++) {
        if (j > 0) await sleep(humanSendDelayMs());
        const client = batch[j];
        try {
          const personalized = message.replace(/{{\s*businessName\s*}}/g, client.businessName);
          const result = await this.notificationsService.sendCustom({
            email: client.user.email,
            phone: client.user.phone,
            subject: campaign.name,
            emailHtml: `<p>${personalized}</p>`,
            whatsappMessage: personalized,
          });
          await this.campaignsService.recordMessage({
            campaignId,
            clientId: client.id,
            content: personalized,
            sent: result.emailSent || result.whatsappSent,
          });
          if (result.emailSent || result.whatsappSent) sentCount++;
        } catch (err: any) {
          // One client's failure must never abort the rest of the batch/job.
          this.logger.warn(`Offer send failed for client ${client.id} in campaign ${campaignId}: ${err.message}`);
          await this.campaignsService.recordMessage({
            campaignId,
            clientId: client.id,
            content: message,
            sent: false,
          });
        }
      }
    }

    await this.campaignsService.updateStatus(campaignId, CampaignStatus.COMPLETED);
    return { targeted: targetClients.length, sent: sentCount };
  }
}
