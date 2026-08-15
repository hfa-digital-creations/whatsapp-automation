import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { AutomationEngineService } from './automation-engine.service';
import { LeadExtractionService } from './lead-extraction.service';
import { ConversationsController, ContactsController } from './conversations.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { FeaturesModule } from '../features/features.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { TrainingModule } from '../training/training.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [WhatsappModule, FeaturesModule, SubscriptionModule, TrainingModule, NotificationsModule],
  controllers: [ConversationsController, ContactsController],
  providers: [ConversationsService, AutomationEngineService, LeadExtractionService],
})
export class AutomationModule {}
