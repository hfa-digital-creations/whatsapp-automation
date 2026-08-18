import { Controller, Get } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';
import { DigestService } from './digest.service';

@Controller('admin/dashboard')
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly digestService: DigestService,
  ) {}

  @Get('stats')
  getStats() {
    return this.dashboardService.getStats();
  }

  /** Platform-wide "everything that happened today," withheld until the configured digest time. */
  @Get('digest')
  getDigest() {
    return this.digestService.getAdminDigest();
  }
}
