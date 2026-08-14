import { Module } from '@nestjs/common';
import { TrainingService } from './training.service';
import { TrainingController } from './training.controller';
import { KnowledgeExtractionService } from './knowledge-extraction.service';
import { FeaturesModule } from '../features/features.module';

@Module({
  imports: [FeaturesModule],
  controllers: [TrainingController],
  providers: [TrainingService, KnowledgeExtractionService],
  exports: [KnowledgeExtractionService],
})
export class TrainingModule {}
