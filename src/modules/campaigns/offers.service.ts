import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignStatus, CampaignType, MessageStatus, Prisma, UserStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/services/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiService } from '../../common/services/ai.service';
import { CampaignsService } from './campaigns.service';
import { batchPauseMs, humanSendDelayMs, sleep } from '../../common/utils/throttle';
import { resolveOfferMediaRule } from './offer-media.util';
import { OfferPhoneRecipient } from './dto/send-offer.dto';

export type OfferTarget = 'ALL_CLIENTS' | 'ACTIVE_CLIENTS' | 'SPECIFIC_CLIENTS' | 'PHONE_NUMBERS' | 'GROUP';
export type OfferMediaType = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

/** Normalizes both client-based and manually-entered-phone-number targets into one shape the send loop can share. */
interface SendRecipient {
  dedupKey: string;
  name: string;
  phone: string | null;
  email?: string | null;
  clientId?: string;
  recipientPhone?: string;
  recipientName?: string;
}

interface OfferCampaignConfig {
  message?: string;
  mediaUrl?: string;
  mediaType?: OfferMediaType;
  mediaFileName?: string;
}

/** Batch size and rationale in throttle.ts — keeps hourly volume well under WhatsApp's ~60/hr automated-behavior threshold. */
const BATCH_SIZE = 5;

const GENERATE_TEXT_SYSTEM_PROMPT = `You write short, warm, persuasive WhatsApp broadcast messages for a SaaS
platform's admin to send to its business clients as promotional offers or announcements.

Rules:
- Plain text only, no markdown formatting (WhatsApp's own *bold*/_italic_ is fine, used sparingly).
- Include the placeholder {{businessName}} at least once so the message can be personalized per client.
- Keep it concise — 2 to 5 short lines, WhatsApp-appropriate, not an email.
- Never invent specific prices, dates, or promo codes that aren't mentioned in the instructions below —
  only use details actually given.
- Output ONLY the final message text, nothing else (no preamble, no quotes around it).`;

