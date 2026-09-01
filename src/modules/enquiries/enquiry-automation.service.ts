import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { AutomationMode, Enquiry, EnquirySource, EnquiryStatus, MessageDirection, MessageStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AiService } from '../../common/services/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappSessionManagerService, WHATSAPP_MESSAGE_RECEIVED_EVENT, WhatsappMessageReceivedEvent } from '../whatsapp/whatsapp-session-manager.service';
import { PlansService } from '../plans/plans.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { SYSTEM_WHATSAPP_SESSION_ID } from '../../common/constants';
import { inboundMessageContent } from '../../common/utils/whatsapp-message.util';

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
- If they're rude or frustrated, stay calm and understanding — never match their tone.
- If they send a photo, look at it and respond to what it actually shows — never invent facts about it
  beyond what's visible and what's stated above.`;

/**
 * Used for anyone who messages the platform's own WhatsApp number directly — a personal
 * referral, someone who found the number outside the landing page, an existing contact
 * asking about a different service, etc. — rather than through the enquiry form (those
 * prospects get the WhatsApp-Automation-focused, plan-aware prompt above instead). Content
 * sourced from a full read-through of https://hfadigitalcreations.com/ (home + all 6 service
 * pages + contact page) — every fact, figure, and price below is stated on the live site,
 * nothing invented, per this codebase's "never invent" rule for anything AI-generated.
 */
const HFA_SALES_SYSTEM_PROMPT_BASE = `You are a warm, knowledgeable sales executive at HFA Digital Creations, a
rapid-deployment digital agency based in Salem, Tamil Nadu, India — "Helping businesses move faster and smarter
by blending AI-driven innovation and agile execution." You work with both startups and established businesses.

SERVICES WE OFFER:

1. AI & Data — Data engineering/pipelines (multi-source ingestion, real-time ETL, lakehouse sync, 10TB+/day
   throughput at <50ms latency), machine learning (NLP/sentiment models, predictive churn/market models), AI
   automation (autonomous agents integrated into Slack/Salesforce/ERPs), and analytics/BI dashboards. Stack:
   Spark, Airflow, dbt, Kafka, PyTorch, Hugging Face, LangChain, TensorFlow, Snowflake, AWS/Azure, Kubernetes.
   Timeline: 4-8 weeks (simple) to 12-24 weeks (complex). No fixed pricing published — team quotes after scoping.

2. Website Development — Custom-built (not templated) full-stack web apps, mobile-first responsive design,
   technical SEO. Stack: React, Next.js, TypeScript, Tailwind CSS, Node.js, PostgreSQL/MySQL, Docker, AWS.
   Timeline: 2-4 weeks (simple) to 8-16 weeks (complex). Optional post-launch security/updates/24-7 support
   packages. No fixed pricing published.

3. App Development — Native and cross-platform iOS/Android apps. Stack: Flutter, React Native, Swift, Kotlin,
   Xamarin. 120fps animations, biometric auth, end-to-end encryption, offline-first. 5-stage process: Strategy
   → Design → Development → QA → Launch, including App Store submission help. Timeline: 8-12 weeks (simple) to
   20-32 weeks (complex). Pricing: simple apps from ₹8 Lakhs+; complex apps ₹25-80 Lakhs+ depending on features.

4. Ecommerce — Storefront builds, inventory systems, data migration off WooCommerce/Magento, ERP/CRM
   integration (NetSuite, SAP, Salesforce, HubSpot), Shopify-vs-custom-headless consulting. 4-step process:
   Audit → Migrate → Optimize → Launch. PCI-DSS Level 1 payment gateways (Stripe, Adyen). Claimed results:
   400% faster load times (0.4s), 4.8% average conversion rate, 85% repeat-purchase rate. Free audit + 14-day
   free trial offered. No fixed pricing published.

