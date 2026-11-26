import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ageFrom, randomToken, sha256Hex } from '../../common/utils/tokens';
import { AppConfig } from '../../config/configuration';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, Length, Matches } from 'class-validator';
import { createPublicKey, createVerify } from 'crypto';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export class GoogleLoginDto {
  @IsString()
  @Length(20, 4096)
  idToken!: string;

  /** Only needed the first time (new account). ISO date YYYY-MM-DD. */
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]{3,20}$/, {
    message: 'username must be 3-20 chars of lowercase letters, digits or underscore',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  username?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  // ---------- Registration ----------

  async register(dto: RegisterDto, meta: RequestMeta = {}) {
    const dob = new Date(dto.dateOfBirth);
    if (Number.isNaN(dob.getTime())) throw new BadRequestException('Invalid dateOfBirth');
    const minAge = this.config.get('minAge', { infer: true });
    const age = ageFrom(dob);
    if (age < minAge) {
      throw new BadRequestException(`You must be at least ${minAge} years old to register`);
    }
    if (age > 120) throw new BadRequestException('Invalid dateOfBirth');

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
      select: { email: true, username: true },
    });
    if (existing) {
      throw new ConflictException(
        existing.email === dto.email ? 'Email is already registered' : 'Username is taken',
      );
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: dto.email, username: dto.username, passwordHash, dateOfBirth: dob, isMinor: age < 18 },
      });
      await tx.profile.create({ data: { userId: created.id, displayName: dto.displayName } });
      await tx.userSettings.create({ data: { userId: created.id } });
      await tx.subscription.create({ data: { userId: created.id } });
      return created;
    });

    const verification = await this.createEmailVerificationToken(user.id);
    const tokens = await this.issueTokenPair(user, meta);

    return {
      user: this.publicUser(user),
      ...tokens,
      ...(this.devExposeTokens() ? { devVerificationToken: verification } : {}),
    };
  }

  // ---------- Login / session ----------

  async login(dto: LoginDto, meta: RequestMeta = {}) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || user.deletedAt) throw new UnauthorizedException('Invalid credentials');
    if (user.status === 'SUSPENDED') throw new UnauthorizedException('Account is suspended');
    const ok = await argon2.verify(user.passwordHash, dto.password).catch(() => false);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
    const tokens = await this.issueTokenPair(user, meta);
    return { user: this.publicUser(user), ...tokens };
  }

  async issueTokenPair(user: Pick<User, 'id' | 'email'>, meta: RequestMeta, familyId?: string): Promise<TokenPair> {
    const accessTtl = this.config.get('jwtAccessTtlSeconds', { infer: true });
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
      { expiresIn: accessTtl },
    );
    const refreshToken = randomToken(48);
    const refreshDays = this.config.get('refreshTokenTtlDays', { infer: true });
    const refreshTokenExpiresAt = new Date(Date.now() + refreshDays * DAY_MS);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(refreshToken),
        familyId: familyId ?? randomToken(16),
        expiresAt: refreshTokenExpiresAt,
        createdByIp: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return { accessToken, accessTokenExpiresIn: accessTtl, refreshToken, refreshTokenExpiresAt };
  }

  /** Rotating refresh with reuse detection: a revoked token presented again revokes its whole family. */
  async refresh(refreshToken: string, meta: RequestMeta = {}) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(refreshToken) },
      include: { user: true },
    });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.revokedAt) {
      // Reuse of a rotated token: possible theft - kill the whole family.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(`Refresh token reuse detected (family ${stored.familyId}); family revoked`);
      throw new UnauthorizedException('Refresh token reuse detected; all sessions revoked');
    }
    if (stored.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('Refresh token expired');
    if (stored.user.status !== 'ACTIVE' || stored.user.deletedAt) {
      throw new UnauthorizedException('Account is not active');
    }

    const pair = await this.issueTokenPair(stored.user, meta, stored.familyId);
    // Mark the presented token rotated -> pointing at its replacement.
    const replacement = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(pair.refreshToken) },
      select: { id: true },
    });
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: replacement?.id },
    });
    return pair;
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256Hex(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async logoutAll(userId: string) {
    const res = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true, revokedSessions: res.count };
  }

  // ---------- Email verification (dev: token is logged, no SMTP yet) ----------

  async createEmailVerificationToken(userId: string): Promise<string> {
    const token = randomToken(32);
    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + DAY_MS) },
    });
    if (this.devExposeTokens()) {
      this.logger.log(`[dev] Email verification token for user ${userId}: ${token}`);
    }
    return token;
  }

  async verifyEmail(token: string) {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256Hex(token) },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } }),
    ]);
    return { success: true };
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerified && !user.deletedAt) {
      const token = await this.createEmailVerificationToken(user.id);
      if (this.devExposeTokens()) return { success: true, devVerificationToken: token };
    }
    // Always succeed: never reveal whether the email exists.
    return { success: true };
  }

  // ---------- Password reset ----------

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && !user.deletedAt) {
      const token = randomToken(32);
      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });
      if (this.devExposeTokens()) {
        this.logger.log(`[dev] Password reset token for user ${user.id}: ${token}`);
        return { success: true, devResetToken: token };
      }
    }
    return { success: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256Hex(token) },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      // A password change invalidates every session.
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { success: true };
  }


  // ---------- Google sign-in ----------

  private googleCerts: { at: number; keys: Record<string, string> } | null = null;

  private async googleKeys(force = false): Promise<Record<string, string>> {
    if (!force && this.googleCerts && Date.now() - this.googleCerts.at < 60 * 60 * 1000) {
      return this.googleCerts.keys;
    }
    const res = await fetch('https://www.googleapis.com/oauth2/v1/certs');
    if (!res.ok) throw new UnauthorizedException('Could not reach Google');
    const keys = (await res.json()) as Record<string, string>;
    this.googleCerts = { at: Date.now(), keys };
    return keys;
  }

  private b64u(input: string): Buffer {
    return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  }

  /** Verifies signature (RS256, Google certs), issuer, audience, expiry. */
  private async verifyGoogleIdToken(idToken: string): Promise<{ email: string; name?: string; picture?: string }> {
    const clientIds = (process.env.GOOGLE_CLIENT_ID ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    if (clientIds.length === 0) throw new ServiceUnavailableException('Google sign-in is not configured');
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Invalid Google token');
    let header: { alg?: string; kid?: string };
    let payload: Record<string, any>;
    try {
      header = JSON.parse(this.b64u(parts[0]).toString('utf8'));
      payload = JSON.parse(this.b64u(parts[1]).toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
    if (header.alg !== 'RS256' || !header.kid) throw new UnauthorizedException('Invalid Google token');
    let keys = await this.googleKeys();
    if (!keys[header.kid]) keys = await this.googleKeys(true);
    const pem = keys[header.kid];
    if (!pem) throw new UnauthorizedException('Invalid Google token');
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    const ok = verifier.verify(createPublicKey(pem), this.b64u(parts[2]));
    if (!ok) throw new UnauthorizedException('Invalid Google token');
    const issOk = payload.iss === 'https://accounts.google.com' || payload.iss === 'accounts.google.com';
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const audOk = aud.some((a: string) => clientIds.includes(a));
    const expOk = typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
    const emailOk = typeof payload.email === 'string' && (payload.email_verified === true || payload.email_verified === 'true');
    if (!issOk || !audOk || !expOk || !emailOk) throw new UnauthorizedException('Invalid Google token');
    return { email: String(payload.email).toLowerCase(), name: payload.name, picture: payload.picture };
  }

  async googleLogin(dto: GoogleLoginDto, meta: RequestMeta = {}) {
    const g = await this.verifyGoogleIdToken(dto.idToken);
    const existing = await this.prisma.user.findUnique({ where: { email: g.email } });
    if (existing) {
      if (existing.deletedAt) throw new UnauthorizedException('Invalid credentials');
      if (existing.status === 'SUSPENDED') throw new UnauthorizedException('Account is suspended');
      const user = await this.prisma.user.update({
        where: { id: existing.id },
        data: { lastActiveAt: new Date(), emailVerified: true },
      });
      const tokens = await this.issueTokenPair(user, meta);
      return { user: this.publicUser(user), ...tokens };
    }

    if (!dto.dateOfBirth || !dto.username) {
      const base = g.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 14);
      return { needsProfile: true, email: g.email, name: g.name ?? '', suggestedUsername: base.length >= 3 ? base : `${base}___`.slice(0, 3) };
    }
    const dob = new Date(dto.dateOfBirth);
    if (Number.isNaN(dob.getTime())) throw new BadRequestException('Invalid dateOfBirth');
    const minAge = this.config.get('minAge', { infer: true });
    const age = ageFrom(dob);
    if (age < minAge) throw new BadRequestException(`You must be at least ${minAge} years old to register`);
    if (age > 120) throw new BadRequestException('Invalid dateOfBirth');
    const taken = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (taken) throw new ConflictException('Username is taken');

    const passwordHash = await argon2.hash(randomToken(32), { type: argon2.argon2id });
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: g.email, username: dto.username!, passwordHash, dateOfBirth: dob, isMinor: age < 18, emailVerified: true },
      });
      await tx.profile.create({ data: { userId: created.id, displayName: (g.name ?? dto.username!).slice(0, 50) } });
      await tx.userSettings.create({ data: { userId: created.id } });
      await tx.subscription.create({ data: { userId: created.id } });
      return created;
    });
    const tokens = await this.issueTokenPair(user, meta);
    return { user: this.publicUser(user), ...tokens };
  }

  // ---------- helpers ----------

  publicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerified,
      isMinor: user.isMinor,
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  private devExposeTokens(): boolean {
    return this.config.get('devExposeTokens', { infer: true });
  }
}
