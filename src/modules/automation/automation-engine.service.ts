import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AutomationMode, MessageDirection, MessageStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AiService } from '../../common/services/ai.service';
import { FeaturesService } from '../features/features.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { KnowledgeExtractionService } from '../training/knowledge-extraction.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappSessionManagerService, WHATSAPP_MESSAGE_RECEIVED_EVENT, WhatsappMessageReceivedEvent } from '../whatsapp/whatsapp-session-manager.service';
import { ConversationsService } from './conversations.service';
import { LeadExtractionService } from './lead-extraction.service';

const LANGUAGE_PROMPT_MESSAGE =
  "Hi! Before we get started, which language would you like to chat in? (e.g. English, Hindi, Tamil...)";

function buildSystemPrompt(
  businessName: string,
  knowledgeContext: string,
  fallbackMessage: string,
  accountPhone: string | null,
  preferredLanguage: string | null,
  conversationFlow: string | null,
): string {
  // Sourced from the client's own OTP-verified account phone (User.phone), never a
  // freely-typed field — a customer is only ever given a number the client actually
  // proved they control.
  const contactRule = accountPhone
    ? `- When the customer is ready to book, register, or pay, don't default to either a link or a phone number —
  ask them which they'd prefer: "Would you like the registration link, or would you rather speak with our team
  directly?" Only share a registration link if one is explicitly present in the approved knowledge above and
  the customer asked for it; never invent one. If they'd rather talk, or no link exists in the approved
  knowledge, give them ${accountPhone} to call or WhatsApp.
- If the customer negotiates, asks for a discount beyond what's in the approved knowledge, or pushes back on
  price, do not get defensive or repeat the price flatly. Acknowledge them warmly, explain the price is fixed
  as listed, and offer to have the team discuss it directly — share ${accountPhone} for that conversation.`
    : `- If the customer negotiates or pushes back on price, do not get defensive or repeat the price flatly.
  Acknowledge them warmly and explain the price is fixed as listed in the approved knowledge.`;

  const languageRule = preferredLanguage
    ? `- The customer has asked to chat in: "${preferredLanguage}". Reply in that language for this entire
  conversation, translating the approved knowledge naturally — never invent facts in the process of translating.`
    : '';

  const flowSection = conversationFlow
    ? `\nCONVERSATION FLOW — follow these steps in this exact order, one at a time. Never skip a step, never
combine steps into one message, and never jump ahead even if the customer's message sounds like it answers a
later step — if they jump ahead, still ask whatever the current step needs before moving on:
${conversationFlow}
`
    : '';

  return `You are the WhatsApp assistant for "${businessName}", a real business. You chat directly with their
customers on WhatsApp, so replies must feel like a helpful human team member — natural, warm, concise.
${flowSection}
APPROVED BUSINESS KNOWLEDGE (this is the ONLY source of facts you may use — nothing else, ever):
${knowledgeContext}

RULES — these are non-negotiable:
- Every factual claim in your reply must come directly from the approved knowledge above. Do not add details,
  numbers, policies, or promises that aren't stated there, even if they sound plausible or helpful.
- If the customer's question isn't answered by the approved knowledge, do NOT guess, infer, or improvise.
  Reply with something close to: "${fallbackMessage}"
- Stay strictly on the topic of this business. Do not engage with small talk, opinions, jokes, general
  knowledge questions, or anything unrelated to what's in the approved knowledge — politely steer the
  conversation back to how you can help regarding this business instead.
- Never say things like "As an AI", "I am an assistant", or "according to my database" — just talk naturally.
- Keep replies short and WhatsApp-friendly (1-4 sentences). Don't dump everything at once — ask one relevant
  follow-up question at a time if you need more information from the customer.
- Be warm and conversational in tone, but never at the cost of rule 1 — a correct, on-topic answer always
  beats a friendlier-sounding one that strays from the approved knowledge.
- If the customer is rude, harsh, or frustrated, stay calm and understanding — never match their tone, get
  defensive, or become curt. Acknowledge how they feel and keep helping.
${contactRule}${languageRule ? `\n${languageRule}` : ''}`;
}

@Injectable()
export class AutomationEngineService {
  private readonly logger = new Logger(AutomationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly featuresService: FeaturesService,
    private readonly subscriptionService: SubscriptionService,
    private readonly knowledgeExtraction: KnowledgeExtractionService,
    private readonly notificationsService: NotificationsService,
    private readonly sessionManager: WhatsappSessionManagerService,
    private readonly conversationsService: ConversationsService,
    private readonly leadExtraction: LeadExtractionService,
  ) {}

