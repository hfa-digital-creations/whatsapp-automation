import { Injectable, NotFoundException } from '@nestjs/common';
import { CampaignStatus, CampaignType, MessageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';

const CAMPAIGN_NAMES: Record<CampaignType, string> = {
  RENEWAL: 'Renewal Reminders',
  OFFER: 'Offer Campaigns',
  ENQUIRY_FOLLOWUP: 'Enquiry Follow-ups',
};

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  /** System campaigns (renewal reminders, enquiry follow-ups) are singletons per type, created on first use. */
  async getOrCreateSystemCampaign(type: CampaignType) {
    const existing = await this.prisma.campaign.findFirst({ where: { type, name: CAMPAIGN_NAMES[type] } });
    if (existing) return existing;
    return this.prisma.campaign.create({
      data: { type, name: CAMPAIGN_NAMES[type], status: CampaignStatus.RUNNING },
    });
  }

  async hasSentToday(campaignId: string, target: { clientId?: string; enquiryId?: string }) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const count = await this.prisma.campaignMessage.count({
      where: { campaignId, ...target, sentAt: { gte: startOfDay } },
    });
    return count > 0;
  }

  recordMessage(params: {
    campaignId: string;
    clientId?: string;
    enquiryId?: string;
    content: string;
    sent: boolean;
  }) {
    return this.prisma.campaignMessage.create({
      data: {
        campaignId: params.campaignId,
        clientId: params.clientId,
        enquiryId: params.enquiryId,
        content: params.content,
        status: params.sent ? MessageStatus.SENT : MessageStatus.FAILED,
        sentAt: params.sent ? new Date() : undefined,
      },
    });
  }

  /** Admin-authored campaigns (e.g. Offers) — unlike system campaigns, admins can create many of these. */
  create(type: CampaignType, name: string, config?: Prisma.InputJsonValue) {
    return this.prisma.campaign.create({ data: { type, name, config, status: CampaignStatus.DRAFT } });
  }

  list(type?: CampaignType) {
    return this.prisma.campaign.findMany({ where: { type }, orderBy: { createdAt: 'desc' } });
  }

  async getById(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found.');
    return campaign;
  }

  updateStatus(id: string, status: CampaignStatus) {
    return this.prisma.campaign.update({ where: { id }, data: { status } });
  }

  listMessages(campaignId: string) {
    return this.prisma.campaignMessage.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
      include: { client: { select: { businessName: true } }, enquiry: { select: { name: true, phone: true } } },
    });
  }
}
