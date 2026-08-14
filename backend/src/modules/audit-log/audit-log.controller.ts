import { Controller, Get, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLogService } from './audit-log.service';

@Controller('admin/audit-logs')
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  list(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('targetType') targetType?: string,
  ) {
    return this.auditLogService.list({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      targetType,
    });
  }
}