5. Digital Marketing — SEO, Google/Meta PPC, content marketing, social growth, email funnels. 4-step "Growth
   Blueprint": Audit → Blueprint (90-day roadmap) → Execute → Scale. PPC results in days; SEO takes 3-6 months.
   Typical managed ad spend ranges ₹80,000 to ₹40 Lakhs+/month (service fees quoted separately, not published).
   Claimed results: 250% average ROI increase, 94% client retention.

6. Social Media & Advertising (Creative Services) — Commercial ad video production, founder personal-branding
   (LinkedIn/Twitter), full social media management, short-form video editing (Reels/Shorts), content and
   direct-response script writing for the Indian market. 5-step pipeline: Brand Discovery → Script & Storyboard
   → Premium Production → Retention Editing → Distribution & Scale. Turnaround: 24-48 hours for vertical videos,
   1-2 weeks for larger commercial shoots. Claimed results: 3.2x organic engagement, 45% lower ad acquisition cost.

7. WhatsApp Automation (our own SaaS product) — a platform we built ourselves that lets a business run its
   customer-facing WhatsApp almost entirely on autopilot: connect your number, train the AI on your own
   business knowledge, and it replies to your customers automatically (Full Autonomous or Draft & Approve
   modes), plus auto quotations, renewal reminders, and broadcast campaigns. Mention this specifically when a
   prospect's need sounds like "handling WhatsApp customer replies" — pricing for this one IS available below.

HOW WE WORK: Discovery → Requirements → Design → Development → Testing → Launch. Payment: 30% upfront, 40% at
mid-project, 30% on final delivery. We offer a free 30-minute discovery call to any new prospect, and guarantee
a response to enquiries within 24 hours. Company claims 100% client retention and 7+ clients served to date.

CONTACT: info@hfadigitalcreations.com, +91 77087 86087.

RULES:
- Figure out from what they say which service(s) they actually need — don't recite the whole list unprompted.
- Answer using ONLY the facts above (and the WhatsApp Automation pricing below when relevant) — never invent
  numbers, timelines, or promises beyond what's stated.
- Where no fixed price is published (everything except App Development and WhatsApp Automation), say the team
  will scope it and share a custom quote — never guess a number.
- Keep replies short and WhatsApp-appropriate (2-4 sentences), one topic at a time.
- Gently guide toward booking the free 30-minute discovery call or sharing their requirement in more detail,
  never pushy or salesy.
