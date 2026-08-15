import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignStatus, CampaignType, MessageStatus, UserStatus } from '@prisma/client';
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

export type OfferTarget = 'ALL_CLIENTS' | 'ACTIVE_CLIENTS' | 'SPECIFIC_CLIENTS';
export type OfferMediaType = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

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

  create(name: string, message: string, media?: { mediaUrl?: string; mediaType?: OfferMediaType; mediaFileName?: string }) {
    return this.campaignsService.create(CampaignType.OFFER, name, { message, ...media });
  }

  list() {
    return this.campaignsService.list(CampaignType.OFFER);
  }

  getMessages(campaignId: string) {
    return this.campaignsService.listMessages(campaignId);
  }

  listTrash() {
    return this.campaignsService.listTrash(CampaignType.OFFER);
  }

  /** Blocked while RUNNING so a trash action can never race an in-progress batched send. Media/history are kept in case of restore. */
  async moveToTrash(campaignId: string) {
    const campaign = await this.campaignsService.getById(campaignId);
    if (campaign.type !== CampaignType.OFFER) throw new BadRequestException('Not an offer campaign.');
    if (campaign.status === CampaignStatus.RUNNING) {
      throw new BadRequestException('This campaign is currently sending — wait for it to finish before deleting it.');
    }
    return this.campaignsService.softDelete(campaignId);
  }

  async restore(campaignId: string) {
    const campaign = await this.campaignsService.getById(campaignId);
    if (campaign.type !== CampaignType.OFFER) throw new BadRequestException('Not an offer campaign.');
    return this.campaignsService.restore(campaignId);
  }

  /** Only ever called on an already-trashed campaign — removes its attached media file and cascades to its CampaignMessages. */
  async permanentlyDelete(campaignId: string) {
    const campaign = await this.campaignsService.getById(campaignId);
    if (campaign.type !== CampaignType.OFFER) throw new BadRequestException('Not an offer campaign.');

    const config = campaign.config as OfferCampaignConfig | null;
    if (config?.mediaUrl) {
      fs.rmSync(this.resolveMediaPath(config.mediaUrl), { force: true });
    }

    return this.campaignsService.permanentlyDelete(campaignId);
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

  /** AI-drafted broadcast copy from a short admin prompt — a starting point the admin can still edit before sending. */
  async generateText(prompt: string): Promise<string> {
    if (!this.ai.isConfigured) {
      throw new BadRequestException('AI text generation is not configured on this server.');
    }
    const text = await this.ai.complete({ system: GENERATE_TEXT_SYSTEM_PROMPT, prompt, maxTokens: 400 });
    if (!text) throw new BadRequestException('AI text generation failed — please try again or write the message manually.');
    return text.trim();
  }

  /**
   * Validates a send request up front (before it's handed to the background queue) so
   * the admin gets an immediate, synchronous error for anything wrong with the campaign
   * itself, rather than finding out minutes later once the batched job has started.
   */
  async prepareSend(campaignId: string, messageOverride?: string) {
    const campaign = await this.campaignsService.getById(campaignId);
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
  async executeSend(campaignId: string, target: OfferTarget, message: string, clientIds?: string[]) {
    const campaign = await this.campaignsService.getById(campaignId);
    const config = campaign.config as OfferCampaignConfig | null;
    const media =
      config?.mediaUrl && config.mediaFileName
        ? { filePath: this.resolveMediaPath(config.mediaUrl), fileName: config.mediaFileName }
        : null;

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
        : target === 'SPECIFIC_CLIENTS'
          ? clients.filter((c) => (clientIds ?? []).includes(c.id))
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
            media,
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
