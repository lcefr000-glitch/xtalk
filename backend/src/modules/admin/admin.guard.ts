import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../../config/configuration';

/** Admin-only guard: expects a JWT issued by /admin/login (claim admin=true). */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header = req.headers.authorization as string | undefined;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing admin token');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; admin?: boolean; role?: string }>(token, {
        secret: this.config.get('jwtAccessSecret', { infer: true }),
      });
      if (!payload.admin) throw new Error('not admin');
      req.admin = { id: payload.sub, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid admin token');
    }
  }
}
