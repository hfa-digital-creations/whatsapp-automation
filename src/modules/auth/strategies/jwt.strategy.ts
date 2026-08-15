import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../../common/services/prisma.service';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

export interface JwtPayload {
  sub: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'CLIENT';
  clientId: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Re-checks live account status on every request, not just at login/refresh — without
   * this, an admin blocking a client only takes effect once their already-issued access
   * token naturally expires (up to 15 minutes later), which doesn't match what "Block"
   * is supposed to mean.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { status: true } });
    if (!user || user.status === UserStatus.BLOCKED || user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('Your account is not active.');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      clientId: payload.clientId,
    };
  }
}
