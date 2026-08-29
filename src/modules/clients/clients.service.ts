import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { PasswordService } from '../../common/services/password.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { WhatsappSessionManagerService } from '../whatsapp/whatsapp-session-manager.service';
import { SYSTEM_WHATSAPP_SESSION_ID } from '../../common/constants';
import { CreateClientDto } from './dto/create-client.dto';
import { ActivateClientDto } from './dto/activate-client.dto';
import { UpdateClientSettingsDto } from './dto/update-client-settings.dto';

const PHONE_OTP_TTL_MINUTES = 10;
const PHONE_OTP_MAX_ATTEMPTS = 5;

function hashOtpCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly subscriptionService: SubscriptionService,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogService: AuditLogService,
    private readonly config: ConfigService,
    private readonly whatsappSessionManager: WhatsappSessionManagerService,
  ) {}

  async create(dto: CreateClientDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('A user with this email already exists.');

    if (dto.planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
      if (!plan) throw new BadRequestException('Selected plan does not exist.');
    }

    // Not usable until activation assigns real credentials (spec §2 step 7) — this
    // hash is unknown to anyone and only exists so the row satisfies NOT NULL.
    const placeholderHash = await this.passwordService.hash(crypto.randomUUID());

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          phone: dto.phone,
          role: UserRole.CLIENT,
          passwordHash: placeholderHash,
          status: UserStatus.PENDING,
          mustChangePassword: true,
        },
      });
      const client = await tx.client.create({
        data: {
          userId: user.id,
          businessName: dto.businessName,
          planId: dto.planId,
        },
        include: { user: true, plan: true },
      });
      return client;
    });
  }

  private async getEnriched(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        user: true,
        plan: true,
        branding: true,
        _count: { select: { whatsappAccounts: true } },
      },
    });
    if (!client) throw new NotFoundException('Client not found.');
    return client;
  }

  async getById(id: string) {
    const client = await this.getEnriched(id);
    return {
      ...client,
      subscriptionStatus: this.subscriptionService.computeStatus(client),
      remainingDays: this.subscriptionService.remainingDays(client),
    };
  }

  async list(params: { search?: string; status?: UserStatus; skip?: number; take?: number }) {
    const { search, status, skip = 0, take = 25 } = params;
    const where: Prisma.ClientWhereInput = {
      user: {
        status,
        OR: search
          ? [
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      businessName: search ? { contains: search, mode: 'insensitive' } : undefined,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        include: { user: true, plan: true, _count: { select: { whatsappAccounts: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      items: items.map((c) => ({
        ...c,
        subscriptionStatus: this.subscriptionService.computeStatus(c),
        remainingDays: this.subscriptionService.remainingDays(c),
      })),
      total,
      skip,
      take,
    };
  }

  /** Same filters as list(), but returns every match (no pagination) as plain export rows. */
  async exportContacts(params: { search?: string; status?: UserStatus }) {
    const { search, status } = params;
    const where: Prisma.ClientWhereInput = {
      user: {
        status,
        OR: search
          ? [
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      businessName: search ? { contains: search, mode: 'insensitive' } : undefined,
    };

    const clients = await this.prisma.client.findMany({
      where,
      include: { user: true },
      orderBy: { businessName: 'asc' },
    });
    return clients.map((c) => ({ name: c.businessName, phone: c.user.phone, email: c.user.email }));
  }

  /**
   * Explicit admin action (spec §2, Rule 1 & 2 — payment existing is never enough on
   * its own). Runs the state changes atomically, then fires notifications afterward
   * so a slow email/WhatsApp send can never roll back the activation itself.
   */
  async activate(clientId: string, adminId: string, dto: ActivateClientDto, ipAddress?: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, include: { user: true } });
    if (!client) throw new NotFoundException('Client not found.');

    const planId = dto.planId ?? client.planId;
    if (!planId) throw new BadRequestException('A plan must be selected before activating this client.');
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new BadRequestException('Selected plan does not exist.');

    const temporaryPassword = this.passwordService.generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    const subscriptionStart = new Date();
    const subscriptionEnd = this.subscriptionService.calculateEndDate(subscriptionStart, plan);

    const updatedClient = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: client.userId },
        data: { status: UserStatus.ACTIVE, passwordHash, mustChangePassword: true },
      });

      const nextClient = await tx.client.update({
        where: { id: clientId },
        data: { planId, subscriptionStart, subscriptionEnd },
        include: { user: true, plan: true },
      });

      await tx.activationHistory.create({
        data: {
          clientId,
          adminId,
          planId,
          subscriptionStart,
          subscriptionEnd,
          note: dto.note,
        },
      });

      await this.auditLogService.record(
        {
          adminId,
          action: 'CLIENT_ACTIVATED',
          targetType: 'Client',
          targetId: clientId,
          metadata: { planId, subscriptionStart, subscriptionEnd },
          ipAddress,
        },
        tx,
      );

      return nextClient;
    });

    const loginUrl = `${this.config.get<string>('FRONTEND_URL') ?? ''}/login`;
    await this.notificationsService.sendActivationCredentials({
      email: updatedClient.user.email,
      phone: updatedClient.user.phone,
      businessName: updatedClient.businessName,
      loginUrl,
      temporaryPassword,
    });

    return updatedClient;
  }

  async updateOwnSettings(clientId: string, dto: UpdateClientSettingsDto) {
    // Account phone number is deliberately NOT settable here — it can only change
    // via the requestPhoneChangeOtp -> confirmOldPhoneOtp -> confirmNewPhoneOtp
    // flow below, which proves the client controls both the old and new number.
    return this.prisma.client.update({
      where: { id: clientId },
      data: dto,
      include: { user: true },
    });
  }

  /**
   * Step 1 of changing the client's own account phone number: send a code to
   * the OLD (current) number first, not the new one. This proves whoever is
   * making the request still controls the number already on file — a stolen
   * session alone can no longer redirect where notifications go, since the
   * attacker would also need access to the client's actual current WhatsApp.
   * Nothing changes yet.
   */
  async requestPhoneChangeOtp(clientId: string, newPhone: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, include: { user: true } });
    if (!client) throw new NotFoundException('Client not found.');
    if (!client.user.phone) {
      throw new BadRequestException('No current phone number on file to verify. Contact support to set one first.');
    }

    await this.prisma.phoneChangeOtp.deleteMany({ where: { userId: client.userId, consumedAt: null } });

    const code = generateOtpCode();
    const otp = await this.prisma.phoneChangeOtp.create({
      data: {
        userId: client.userId,
        newPhone,
        codeHash: hashOtpCode(code),
        expiresAt: new Date(Date.now() + PHONE_OTP_TTL_MINUTES * 60 * 1000),
      },
    });

    const { sent, reason } = await this.whatsappSessionManager.sendMessage(
      SYSTEM_WHATSAPP_SESSION_ID,
      client.user.phone,
      `To change your account phone number, we first need to confirm it's really you. Your verification code is: ${code}\n\nThis code expires in ${PHONE_OTP_TTL_MINUTES} minutes. If you didn't request this, you can ignore this message.`,
    );
    if (!sent) {
      throw new BadRequestException(
        `Could not send a verification code to your current number right now. Make sure the system WhatsApp session is connected.${reason ? ` (${reason})` : ''}`,
      );
    }

    return { requestId: otp.id, stage: 'VERIFY_OLD' as const };
  }

  /**
   * Step 2: the code sent to the OLD number. On success this does NOT change
   * the phone yet — it immediately sends a second, different code to the NEW
   * number, which confirmNewPhoneOtp checks next.
   */
  async confirmOldPhoneOtp(clientId: string, requestId: string, code: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found.');

    const otp = await this.prisma.phoneChangeOtp.findUnique({ where: { id: requestId } });
    if (!otp || otp.userId !== client.userId || otp.consumedAt || otp.expiresAt < new Date()) {
      throw new UnauthorizedException('This code has expired. Please start over.');
    }
    if (otp.oldPhoneVerifiedAt) {
      throw new BadRequestException('Your current number is already verified — enter the code sent to your new number instead.');
    }
    if (otp.attempts >= PHONE_OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException('Too many incorrect attempts. Please start over.');
    }
    if (hashOtpCode(code) !== otp.codeHash) {
      await this.prisma.phoneChangeOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException('Incorrect code.');
    }

    const newCode = generateOtpCode();
    await this.prisma.phoneChangeOtp.update({
      where: { id: otp.id },
      data: {
        oldPhoneVerifiedAt: new Date(),
        codeHash: hashOtpCode(newCode),
        attempts: 0,
        expiresAt: new Date(Date.now() + PHONE_OTP_TTL_MINUTES * 60 * 1000),
      },
    });

    const { sent, reason } = await this.whatsappSessionManager.sendMessage(
      SYSTEM_WHATSAPP_SESSION_ID,
      otp.newPhone,
      `Your current number is verified. Now confirm your new number — your verification code is: ${newCode}\n\nThis code expires in ${PHONE_OTP_TTL_MINUTES} minutes. If you didn't request this, you can ignore this message.`,
    );
    if (!sent) {
      throw new BadRequestException(
        `Your current number was verified, but we could not send a code to the new number. Make sure it is correct, then start over.${reason ? ` (${reason})` : ''}`,
      );
    }

    return { requestId: otp.id, stage: 'VERIFY_NEW' as const };
  }

  /** Step 3: the code sent to the NEW number. Only on success does the phone number actually change. */
  async confirmNewPhoneOtp(clientId: string, requestId: string, code: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found.');

    const otp = await this.prisma.phoneChangeOtp.findUnique({ where: { id: requestId } });
    if (!otp || otp.userId !== client.userId || otp.consumedAt || otp.expiresAt < new Date()) {
      throw new UnauthorizedException('This code has expired. Please start over.');
    }
    if (!otp.oldPhoneVerifiedAt) {
      throw new BadRequestException('Please verify your current number first.');
    }
    if (otp.attempts >= PHONE_OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException('Too many incorrect attempts. Please start over.');
    }
    if (hashOtpCode(code) !== otp.codeHash) {
      await this.prisma.phoneChangeOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException('Incorrect code.');
    }

    await this.prisma.$transaction([
      this.prisma.phoneChangeOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
      this.prisma.user.update({ where: { id: client.userId }, data: { phone: otp.newPhone } }),
    ]);

    return { phone: otp.newPhone };
  }

  /** Admin toggle: whether this client's login requires the emailed OTP second factor. */
  async setLoginOtpEnabled(clientId: string, enabled: boolean, adminId: string, ipAddress?: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found.');
    const updated = await this.prisma.client.update({ where: { id: clientId }, data: { loginOtpEnabled: enabled } });
    await this.auditLogService.record({
      adminId,
      action: enabled ? 'CLIENT_LOGIN_OTP_ENABLED' : 'CLIENT_LOGIN_OTP_DISABLED',
      targetType: 'Client',
      targetId: clientId,
      ipAddress,
    });
    return { loginOtpEnabled: updated.loginOtpEnabled };
  }

  async block(clientId: string, adminId: string, ipAddress?: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found.');
    await this.prisma.user.update({ where: { id: client.userId }, data: { status: UserStatus.BLOCKED } });
    await this.prisma.refreshToken.updateMany({ where: { userId: client.userId }, data: { revoked: true } });
    await this.auditLogService.record({ adminId, action: 'CLIENT_BLOCKED', targetType: 'Client', targetId: clientId, ipAddress });
    return { blocked: true };
  }

  async unblock(clientId: string, adminId: string, ipAddress?: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found.');
    await this.prisma.user.update({ where: { id: client.userId }, data: { status: UserStatus.ACTIVE } });
    await this.auditLogService.record({ adminId, action: 'CLIENT_UNBLOCKED', targetType: 'Client', targetId: clientId, ipAddress });
    return { unblocked: true };
  }

  async softDelete(clientId: string, adminId: string, ipAddress?: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found.');
    await this.prisma.user.update({
      where: { id: client.userId },
      data: { status: UserStatus.DELETED, deletedAt: new Date() },
    });
    await this.prisma.refreshToken.updateMany({ where: { userId: client.userId }, data: { revoked: true } });
    await this.auditLogService.record({ adminId, action: 'CLIENT_DELETED', targetType: 'Client', targetId: clientId, ipAddress });
    return { deleted: true };
  }

  /** Admin-triggered reset for a locked-out client — delivered the same way activation credentials are. */
  async resetPassword(clientId: string, adminId: string, ipAddress?: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, include: { user: true } });
    if (!client) throw new NotFoundException('Client not found.');

    const temporaryPassword = this.passwordService.generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    await this.prisma.user.update({ where: { id: client.userId }, data: { passwordHash, mustChangePassword: true } });
    await this.prisma.refreshToken.updateMany({ where: { userId: client.userId }, data: { revoked: true } });
    await this.auditLogService.record({ adminId, action: 'CLIENT_PASSWORD_RESET', targetType: 'Client', targetId: clientId, ipAddress });

    const loginUrl = `${this.config.get<string>('FRONTEND_URL') ?? ''}/login`;
    const message =
      `Hi ${client.businessName}, your password has been reset by an admin.\n` +
      `Login: ${loginUrl}\nEmail: ${client.user.email}\nTemporary Password: ${temporaryPassword}\n\n` +
      `You'll be asked to set a new password on your next login.`;
    const delivery = await this.notificationsService.sendCustom({
      email: client.user.email,
      phone: client.user.phone,
      subject: 'Your password has been reset',
      emailHtml: `<p>${message.replace(/\n/g, '<br/>')}</p>`,
      whatsappMessage: message,
    });

    return delivery;
  }
}
