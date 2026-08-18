import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { DigestService } from './digest.service';
import { DigestSenderProcessor } from './digest-sender.processor';
import { ClientDashboardController } from './client-dashboard.controller';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { FeaturesModule } from '../features/features.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [PlatformSettingsModule, FeaturesModule, WhatsappModule, BullModule.registerQueue({ name: 'digest' })],
  controllers: [DashboardController, ClientDashboardController],
  providers: [DashboardService, DigestService, DigestSenderProcessor],
})
export class DashboardModule implements OnModuleInit {
  constructor(@InjectQueue('digest') private readonly digestQueue: Queue) {}

  async onModuleInit() {
    // dailyDigestTime is admin-configurable at runtime, not a fixed cron expression, so this
    // polls every 5 minutes and DigestService.sendDailyReportIfDue() decides per-tick whether
    // it's actually due — rather than re-registering a BullMQ repeatable job on every settings
    // change. Repeatable jobs are deduped by BullMQ on (name + repeat pattern), so this is safe
    // to call on every boot without creating duplicate schedules.
    await this.digestQueue.add(
      'check-daily-digest',
      {},
      { repeat: { pattern: '*/5 * * * *' }, jobId: 'daily-digest-check' },
    );
  }
}
