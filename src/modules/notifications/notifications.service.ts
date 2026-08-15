import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import { EmailService } from './email.service';
import { WhatsappSessionManagerService } from '../whatsapp/whatsapp-session-manager.service';
import { SYSTEM_WHATSAPP_SESSION_ID } from '../../common/constants';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly whatsappSessionManager: WhatsappSessionManagerService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    // Keeps the platform's own WhatsApp number connected across restarts, best-effort.
    this.whatsappSessionManager.startSession(SYSTEM_WHATSAPP_SESSION_ID).catch((err) =>
      this.logger.warn(`System WhatsApp session did not start: ${err.message}`),
    );
  }

  async notifyInApp(userId: string, type: string, title: string, message: string) {
    return this.prisma.notification.create({ data: { userId, type, title, message } });
  }

  async listForUser(userId: string) {
    return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
  }

  /** Spec §9: client activation credentials are delivered via email AND WhatsApp. */
  async sendActivationCredentials(params: {
    email: string;
    phone: string | null;
    businessName: string;
    loginUrl: string;
    temporaryPassword: string;
  }) {
    const { email, phone, businessName, loginUrl, temporaryPassword } = params;

    const emailHtml = `
      <p>Hi ${businessName},</p>
      <p>Your account has been activated. Here are your login details:</p>
      <p>
        Login URL: <a href="${loginUrl}">${loginUrl}</a><br/>
        Email: ${email}<br/>
        Temporary Password: <strong>${temporaryPassword}</strong>
      </p>
      <p>You'll be asked to set a new password the first time you log in.</p>
    `;
    const emailSent = await this.emailService.send(email, 'Your account is ready', emailHtml);

    let whatsappSent = false;
    if (phone) {
      const message =
        `Hi ${businessName}, your account is now active.\n` +
        `Login: ${loginUrl}\nEmail: ${email}\nTemporary Password: ${temporaryPassword}\n\n` +
        `You'll be asked to set a new password on first login.`;
      whatsappSent = await this.whatsappSessionManager.sendMessage(SYSTEM_WHATSAPP_SESSION_ID, phone, message);
    }

    if (!emailSent && !whatsappSent) {
      this.logger.warn(`Could not deliver activation credentials to ${email} via email or WhatsApp.`);
    }

    return { emailSent, whatsappSent };
  }

  /** Generic system-to-recipient message (renewal reminders, enquiry follow-ups, etc.) via the platform's own channels. */
  async sendCustom(params: {
    email?: string | null;
    phone?: string | null;
    subject: string;
    emailHtml?: string;
    whatsappMessage?: string;
    /** Optional local file (image/video/document) attached to both the email and WhatsApp send. */
    media?: { filePath: string; fileName: string } | null;
  }): Promise<{ emailSent: boolean; whatsappSent: boolean }> {
    const emailSent =
      params.email && params.emailHtml
        ? await this.emailService.send(
            params.email,
            params.subject,
            params.emailHtml,
            params.media ? [{ filename: params.media.fileName, path: params.media.filePath }] : undefined,
          )
        : false;
    const whatsappSent =
      params.phone && params.whatsappMessage
        ? params.media
          ? await this.whatsappSessionManager.sendMediaMessage(
              SYSTEM_WHATSAPP_SESSION_ID,
              params.phone,
              params.media.filePath,
              params.whatsappMessage,
            )
          : await this.whatsappSessionManager.sendMessage(SYSTEM_WHATSAPP_SESSION_ID, params.phone, params.whatsappMessage)
        : false;
    return { emailSent, whatsappSent };
  }
}
