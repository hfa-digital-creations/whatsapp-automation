import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsController, ClientProfileController } from './clients.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [AuditLogModule, NotificationsModule, SubscriptionModule, WhatsappModule],
  controllers: [ClientsController, ClientProfileController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
