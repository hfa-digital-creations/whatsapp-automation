import { AutomationMode, MessageDirection, MessageStatus } from '@prisma/client';
import { AutomationEngineService } from './automation-engine.service';

const EVENT = { sessionId: 'wa_session-1', fromPhone: '911234567890', resolvedPhone: null, customerName: 'Priya', body: 'Hi, what are your prices?' };

const BASE_CLIENT = {
  id: 'client-1',
  userId: 'user-1',
  businessName: 'Acme Interiors',
  fallbackMessage: "I don't have that yet, I'll check and get back to you.",
  automationMode: AutomationMode.DRAFT_APPROVE as AutomationMode,
  // The account phone is the client's own OTP-verified number (User.phone) — the
  // automation engine reads it via client.user.phone, never a separate field.
  user: { phone: '+919999999999' },
  conversationFlow: null as string | null,
  subscriptionStart: new Date(Date.now() - 10 * 86400_000),
  subscriptionEnd: new Date(Date.now() + 20 * 86400_000),
};

// Language already resolved by default so existing behavioral tests exercise
// post-gate logic directly — the gate itself has its own dedicated tests below.
const CONVERSATION: { id: string; preferredLanguage: string | null } = { id: 'conversation-1', preferredLanguage: 'English' };

describe('AutomationEngineService.handleIncomingMessage', () => {
  function makeService(opts: {
    account?: any;
    automationEnabled?: boolean;
    aiConfigured?: boolean;
    reply?: string | null;
    sendResult?: boolean;
    client?: Partial<typeof BASE_CLIENT>;
    conversation?: Partial<typeof CONVERSATION>;
    inboundCount?: number;
  }) {
    const account = opts.account !== undefined ? opts.account : { id: 'account-1', sessionId: EVENT.sessionId, client: { ...BASE_CLIENT, ...opts.client } };

    const prisma = { whatsappAccount: { findUnique: jest.fn().mockResolvedValue(account) } };
    const ai = {
      isConfigured: opts.aiConfigured ?? true,
      chat: jest.fn().mockResolvedValue(opts.reply === undefined ? 'Our starting price is ₹25,000.' : opts.reply),
    };
    const featuresService = { isFeatureEnabled: jest.fn().mockResolvedValue(opts.automationEnabled ?? true) };
    const subscriptionService = { computeStatus: jest.fn().mockReturnValue('ACTIVE') };
    const knowledgeExtraction = { getKnowledgeContext: jest.fn().mockResolvedValue('[PRICING]\n- Starting price: ₹25,000') };
    const notificationsService = { notifyInApp: jest.fn().mockResolvedValue(undefined) };
    const sessionManager = { sendMessage: jest.fn().mockResolvedValue({ sent: opts.sendResult ?? true }) };
    const conversationsService = {
      findOrCreate: jest.fn().mockResolvedValue({ ...CONVERSATION, ...opts.conversation }),
      addMessage: jest.fn().mockResolvedValue(undefined),
      recentHistory: jest.fn().mockResolvedValue([{ direction: MessageDirection.INBOUND, content: EVENT.body }]),
      countInboundMessages: jest.fn().mockResolvedValue(opts.inboundCount ?? 2),
      setPreferredLanguage: jest.fn().mockResolvedValue(undefined),
    };
    const leadExtraction = { extractAndUpdate: jest.fn().mockResolvedValue(undefined) };

    const service = new AutomationEngineService(
      prisma as any,
      ai as any,
      featuresService as any,
      subscriptionService as any,
      knowledgeExtraction as any,
      notificationsService as any,
      sessionManager as any,
      conversationsService as any,
      leadExtraction as any,
    );

    return { service, prisma, ai, featuresService, subscriptionService, notificationsService, sessionManager, conversationsService, leadExtraction };
  }

  it('ignores messages on a session with no matching WhatsappAccount (e.g. the system session)', async () => {
    const { service, conversationsService } = makeService({ account: null });
    await service.handleIncomingMessage(EVENT);
    expect(conversationsService.findOrCreate).not.toHaveBeenCalled();
  });

  it('always records the inbound message, even before checking any gates', async () => {
    const { service, conversationsService } = makeService({});
    await service.handleIncomingMessage(EVENT);
    expect(conversationsService.addMessage).toHaveBeenCalledWith(CONVERSATION.id, MessageDirection.INBOUND, EVENT.body);
  });

  it('does not generate a reply when the subscription has expired', async () => {
    const { service, subscriptionService, ai } = makeService({});
    subscriptionService.computeStatus.mockReturnValue('EXPIRED');
    await service.handleIncomingMessage(EVENT);
    expect(ai.chat).not.toHaveBeenCalled();
  });

  it('does not generate a reply when the WHATSAPP_AUTOMATION feature is disabled for the client', async () => {
    const { service, ai } = makeService({ automationEnabled: false });
    await service.handleIncomingMessage(EVENT);
    expect(ai.chat).not.toHaveBeenCalled();
  });

  it('does not attempt a reply when the AI provider is not configured', async () => {
    const { service, ai } = makeService({ aiConfigured: false });
    await service.handleIncomingMessage(EVENT);
    expect(ai.chat).not.toHaveBeenCalled();
  });

  it('passes the client\'s approved knowledge and fallback message into the system prompt (knowledge boundary)', async () => {
    const { service, ai } = makeService({});
    await service.handleIncomingMessage(EVENT);
    const call = ai.chat.mock.calls[0][0];
    expect(call.system).toContain('₹25,000');
    expect(call.system).toContain(BASE_CLIENT.fallbackMessage);
    expect(call.system).toContain('do NOT guess, infer, or improvise');
    expect(call.system).toContain('Stay strictly on the topic of this business');
  });

  it('sends the fallback message when the AI returns no reply (e.g. provider outage/quota)', async () => {
    const { service, sessionManager, conversationsService } = makeService({ reply: null });
    await service.handleIncomingMessage(EVENT);
    expect(sessionManager.sendMessage).toHaveBeenCalledWith(EVENT.sessionId, EVENT.fromPhone, BASE_CLIENT.fallbackMessage);
    expect(conversationsService.addMessage).toHaveBeenLastCalledWith(
      CONVERSATION.id,
      MessageDirection.OUTBOUND,
      BASE_CLIENT.fallbackMessage,
      expect.objectContaining({ automationGenerated: true, status: MessageStatus.SENT }),
    );
  });

  it('sends the fallback immediately even in DRAFT_APPROVE mode — a canned fallback needs no human review', async () => {
    const { service, sessionManager, notificationsService } = makeService({
      reply: null,
      client: { automationMode: AutomationMode.DRAFT_APPROVE },
    });
    await service.handleIncomingMessage(EVENT);
    expect(sessionManager.sendMessage).toHaveBeenCalled();
    expect(notificationsService.notifyInApp).not.toHaveBeenCalled();
  });

  it('records nothing further when the AI returns no reply and no fallback message is configured', async () => {
    const { service, conversationsService } = makeService({ reply: null, client: { fallbackMessage: '' } });
    await service.handleIncomingMessage(EVENT);
    // Only the inbound message was recorded — no outbound draft/sent message.
    expect(conversationsService.addMessage).toHaveBeenCalledTimes(1);
  });

  it('sends immediately and marks SENT in FULL_AUTONOMOUS mode', async () => {
    const { service, sessionManager, conversationsService } = makeService({
      client: { automationMode: AutomationMode.FULL_AUTONOMOUS },
    });
    await service.handleIncomingMessage(EVENT);
    expect(sessionManager.sendMessage).toHaveBeenCalledWith(EVENT.sessionId, EVENT.fromPhone, expect.any(String));
    expect(conversationsService.addMessage).toHaveBeenLastCalledWith(
      CONVERSATION.id,
      MessageDirection.OUTBOUND,
      expect.any(String),
      expect.objectContaining({ automationGenerated: true, status: MessageStatus.SENT }),
    );
  });

  it('marks FAILED in FULL_AUTONOMOUS mode when the WhatsApp send itself fails', async () => {
    const { service, conversationsService } = makeService({
      client: { automationMode: AutomationMode.FULL_AUTONOMOUS },
      sendResult: false,
    });
    await service.handleIncomingMessage(EVENT);
    expect(conversationsService.addMessage).toHaveBeenLastCalledWith(
      CONVERSATION.id,
      MessageDirection.OUTBOUND,
      expect.any(String),
      expect.objectContaining({ status: MessageStatus.FAILED }),
    );
  });

  it('queues a draft instead of sending in DRAFT_APPROVE mode, and notifies the client', async () => {
    const { service, sessionManager, conversationsService, notificationsService } = makeService({
      client: { automationMode: AutomationMode.DRAFT_APPROVE },
    });
    await service.handleIncomingMessage(EVENT);
    expect(sessionManager.sendMessage).not.toHaveBeenCalled();
    expect(conversationsService.addMessage).toHaveBeenLastCalledWith(
      CONVERSATION.id,
      MessageDirection.OUTBOUND,
      expect.any(String),
      expect.objectContaining({ automationGenerated: true, status: MessageStatus.QUEUED }),
    );
    expect(notificationsService.notifyInApp).toHaveBeenCalledWith(
      BASE_CLIENT.userId,
      'DRAFT_READY',
      expect.any(String),
      expect.any(String),
    );
  });

  describe('language selection gate', () => {
    it('asks which language to chat in on the very first message, without calling the AI', async () => {
      const { service, ai, conversationsService } = makeService({
        conversation: { preferredLanguage: null },
        inboundCount: 1,
      });
      await service.handleIncomingMessage(EVENT);
      expect(ai.chat).not.toHaveBeenCalled();
      expect(conversationsService.addMessage).toHaveBeenLastCalledWith(
        CONVERSATION.id,
        MessageDirection.OUTBOUND,
        expect.stringContaining('which language'),
        expect.any(Object),
      );
    });

    it('treats the second message as the language answer, stores it, and still answers the question', async () => {
      const { service, ai, conversationsService } = makeService({
        conversation: { preferredLanguage: null },
        inboundCount: 2,
      });
      await service.handleIncomingMessage(EVENT);
      expect(conversationsService.setPreferredLanguage).toHaveBeenCalledWith(CONVERSATION.id, EVENT.body);
      expect(ai.chat).toHaveBeenCalledTimes(1);
      const call = ai.chat.mock.calls[0][0];
      expect(call.system).toContain(EVENT.body);
    });

    it('does not re-ask once a language is already set on the conversation', async () => {
      const { service, ai } = makeService({});
      await service.handleIncomingMessage(EVENT);
      expect(ai.chat).toHaveBeenCalledTimes(1);
      const call = ai.chat.mock.calls[0][0];
      expect(call.system).toContain('English');
    });
  });

  describe('contact-phone and link-vs-call choice rules', () => {
    it('instructs the AI to ask whether the customer wants a link or a call, and to stay calm under a harsh customer', async () => {
      const { service, ai } = makeService({});
      await service.handleIncomingMessage(EVENT);
      const call = ai.chat.mock.calls[0][0];
      expect(call.system).toContain(BASE_CLIENT.user.phone);
      expect(call.system).toContain('ask them which they\'d prefer');
      expect(call.system).toContain('never invent one');
      expect(call.system).toContain('stay calm and understanding');
    });
  });

  describe('conversation flow script', () => {
    it('injects the client\'s conversation flow verbatim, with a strict step-order instruction', async () => {
      const flow = 'Step 1 - Ask X.\nStep 2 - Ask Y. Never skip this step.';
      const { service, ai } = makeService({ client: { conversationFlow: flow } });
      await service.handleIncomingMessage(EVENT);
      const call = ai.chat.mock.calls[0][0];
      expect(call.system).toContain(flow);
      expect(call.system).toContain('Never skip a step');
    });

    it('omits the conversation flow section entirely when none is configured', async () => {
      const { service, ai } = makeService({});
      await service.handleIncomingMessage(EVENT);
      const call = ai.chat.mock.calls[0][0];
      expect(call.system).not.toContain('CONVERSATION FLOW');
    });
  });
});
