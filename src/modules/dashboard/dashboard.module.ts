import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { DigestService } from './digest.service';
import { ClientDashboardController } from './client-dashboard.controller';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { FeaturesModule } from '../features/features.module';

@Module({
  imports: [PlatformSettingsModule, FeaturesModule],
  controllers: [DashboardController, ClientDashboardController],
  providers: [DashboardService, DigestService],
})
export class DashboardModule {}