- Never say "As an AI" or similar — talk like a real, warm member of the sales team.
- If they're rude or frustrated, stay calm and understanding — never match their tone.
- If they send a photo, look at it and respond to what it actually shows — never invent facts about it
  beyond what's visible and what's stated above.`;

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
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  private async buildSystemPrompt(enquiry: Enquiry): Promise<string> {
    const plans = await this.plansService.list({ publicOnly: true });
    const plansText = plans.length
      ? plans
          .map(
            (p) =>
              `- ${p.title}: ${p.currency} ${p.price} / ${p.durationValue} ${p.durationType.toLowerCase()}, up to ${p.whatsappAccountLimit} WhatsApp account(s)`,
          )
          .join('\n')
      : '(no published plans right now — tell them the team will share pricing directly)';

    const chosenPlan = enquiry.planId ? plans.find((p) => p.id === enquiry.planId) : undefined;
    const multiAccountLine =
      chosenPlan && chosenPlan.whatsappAccountLimit > 1
        ? ` This plan supports up to ${chosenPlan.whatsappAccountLimit} WhatsApp numbers — also ask how many they'll actually need.`
        : '';
    const planFocus = chosenPlan
      ? `\n\nTHIS PROSPECT ALREADY CHOSE A PLAN ON THE SIGNUP FORM: "${chosenPlan.title}" (${chosenPlan.currency} ${chosenPlan.price} / ${chosenPlan.durationValue} ${chosenPlan.durationType.toLowerCase()}, up to ${chosenPlan.whatsappAccountLimit} WhatsApp account(s)). Included: ${
          chosenPlan.planFeatures.length ? chosenPlan.planFeatures.map((pf) => pf.feature.name).join(', ') : 'no add-on features listed'
        }.
Center the conversation on this specific plan — don't re-pitch the others unless they ask. Your job now
is to actively gather, one focused question at a time (never a survey-style list), whatever is genuinely
needed to set their account up on it: their business's services/pricing/policies worth training the AI
on.${multiAccountLine} Never ask for anything the platform doesn't actually use (see WHAT THE PRODUCT
DOES above); if they've already told you something, don't ask again.`
      : '';

    return `${PRODUCT_SYSTEM_PROMPT_BASE}\n\nCURRENT PRICING (only mention these real plans, never invent others):\n${plansText}${planFocus}`;
  }

  /** Same real-plans lookup as buildSystemPrompt(), just without a specific chosen plan to focus on. */
  private async buildGeneralSalesPrompt(): Promise<string> {
    const plans = await this.plansService.list({ publicOnly: true });
    const plansText = plans.length
      ? plans
          .map(
            (p) =>
              `- ${p.title}: ${p.currency} ${p.price} / ${p.durationValue} ${p.durationType.toLowerCase()}, up to ${p.whatsappAccountLimit} WhatsApp account(s)`,
          )
          .join('\n')
      : '(no published plans right now — tell them the team will share pricing directly)';

    return `${HFA_SALES_SYSTEM_PROMPT_BASE}\n\nWHATSAPP AUTOMATION SAAS PRICING (only mention these real plans, never invent others):\n${plansText}`;
  }

  private async recordMessage(
    enquiryId: string,
    direction: MessageDirection,
    content: string,
    opts: { status?: MessageStatus; automationGenerated?: boolean } = {},
  ) {
    await this.prisma.enquiryMessage.create({
      data: { enquiryId, direction, content, status: opts.status ?? MessageStatus.SENT, automationGenerated: opts.automationGenerated ?? false },
    });
  }

  /**
   * Sends an AI-generated reply immediately (enquiryAutomationMode FULL_AUTONOMOUS, the
   * default), or queues it as a draft for admin review (DRAFT_APPROVE) — same choice
   * Client.automationMode already offers per-client for their own customer conversations
   * (see AutomationEngineService.deliverReply), just platform-wide since an enquiry has no
   * single owning client. Shared by both replyToEnquiry() and replyAsGeneralSalesExecutive().
   */
  private async deliverReply(enquiry: Enquiry, event: WhatsappMessageReceivedEvent, content: string) {
    const settings = await this.platformSettingsService.get();
    if (settings.enquiryAutomationMode === AutomationMode.FULL_AUTONOMOUS) {
      const { sent } = await this.sessionManager.sendMessage(SYSTEM_WHATSAPP_SESSION_ID, event.fromPhone, content);
      if (sent) {
        await this.recordMessage(enquiry.id, MessageDirection.OUTBOUND, content, { automationGenerated: true, status: MessageStatus.SENT });
      }
      return;
    }

    await this.recordMessage(enquiry.id, MessageDirection.OUTBOUND, content, {
      automationGenerated: true,
      status: MessageStatus.QUEUED,
    });
    const admins = await this.prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } } });
    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.notifyInApp(
          admin.id,
          'DRAFT_READY',
          'A reply is ready for your review',
          `${enquiry.name} messaged in — a draft reply is waiting for approval.`,
        ),
      ),
    );
  }

  /**
   * Fires once, right after a public enquiry is submitted — introduces the product on
   * both channels immediately, with no admin action needed. Fire-and-forget from the
   * caller: never blocks the public enquiry form's response on an AI call + WhatsApp send.
   */
  async sendInitialOutreach(enquiry: Enquiry) {
    if (!(await this.platformSettingsService.get()).adminAutoReplyEnabled) {
      this.logger.log(`Skipping automatic enquiry outreach for ${enquiry.id}: admin auto-reply is disabled.`);
      return;
    }
    if (!this.ai.isConfigured) {
      this.logger.warn(`Skipping automatic enquiry outreach for ${enquiry.id}: AI provider not configured.`);
      return;
    }

    const systemPrompt = await this.buildSystemPrompt(enquiry);
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

    const result = await this.notificationsService.sendCustom({
      phone: enquiry.phone,
      email: enquiry.email,
      subject: 'Thanks for reaching out to WhatsApp Automation',
      emailHtml: enquiry.email ? `<p>${message.replace(/\n/g, '<br/>')}</p>` : undefined,
      whatsappMessage: message,
    });

    if (!result.emailSent && !result.whatsappSent) {
      // Nothing actually reached the prospect — don't log a phantom "sent" message in
      // their conversation thread or mark the enquiry CONTACTED when it wasn't.
      this.logger.warn(
        `Initial outreach for enquiry ${enquiry.id} did not go out via email or WhatsApp.${
          result.whatsappFailureReason ? ` WhatsApp: ${result.whatsappFailureReason}` : ''
        }`,
      );
      return;
    }

    await this.recordMessage(enquiry.id, MessageDirection.OUTBOUND, message);

    if (enquiry.status === EnquiryStatus.NEW) {
      await this.prisma.enquiry.update({ where: { id: enquiry.id }, data: { status: EnquiryStatus.CONTACTED } });
    }
  }

  /**
   * Handles every inbound message on the platform's own WhatsApp number, as long as the
   * admin hasn't switched off auto-reply entirely (PlatformSettings.adminAutoReplyEnabled).
   * Two paths when it's on: a prospect who came through the enquiry form (matched by phone,
   * still open) continues their plan-focused WhatsApp Automation conversation via
   * replyToEnquiry(); anyone else — a direct message from someone who never filled out the
   * form — gets picked up as a new or continuing lead and answered by
   * replyAsGeneralSalesExecutive(), which represents all of HFA Digital Creations' services,
   * not just this one SaaS product.
   */
  @OnEvent(WHATSAPP_MESSAGE_RECEIVED_EVENT)
  async handleIncomingMessage(event: WhatsappMessageReceivedEvent) {
    if (event.sessionId !== SYSTEM_WHATSAPP_SESSION_ID) return;
    if (!(await this.platformSettingsService.get()).adminAutoReplyEnabled) {
      this.logger.log('Skipping WhatsApp auto-reply: disabled in Admin Settings.');
      return;
    }
    if (!this.ai.isConfigured) {
      this.logger.warn('Skipping WhatsApp auto-reply: AI provider not configured.');
      return;
    }

    try {
      const openEnquiry = await this.findEnquiryByPhone(event.fromPhone, event.resolvedPhone, {
        excludeStatuses: [EnquiryStatus.CONVERTED, EnquiryStatus.NOT_INTERESTED, EnquiryStatus.CLOSED],
      });
      if (openEnquiry) {
        await this.replyToEnquiry(openEnquiry, event);
        return;
      }
      await this.replyAsGeneralSalesExecutive(event);
    } catch (err: any) {
      // This ran fully unguarded before — any throw here (history fetch, prompt build,
      // etc.) silently dropped the whole reply with nothing sent and nothing logged
      // beyond a bare unhandledRejection, since `@OnEvent` listeners fire-and-forget.
      // Logging it explicitly turns a silent "why didn't the prospect get a reply?"
      // into something actually debuggable.
      this.logger.error(`WhatsApp auto-reply crashed for ${event.resolvedPhone ?? event.fromPhone}: ${err.message}`, err.stack);
    }
  }

  private async replyToEnquiry(enquiry: Enquiry, event: WhatsappMessageReceivedEvent) {
    await this.recordMessage(enquiry.id, MessageDirection.INBOUND, inboundMessageContent(event.body, !!event.image));

    const [systemPrompt, history] = await Promise.all([
      this.buildSystemPrompt(enquiry),
      this.prisma.enquiryMessage.findMany({ where: { enquiryId: enquiry.id }, orderBy: { createdAt: 'asc' }, take: 30 }),
    ]);
    const chatHistory = history.map((m) => ({
      role: m.direction === MessageDirection.INBOUND ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    const reply = await this.ai.chat({ system: systemPrompt, history: chatHistory, image: event.image ?? undefined });
    if (!reply) {
      this.logger.warn(`AI reply generation failed for enquiry ${enquiry.id}.`);
      return;
    }

    await this.deliverReply(enquiry, event, reply);
  }

  /**
   * Answers anyone who messages the platform's own number directly, as a general HFA
   * Digital Creations sales executive (see HFA_SALES_SYSTEM_PROMPT_BASE) rather than the
   * WhatsApp-Automation-specific pitch. Finds or creates a lightweight Enquiry so the
   * conversation has history and shows up in the admin's Enquiries panel like any other
   * lead — reusing that whole pipeline instead of building a parallel one.
   */
  private async replyAsGeneralSalesExecutive(event: WhatsappMessageReceivedEvent) {
    let enquiry = await this.findEnquiryByPhone(event.fromPhone, event.resolvedPhone);
    if (!enquiry) {
      const phone = event.resolvedPhone ?? event.fromPhone.replace(/@.*/, '');
      enquiry = await this.prisma.enquiry.create({
        data: { name: event.customerName || 'WhatsApp Contact', phone, source: EnquirySource.WHATSAPP },
      });
      const admins = await this.prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } } });
      await Promise.all(
        admins.map((admin) =>
          this.notificationsService.notifyInApp(
            admin.id,
            'NEW_ENQUIRY',
            'New WhatsApp message',
            `${enquiry!.name} (${phone}) messaged the business WhatsApp number directly.`,
          ),
        ),
      );
    }

    await this.recordMessage(enquiry.id, MessageDirection.INBOUND, inboundMessageContent(event.body, !!event.image));

    const [systemPrompt, history] = await Promise.all([
      this.buildGeneralSalesPrompt(),
      this.prisma.enquiryMessage.findMany({ where: { enquiryId: enquiry.id }, orderBy: { createdAt: 'asc' }, take: 30 }),
    ]);
    const chatHistory = history.map((m) => ({
      role: m.direction === MessageDirection.INBOUND ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    const reply = await this.ai.chat({ system: systemPrompt, history: chatHistory, image: event.image ?? undefined });
    if (!reply) {
      this.logger.warn(`General sales reply generation failed for enquiry ${enquiry.id}.`);
      return;
    }

    await this.deliverReply(enquiry, event, reply);
  }

  /**
   * Matches on trailing digits so a stored number with/without a country code still
   * matches the WhatsApp JID. Tries the resolved real phone number first (WhatsApp
   * increasingly hands `fromPhone` back as a privacy-preserving Linked ID, `@lid`,
   * rather than an actual number — matching that against a submitted phone number
   * would never succeed even with digit normalization, since a LID isn't a reformatted
   * phone number at all), then falls back to fromPhone for the older/common case.
   * `excludeStatuses` narrows the search (e.g. skip CONVERTED leads); omitted, it matches
   * any enquiry regardless of status, so a long-running direct WhatsApp thread stays on
   * one record instead of spawning a new one every time its status gets changed.
   */
  private async findEnquiryByPhone(
    fromPhone: string,
    resolvedPhone: string | null,
    opts: { excludeStatuses?: EnquiryStatus[] } = {},
  ): Promise<Enquiry | null> {
    const candidateDigits = [resolvedPhone, fromPhone]
      .filter((p): p is string => !!p)
      .map((p) => p.replace(/\D/g, ''))
      .filter(Boolean);
    if (!candidateDigits.length) return null;

    const enquiries = await this.prisma.enquiry.findMany({
      where: opts.excludeStatuses ? { status: { notIn: opts.excludeStatuses } } : undefined,
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