  @OnEvent(WHATSAPP_MESSAGE_RECEIVED_EVENT)
  async handleIncomingMessage(event: WhatsappMessageReceivedEvent) {
    const account = await this.prisma.whatsappAccount.findUnique({
      where: { sessionId: event.sessionId },
      include: { client: { include: { user: true } } },
    });
    // Not a client-owned account (e.g. the platform's own notification session) — ignore.
    if (!account) return;

    const { client } = account;
    const conversation = await this.conversationsService.findOrCreate(
      client.id,
      account.id,
      event.fromPhone,
      event.customerName,
    );
    await this.conversationsService.addMessage(conversation.id, MessageDirection.INBOUND, event.body);

    const subscriptionStatus = this.subscriptionService.computeStatus(client);
    if (subscriptionStatus === 'EXPIRED' || subscriptionStatus === 'NOT_ACTIVATED') {
      this.logger.log(`Skipping auto-reply for client ${client.id}: subscription ${subscriptionStatus}`);
      return;
    }

    const automationEnabled = await this.featuresService.isFeatureEnabled(client.id, 'WHATSAPP_AUTOMATION');
    if (!automationEnabled) return;

    if (!this.ai.isConfigured) {
      this.logger.warn('Skipping auto-reply: AI provider not configured.');
      return;
    }

    // Every new conversation opens with a language check before any business content —
    // the first inbound message only gets this prompt; the customer's next message is
    // then treated as their language answer and stored for the rest of the conversation.
    let preferredLanguage = conversation.preferredLanguage;
    if (!preferredLanguage) {
      const inboundCount = await this.conversationsService.countInboundMessages(conversation.id);
      if (inboundCount <= 1) {
        // Always sent immediately, regardless of automationMode — it's a fixed,
        // non-AI-generated question with nothing for a human to review, and queuing
        // it as a draft would stall the flow (the customer's next message is treated
        // as their language answer whether or not they've actually seen this prompt).
        await this.deliverReply(client, account, conversation.id, event, LANGUAGE_PROMPT_MESSAGE, { forceImmediate: true });
        return;
      }
      preferredLanguage = event.body.trim();
      await this.conversationsService.setPreferredLanguage(conversation.id, preferredLanguage);
    }

    const [knowledgeContext, history] = await Promise.all([
      this.knowledgeExtraction.getKnowledgeContext(client.id),
      this.conversationsService.recentHistory(conversation.id),
    ]);

    const systemPrompt = buildSystemPrompt(
      client.businessName,
      knowledgeContext,
      client.fallbackMessage,
      client.user.phone,
      preferredLanguage,
      client.conversationFlow,
    );
    const chatHistory = history.map((m) => ({
      role: m.direction === MessageDirection.INBOUND ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    const [aiReply] = await Promise.all([
      this.ai.chat({ system: systemPrompt, history: chatHistory }),
      this.leadExtraction.extractAndUpdate(client.id, conversation.id, chatHistory).catch((err) =>
        this.logger.warn(`Lead extraction failed for conversation ${conversation.id}: ${err.message}`),
      ),
    ]);

    if (aiReply) {
      await this.deliverReply(client, account, conversation.id, event, aiReply);
      return;
    }

    // The AI call failed (provider outage, rate limit, etc.) — a customer question
    // getting total silence is worse than a canned fallback, and unlike a real AI reply
    // there's nothing here that needs human review, so this always sends immediately
    // regardless of automationMode.
    this.logger.warn(`AI reply generation failed for conversation ${conversation.id} — sending fallback message.`);
    if (!client.fallbackMessage) return;
    await this.deliverReply(client, account, conversation.id, event, client.fallbackMessage, { forceImmediate: true });
  }

  /**
   * Sends immediately in FULL_AUTONOMOUS mode (or when forced — e.g. the fallback
   * safety net, which has nothing left for a human to review), otherwise queues as a
   * draft awaiting approval. Shared by the language prompt, real AI replies, and the
   * fallback path so all three follow the same automationMode rules consistently.
   */
  private async deliverReply(
    client: { id: string; userId: string; automationMode: AutomationMode },
    account: { id: string; sessionId: string },
    conversationId: string,
    event: WhatsappMessageReceivedEvent,
    content: string,
    opts: { forceImmediate?: boolean } = {},
  ) {
    if (opts.forceImmediate || client.automationMode === AutomationMode.FULL_AUTONOMOUS) {
      const sent = await this.sessionManager.sendMessage(account.sessionId, event.fromPhone, content);
      await this.conversationsService.addMessage(conversationId, MessageDirection.OUTBOUND, content, {
        automationGenerated: true,
        status: sent ? MessageStatus.SENT : MessageStatus.FAILED,
      });
    } else {
      await this.conversationsService.addMessage(conversationId, MessageDirection.OUTBOUND, content, {
        automationGenerated: true,
        status: MessageStatus.QUEUED,
      });
      await this.notificationsService.notifyInApp(
        client.userId,
        'DRAFT_READY',
        'A reply is ready for your review',
        `${event.customerName ?? event.fromPhone} messaged you — a draft reply is waiting for approval.`,
      );
    }
  }
}
