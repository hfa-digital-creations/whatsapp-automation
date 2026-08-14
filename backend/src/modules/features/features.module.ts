import { Module } from '@nestjs/common';
import { FeaturesService } from './features.service';
import { FeaturesController, ClientFeaturesController } from './features.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [AuditLogModule],
  controllers: [FeaturesController, ClientFeaturesController],
  providers: [FeaturesService],
  exports: [FeaturesService],
})
export class FeaturesModule {}
