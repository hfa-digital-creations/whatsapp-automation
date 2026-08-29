import { Injectable, Logger } from '@nestjs/common';
import { EnquiryStatus, LeadStatus, MessageStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { WhatsappSessionManagerService } from '../whatsapp/whatsapp-session-manager.service';
import { SYSTEM_WHATSAPP_SESSION_ID } from '../../common/constants';

// A lead with no update in this long is treated as needing a follow-up nudge in the digest.
const STALE_LEAD_MS = 2 * 24 * 60 * 60 * 1000;
const RENEWAL_LOOKAHEAD_DAYS = 7;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Server-local "YYYY-MM-DD" — used only as a same-day dedupe key, never parsed back to a Date. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DigestNotReady {
  ready: false;
  availableAt: string;
}

/**
 * Aggregates "everything that happened today" for the admin (platform-wide) and for a
 * single client (their own data only) — withheld until PlatformSettings.dailyDigestTime
 * so nobody sees a half-finished day's figures before the admin-configured cutoff.
 */
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly sessionManager: WhatsappSessionManagerService,
  ) {}

  private async readiness(): Promise<{ ready: boolean; availableAt: string }> {
    const { dailyDigestTime } = await this.settings.get();
    const [hours, minutes] = dailyDigestTime.split(':').map(Number);
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
    return { ready: now >= cutoff, availableAt: dailyDigestTime };
  }

  async getAdminDigest() {
    const { ready, availableAt } = await this.readiness();
    if (!ready) return { ready: false, availableAt } satisfies DigestNotReady;
    return this.buildAdminDigest();
  }

  private async buildAdminDigest() {
    const todayStart = startOfToday();
    const todayEnd = endOfToday();
    const soon = new Date(todayEnd);
    soon.setDate(soon.getDate() + RENEWAL_LOOKAHEAD_DAYS);

    const [newEnquiries, followUpEnquiries, renewalsDueToday, renewalsDueSoon, paymentsTodayAgg, paymentsToday, newClientsToday, pendingDraftsAcrossClients] =
      await Promise.all([
        this.prisma.enquiry.findMany({
          where: { createdAt: { gte: todayStart, lte: todayEnd } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, phone: true },
        }),
        this.prisma.enquiry.findMany({
          where: { status: EnquiryStatus.FOLLOW_UP },
          orderBy: { updatedAt: 'asc' },
          take: 10,
          select: { id: true, name: true, phone: true },
        }),
        this.prisma.client.findMany({
          where: { subscriptionEnd: { gte: todayStart, lte: todayEnd } },
          select: { id: true, businessName: true },
        }),
        this.prisma.client.count({ where: { subscriptionEnd: { gt: todayEnd, lte: soon } } }),
        this.prisma.payment.aggregate({
          where: { status: PaymentStatus.SUCCESS, paidAt: { gte: todayStart, lte: todayEnd } },
          _sum: { amount: true },
        }),
        this.prisma.payment.findMany({
          where: { status: PaymentStatus.SUCCESS, paidAt: { gte: todayStart, lte: todayEnd } },
          orderBy: { paidAt: 'desc' },
          include: { client: { select: { businessName: true } } },
        }),
        this.prisma.client.findMany({
          where: { createdAt: { gte: todayStart, lte: todayEnd } },
          select: { id: true, businessName: true },
        }),
        this.prisma.conversationMessage.count({ where: { status: MessageStatus.QUEUED } }),
      ]);

    return {
      ready: true as const,
      generatedAt: new Date(),
      newEnquiries: { count: newEnquiries.length, items: newEnquiries },
      followUpNeeded: { count: followUpEnquiries.length, items: followUpEnquiries },
      renewalsDueToday: { count: renewalsDueToday.length, items: renewalsDueToday },
      renewalsDueSoon,
      paymentsToday: {
        count: paymentsToday.length,
        total: paymentsTodayAgg._sum.amount ?? 0,
        items: paymentsToday.map((p) => ({ id: p.id, businessName: p.client.businessName, amount: p.amount })),
      },
      newClientsToday: { count: newClientsToday.length, items: newClientsToday },
      pendingDraftsAcrossClients,
    };
  }

  async getClientDigest(clientId: string) {
    const { ready, availableAt } = await this.readiness();
    if (!ready) return { ready: false, availableAt } satisfies DigestNotReady;

    const todayStart = startOfToday();
    const todayEnd = endOfToday();

    const [client, newConversations, newLeadsToday, staleLeads, messagesToday, pendingDrafts, quotationsToday] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: clientId }, select: { subscriptionEnd: true } }),
      this.prisma.customerConversation.findMany({
        where: { clientId, createdAt: { gte: todayStart, lte: todayEnd }, deletedAt: null },
        select: { id: true, customerName: true, customerPhone: true },
      }),
      this.prisma.customerLead.count({ where: { clientId, createdAt: { gte: todayStart, lte: todayEnd } } }),
      this.prisma.customerLead.findMany({
        where: {
          clientId,
          status: { in: [LeadStatus.NEW, LeadStatus.QUALIFIED] },
          updatedAt: { lt: new Date(Date.now() - STALE_LEAD_MS) },
        },
        orderBy: { updatedAt: 'asc' },
        take: 10,
        include: { conversation: { select: { customerName: true, customerPhone: true } } },
      }),
      this.prisma.conversationMessage.count({
        where: { conversation: { clientId }, createdAt: { gte: todayStart, lte: todayEnd } },
      }),
      this.prisma.conversationMessage.count({ where: { conversation: { clientId }, status: MessageStatus.QUEUED } }),
      this.prisma.quotation.count({ where: { clientId, createdAt: { gte: todayStart, lte: todayEnd } } }),
    ]);

    const renewalDueSoon =
      client?.subscriptionEnd && client.subscriptionEnd.getTime() - Date.now() <= RENEWAL_LOOKAHEAD_DAYS * 86_400_000
        ? { dueOn: client.subscriptionEnd }
        : null;

    return {
      ready: true as const,
      generatedAt: new Date(),
      newConversationsToday: { count: newConversations.length, items: newConversations },
      newLeadsToday,
      followUpNeeded: {
        count: staleLeads.length,
        items: staleLeads.map((l) => ({ id: l.id, name: l.conversation.customerName, phone: l.conversation.customerPhone })),
      },
      messagesToday,
      pendingDrafts,
      quotationsToday,
      renewalDueSoon,
    };
  }

  /**
   * Called on a periodic check (every few minutes, see DigestSenderProcessor) rather than a
   * single fixed-time cron — dailyDigestTime is admin-configurable at runtime, so instead of
   * re-registering a BullMQ repeatable job on every settings change, this just checks "is it
   * past today's configured time, and have we not already sent today's report" on each tick.
   * dailyDigestLastSentDate is the dedupe guard against sending the same day's report twice.
   */
  async sendDailyReportIfDue(): Promise<void> {
    const settings = await this.settings.get();
    if (!settings.dailyDigestWhatsappNumber) return;
    if (settings.dailyDigestLastSentDate === todayKey()) return;

    const { ready } = await this.readiness();
    if (!ready) return;

    const digest = await this.buildAdminDigest();
    const message = this.formatDigestMessage(digest);
    const { sent, reason } = await this.sessionManager.sendMessage(SYSTEM_WHATSAPP_SESSION_ID, settings.dailyDigestWhatsappNumber, message);
    if (!sent) {
      this.logger.warn(
        `Failed to send daily digest report to ${settings.dailyDigestWhatsappNumber} — will retry on the next check.${reason ? ` (${reason})` : ''}`,
      );
      return;
    }

    await this.prisma.platformSettings.update({ where: { id: settings.id }, data: { dailyDigestLastSentDate: todayKey() } });
    this.logger.log(`Daily digest report sent to ${settings.dailyDigestWhatsappNumber}.`);
  }

  private formatDigestMessage(digest: Awaited<ReturnType<DigestService['buildAdminDigest']>>): string {
    const dateLabel = digest.generatedAt.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const lines: string[] = [`📊 *Daily Digest — ${dateLabel}*`, ''];

    lines.push(`🆕 *New Enquiries Today:* ${digest.newEnquiries.count}`);
    for (const e of digest.newEnquiries.items) lines.push(`   • ${e.name} (${e.phone})`);

    lines.push('', `⏰ *Needing Follow-up:* ${digest.followUpNeeded.count}`);
    for (const e of digest.followUpNeeded.items) lines.push(`   • ${e.name} (${e.phone})`);

    lines.push(
      '',
      `📅 *Renewals Due Today:* ${digest.renewalsDueToday.count}`,
    );
    for (const c of digest.renewalsDueToday.items) lines.push(`   • ${c.businessName}`);
    lines.push(`📅 *Renewals Due in 7 Days:* ${digest.renewalsDueSoon}`);

    lines.push(
      '',
      `💰 *Payments Today:* ${digest.paymentsToday.count} (₹${Number(digest.paymentsToday.total).toLocaleString('en-IN')})`,
    );
    for (const p of digest.paymentsToday.items) lines.push(`   • ${p.businessName}: ₹${Number(p.amount).toLocaleString('en-IN')}`);

    lines.push('', `✨ *New Clients Today:* ${digest.newClientsToday.count}`);
    for (const c of digest.newClientsToday.items) lines.push(`   • ${c.businessName}`);

    lines.push('', `📝 *Drafts Awaiting Approval (all clients):* ${digest.pendingDraftsAcrossClients}`);

    return lines.join('\n');
  }
}
