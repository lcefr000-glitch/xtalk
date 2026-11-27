import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppConfig } from '../../config/configuration';
import { ControlService } from '../control/control.service';
import { smtpConfigured } from './signup-mail';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly control: ControlService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwtAccessSecret', { infer: true }),
      passReqToCallback: true,
    });
  }

  async validate(req: { originalUrl?: string; url?: string }, payload: AccessTokenPayload) {
    const cs = await this.control.state();
    if (cs.validAfter && (payload.iat ?? 0) * 1000 < cs.validAfter) throw new UnauthorizedException('Session revoked');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, status: true, deletedAt: true, emailVerified: true },
    });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
      throw new UnauthorizedException('Account is not active');
    }
    // Unverified accounts must confirm their email with a code once (only enforced while email sending works).
    if (!user.emailVerified && smtpConfigured() && process.env.EMAIL_GATE === 'on') {
      const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
      if (!path.startsWith('/api/v1/auth/email-code/') && path !== '/api/v1/auth/logout' && path !== '/api/v1/auth/logout-all') {
        throw new ForbiddenException('EMAIL_NOT_VERIFIED');
      }
    }
    return { id: user.id, email: user.email };
  }
}
