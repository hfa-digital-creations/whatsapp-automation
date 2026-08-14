import { CanActivate, ExecutionContext, Injectable, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../services/prisma.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

export const SKIP_PASSWORD_CHECK_KEY = 'skipPasswordCheck';
export const SkipPasswordCheck = () => SetMetadata(SKIP_PASSWORD_CHECK_KEY, true);

/**
 * Blocks access to the client panel until the forced first-login password
 * change is complete (spec §9). Endpoints that must remain reachable before
 * that (change-password, logout, profile read) opt out via @SkipPasswordCheck().
 *
 * Scoped to CLIENT accounts only — admin/staff accounts have no dedicated
 * forced-password-change screen in this phase, so this must never lock them out.
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_PASSWORD_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;
    if (!user || user.role !== 'CLIENT') return true;

    const dbUser = await this.prisma.user.findUnique({ where: { id: user.userId } });
    if (dbUser?.mustChangePassword) {
      throw new ForbiddenException('Password change required before continuing.');
    }
    return true;
  }
}
