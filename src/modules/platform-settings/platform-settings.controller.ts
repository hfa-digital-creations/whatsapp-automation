import { BadRequestException, Controller, Get, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PlatformSettingsService } from './platform-settings.service';
import { AuditLogService } from '../audit-log/audit-log.service';

const MAX_FAVICON_BYTES = 1 * 1024 * 1024;

@Controller()
export class PlatformSettingsController {
  constructor(
    private readonly settingsService: PlatformSettingsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Read by every page (landing, login, admin, client) to apply the current favicon — never behind auth. */
  @Public()
  @Get('public/settings')
  get() {
    return this.settingsService.get();
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post('admin/settings/favicon')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FAVICON_BYTES } }))
  async uploadFavicon(@UploadedFile() file: Express.Multer.File, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const settings = await this.settingsService.uploadFavicon(file);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'PLATFORM_FAVICON_UPDATED',
      targetType: 'PlatformSettings',
      targetId: settings.id,
      ipAddress: req.ip,
    });
    return settings;
  }
}
