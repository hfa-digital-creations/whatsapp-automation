import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { FeaturesService } from './features.service';
import { UpsertFeatureDto } from './dto/upsert-feature.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

@Controller('admin/features')
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class FeaturesController {
  constructor(
    private readonly featuresService: FeaturesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  list() {
    return this.featuresService.list();
  }

  @Post()
  async create(@Body() dto: UpsertFeatureDto, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const feature = await this.featuresService.create(dto);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'FEATURE_CREATED',
      targetType: 'Feature',
      targetId: feature.id,
      metadata: { code: feature.code },
      ipAddress: req.ip,
    });
    return feature;
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<UpsertFeatureDto>) {
    return this.featuresService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.featuresService.delete(id);
  }

  @Get('client/:clientId/effective')
  effective(@Param('clientId') clientId: string) {
    return this.featuresService.computeEffectiveFeatures(clientId);
  }

  @Patch('client/:clientId/:featureCode')
  async setOverride(
    @Param('clientId') clientId: string,
    @Param('featureCode') featureCode: string,
    @Body('enabled') enabled: boolean | null,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    const result = await this.featuresService.setClientOverride(clientId, featureCode, enabled);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: enabled === null ? 'FEATURE_OVERRIDE_CLEARED' : enabled ? 'FEATURE_ENABLED' : 'FEATURE_DISABLED',
      targetType: 'Client',
      targetId: clientId,
      metadata: { featureCode, enabled },
      ipAddress: req.ip,
    });
    return result;
  }
}

/** Lets a client check their own effective feature set — used to conditionally show/hide UI. */
@Controller('client/features')
@Roles(UserRole.CLIENT)
export class ClientFeaturesController {
  constructor(private readonly featuresService: FeaturesService) {}

  @Get()
  effective(@CurrentUser() user: AuthenticatedUser) {
    return this.featuresService.computeEffectiveFeatures(user.clientId!);
  }
}
