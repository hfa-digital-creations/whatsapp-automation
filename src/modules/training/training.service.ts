import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

  /**
   * Portable snapshot of a client's training content — lets a business with a
   * similar setup (e.g. a franchise, or the same owner's other client account)
   * reuse it instead of retyping everything. Only successfully-processed
   * sources are included, since a PENDING/FAILED one has no usable content.
   */
  async exportData(clientId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { businessName: true } });
    const sources = await this.prisma.businessTrainingSource.findMany({
      where: { clientId, status: TrainingSourceStatus.PROCESSED, content: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { title: true, content: true },
    });

    return {
      exportedFrom: client?.businessName ?? null,
      exportedAt: new Date().toISOString(),
      sources: sources.map((s) => ({ title: s.title, content: s.content as string })),
    };
  }

  /**
   * Imports a previously exported snapshot as new TEXT sources on this client
   * (never overwrites existing ones) — each runs through the same knowledge
   * extraction pipeline as if it had been typed in by hand.
   */
  async importData(clientId: string, payload: unknown) {
    const sources = (payload as { sources?: unknown })?.sources;
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new BadRequestException('This file has no training sources to import.');
    }

    let imported = 0;
    for (const item of sources) {
      const title = (item as { title?: unknown })?.title;
      const content = (item as { content?: unknown })?.content;
      if (typeof title !== 'string' || typeof content !== 'string' || !title.trim() || !content.trim()) continue;

      const source = await this.prisma.businessTrainingSource.create({
        data: { clientId, title: title.trim(), type: TrainingSourceType.TEXT, content, status: TrainingSourceStatus.PROCESSED },
      });
      await this.knowledgeExtraction.extractForSource(source.id);
      imported += 1;
    }

    if (imported === 0) {
      throw new BadRequestException('No valid training sources were found in this file.');
    }
    return { imported };
  }
}
