import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WhatsappAccountsService } from './whatsapp-accounts.service';
import { SubscriptionService } from '../subscription/subscription.service';

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

const ACTIVE_CLIENT = { id: 'client-1', whatsappAccountLimitOverride: null, subscriptionStart: daysFromNow(-10), subscriptionEnd: daysFromNow(20) };
const EXPIRED_CLIENT = { id: 'client-1', whatsappAccountLimitOverride: null, subscriptionStart: daysFromNow(-40), subscriptionEnd: daysFromNow(-1) };

describe('WhatsappAccountsService', () => {
  // Real SubscriptionService — computeStatus is pure date math, no need to mock it.
  const subscriptionService = new SubscriptionService({} as any, {} as any, {} as any);

  function makeService(opts: {
    client?: any;
    plan?: any;
    accountCount?: number;
    additionalAccountPayments?: number;
  }) {
    const sessionManager = { startSession: jest.fn().mockResolvedValue(undefined), getQrImage: jest.fn(), reconnect: jest.fn(), logout: jest.fn() };
    const prisma = {
      client: { findUnique: jest.fn().mockResolvedValue(opts.client ? { ...opts.client, plan: opts.plan } : opts.client) },
      whatsappAccount: {
        count: jest.fn().mockResolvedValue(opts.accountCount ?? 0),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'account-1', status: 'PENDING', ...data })),
        findUnique: jest.fn(),
      },
      payment: { count: jest.fn().mockResolvedValue(opts.additionalAccountPayments ?? 0) },
    };
    const events = { emit: jest.fn() };
    return { service: new WhatsappAccountsService(prisma as any, subscriptionService, sessionManager as any, events as any), prisma, sessionManager, events };
  }

  describe('getEffectiveLimit', () => {
    it('uses the admin override when one is set, ignoring the plan limit entirely', async () => {
      const { service } = makeService({
        client: { ...ACTIVE_CLIENT, whatsappAccountLimitOverride: 10 },
        plan: { whatsappAccountLimit: 1 },
      });
      expect(await service.getEffectiveLimit('client-1')).toBe(10);
    });

    it('adds successfully-purchased additional accounts on top of the plan limit', async () => {
      const { service } = makeService({
        client: ACTIVE_CLIENT,
        plan: { whatsappAccountLimit: 1 },
        additionalAccountPayments: 2,
      });
      expect(await service.getEffectiveLimit('client-1')).toBe(3);
    });
  });

  describe('createAccount', () => {
    it('rejects account creation when the subscription has expired (Rule 4/5)', async () => {
      const { service } = makeService({ client: EXPIRED_CLIENT, plan: { whatsappAccountLimit: 1 } });
      await expect(service.createAccount('client-1')).rejects.toThrow(ForbiddenException);
    });

    it('rejects account creation once the plan limit is reached, even with a valid subscription', async () => {
      const { service } = makeService({ client: ACTIVE_CLIENT, plan: { whatsappAccountLimit: 1 }, accountCount: 1 });
      await expect(service.createAccount('client-1')).rejects.toThrow(BadRequestException);
    });

    it('allows creation and starts a session when under the limit', async () => {
      const { service, sessionManager, prisma } = makeService({
        client: ACTIVE_CLIENT,
        plan: { whatsappAccountLimit: 2 },
        accountCount: 1,
      });
      const account = await service.createAccount('client-1', 'Support Line');
      expect(account.clientId).toBe('client-1');
      expect(prisma.whatsappAccount.create).toHaveBeenCalled();
      expect(sessionManager.startSession).toHaveBeenCalledWith(account.sessionId);
    });
  });

  describe('tenant isolation', () => {
    it('never returns another client\'s WhatsApp account (spec §7, §28)', async () => {
      const { service, prisma } = makeService({});
      prisma.whatsappAccount.findUnique.mockResolvedValue({ id: 'account-1', clientId: 'someone-elses-client', status: 'CONNECTED' });
      await expect(service.getStatus('client-1', 'account-1')).rejects.toThrow(NotFoundException);
    });
  });
});
