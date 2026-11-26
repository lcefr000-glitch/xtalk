import { Body, Controller, Get, Header, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, Length } from 'class-validator';
import * as argon2 from 'argon2';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { DELETE_HTML, PRIVACY_HTML, TERMS_HTML } from './legal.pages';

class WebDeleteDto {
  @IsEmail() email!: string;
  @IsString() @Length(1, 72) password!: string;
}

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'";

@Public()
@Controller('legal')
export class LegalController {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService) {}

  @Get('privacy') @Header('Content-Type', 'text/html; charset=utf-8') @Header('Content-Security-Policy', CSP)
  privacy() { return PRIVACY_HTML; }

  @Get('terms') @Header('Content-Type', 'text/html; charset=utf-8') @Header('Content-Security-Policy', CSP)
  terms() { return TERMS_HTML; }

  @Get('delete-account') @Header('Content-Type', 'text/html; charset=utf-8') @Header('Content-Security-Policy', CSP)
  deletePage() { return DELETE_HTML; }

  /** Web account deletion: proves ownership with the account password. */
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(200)
  @Post('delete-account')
  async deleteAccount(@Body() dto: WebDeleteDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    const ok = !!user && !user.deletedAt && (await argon2.verify(user.passwordHash, dto.password).catch(() => false));
    if (!ok || !user) throw new UnauthorizedException('Invalid email or password');
    return this.users.deleteMe(user.id);
  }
}
