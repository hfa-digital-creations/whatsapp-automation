import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AiService } from '../../common/services/ai.service';

const EXTRACTION_SYSTEM_PROMPT = `You extract structured business knowledge from raw business documents/text for a
WhatsApp sales automation assistant. Read the provided content and output ONLY a JSON array of facts, each shaped as:
{"category": "...", "key": "...", "value": "..."}.

Categories to use where applicable: identity, services, products, pricing, faqs, policies, offers, contact,
hours, location, payment, delivery, terms.

Rules:
- Only extract facts that are explicitly stated in the content. Never infer, guess, or invent information.
- Keep each "value" concise and WhatsApp-reply-ready (a sentence or short paragraph, not the raw source text).
- If the content contains no usable business facts, output an empty JSON array: []
- Output ONLY the JSON array, no commentary, no markdown fences.`;

@Injectable()
export class KnowledgeExtractionService {
  private readonly logger = new Logger(KnowledgeExtractionService.name);

  constructor(private readonly prisma: PrismaService, private readonly ai: AiService) {}

  /**
   * Structures a training source's raw content into BusinessKnowledge rows (spec §11).
   * Best-effort: if the AI provider isn't configured, the source stays PROCESSED with
   * its raw content stored, just without structured facts yet — never blocks training.
   */
  async extractForSource(sourceId: string): Promise<void> {
    const source = await this.prisma.businessTrainingSource.findUnique({ where: { id: sourceId } });
    if (!source?.content) return;

    if (!this.ai.isConfigured) {
      this.logger.warn(`Skipping knowledge extraction for source ${sourceId} — AI provider not configured.`);
      return;
    }

    const raw = await this.ai.complete({
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt: source.content.slice(0, 20_000),
      maxTokens: 2048,
    });
    if (!raw) return;

    let facts: Array<{ category: string; key: string; value: string }>;
    try {
      const jsonText = raw.trim().replace(/^```(json)?/i, '').replace(/```$/, '');
      facts = JSON.parse(jsonText);
      if (!Array.isArray(facts)) throw new Error('Expected a JSON array');
    } catch (err: any) {
      this.logger.warn(`Could not parse extracted knowledge for source ${sourceId}: ${err.message}`);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.businessKnowledge.deleteMany({ where: { sourceId } });
      if (facts.length > 0) {
        await tx.businessKnowledge.createMany({
          data: facts
            .filter((f) => f.category && f.key && f.value)
            .map((f) => ({ clientId: source.clientId, sourceId, category: f.category, key: f.key, value: f.value })),
        });
      }
    });
  }

  /** Formats a client's approved knowledge as a system-prompt context block for the conversation engine. */
  async getKnowledgeContext(clientId: string): Promise<string> {
    const facts = await this.prisma.businessKnowledge.findMany({ where: { clientId }, orderBy: { category: 'asc' } });
    if (facts.length === 0) return '(No business knowledge has been configured yet.)';

    const byCategory = new Map<string, string[]>();
    for (const fact of facts) {
      const list = byCategory.get(fact.category) ?? [];
      list.push(`- ${fact.key}: ${fact.value}`);
      byCategory.set(fact.category, list);
    }

    return Array.from(byCategory.entries())
      .map(([category, lines]) => `[${category.toUpperCase()}]\n${lines.join('\n')}`)
      .join('\n\n');
  }
}
