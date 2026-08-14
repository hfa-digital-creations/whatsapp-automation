import { Injectable, Logger } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AiService } from '../../common/services/ai.service';

const EXTRACTION_SYSTEM_PROMPT = `You extract customer lead information from a WhatsApp sales conversation.
Read the conversation and output ONLY a JSON object with any of these fields the customer has explicitly
mentioned (omit fields they haven't mentioned — never guess or infer a value):

{"name": "...", "company": "...", "email": "...", "serviceRequired": "...", "location": "...", "budget": "...",
"preferredDate": "...", "quantity": "...", "notes": "...", "participationType": "...", "category": "...",
"stallSize": "...", "previousParticipant": "..."}

participationType is how they want to take part (e.g. Exhibit, Sponsor, Delegate). category is their
industry/product category (e.g. Medical Devices, Pharma, Hospital Tech, Other). stallSize is the booth/stall
size they want. previousParticipant is whether they mentioned participating in a prior year (yes/no).

If nothing new is mentioned, output {}. Output ONLY the JSON object, no commentary, no markdown fences.`;

const QUALIFIED_FIELD_THRESHOLD = 3;

@Injectable()
export class LeadExtractionService {
  private readonly logger = new Logger(LeadExtractionService.name);

  constructor(private readonly prisma: PrismaService, private readonly ai: AiService) {}

  /**
   * Best-effort structured extraction of customer-provided details (spec §12) —
   * runs after each inbound message, merges into the conversation's lead record.
   * Never blocks or fails the reply flow if the AI provider isn't configured.
   */
  async extractAndUpdate(
    clientId: string,
    conversationId: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<void> {
    if (!this.ai.isConfigured) return;

    const transcript = history.map((m) => `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${m.content}`).join('\n');
    const raw = await this.ai.complete({
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt: transcript,
      maxTokens: 400,
    });
    if (!raw) return;

    let extracted: Record<string, string>;
    try {
      const jsonText = raw.trim().replace(/^```(json)?/i, '').replace(/```$/, '');
      extracted = JSON.parse(jsonText);
    } catch (err: any) {
      this.logger.warn(`Could not parse lead extraction for conversation ${conversationId}: ${err.message}`);
      return;
    }
    if (Object.keys(extracted).length === 0) return;

    const existing = await this.prisma.customerLead.findFirst({ where: { conversationId } });
    const merged = { ...(existing?.collectedInfo as Record<string, string> | undefined), ...extracted };
    const status: LeadStatus = Object.keys(merged).length >= QUALIFIED_FIELD_THRESHOLD ? LeadStatus.QUALIFIED : LeadStatus.NEW;

    if (existing) {
      await this.prisma.customerLead.update({
        where: { id: existing.id },
        data: { collectedInfo: merged, status },
      });
    } else {
      await this.prisma.customerLead.create({
        data: { conversationId, clientId, collectedInfo: merged, status },
      });
    }

    await this.prisma.customerConversation.update({ where: { id: conversationId }, data: { leadStatus: status } });
  }
}
