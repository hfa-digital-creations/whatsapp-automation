import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { Prisma } from '@prisma/client';

export interface AuditLogEntry {
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditLogEntry, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.auditLog.create({ data: entry });
  }

  async list(params: { skip?: number; take?: number; adminId?: string; targetType?: string }) {
    const { skip = 0, take = 50, adminId, targetType } = params;
    return this.prisma.auditLog.findMany({
      where: {
        adminId,
        targetType,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { admin: { select: { id: true, email: true } } },
    });
  }
}
