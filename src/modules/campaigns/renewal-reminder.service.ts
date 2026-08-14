import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignType } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CampaignsService } from './campaigns.service';
import { humanSendDelayMs, sleep } from '../../common/utils/throttle';

const DEFAULT_REMINDER_DAYS = [7, 3, 1, 0];

function buildMessage(businessName: string, planTitle: string, days: number, expiryDate: Date): string {
  // Explicit timeZone — the container runs in UTC, so an unqualified call could
  // shift the displayed day near the UTC/IST midnight boundary.
  const dateStr = expiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
  if (days <= 0) {
    return `Hi ${businessName}, your ${planTitle} plan expires today. Renew anytime from your dashboard to avoid any interruption to your WhatsApp automation.`;
  }
  return `Hi ${businessName}, just a heads up — your ${planTitle} plan ends in ${days} day${days === 1 ? '' : 's'} (on ${dateStr}). Renew anytime from your dashboard to keep things running smoothly.`;
}

@Injectable()
export class RenewalReminderService {
  private readonly logger = new Logger(RenewalReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly subscriptionService: SubscriptionService,
    private readonly notificationsService: NotificationsService,
    private readonly campaignsService: CampaignsService,
  ) {}

  private getReminderDays(): number[] {
    const raw = this.config.get<string>('RENEWAL_REMINDER_DAYS');
    if (!raw) return DEFAULT_REMINDER_DAYS;
    const parsed = raw.split(',').map((d) => Number(d.trim())).filter((d) => !Number.isNaN(d));
    return parsed.length > 0 ? parsed : DEFAULT_REMINDER_DAYS;
  }

  async run(): Promise<{ sent: number; skipped: number }> {
    const reminderDays = this.getReminderDays();
    const campaign = await this.campaignsService.getOrCreateSystemCampaign(CampaignType.RENEWAL);

    const clients = await this.prisma.client.findMany({
      where: { subscriptionEnd: { not: null } },
      include: { user: true, plan: true },
    });

    let sent = 0;
    let skipped = 0;

    for (const client of clients) {
      const status = this.subscriptionService.computeStatus(client);
      if (status !== 'ACTIVE' && status !== 'EXPIRING_SOON') continue;

      const remainingDays = this.subscriptionService.remainingDays(client);
      if (remainingDays == null || !reminderDays.includes(remainingDays)) continue;

      const alreadySent = await this.campaignsService.hasSentToday(campaign.id, { clientId: client.id });
      if (alreadySent) {
        skipped++;
        continue;
      }

      // Random human-like gap before each send in this bulk job — sending WhatsApp
      // messages to many recipients back-to-back is one of the strongest automated-
      // behavior signals WhatsApp's detection looks for (see automation safety notes).
      if (sent > 0) await sleep(humanSendDelayMs());

      const message = buildMessage(client.businessName, client.plan?.title ?? 'your', remainingDays, client.subscriptionEnd!);
      const result = await this.notificationsService.sendCustom({
        email: client.user.email,
        phone: client.user.phone,
        subject: `Your subscription ${remainingDays === 0 ? 'expires today' : `expires in ${remainingDays} day(s)`}`,
        emailHtml: `<p>${message}</p>`,
        whatsappMessage: message,
      });

      await this.campaignsService.recordMessage({
        campaignId: campaign.id,
        clientId: client.id,
        content: message,
        sent: result.emailSent || result.whatsappSent,
      });

      await this.notificationsService.notifyInApp(
        client.userId,
        'SUBSCRIPTION_EXPIRING',
        'Subscription renewal reminder',
        message,
      );

      sent++;
    }

    this.logger.log(`Renewal reminders: sent ${sent}, skipped ${skipped} (already notified today)`);
    return { sent, skipped };
  }
}
