import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { VouchersService } from './vouchers.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

@Controller('admin/vouchers')
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class VouchersController {
  constructor(
    private readonly vouchersService: VouchersService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  list() {
    return this.vouchersService.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.vouchersService.findById(id);
  }

  @Post()
  async create(@Body() dto: CreateVoucherDto, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const voucher = await this.vouchersService.create(dto);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'VOUCHER_CREATED',
      targetType: 'Voucher',
      targetId: voucher.id,
      metadata: { code: voucher.code },
      ipAddress: req.ip,
    });
    return voucher;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateVoucherDto, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const voucher = await this.vouchersService.update(id, dto);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'VOUCHER_UPDATED',
      targetType: 'Voucher',
      targetId: id,
      ipAddress: req.ip,
    });
    return voucher;
  }
}
