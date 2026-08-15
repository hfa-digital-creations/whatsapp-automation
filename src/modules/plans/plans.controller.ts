import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { PlanStatus, UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

@Controller()
export class PlansController {
  constructor(private readonly plansService: PlansService, private readonly auditLogService: AuditLogService) {}

  @Public()
  @Get('public/plans')
  listPublic() {
    return this.plansService.list({ publicOnly: true });
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Get('admin/plans')
  list(@Query('status') status?: PlanStatus) {
    return this.plansService.list({ status });
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Get('admin/plans/:id')
  get(@Param('id') id: string) {
    return this.plansService.findById(id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post('admin/plans')
  async create(@Body() dto: CreatePlanDto, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const plan = await this.plansService.create(dto);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'PLAN_CREATED',
      targetType: 'Plan',
      targetId: plan.id,
      metadata: { name: plan.name },
      ipAddress: req.ip,
    });
    return plan;
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Patch('admin/plans/:id')
  async update(@Param('id') id: string, @Body() dto: UpdatePlanDto, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const plan = await this.plansService.update(id, dto);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'PLAN_UPDATED',
      targetType: 'Plan',
      targetId: id,
      ipAddress: req.ip,
    });
    return plan;
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Patch('admin/plans/:id/status')
  async setStatus(@Param('id') id: string, @Body('status') status: PlanStatus, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const plan = await this.plansService.setStatus(id, status);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'PLAN_STATUS_CHANGED',
      targetType: 'Plan',
      targetId: id,
      metadata: { status },
      ipAddress: req.ip,
    });
    return plan;
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete('admin/plans/:id')
  async archive(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const result = await this.plansService.archive(id);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'PLAN_ARCHIVED',
      targetType: 'Plan',
      targetId: id,
      ipAddress: req.ip,
    });
    return result;
  }
}
