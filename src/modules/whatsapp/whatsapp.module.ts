import { Module } from '@nestjs/common';
import { WhatsappSessionManagerService } from './whatsapp-session-manager.service';
import { WhatsappAccountsService } from './whatsapp-accounts.service';
import { WhatsappController, AdminWhatsappController } from './whatsapp.controller';
import { SubscriptionModule } from '../subscription/subscription.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { FeaturesModule } from '../features/features.module';

@Module({
  imports: [SubscriptionModule, AuditLogModule, FeaturesModule],
  controllers: [WhatsappController, AdminWhatsappController],
  providers: [WhatsappSessionManagerService, WhatsappAccountsService],
  exports: [WhatsappSessionManagerService, WhatsappAccountsService],
})
export class WhatsappModule {}
