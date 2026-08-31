import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentType, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { WhatsappSessionManagerService, WHATSAPP_MESSAGE_RECEIVED_EVENT } from './whatsapp-session-manager.service';
import { SimulateMessageDto } from './dto/simulate-message.dto';

@Injectable()
export class WhatsappAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    private readonly sessionManager: WhatsappSessionManagerService,
    private readonly events: EventEmitter2,
  ) {}

  async getEffectiveLimit(clientId: string): Promise<number> {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, include: { plan: true } });
    if (!client) throw new NotFoundException('Client not found.');
    if (client.whatsappAccountLimitOverride != null) return client.whatsappAccountLimitOverride;

    const planLimit = client.plan?.whatsappAccountLimit ?? 0;
    const additionalPurchased = await this.prisma.payment.count({
      where: { clientId, type: PaymentType.ADDITIONAL_ACCOUNT, status: PaymentStatus.SUCCESS },
    });
    return planLimit + additionalPurchased;
  }

  async listForClient(clientId: string) {
    return this.prisma.whatsappAccount.findMany({ where: { clientId }, orderBy: { createdAt: 'asc' } });
  }

  async listAll(params: { skip?: number; take?: number }) {
    const { skip = 0, take = 50 } = params;
    return this.prisma.whatsappAccount.findMany({
      include: { client: { include: { user: { select: { email: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  /** Enforces subscription status + account-limit before creating a new session (spec §6, Rule 4/5). */
  async createAccount(clientId: string, displayName?: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found.');

    const status = this.subscriptionService.computeStatus(client);
    if (status === 'EXPIRED' || status === 'NOT_ACTIVATED') {
      throw new ForbiddenException('Your subscription is not active. Please renew to add a WhatsApp account.');
    }

    const [currentCount, limit] = await Promise.all([
      this.prisma.whatsappAccount.count({
        where: { clientId, status: { notIn: ['LOGGED_OUT', 'ERROR'] } },
      }),
      this.getEffectiveLimit(clientId),
    ]);

    if (currentCount >= limit) {
      throw new BadRequestException(
        'You have reached your WhatsApp account limit for this plan. Purchase an additional account to continue.',
      );
    }

    const account = await this.prisma.whatsappAccount.create({
      data: {
        clientId,
        displayName,
        sessionId: `wa_${crypto.randomUUID()}`,
      },
    });

    await this.sessionManager.startSession(account.sessionId);
    return account;
  }

  private async getOwnedAccount(clientId: string, accountId: string) {
    const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } });
    // Tenant isolation: a client must never reach another client's WhatsApp account (spec §7, §28).
    if (!account || account.clientId !== clientId) {
      throw new NotFoundException('WhatsApp account not found.');
    }
    return account;
  }

  async getQr(clientId: string, accountId: string) {
    const account = await this.getOwnedAccount(clientId, accountId);
    const qr = await this.sessionManager.getQrImage(account.sessionId);
    return { status: account.status, qr };
  }

  async getStatus(clientId: string, accountId: string) {
    const account = await this.getOwnedAccount(clientId, accountId);
    return { id: account.id, status: account.status, phoneNumber: account.phoneNumber };
  }

  /** "Link with phone number" alternative to scanning the QR (spec: pairing-code linking). */
  async requestPairingCode(clientId: string, accountId: string, phoneNumber: string) {
    const account = await this.getOwnedAccount(clientId, accountId);
    const code = await this.sessionManager.requestPairingCode(account.sessionId, phoneNumber);
    if (!code) {
      throw new BadRequestException(
        'Could not generate a pairing code right now. Make sure the session has started and try again.',
      );
    }
    return { code };
  }

  async reconnect(clientId: string, accountId: string) {
    const account = await this.getOwnedAccount(clientId, accountId);
    await this.sessionManager.reconnect(account.sessionId);
    return { reconnecting: true };
  }

  async logout(clientId: string, accountId: string) {
    const account = await this.getOwnedAccount(clientId, accountId);
    await this.sessionManager.logout(account.sessionId);
    return { loggedOut: true };
  }

  /**
   * Permanently removes the account (not just a logout) — cleanly disconnects the
   * WhatsApp session first, then deletes the row, cascading its conversations,
   * messages, and leads. Gated behind the WHATSAPP_ACCOUNT_REMOVAL feature, which
   * admins grant per-client (spec: not every client should be able to self-delete
   * their WhatsApp history).
   */
  async removeAccount(clientId: string, accountId: string) {
    const account = await this.getOwnedAccount(clientId, accountId);
    await this.sessionManager.logout(account.sessionId);
    await this.prisma.whatsappAccount.delete({ where: { id: account.id } });
    return { removed: true };
  }

  /**
   * Admin QA tool: replays the exact event the WhatsApp session manager would
   * emit for a real inbound message, so the whole automation pipeline (gates,
   * knowledge boundary, mode branching) can be exercised without a second
   * phone. Doesn't touch WhatsApp at all — purely internal.
   */
  async simulateInboundMessage(accountId: string, dto: SimulateMessageDto) {
    const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('WhatsApp account not found.');

    this.events.emit(WHATSAPP_MESSAGE_RECEIVED_EVENT, {
      sessionId: account.sessionId,
      fromPhone: dto.fromPhone.replace(/\D/g, ''),
      resolvedPhone: dto.fromPhone.replace(/\D/g, ''),
      customerName: dto.customerName ?? null,
      body: dto.body,
      image: null,
    });

    return { simulated: true };
  }

  /**
   * Admin support actions — an admin can legitimately manage any client's WhatsApp
   * session (e.g. to help disconnect a wrong number), unlike every other method
   * above which is scoped to the owning client only.
   */
  private async getAnyAccount(accountId: string) {
    const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('WhatsApp account not found.');
    return account;
  }

  async adminLogout(accountId: string) {
    const account = await this.getAnyAccount(accountId);
    await this.sessionManager.logout(account.sessionId);
    return { loggedOut: true };
  }

  async adminReconnect(accountId: string) {
    const account = await this.getAnyAccount(accountId);
    await this.sessionManager.reconnect(account.sessionId);
    return { reconnecting: true };
  }
}
