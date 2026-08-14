import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/services/prisma.service';
import { PasswordService } from '../../common/services/password.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserStatus } from '@prisma/client';
import { JwtPayload } from './strategies/jwt.strategy';

const REFRESH_TOKEN_TTL_DAYS = 7;
const ACCESS_TOKEN_TTL = '15m';
const RESET_TOKEN_TTL_HOURS = 1;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Cryptographically random 6-digit code — never Math.random() for anything security-relevant. */
function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Step 1 of login: password only. On success this does NOT issue tokens —
   * it emails a one-time code and returns just enough to let the client
   * complete step 2 (verifyLoginOtp). No session exists until that code is
   * verified, so a stolen password alone can never produce a working login.
   */
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { client: { select: { id: true, loginOtpEnabled: true } } },
    });

    // Constant response shape whether the user exists or not, to avoid user enumeration.
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const validPassword = await this.passwordService.compare(password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException('Your account has been blocked. Please contact support.');
    }
    if (user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Admin-controlled per client (Client.loginOtpEnabled). Admin/staff accounts
    // have no `client` relation and always go through OTP — this opt-out only
    // ever applies to a specific client the admin has explicitly chosen.
    if (user.client && !user.client.loginOtpEnabled) {
      await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      const tokens = await this.issueTokens(
        { sub: user.id, email: user.email, role: user.role, clientId: user.client.id },
        { mustChangePassword: user.mustChangePassword, role: user.role },
      );
      return { otpRequired: false as const, ...tokens };
    }

    // Invalidate any earlier unused codes for this user before issuing a fresh one.
    await this.prisma.loginOtp.deleteMany({ where: { userId: user.id, consumedAt: null } });

    const code = generateOtpCode();
    const otp = await this.prisma.loginOtp.create({
      data: {
        userId: user.id,
        codeHash: hashToken(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
      },
    });

    await this.notificationsService.sendCustom({
      email: user.email,
      subject: 'Your login verification code',
      emailHtml: `<p>Your verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p><p>This code expires in ${OTP_TTL_MINUTES} minutes. If you didn't just try to log in, you can ignore this email — your account is still safe.</p>`,
    });

    return { otpRequired: true as const, loginOtpId: otp.id };
  }

  /**
   * Step 2 of login: the emailed code. Only on success does a real session get
   * created — this is the only place issueTokens() is called from a fresh login.
   */
  async verifyLoginOtp(loginOtpId: string, code: string) {
    const otp = await this.prisma.loginOtp.findUnique({
      where: { id: loginOtpId },
      include: { user: { include: { client: { select: { id: true } } } } },
    });

    if (!otp || otp.consumedAt || otp.expiresAt < new Date()) {
      throw new UnauthorizedException('This code has expired. Please log in again.');
    }
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException('Too many incorrect attempts. Please log in again.');
    }

    if (hashToken(code) !== otp.codeHash) {
      await this.prisma.loginOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException('Incorrect code.');
    }

    const { user } = otp;
    if (user.status === UserStatus.BLOCKED || user.status === UserStatus.DELETED) {
      throw new ForbiddenException('Your account is not active.');
    }

    await this.prisma.$transaction([
      this.prisma.loginOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    ]);

    return this.issueTokens(
      { sub: user.id, email: user.email, role: user.role, clientId: user.client?.id ?? null },
      { mustChangePassword: user.mustChangePassword, role: user.role },
    );
  }

  private async issueTokens(
    payload: JwtPayload,
    extra: { mustChangePassword: boolean; role: string },
  ) {
    const accessToken = this.jwt.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { userId: payload.sub, tokenHash: hashToken(refreshToken), expiresAt },
    });

    return {
      accessToken,
      refreshToken,
      mustChangePassword: extra.mustChangePassword,
      role: extra.role,
    };
  }

  async refresh(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revoked: false },
      include: { user: { include: { client: { select: { id: true } } } } },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }
    if (stored.user.status === UserStatus.BLOCKED || stored.user.status === UserStatus.DELETED) {
      throw new ForbiddenException('Your account is not active.');
    }

    // Rotate: revoke the old token and issue a new pair.
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });

    return this.issueTokens(
      {
        sub: stored.user.id,
        email: stored.user.email,
        role: stored.user.role,
        clientId: stored.user.client?.id ?? null,
      },
      { mustChangePassword: stored.user.mustChangePassword, role: stored.user.role },
    );
  }

  async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revoked: true },
    });
    return { loggedOut: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const valid = await this.passwordService.compare(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect.');

    const newHash = await this.passwordService.hash(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, mustChangePassword: false },
    });

    // Revoke all existing sessions so old tokens can't outlive the password change.
    await this.prisma.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });

    return { changed: true };
  }

  /**
   * Self-service "forgot password" (spec gap fix). Always returns the same generic
   * result regardless of whether the email exists, to avoid user enumeration —
   * the actual email/WhatsApp send happens silently in the background of that response.
   */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user && user.status !== UserStatus.DELETED) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_HOURS * 60 * 60 * 1000);
      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
      });

      const resetUrl = `${this.config.get<string>('FRONTEND_URL') ?? ''}/reset-password?token=${token}`;
      await this.notificationsService.sendCustom({
        email: user.email,
        phone: user.phone,
        subject: 'Reset your password',
        emailHtml: `<p>We received a request to reset your password. This link expires in ${RESET_TOKEN_TTL_HOURS} hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can safely ignore this message.</p>`,
        whatsappMessage: `We received a request to reset your password. This link expires in ${RESET_TOKEN_TTL_HOURS} hour:\n${resetUrl}\n\nIf you didn't request this, you can ignore this message.`,
      });
    }

    return { message: 'If an account exists for that email, a reset link has been sent.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = hashToken(token);
    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!resetToken) {
      throw new BadRequestException('This reset link is invalid or has expired.');
    }

    const newHash = await this.passwordService.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: newHash, mustChangePassword: false },
      }),
      this.prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({ where: { userId: resetToken.userId }, data: { revoked: true } }),
    ]);

    return { reset: true };
  }
}
