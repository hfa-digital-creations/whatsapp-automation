import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { UpsertQuotationTemplateDto } from './dto/upsert-template.dto';
import { GenerateQuotationDto } from './dto/generate-quotation.dto';

function renderTemplate(template: string, values: Record<string, string>, fallback: Record<string, unknown>): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_match, key: string) => {
    if (key in values) return values[key];
    const fallbackValue = (fallback as Record<string, unknown>)[key];
    return fallbackValue != null ? String(fallbackValue) : `[${key}]`;
  });
}

@Injectable()
export class QuotationsService {
  constructor(private readonly prisma: PrismaService) {}

  createTemplate(clientId: string, dto: UpsertQuotationTemplateDto) {
    return this.prisma.quotationTemplate.create({ data: { clientId, ...dto } });
  }

  listTemplates(clientId: string) {
    return this.prisma.quotationTemplate.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } });
  }

  private async getOwnedTemplate(clientId: string, id: string) {
    const template = await this.prisma.quotationTemplate.findUnique({ where: { id } });
    if (!template || template.clientId !== clientId) throw new NotFoundException('Quotation template not found.');
    return template;
  }

  async updateTemplate(clientId: string, id: string, dto: Partial<UpsertQuotationTemplateDto>) {
    await this.getOwnedTemplate(clientId, id);
    return this.prisma.quotationTemplate.update({ where: { id }, data: dto });
  }

  async deleteTemplate(clientId: string, id: string) {
    await this.getOwnedTemplate(clientId, id);
    await this.prisma.quotationTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Deterministic templating only — the quoted amount always comes from the
   * client's own configured startingPrice, never invented (spec §16, Rule 13).
   */
  async generate(clientId: string, dto: GenerateQuotationDto) {
    const template = await this.getOwnedTemplate(clientId, dto.templateId);
    const values = dto.fieldValues ?? {};

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + template.validityDays);

    const baseText =
      template.templateText ??
      `Thanks for your interest in ${template.service}! Based on what you've shared, our starting price is ` +
        `₹${template.startingPrice}. ${template.paymentTerms ?? ''} This quote is valid until ${validUntil.toDateString()}.`;

    const generatedText = renderTemplate(baseText, values, {
      service: template.service,
      price: template.startingPrice.toString(),
      validUntil: validUntil.toDateString(),
      paymentTerms: template.paymentTerms ?? '',
    });

    return this.prisma.quotation.create({
      data: {
        clientId,
        conversationId: dto.conversationId,
        templateId: template.id,
        generatedText,
        amount: template.startingPrice,
      },
    });
  }

  listQuotations(clientId: string) {
    return this.prisma.quotation.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } });
  }
}
