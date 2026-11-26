import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ControlService } from '../control/control.service';

/** Optional allow-list: ADMIN_ALLOWED_IPS=1.2.3.4,5.6.7.8 limits the admin API and panel login to those client IPs. Unset = no IP limit. */
export function adminIpAllowed(ip: string | undefined): boolean {
  const list = (process.env.ADMIN_ALLOWED_IPS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (list.length === 0) return true;
  const clean = (ip ?? '').replace(/^::ffff:/, '');
  return list.includes(clean);
}

/** Admin-only guard: expects a JWT issued by /admin/login (claim admin=true). */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly control: ControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (!adminIpAllowed(req.ip)) throw new UnauthorizedException('Not allowed from this network');
    const header = req.headers.authorization as string | undefined;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing admin token');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; admin?: boolean; role?: string; iat?: number }>(token, {
        secret: this.config.get('jwtAccessSecret', { infer: true }),
      });
      if (!payload.admin) throw new Error('not admin');
      const cs = await this.control.state();
      if (cs.validAfter && (payload.iat ?? 0) * 1000 < cs.validAfter) throw new Error('revoked');
      const row = await this.prisma.adminUser.findUnique({ where: { id: payload.sub }, select: { isActive: true, role: true } });
      if (!row || !row.isActive) throw new Error('inactive');
      req.admin = { id: payload.sub, role: row.role };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid admin token');
    }
  }
}
