import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { UpsertFeatureDto } from './dto/upsert-feature.dto';

@Injectable()
export class FeaturesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.feature.findMany({ orderBy: { code: 'asc' } });
  }

  async create(dto: UpsertFeatureDto) {
    return this.prisma.feature.create({ data: dto });
  }

  async update(id: string, dto: Partial<UpsertFeatureDto>) {
    const feature = await this.prisma.feature.findUnique({ where: { id } });
    if (!feature) throw new NotFoundException('Feature not found.');
    return this.prisma.feature.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    const feature = await this.prisma.feature.findUnique({ where: { id } });
    if (!feature) throw new NotFoundException('Feature not found.');
    await this.prisma.feature.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Effective permission = plan default, overridden per-client if an override row exists (spec §46).
   * This is the single source of truth backend enforcement relies on — never trust the frontend.
   */
  async computeEffectiveFeatures(clientId: string): Promise<Record<string, boolean>> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: {
        plan: { include: { planFeatures: { include: { feature: true } } } },
        featureOverrides: { include: { feature: true } },
      },
    });
    if (!client) throw new NotFoundException('Client not found.');

    const effective: Record<string, boolean> = {};
    for (const pf of client.plan?.planFeatures ?? []) {
      effective[pf.feature.code] = pf.enabled;
    }
    for (const override of client.featureOverrides) {
      effective[override.feature.code] = override.enabled;
    }
    return effective;
  }

  async isFeatureEnabled(clientId: string, featureCode: string): Promise<boolean> {
    const effective = await this.computeEffectiveFeatures(clientId);
    return effective[featureCode] ?? false;
  }

  async setClientOverride(clientId: string, featureCode: string, enabled: boolean | null) {
    const feature = await this.prisma.feature.findUnique({ where: { code: featureCode } });
    if (!feature) throw new NotFoundException('Feature not found.');

    if (enabled === null) {
      await this.prisma.clientFeatureOverride.deleteMany({ where: { clientId, featureId: feature.id } });
      return { cleared: true };
    }

    return this.prisma.clientFeatureOverride.upsert({
      where: { clientId_featureId: { clientId, featureId: feature.id } },
      update: { enabled },
      create: { clientId, featureId: feature.id, enabled },
    });
  }
}
