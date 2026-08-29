import { Injectable, Logger } from '@nestjs/common';
import { CampaignType, EnquiryStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { CampaignsService } from './campaigns.service';
import { EnquiryMessageService } from './enquiry-message.service';
import { humanSendDelayMs, sleep } from '../../common/utils/throttle';

/** How long an enquiry has to go silent (no message either direction) before it's due a follow-up. */
const QUIET_PERIOD_DAYS = 3;
/** Caps automatic nudges per enquiry so a prospect who never replies doesn't get pestered forever
 *  — the admin can always send more manually from the Enquiries panel if they judge it worthwhile. */
const MAX_AUTOMATIC_FOLLOWUPS = 3;

/**
 * Runs on a schedule (see CampaignsModule) to nudge prospects who've gone quiet — the AI already
 * handles the live back-and-forth the moment a prospect replies (EnquiryAutomationService), so this
 * only ever targets enquiries with no recent activity at all, using the same AI-drafted,
 * friendly/professional copy (SALES_MESSAGE_SYSTEM_PROMPT) an admin would send manually.
 */
@Injectable()
export class EnquiryFollowUpService {
  private readonly logger = new Logger(EnquiryFollowUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignsService: CampaignsService,
    private readonly enquiryMessageService: EnquiryMessageService,
  ) {}

  async run(): Promise<{ sent: number; skipped: number }> {
    const campaign = await this.campaignsService.getOrCreateSystemCampaign(CampaignType.ENQUIRY_FOLLOWUP);
    const cutoff = new Date(Date.now() - QUIET_PERIOD_DAYS * 86_400_000);

    // Also excludes enquiries created within the quiet period outright — cheaper than fetching
    // message history for every fresh enquiry, and covers the edge case where the initial AI
    // outreach itself failed to send (no EnquiryMessage row yet) right after signup.
    const candidates = await this.prisma.enquiry.findMany({
      where: {
        status: { notIn: [EnquiryStatus.CONVERTED, EnquiryStatus.NOT_INTERESTED, EnquiryStatus.CLOSED] },
        createdAt: { lt: cutoff },
      },
    });

    let sent = 0;
    let skipped = 0;

    for (const enquiry of candidates) {
      const [recentMessage, followUpCount] = await Promise.all([
        this.prisma.enquiryMessage.findFirst({ where: { enquiryId: enquiry.id, createdAt: { gte: cutoff } } }),
        this.prisma.campaignMessage.count({ where: { campaignId: campaign.id, enquiryId: enquiry.id } }),
      ]);

      if (recentMessage || followUpCount >= MAX_AUTOMATIC_FOLLOWUPS) {
        skipped++;
        continue;
      }

      // Random human-like gap before each send in this bulk job — see throttle.ts.
      if (sent > 0) await sleep(humanSendDelayMs());

      const { draft, configured } = await this.enquiryMessageService.generateDraft(enquiry.id);
      if (!configured || !draft) {
        skipped++;
        continue;
      }

      try {
        // send() throws when neither email nor WhatsApp actually went out — one enquiry's
        // delivery failure (e.g. the system WhatsApp session being disconnected) must never
        // abort the rest of this batch.
        await this.enquiryMessageService.send(enquiry.id, draft);
        sent++;
      } catch (err: any) {
        this.logger.warn(`Follow-up send failed for enquiry ${enquiry.id}: ${err.message}`);
        skipped++;
      }
    }

    this.logger.log(`Enquiry follow-ups: sent ${sent}, skipped ${skipped}`);
    return { sent, skipped };
  }
}
