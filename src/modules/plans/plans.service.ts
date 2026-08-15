import { Injectable, NotFoundException } from '@nestjs/common';
import { PlanStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

const planInclude = { planFeatures: { include: { feature: true } } } satisfies Prisma.PlanInclude;

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePlanDto) {
    const { featureCodes, ...planData } = dto;
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.create({ data: planData });
      if (featureCodes?.length) {
        await this.syncFeatures(tx, plan.id, featureCodes);
      }
      return tx.plan.findUniqueOrThrow({ where: { id: plan.id }, include: planInclude });
    });
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.findById(id);
    const { featureCodes, ...planData } = dto;
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.update({ where: { id }, data: planData });
      if (featureCodes) {
        await this.syncFeatures(tx, plan.id, featureCodes);
      }
      return tx.plan.findUniqueOrThrow({ where: { id: plan.id }, include: planInclude });
    });
  }

  private async syncFeatures(tx: Prisma.TransactionClient, planId: string, featureCodes: string[]) {
    const features = await tx.feature.findMany({ where: { code: { in: featureCodes } } });
    await tx.planFeature.deleteMany({ where: { planId } });
    if (features.length) {
      await tx.planFeature.createMany({
        data: features.map((f) => ({ planId, featureId: f.id, enabled: true })),
      });
    }
  }

  async findById(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id }, include: planInclude });
    if (!plan) throw new NotFoundException('Plan not found.');
    return plan;
  }

  list(params: { status?: PlanStatus; publicOnly?: boolean }) {
    return this.prisma.plan.findMany({
      where: { status: params.publicOnly ? PlanStatus.ACTIVE : params.status },
      include: planInclude,
      orderBy: { displayOrder: 'asc' },
    });
  }

  async setStatus(id: string, status: PlanStatus) {
    await this.findById(id);
    return this.prisma.plan.update({ where: { id }, data: { status } });
  }

  async archive(id: string) {
    await this.findById(id);
    const inUse = await this.prisma.client.count({ where: { planId: id } });
    if (inUse > 0) {
      // Preserve relational integrity: deactivate rather than delete when clients reference this plan.
      return this.prisma.plan.update({ where: { id }, data: { status: PlanStatus.INACTIVE } });
    }
    return this.prisma.plan.delete({ where: { id } });
  }
}
