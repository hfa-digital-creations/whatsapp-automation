import { Module } from '@nestjs/common';
import { EnquiriesService } from './enquiries.service';
import { EnquiryAutomationService } from './enquiry-automation.service';
import { EnquiriesController } from './enquiries.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { PlansModule } from '../plans/plans.module';
import { ClientsModule } from '../clients/clients.module';
import { TrainingModule } from '../training/training.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';

@Module({
  imports: [NotificationsModule, WhatsappModule, PlansModule, ClientsModule, TrainingModule, AuditLogModule, PlatformSettingsModule],
  controllers: [EnquiriesController],
  providers: [EnquiriesService, EnquiryAutomationService],
})
export class EnquiriesModule {}
