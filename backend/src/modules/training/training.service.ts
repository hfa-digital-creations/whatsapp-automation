import { Injectable, NotFoundException } from '@nestjs/common';
import { TrainingSourceStatus, TrainingSourceType } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { KnowledgeExtractionService } from './knowledge-extraction.service';
import { extractDocumentText, resolveTrainingSourceType } from './document-extractor';
import { CreateTextTrainingDto } from './dto/create-text-training.dto';
import { UpdateTextTrainingDto } from './dto/update-text-training.dto';

@Injectable()
export class TrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeExtraction: KnowledgeExtractionService,
  ) {}

  async createText(clientId: string, dto: CreateTextTrainingDto) {
    const source = await this.prisma.businessTrainingSource.create({
      data: {
        clientId,
        title: dto.title,
        type: TrainingSourceType.TEXT,
        content: dto.content,
        status: TrainingSourceStatus.PROCESSED,
      },
    });
    await this.knowledgeExtraction.extractForSource(source.id);
    return source;
  }

  async uploadDocument(clientId: string, file: Express.Multer.File) {
    const type = resolveTrainingSourceType(file.originalname);

    let source = await this.prisma.businessTrainingSource.create({
      data: {
        clientId,
        title: file.originalname,
        type,
        fileName: file.originalname,
        status: TrainingSourceStatus.PENDING,
      },
    });

    try {
      const content = await extractDocumentText(file.buffer, type);
      source = await this.prisma.businessTrainingSource.update({
        where: { id: source.id },
        data: { content, status: TrainingSourceStatus.PROCESSED },
      });
      await this.knowledgeExtraction.extractForSource(source.id);
    } catch (err: any) {
      source = await this.prisma.businessTrainingSource.update({
        where: { id: source.id },
        data: { status: TrainingSourceStatus.FAILED },
      });
    }

    return source;
  }

  list(clientId: string) {
    return this.prisma.businessTrainingSource.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } });
  }

  private async getOwned(clientId: string, id: string) {
    const source = await this.prisma.businessTrainingSource.findUnique({ where: { id } });
    if (!source || source.clientId !== clientId) throw new NotFoundException('Training source not found.');
    return source;
  }

  async update(clientId: string, id: string, dto: UpdateTextTrainingDto) {
    const source = await this.getOwned(clientId, id);
    if (source.type !== TrainingSourceType.TEXT) {
      throw new NotFoundException('Only text training entries can be edited directly.');
    }
    const updated = await this.prisma.businessTrainingSource.update({
      where: { id },
      data: { title: dto.title, content: dto.content, status: TrainingSourceStatus.PROCESSED },
    });
    if (dto.content) await this.knowledgeExtraction.extractForSource(id);
    return updated;
  }

  async reprocess(clientId: string, id: string) {
    await this.getOwned(clientId, id);
    await this.knowledgeExtraction.extractForSource(id);
    return { reprocessed: true };
  }

  async delete(clientId: string, id: string) {
    await this.getOwned(clientId, id);
    await this.prisma.$transaction([
      this.prisma.businessKnowledge.deleteMany({ where: { sourceId: id } }),
      this.prisma.businessTrainingSource.delete({ where: { id } }),
    ]);
    return { deleted: true };
  }

  getKnowledge(clientId: string) {
    return this.prisma.businessKnowledge.findMany({ where: { clientId }, orderBy: { category: 'asc' } });
  }
}
