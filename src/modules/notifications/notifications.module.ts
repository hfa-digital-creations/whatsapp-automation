import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { PaymentReceiptListener } from './payment-receipt.listener';
import { NotificationsController, AdminSystemWhatsappController } from './notifications.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule],
  controllers: [NotificationsController, AdminSystemWhatsappController],
  providers: [NotificationsService, EmailService, PaymentReceiptListener],
  exports: [NotificationsService],
})
export class NotificationsModule {}
