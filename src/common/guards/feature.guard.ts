import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_FEATURE_KEY } from '../decorators/require-feature.decorator';
import { FeaturesService } from '../../modules/features/features.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Backend enforcement of plan/feature permissions (spec §5, §46). The frontend
 * may hide a button, but this guard is the actual authorization boundary.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly featuresService: FeaturesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureCode = this.reflector.getAllAndOverride<string>(REQUIRE_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!featureCode) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;
    if (!user?.clientId) {
      throw new ForbiddenException('This action requires an active client account.');
    }

    const enabled = await this.featuresService.isFeatureEnabled(user.clientId, featureCode);
    if (!enabled) {
      throw new ForbiddenException(`This feature (${featureCode}) is not enabled for your account.`);
    }
    return true;
  }
}
