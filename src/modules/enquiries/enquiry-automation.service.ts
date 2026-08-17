import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Enquiry, EnquiryStatus, MessageDirection } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AiService } from '../../common/services/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappSessionManagerService, WHATSAPP_MESSAGE_RECEIVED_EVENT, WhatsappMessageReceivedEvent } from '../whatsapp/whatsapp-session-manager.service';
import { PlansService } from '../plans/plans.service';
import { SYSTEM_WHATSAPP_SESSION_ID } from '../../common/constants';

const PRODUCT_SYSTEM_PROMPT_BASE = `You are a warm, knowledgeable sales assistant for "HFA Digital Creations", the
company behind "WhatsApp Automation" — a SaaS platform that lets businesses run their customer-facing WhatsApp
almost entirely on autopilot.

WHAT THE PRODUCT DOES:
- A business connects its own WhatsApp number to the platform.
- They train it on their own business knowledge (services, pricing, FAQs, policies) via plain text or uploaded
  documents (PDF/DOC/CSV) — the AI learns from that content specifically.
- The AI then automatically replies to that business's own customers on WhatsApp, using ONLY the business's
  approved knowledge — it never invents facts, prices, or policies.
- Two modes: "Full Autonomous" (AI replies instantly, no human involved) or "Draft & Approve" (AI drafts a
  reply, a human on the business's team approves it before it sends).
- Also included: automatic quotation generation from pricing templates, subscription renewal reminders,
  promotional broadcast campaigns to their own customer list, and a full admin dashboard.
- Every business gets its own login to manage settings, connect WhatsApp, upload training data, and review
  conversations.

RULES:
- You're talking to a PROSPECT who submitted an enquiry about this product — not an existing customer.
- Answer warmly and helpfully using ONLY the facts above and the current pricing below — never invent
  features, numbers, or promises that aren't stated here.
- Keep replies short and WhatsApp-appropriate (2-4 sentences), one topic at a time — don't dump everything at once.
- If asked something you don't have a real answer for, say the team will follow up with specifics — never guess.
- Gently guide interested prospects toward booking a call or signing up, but never be pushy or salesy.
- Never say "As an AI" or similar — talk like a real, warm member of the sales team.
- If they're rude or frustrated, stay calm and understanding — never match their tone.`;

@Injectable()
export class EnquiryAutomationService {
  private readonly logger = new Logger(EnquiryAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly config: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly sessionManager: WhatsappSessionManagerService,
    private readonly plansService: PlansService,
  ) {}

  private async buildSystemPrompt(): Promise<string> {
    const plans = await this.plansService.list({ publicOnly: true });
    const plansText = plans.length
      ? plans
          .map(
            (p) =>
              `- ${p.title}: ${p.currency} ${p.price} / ${p.durationValue} ${p.durationType.toLowerCase()}, up to ${p.whatsappAccountLimit} WhatsApp account(s)`,
          )
          .join('\n')
      : '(no published plans right now — tell them the team will share pricing directly)';

    return `${PRODUCT_SYSTEM_PROMPT_BASE}\n\nCURRENT PRICING (only mention these real plans, never invent others):\n${plansText}`;
  }

  private async recordMessage(enquiryId: string, direction: MessageDirection, content: string) {
    await this.prisma.enquiryMessage.create({ data: { enquiryId, direction, content } });
  }

  /**
   * Fires once, right after a public enquiry is submitted — introduces the product on
   * both channels immediately, with no admin action needed. Fire-and-forget from the
   * caller: never blocks the public enquiry form's response on an AI call + WhatsApp send.
   */
  async sendInitialOutreach(enquiry: Enquiry) {
    if (!this.ai.isConfigured) {
      this.logger.warn(`Skipping automatic enquiry outreach for ${enquiry.id}: AI provider not configured.`);
      return;
    }

    const systemPrompt = await this.buildSystemPrompt();
    const prompt = `A prospect just submitted this enquiry — write your first message to them, introducing the
product and responding to what they asked about.

Name: ${enquiry.name}
Business: ${enquiry.businessName ?? 'unknown'}
Business type: ${enquiry.businessType ?? 'unknown'}
Their message: ${enquiry.message ?? '(no message provided)'}`;

    const message = await this.ai.complete({ system: systemPrompt, prompt, maxTokens: 350 });
    if (!message) {
      this.logger.warn(`AI outreach generation failed for enquiry ${enquiry.id}.`);
      return;
    }

    await this.notificationsService.sendCustom({
      phone: enquiry.phone,
      email: enquiry.email,
      subject: 'Thanks for reaching out to WhatsApp Automation',
      emailHtml: enquiry.email ? `<p>${message.replace(/\n/g, '<br/>')}</p>` : undefined,
      whatsappMessage: message,
    });
    await this.recordMessage(enquiry.id, MessageDirection.OUTBOUND, message);

    if (enquiry.status === EnquiryStatus.NEW) {
      await this.prisma.enquiry.update({ where: { id: enquiry.id }, data: { status: EnquiryStatus.CONTACTED } });
    }
  }

