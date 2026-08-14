import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { BrandingService } from './branding.service';
import { UpsertBrandingDto } from './dto/upsert-branding.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

@Controller()
export class BrandingController {
  constructor(
    private readonly brandingService: BrandingService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Get('admin/clients/:clientId/branding')
  getForClient(@Param('clientId') clientId: string) {
    return this.brandingService.getForClient(clientId);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Patch('admin/clients/:clientId/branding')
  async update(
    @Param('clientId') clientId: string,
    @Body() dto: UpsertBrandingDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    const result = await this.brandingService.upsert(clientId, dto);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'CLIENT_BRANDING_UPDATED',
      targetType: 'Client',
      targetId: clientId,
      ipAddress: req.ip,
    });
    return result;
  }

  @Roles(UserRole.CLIENT)
  @Get('client/branding')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.brandingService.getForClient(user.clientId!);
  }
}
