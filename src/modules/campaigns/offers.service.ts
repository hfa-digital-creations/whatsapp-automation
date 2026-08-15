import { BadRequestException, Injectable } from '@nestjs/common';
import { CampaignStatus, CampaignType, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CampaignsService } from './campaigns.service';
import { humanSendDelayMs, sleep } from '../../common/utils/throttle';

export type OfferTarget = 'ALL_CLIENTS' | 'ACTIVE_CLIENTS';

@Injectable()
export class OffersService {
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
   * Sends an already-created offer campaign to a target audience. Kept as an explicit,
   * admin-triggered action (not scheduled) so promotional messages are never sent
   * without a human deciding to send them (spec §18 — no unnecessary/spammy sends).
   */
  async send(campaignId: string, target: OfferTarget, messageOverride?: string) {
    const campaign = await this.campaignsService.getById(campaignId);
    if (campaign.type !== CampaignType.OFFER) throw new BadRequestException('Not an offer campaign.');
    if (campaign.status === CampaignStatus.COMPLETED) {
      throw new BadRequestException('This campaign has already been sent.');
    }

    const message = messageOverride ?? (campaign.config as { message?: string } | null)?.message;
    if (!message) throw new BadRequestException('Campaign has no message content.');

    const clients = await this.prisma.client.findMany({
      where: { user: { status: UserStatus.ACTIVE } },
      include: { user: true },
    });

    const targetClients =
      target === 'ACTIVE_CLIENTS'
        ? clients.filter((c) => {
            const status = this.subscriptionService.computeStatus(c);
            return status === 'ACTIVE' || status === 'EXPIRING_SOON';
          })
        : clients;

    let sentCount = 0;
    for (const client of targetClients) {
      // Random human-like gap between recipients — see renewal-reminder.service.ts
      // for why (bursty bulk sends are a strong automated-behavior detection signal).
      if (sentCount > 0) await sleep(humanSendDelayMs());

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
    }

    await this.campaignsService.updateStatus(campaignId, CampaignStatus.COMPLETED);
    return { targeted: targetClients.length, sent: sentCount };
  }
}