  /**
   * Continues the pre-sales conversation whenever a prospect replies on WhatsApp to the
   * platform's own number — matched to their enquiry by phone number. Ignores messages
   * from numbers that don't match a known, still-open enquiry (never auto-replies to an
   * arbitrary inbound message on the system session).
   */
  @OnEvent(WHATSAPP_MESSAGE_RECEIVED_EVENT)
  async handleIncomingMessage(event: WhatsappMessageReceivedEvent) {
    if (event.sessionId !== SYSTEM_WHATSAPP_SESSION_ID) return;
    if (!this.ai.isConfigured) {
      this.logger.warn('Skipping enquiry auto-reply: AI provider not configured.');
      return;
    }

    const enquiry = await this.findOpenEnquiryByPhone(event.fromPhone, event.resolvedPhone);
    if (!enquiry) {
      // Deliberately quiet at info level, not warn — most inbound messages on the system
      // number legitimately aren't from an open enquiry (e.g. a client texting support).
      this.logger.log(`No open enquiry matched inbound message from ${event.resolvedPhone ?? event.fromPhone} — ignoring.`);
      return;
    }

    await this.recordMessage(enquiry.id, MessageDirection.INBOUND, event.body);

    const [systemPrompt, history] = await Promise.all([
      this.buildSystemPrompt(),
      this.prisma.enquiryMessage.findMany({ where: { enquiryId: enquiry.id }, orderBy: { createdAt: 'asc' }, take: 30 }),
    ]);
    const chatHistory = history.map((m) => ({
      role: m.direction === MessageDirection.INBOUND ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    const reply = await this.ai.chat({ system: systemPrompt, history: chatHistory });
    if (!reply) {
      this.logger.warn(`AI reply generation failed for enquiry ${enquiry.id}.`);
      return;
    }

    const sent = await this.sessionManager.sendMessage(SYSTEM_WHATSAPP_SESSION_ID, event.fromPhone, reply);
    if (sent) await this.recordMessage(enquiry.id, MessageDirection.OUTBOUND, reply);
  }

  /**
   * Matches on trailing digits so a stored number with/without a country code still
   * matches the WhatsApp JID. Tries the resolved real phone number first (WhatsApp
   * increasingly hands `fromPhone` back as a privacy-preserving Linked ID, `@lid`,
   * rather than an actual number — matching that against a submitted phone number
   * would never succeed even with digit normalization, since a LID isn't a reformatted
   * phone number at all), then falls back to fromPhone for the older/common case.
   */
  private async findOpenEnquiryByPhone(fromPhone: string, resolvedPhone: string | null): Promise<Enquiry | null> {
    const candidateDigits = [resolvedPhone, fromPhone]
      .filter((p): p is string => !!p)
      .map((p) => p.replace(/\D/g, ''))
      .filter(Boolean);
    if (!candidateDigits.length) return null;

    const enquiries = await this.prisma.enquiry.findMany({
      where: { status: { notIn: [EnquiryStatus.CONVERTED, EnquiryStatus.NOT_INTERESTED, EnquiryStatus.CLOSED] } },
      orderBy: { createdAt: 'desc' },
    });
    return (
      enquiries.find((e) => {
        const enquiryDigits = e.phone.replace(/\D/g, '');
        return candidateDigits.some((digits) => enquiryDigits.endsWith(digits.slice(-10)) || digits.endsWith(enquiryDigits.slice(-10)));
      }) ?? null
    );
  }

  /** Fires once, when an enquiry is marked CONVERTED — lets the team know on WhatsApp without watching the panel. */
  async notifyAdminOfConversion(enquiry: Enquiry) {
    const notifyNumber = this.config.get<string>('WHATSAPP_NOTIFICATION_NUMBER');
    if (!notifyNumber) {
      this.logger.warn(`Skipping conversion notification for enquiry ${enquiry.id}: WHATSAPP_NOTIFICATION_NUMBER is not configured.`);
      return;
    }

    const message =
      `🎉 Enquiry converted!\n\n` +
      `Name: ${enquiry.name}\n` +
      `Business: ${enquiry.businessName ?? '-'}\n` +
      `Phone: ${enquiry.phone}\n` +
      `Email: ${enquiry.email ?? '-'}\n\n` +
      `View it in the admin panel under Enquiries.`;
    await this.sessionManager.sendMessage(SYSTEM_WHATSAPP_SESSION_ID, notifyNumber, message);
  }

  getMessages(enquiryId: string) {
    return this.prisma.enquiryMessage.findMany({ where: { enquiryId }, orderBy: { createdAt: 'asc' } });
  }
}
