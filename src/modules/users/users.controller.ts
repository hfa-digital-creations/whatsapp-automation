import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

@Controller('admin/users')
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('role') role?: UserRole,
    @Query('status') status?: UserStatus,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.usersService.list({
      search,
      role,
      status,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  async create(@Body() dto: CreateUserDto, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const result = await this.usersService.create(dto);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'USER_CREATED',
      targetType: 'User',
      targetId: result.user.id,
      metadata: { email: dto.email, role: dto.role },
      ipAddress: req.ip,
    });
    return result;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const result = await this.usersService.update(id, dto);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'USER_UPDATED',
      targetType: 'User',
      targetId: id,
      metadata: dto as any,
      ipAddress: req.ip,
    });
    return result;
  }

  @Patch(':id/block')
  async block(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const result = await this.usersService.block(id);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'USER_BLOCKED',
      targetType: 'User',
      targetId: id,
      ipAddress: req.ip,
    });
    return result;
  }

  @Patch(':id/unblock')
  async unblock(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const result = await this.usersService.unblock(id);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'USER_UNBLOCKED',
      targetType: 'User',
      targetId: id,
      ipAddress: req.ip,
    });
    return result;
  }

  @Patch(':id/delete')
  async softDelete(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const result = await this.usersService.softDelete(id);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'USER_DELETED',
      targetType: 'User',
      targetId: id,
      ipAddress: req.ip,
    });
    return result;
  }

  @Post(':id/reset-password')
  async resetPassword(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const result = await this.usersService.resetPassword(id);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'USER_PASSWORD_RESET',
      targetType: 'User',
      targetId: id,
      ipAddress: req.ip,
    });
    return result;
  }
}
