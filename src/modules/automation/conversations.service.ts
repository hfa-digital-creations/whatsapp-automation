import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageDirection, MessageStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { WhatsappSessionManagerService } from '../whatsapp/whatsapp-session-manager.service';

const MAX_LANGUAGE_LENGTH = 60;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionManager: WhatsappSessionManagerService,
  ) {}

  async findOrCreate(clientId: string, whatsappAccountId: string, customerPhone: string, customerName: string | null) {
    // Upsert on the (whatsappAccountId, customerPhone) unique constraint avoids a
    // race between concurrent inbound events creating duplicate conversations.
    // Clearing deletedAt here means a customer who messages again after being
    // trashed automatically reappears — a new message shouldn't land silently
    // in a conversation the client can no longer see.
    return this.prisma.customerConversation.upsert({
      where: { whatsappAccountId_customerPhone: { whatsappAccountId, customerPhone } },
      update: { ...(customerName ? { customerName } : {}), deletedAt: null },
      create: { clientId, whatsappAccountId, customerPhone, customerName },
    });
  }

  addMessage(
    conversationId: string,
    direction: MessageDirection,
    content: string,
    opts: { automationGenerated?: boolean; status?: MessageStatus; approvedByUserId?: string } = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.conversationMessage.create({
        data: {
          conversationId,
          direction,
          content,
          automationGenerated: opts.automationGenerated ?? false,
          status: opts.status ?? MessageStatus.SENT,
          approvedByUserId: opts.approvedByUserId,
        },
      });
      await tx.customerConversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
      return message;
    });
  }

  async recentHistory(conversationId: string, limit = 12) {
    const messages = await this.prisma.conversationMessage.findMany({
      where: { conversationId, status: { not: MessageStatus.FAILED } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return messages.reverse();
  }

  countInboundMessages(conversationId: string) {
    return this.prisma.conversationMessage.count({
      where: { conversationId, direction: MessageDirection.INBOUND },
    });
  }

  setPreferredLanguage(conversationId: string, language: string) {
    return this.prisma.customerConversation.update({
      where: { id: conversationId },
      data: { preferredLanguage: language.slice(0, MAX_LANGUAGE_LENGTH) },
    });
  }

  listForClient(clientId: string) {
    return this.prisma.customerConversation.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { lastMessageAt: 'desc' },
      include: { whatsappAccount: { select: { displayName: true, phoneNumber: true } } },
    });
  }

  /**
   * Every contact who has messaged in, with whatever details the automation has
   * captured about them so far (spec: client-facing Contacts view) — one row per
   * conversation, since each WhatsApp conversation is one real person.
   */
  async listContacts(clientId: string) {
    const conversations = await this.prisma.customerConversation.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { lastMessageAt: 'desc' },
      include: { leads: { orderBy: { updatedAt: 'desc' }, take: 1 } },
    });

    return conversations.map((c) => ({
      conversationId: c.id,
      customerPhone: c.customerPhone,
      customerName: c.customerName,
      leadStatus: c.leadStatus,
      lastMessageAt: c.lastMessageAt,
      collectedInfo: (c.leads[0]?.collectedInfo as Record<string, string> | undefined) ?? null,
    }));
  }

  /** Contacts/conversations the client has deleted, awaiting either restore or permanent removal. */
  async listTrash(clientId: string) {
    const conversations = await this.prisma.customerConversation.findMany({
      where: { clientId, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
    });

    return conversations.map((c) => ({
      conversationId: c.id,
      customerPhone: c.customerPhone,
      customerName: c.customerName,
      lastMessageAt: c.lastMessageAt,
      deletedAt: c.deletedAt,
    }));
  }

  private async getOwnedConversation(clientId: string, conversationId: string) {
    const conversation = await this.prisma.customerConversation.findUnique({
      where: { id: conversationId },
      include: { whatsappAccount: true },
    });
    // Tenant isolation: a client must never read or act on another client's conversation.
    if (!conversation || conversation.clientId !== clientId) {
      throw new NotFoundException('Conversation not found.');
    }
    return conversation;
  }

  /**
   * Moves a contact/conversation to Trash. Website-only: this never touches the
   * real WhatsApp account or contact — no logout, no block, no message sent —
   * it only hides the record from the client's own conversation/contact lists.
   */
  async softDelete(clientId: string, conversationId: string) {
    await this.getOwnedConversation(clientId, conversationId);
    await this.prisma.customerConversation.update({ where: { id: conversationId }, data: { deletedAt: new Date() } });
    return { deleted: true };
  }

  async restore(clientId: string, conversationId: string) {
    await this.getOwnedConversation(clientId, conversationId);
    await this.prisma.customerConversation.update({ where: { id: conversationId }, data: { deletedAt: null } });
    return { restored: true };
  }

  /** Permanent delete is only reachable via Trash — never directly from the Contacts/Conversations list. */
  async permanentlyDelete(clientId: string, conversationId: string) {
    const conversation = await this.getOwnedConversation(clientId, conversationId);
    if (!conversation.deletedAt) {
      throw new ForbiddenException('Move this to Trash first before deleting it permanently.');
    }
    await this.prisma.customerConversation.delete({ where: { id: conversationId } });
    return { deleted: true };
  }

  /**
   * Bulk variants for multiselect actions. `updateMany`/`deleteMany` scoped to
   * `clientId` do the tenant-isolation check inline — any id in the list that
   * doesn't belong to this client (or, for permanent delete, isn't already in
   * Trash) is silently excluded rather than erroring the whole batch.
   */
  async bulkSoftDelete(clientId: string, ids: string[]) {
    const result = await this.prisma.customerConversation.updateMany({
      where: { id: { in: ids }, clientId },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count };
  }

  async bulkRestore(clientId: string, ids: string[]) {
    const result = await this.prisma.customerConversation.updateMany({
      where: { id: { in: ids }, clientId },
      data: { deletedAt: null },
    });
    return { restored: result.count };
  }

  async bulkPermanentlyDelete(clientId: string, ids: string[]) {
    const result = await this.prisma.customerConversation.deleteMany({
      where: { id: { in: ids }, clientId, deletedAt: { not: null } },
    });
    return { deleted: result.count };
  }

  async getMessages(clientId: string, conversationId: string) {
    await this.getOwnedConversation(clientId, conversationId);
    return this.prisma.conversationMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
  }

  async getLead(clientId: string, conversationId: string) {
    await this.getOwnedConversation(clientId, conversationId);
    return this.prisma.customerLead.findFirst({ where: { conversationId } });
  }

  async sendManual(clientId: string, conversationId: string, content: string) {
    const conversation = await this.getOwnedConversation(clientId, conversationId);
    const sent = await this.sessionManager.sendMessage(conversation.whatsappAccount.sessionId, conversation.customerPhone, content);
    return this.addMessage(conversationId, MessageDirection.OUTBOUND, content, {
      status: sent ? MessageStatus.SENT : MessageStatus.FAILED,
    });
  }

  /** Approves an AI-drafted reply (Draft & Approve mode), optionally edited, and sends it. */
  async approveDraft(clientId: string, messageId: string, userId: string, editedContent?: string) {
    const message = await this.prisma.conversationMessage.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { whatsappAccount: true } } },
    });
    if (!message || message.conversation.clientId !== clientId) {
      throw new NotFoundException('Draft message not found.');
    }
    if (message.status !== MessageStatus.QUEUED) {
      throw new ForbiddenException('This message has already been sent or discarded.');
    }

    const finalContent = editedContent?.trim() || message.content;
    const sent = await this.sessionManager.sendMessage(
      message.conversation.whatsappAccount.sessionId,
      message.conversation.customerPhone,
      finalContent,
    );

    return this.prisma.conversationMessage.update({
      where: { id: messageId },
      data: {
        content: finalContent,
        status: sent ? MessageStatus.SENT : MessageStatus.FAILED,
        approvedByUserId: userId,
      },
    });
  }

  async rejectDraft(clientId: string, messageId: string) {
    const message = await this.prisma.conversationMessage.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });
    if (!message || message.conversation.clientId !== clientId) {
      throw new NotFoundException('Draft message not found.');
    }
    if (message.status !== MessageStatus.QUEUED) {
      throw new ForbiddenException('This message has already been sent or discarded.');
    }
    await this.prisma.conversationMessage.delete({ where: { id: messageId } });
    return { rejected: true };
  }
}