/** Used instead of the above when a CLIENT (not the platform admin) is drafting a campaign to their own customers. */
const GENERATE_TEXT_CLIENT_SYSTEM_PROMPT = `You write short, warm, persuasive WhatsApp broadcast messages for a
business owner to send to their own customers as promotional offers or announcements.

Rules:
- Plain text only, no markdown formatting (WhatsApp's own *bold*/_italic_ is fine, used sparingly).
- Include the placeholder {{businessName}} at least once so the message can be personalized per recipient, if a name is available.
- Keep it concise — 2 to 5 short lines, WhatsApp-appropriate, not an email.
- Never invent specific prices, dates, or promo codes that aren't mentioned in the instructions below —
  only use details actually given.
- Output ONLY the final message text, nothing else (no preamble, no quotes around it).`;

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    private readonly notificationsService: NotificationsService,
    private readonly campaignsService: CampaignsService,
    private readonly ai: AiService,
    private readonly config: ConfigService,
  ) {}

  private get uploadRoot(): string {
    return this.config.get<string>('UPLOAD_PATH') ?? path.join(process.cwd(), 'uploads');
  }

  private resolveMediaPath(mediaUrl: string): string {
    const storedFileName = mediaUrl.split('/').pop()!;
    return path.join(this.uploadRoot, 'offers', storedFileName);
  }

  create(
    name: string,
    message: string,
    media?: { mediaUrl?: string; mediaType?: OfferMediaType; mediaFileName?: string },
    ownerClientId: string | null = null,
  ) {
    return this.campaignsService.create(CampaignType.OFFER, name, ownerClientId, { message, ...media });
  }

  list(ownerClientId: string | null = null) {
    return this.campaignsService.list(CampaignType.OFFER, ownerClientId);
  }

  async getMessages(campaignId: string, ownerClientId: string | null = null) {
    await this.campaignsService.getById(campaignId, ownerClientId);
    return this.campaignsService.listMessages(campaignId);
  }

  listTrash(ownerClientId: string | null = null) {
    return this.campaignsService.listTrash(CampaignType.OFFER, ownerClientId);
  }

  /**
   * Only DRAFT campaigns can be edited — once RUNNING or COMPLETED, its content is either
   * actively being sent or is a record of what actually went out, neither of which should
   * change underneath a send. Replacing the media clears the old file from disk so nothing
   * orphans; passing mediaUrl: null clears the attachment entirely.
   */
  async update(
    campaignId: string,
    updates: {
      name?: string;
      message?: string;
      mediaUrl?: string | null;
      mediaType?: OfferMediaType | null;
      mediaFileName?: string | null;
    },
    ownerClientId: string | null = null,
  ) {
    const campaign = await this.campaignsService.getById(campaignId, ownerClientId);
    if (campaign.type !== CampaignType.OFFER) throw new BadRequestException('Not an offer campaign.');
    if (campaign.deletedAt) throw new BadRequestException('This campaign is in the trash — restore it first.');
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Only draft campaigns can be edited.');
    }

    const config = (campaign.config as OfferCampaignConfig | null) ?? {};
    const nextConfig: OfferCampaignConfig = { ...config };

    if (updates.message !== undefined) nextConfig.message = updates.message;

    if (updates.mediaUrl !== undefined) {
      if (config.mediaUrl && config.mediaUrl !== updates.mediaUrl) {
        fs.rmSync(this.resolveMediaPath(config.mediaUrl), { force: true });
      }
      if (updates.mediaUrl === null) {
        delete nextConfig.mediaUrl;
        delete nextConfig.mediaType;
        delete nextConfig.mediaFileName;
      } else {
        nextConfig.mediaUrl = updates.mediaUrl;
        nextConfig.mediaType = updates.mediaType ?? undefined;
        nextConfig.mediaFileName = updates.mediaFileName ?? undefined;
      }
    }

    return this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        name: updates.name ?? campaign.name,
        config: nextConfig as Prisma.InputJsonValue,
      },
    });
  }

  /** Blocked while RUNNING so a trash action can never race an in-progress batched send. Media/history are kept in case of restore. */
  async moveToTrash(campaignId: string, ownerClientId: string | null = null) {
    const campaign = await this.campaignsService.getById(campaignId, ownerClientId);
    if (campaign.type !== CampaignType.OFFER) throw new BadRequestException('Not an offer campaign.');
    if (campaign.status === CampaignStatus.RUNNING) {
      throw new BadRequestException('This campaign is currently sending — wait for it to finish before deleting it.');
    }
    return this.campaignsService.softDelete(campaignId, ownerClientId);
  }

  async restore(campaignId: string, ownerClientId: string | null = null) {
    const campaign = await this.campaignsService.getById(campaignId, ownerClientId);
    if (campaign.type !== CampaignType.OFFER) throw new BadRequestException('Not an offer campaign.');
    return this.campaignsService.restore(campaignId, ownerClientId);
  }

  /** Only ever called on an already-trashed campaign — removes its attached media file and cascades to its CampaignMessages. */
  async permanentlyDelete(campaignId: string, ownerClientId: string | null = null) {
    const campaign = await this.campaignsService.getById(campaignId, ownerClientId);
    if (campaign.type !== CampaignType.OFFER) throw new BadRequestException('Not an offer campaign.');

    const config = campaign.config as OfferCampaignConfig | null;
    if (config?.mediaUrl) {
      fs.rmSync(this.resolveMediaPath(config.mediaUrl), { force: true });
    }

    return this.campaignsService.permanentlyDelete(campaignId, ownerClientId);
  }

  /** Stores an uploaded image/video/PDF to disk and returns the details to attach to an offer campaign. */
  async saveMedia(file: Express.Multer.File) {
    const rule = resolveOfferMediaRule(file.originalname);
    if (!rule) {
      throw new BadRequestException('Unsupported file type. Allowed: images (jpg, png, webp, gif), video (mp4, mov, 3gp), or PDF.');
    }
    if (file.size > rule.maxBytes) {
      const label = rule.type === 'IMAGE' ? 'Images' : rule.type === 'VIDEO' ? 'Videos' : 'Documents';
      throw new BadRequestException(`${label} must be under ${Math.round(rule.maxBytes / (1024 * 1024))}MB.`);
    }

    const dir = path.join(this.uploadRoot, 'offers');
    fs.mkdirSync(dir, { recursive: true });
    const ext = file.originalname.split('.').pop()!.toLowerCase();
    const storedFileName = `${randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(dir, storedFileName), file.buffer);

    return {
      mediaUrl: `/api/uploads/offers/${storedFileName}`,
      mediaType: rule.type,
      mediaFileName: file.originalname,
    };
  }

  /**
   * A one-off follow-up message to a single contact — deliberately not a Campaign (no
   * batching, no history), just an immediate WhatsApp send, available from the Contacts
   * tab in both the admin and client offer campaign panels.
   */
  async sendFollowup(phone: string, message: string, sessionId?: string): Promise<{ sent: boolean }> {
    const { whatsappSent } = await this.notificationsService.sendCustom({
      phone,
      subject: 'Follow-up message',
      whatsappMessage: message,
      sessionId,
    });
    if (!whatsappSent) throw new BadRequestException('Could not send the message — check the number and WhatsApp connection.');
    return { sent: true };
  }

  /** AI-drafted broadcast copy from a short prompt — a starting point the caller can still edit before sending. */
  async generateText(prompt: string, audience: 'clients' | 'customers' = 'clients'): Promise<string> {
    if (!this.ai.isConfigured) {
      throw new BadRequestException('AI text generation is not configured on this server.');
    }
    const system = audience === 'customers' ? GENERATE_TEXT_CLIENT_SYSTEM_PROMPT : GENERATE_TEXT_SYSTEM_PROMPT;
    const text = await this.ai.complete({ system, prompt, maxTokens: 400 });
    if (!text) throw new BadRequestException('AI text generation failed — please try again or write the message manually.');
    return text.trim();
  }

  /**
   * Validates a send request up front (before it's handed to the background queue) so
   * the caller gets an immediate, synchronous error for anything wrong with the campaign
   * itself, rather than finding out minutes later once the batched job has started.
   */
  async prepareSend(campaignId: string, ownerClientId: string | null = null, messageOverride?: string) {
    const campaign = await this.campaignsService.getById(campaignId, ownerClientId);
    if (campaign.type !== CampaignType.OFFER) throw new BadRequestException('Not an offer campaign.');
    if (campaign.deletedAt) throw new BadRequestException('This campaign is in the trash — restore it first.');
    if (campaign.status === CampaignStatus.RUNNING) {
      throw new BadRequestException('This campaign is already being sent.');
    }
    if (campaign.status === CampaignStatus.COMPLETED) {
      throw new BadRequestException('This campaign has already been sent.');
    }
    const config = campaign.config as OfferCampaignConfig | null;
    const message = messageOverride ?? config?.message;
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
  async executeSend(
    campaignId: string,
    target: OfferTarget,
    message: string,
    clientIds?: string[],
    phoneNumbers?: OfferPhoneRecipient[],
    groupId?: string,
    /** Which WhatsApp session sends this — defaults to the platform's system number (admin
     * campaigns); a client's own campaign passes their own connected account's sessionId. */
    sendSessionId?: string,
  ) {
    const campaign = await this.campaignsService.getById(campaignId);
    const config = campaign.config as OfferCampaignConfig | null;
    const media =
      config?.mediaUrl && config.mediaFileName
        ? { filePath: this.resolveMediaPath(config.mediaUrl), fileName: config.mediaFileName }
        : null;

    // A group can mix registered clients and manually-entered phone numbers — resolve it
    // once here into the same two lists the SPECIFIC_CLIENTS/PHONE_NUMBERS targets use.
    let groupClientIds: string[] | undefined;
    let groupPhoneNumbers: OfferPhoneRecipient[] | undefined;
    if (target === 'GROUP' && groupId) {
      const members = await this.prisma.offerGroupMember.findMany({ where: { groupId } });
      groupClientIds = members.filter((m) => m.clientId).map((m) => m.clientId!);
      groupPhoneNumbers = members
        .filter((m) => !m.clientId && m.phone)
        .map((m) => ({ phone: m.phone!, name: m.name ?? undefined }));
    }

    const [clients, alreadySent] = await Promise.all([
      this.prisma.client.findMany({ where: { user: { status: UserStatus.ACTIVE } }, include: { user: true } }),
      this.prisma.campaignMessage.findMany({
        where: { campaignId, status: MessageStatus.SENT },
        select: { clientId: true, recipientPhone: true },
      }),
    ]);
    const alreadySentKeys = new Set(
      alreadySent.map((m) => (m.clientId ? `client:${m.clientId}` : `phone:${normalizePhone(m.recipientPhone ?? '')}`)),
    );

    const targetClients =
      target === 'ACTIVE_CLIENTS'
        ? clients.filter((c) => {
            const status = this.subscriptionService.computeStatus(c);
            return status === 'ACTIVE' || status === 'EXPIRING_SOON';
          })
        : target === 'SPECIFIC_CLIENTS'
          ? clients.filter((c) => (clientIds ?? []).includes(c.id))
          : target === 'GROUP'
            ? clients.filter((c) => (groupClientIds ?? []).includes(c.id))
            : target === 'PHONE_NUMBERS'
              ? []
              : clients;

    const effectivePhoneNumbers = target === 'GROUP' ? groupPhoneNumbers : target === 'PHONE_NUMBERS' ? phoneNumbers : undefined;

    const clientRecipients: SendRecipient[] = targetClients.map((c) => ({
      dedupKey: `client:${c.id}`,
      name: c.businessName,
      phone: c.user.phone,
      email: c.user.email,
      clientId: c.id,
    }));
    const phoneRecipients: SendRecipient[] = (effectivePhoneNumbers ?? []).map((r) => ({
      dedupKey: `phone:${normalizePhone(r.phone)}`,
      name: r.name?.trim() || 'there',
      phone: r.phone,
      recipientPhone: r.phone,
      recipientName: r.name?.trim() || undefined,
    }));
    const recipients: SendRecipient[] = [...clientRecipients, ...phoneRecipients];

    const pendingRecipients = recipients.filter((r) => !alreadySentKeys.has(r.dedupKey));

    let sentCount = alreadySentKeys.size;
    for (let i = 0; i < pendingRecipients.length; i += BATCH_SIZE) {
      const batch = pendingRecipients.slice(i, i + BATCH_SIZE);
      if (i > 0) {
        // Longer pause between batches of 5 — see throttle.ts for the WhatsApp
        // automated-behavior threshold this is sized against.
        await sleep(batchPauseMs());
      }

      for (let j = 0; j < batch.length; j++) {
        if (j > 0) await sleep(humanSendDelayMs());
        const recipient = batch[j];
        const recordBase = { campaignId, clientId: recipient.clientId, recipientPhone: recipient.recipientPhone, recipientName: recipient.recipientName };
        try {
          const personalized = message.replace(/{{\s*businessName\s*}}/g, recipient.name);
          const result = await this.notificationsService.sendCustom({
            email: recipient.email,
            phone: recipient.phone,
            subject: campaign.name,
            emailHtml: recipient.email ? `<p>${personalized}</p>` : undefined,
            whatsappMessage: personalized,
            media,
            sessionId: sendSessionId,
          });
          await this.campaignsService.recordMessage({
            ...recordBase,
            content: personalized,
            sent: result.emailSent || result.whatsappSent,
          });
          if (result.emailSent || result.whatsappSent) sentCount++;
        } catch (err: any) {
          // One recipient's failure must never abort the rest of the batch/job.
          this.logger.warn(`Offer send failed for ${recipient.dedupKey} in campaign ${campaignId}: ${err.message}`);
          await this.campaignsService.recordMessage({
            ...recordBase,
            content: message,
            sent: false,
          });
        }
      }
    }

    await this.campaignsService.updateStatus(campaignId, CampaignStatus.COMPLETED);
    return { targeted: recipients.length, sent: sentCount };
  }
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}
