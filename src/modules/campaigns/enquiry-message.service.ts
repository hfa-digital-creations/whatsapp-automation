import { Injectable, NotFoundException } from '@nestjs/common';
import { CampaignType, EnquiryStatus, MessageDirection } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AiService } from '../../common/services/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CampaignsService } from './campaigns.service';

const SALES_MESSAGE_SYSTEM_PROMPT = `You write short, warm, human-sounding WhatsApp sales outreach messages for a
WhatsApp automation SaaS company reaching out to a prospect who submitted an enquiry on the landing page.

Rules:
- Sound like a real person on the sales team, not an AI or a template. Never say "As an AI" or similar.
- Reference their actual enquiry details naturally (name, business, what they asked about) — don't be generic.
- Keep it short: 2-4 sentences, WhatsApp-appropriate, no corporate jargon.
- End with a soft, low-pressure question inviting a reply, not a hard sell.
- Output ONLY the message text — no greeting like "Sure, here's a message:", no quotes, no markdown.`;

@Injectable()
export class EnquiryMessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly notificationsService: NotificationsService,
    private readonly campaignsService: CampaignsService,
  ) {}

  async generateDraft(enquiryId: string): Promise<{ draft: string | null; configured: boolean }> {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id: enquiryId } });
    if (!enquiry) throw new NotFoundException('Enquiry not found.');

    if (!this.ai.isConfigured) {
      return { draft: null, configured: false };
    }

    const prompt = `Enquiry details:
Name: ${enquiry.name}
Business: ${enquiry.businessName ?? 'unknown'}
Business type: ${enquiry.businessType ?? 'unknown'}
Their message: ${enquiry.message ?? '(no message provided)'}`;

    const draft = await this.ai.complete({ system: SALES_MESSAGE_SYSTEM_PROMPT, prompt, maxTokens: 300 });
    return { draft, configured: true };
  }

  async send(enquiryId: string, content: string) {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id: enquiryId } });
    if (!enquiry) throw new NotFoundException('Enquiry not found.');

    const campaign = await this.campaignsService.getOrCreateSystemCampaign(CampaignType.ENQUIRY_FOLLOWUP);
    const result = await this.notificationsService.sendCustom({
      phone: enquiry.phone,
      email: enquiry.email,
      subject: `Following up on your enquiry`,
      whatsappMessage: content,
    });

    await this.campaignsService.recordMessage({
      campaignId: campaign.id,
      enquiryId,
      content,
      sent: result.whatsappSent || result.emailSent,
    });
    // Also logged to the conversation thread (used by both this manual send and the
    // automatic enquiry outreach/replies) so the admin panel shows one complete history.
    await this.prisma.enquiryMessage.create({ data: { enquiryId, direction: MessageDirection.OUTBOUND, content } });

    if (enquiry.status === EnquiryStatus.NEW) {
      await this.prisma.enquiry.update({ where: { id: enquiryId }, data: { status: EnquiryStatus.CONTACTED } });
    }

    return result;
  }
}
