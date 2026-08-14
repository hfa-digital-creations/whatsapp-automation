import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('EMAIL_HOST');
    if (!host) {
      this.logger.warn('EMAIL_HOST not configured — outgoing email is disabled.');
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(this.config.get<string>('EMAIL_PORT') ?? 587),
      secure: this.config.get<string>('EMAIL_SECURE') === 'true',
      auth: {
        user: this.config.get<string>('EMAIL_USER'),
        pass: this.config.get<string>('EMAIL_PASSWORD'),
      },
    });
  }

  async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('EMAIL_FROM') ?? this.config.get<string>('EMAIL_USER'),
        to,
        subject,
        html,
      });
      return true;
    } catch (err: any) {
      this.logger.warn(`Failed to send email to ${to}: ${err.message}`);
      return false;
    }
  }
}
