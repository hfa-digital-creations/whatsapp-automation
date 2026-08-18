import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DigestService } from './digest.service';

/** A client's own "everything that happened today" — admin decides per client/plan
 * whether this is available at all, via the DAILY_DIGEST feature flag. */
@Controller('client/dashboard')
@Roles(UserRole.CLIENT)
@UseGuards(FeatureGuard)
@RequireFeature('DAILY_DIGEST')
export class ClientDashboardController {
  constructor(private readonly digestService: DigestService) {}

  @Get('digest')
  getDigest(@CurrentUser() user: AuthenticatedUser) {
    return this.digestService.getClientDigest(user.clientId!);
  }
}
