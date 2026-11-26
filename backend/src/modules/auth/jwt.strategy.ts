import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppConfig } from '../../config/configuration';
import { ControlService } from '../control/control.service';

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
    });
  }

  async validate(payload: AccessTokenPayload) {
    const cs = await this.control.state();
    if (cs.validAfter && (payload.iat ?? 0) * 1000 < cs.validAfter) throw new UnauthorizedException('Session revoked');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, status: true, deletedAt: true },
    });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
      throw new UnauthorizedException('Account is not active');
    }
    return { id: user.id, email: user.email };
  }
}
