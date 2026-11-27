import { Injectable, Logger, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ResolveReportDto } from './dto/admin.dto';

@Injectable()
export class AdminService implements OnModuleInit {
  private readonly log = new Logger('Admin');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Idempotent first-admin bootstrap from ADMIN_EMAIL / ADMIN_PASSWORD. The password is never logged. */
  async onModuleInit() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) return;
    try {
      if (process.env.ADMIN_EXCLUSIVE !== 'false') {
        const r = await this.prisma.adminUser.updateMany({ where: { email: { not: email }, isActive: true }, data: { isActive: false } });
        if (r.count) this.log.warn(`ADMIN_EXCLUSIVE: deactivated ${r.count} other admin account(s)`);
      }
      const existing = await this.prisma.adminUser.findUnique({ where: { email } });
      if (!existing) {
        await this.prisma.adminUser.create({ data: { email, passwordHash: await argon2.hash(password), role: 'SUPER_ADMIN', isActive: true } });
        this.log.log('admin account created from ADMIN_EMAIL');
      } else {
        const same = await argon2.verify(existing.passwordHash, password).catch(() => false);
        if (!same || !existing.isActive || existing.role !== 'SUPER_ADMIN') {
          await this.prisma.adminUser.update({
            where: { email },
            data: { passwordHash: same ? existing.passwordHash : await argon2.hash(password), isActive: true, role: 'SUPER_ADMIN' },
          });
          this.log.log('admin account updated from ADMIN_EMAIL');
        }
      }
    } catch (e) {
      this.log.error('admin bootstrap failed: ' + (e as Error).message);
    }
  }

  async login(email: string, password: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin || !admin.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await argon2.verify(admin.passwordHash, password).catch(() => false);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const token = await this.jwt.signAsync(
      { sub: admin.id, admin: true, role: admin.role },
      { expiresIn: '2h' },
    );
    return { accessToken: token, role: admin.role, expiresIn: 2 * 3600 };
  }

  async stats() {
    const [users, activeToday, posts, messages, openReports, roomsLive] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { lastActiveAt: { gte: new Date(Date.now() - 86_400_000) } } }),
      this.prisma.post.count({ where: { deletedAt: null } }),
      this.prisma.message.count({ where: { deletedAt: null } }),
      this.prisma.report.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
      this.prisma.voiceRoom.count({ where: { isLive: true } }),
    ]);
    return { users, activeToday, posts, messages, openReports, roomsLive };
  }

  async searchUsers(search?: string, page = 1, limit = 20) {
    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { username: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: {
          id: true, email: true, username: true, status: true, isMinor: true,
          emailVerified: true, createdAt: true, lastActiveAt: true,
          profile: { select: { displayName: true, country: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: Math.min(limit, 50),
      }),
    ]);
    return { page, limit, total, results: users };
  }

  async setUserStatus(adminId: string, userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'RESTRICTED', notes?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { status } }),
      // suspending kills live sessions immediately
      ...(status !== 'ACTIVE'
        ? [this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })]
        : []),
      this.prisma.moderationAction.create({
        data: {
          adminId,
          action: status === 'SUSPENDED' ? 'SUSPEND' : status === 'ACTIVE' ? 'UNSUSPEND' : 'RESTRICT',
          targetType: 'USER',
          targetId: userId,
          notes,
        },
      }),
    ]);
    return { success: true, status };
  }

  async reports(status?: string, page = 1, limit = 20) {
    const where = status ? { status: status as any } : {};
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        include: {
          reporter: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: Math.min(limit, 50),
      }),
    ]);
    return { page, limit, total, results: rows };
  }

  async resolveReport(adminId: string, reportId: string, dto: ResolveReportDto) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: reportId },
        data: {
          status: dto.action === 'DISMISS_REPORT' ? 'DISMISSED' : 'RESOLVED',
          resolvedAt: new Date(),
          resolvedById: adminId,
        },
      });
      await tx.moderationAction.create({
        data: {
          adminId, reportId,
          action: dto.action,
          targetType: report.targetType,
          targetId: report.targetId,
          notes: dto.notes,
        },
      });
      // Apply the action to the target where applicable.
      if (dto.action === 'SUSPEND' && report.targetType === 'USER') {
        await tx.user.update({ where: { id: report.targetId }, data: { status: 'SUSPENDED' } });
        await tx.refreshToken.updateMany({ where: { userId: report.targetId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      if (dto.action === 'RESTRICT' && report.targetType === 'USER') {
        await tx.user.update({ where: { id: report.targetId }, data: { status: 'RESTRICTED' } });
      }
      if (dto.action === 'REMOVE_CONTENT') {
        if (report.targetType === 'POST') {
          await tx.post.updateMany({ where: { id: report.targetId }, data: { deletedAt: new Date() } });
        } else if (report.targetType === 'COMMENT') {
          await tx.comment.updateMany({ where: { id: report.targetId }, data: { deletedAt: new Date() } });
        } else if (report.targetType === 'MESSAGE') {
          await tx.message.updateMany({ where: { id: report.targetId }, data: { deletedAt: new Date() } });
        } else if (report.targetType === 'VOICE_ROOM') {
          await tx.voiceRoom.updateMany({ where: { id: report.targetId }, data: { isLive: false, closedAt: new Date() } });
        }
      }
    });
    return { success: true };
  }

  /** READ-ONLY: what could be restored for a deleted account. Changes nothing. */
  async restorePreview(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true, deletedAt: true, createdAt: true, dateOfBirth: true } });
    if (!u) throw new NotFoundException('User not found');
    const q = async (sql: string) => { try { return await this.prisma.$queryRawUnsafe<any[]>(sql, userId); } catch (e) { return [{ error: (e as Error).message.slice(0, 120) }]; } };
    const codes = await q(`SELECT kind, coins, vip_tier, redeemed_at FROM redeem_codes WHERE redeemed_by = $1 ORDER BY redeemed_at`);
    const sent = await q(`SELECT count(*)::int AS n, COALESCE(sum(coins),0)::int AS coins FROM gift_transactions WHERE sender_id = $1`);
    const recv = await q(`SELECT count(*)::int AS n, COALESCE(sum(coins),0)::int AS coins FROM gift_transactions WHERE receiver_id = $1`);
    const wallet = await q(`SELECT coins, total_spent FROM economy_wallets WHERE user_id = $1`);
    const vip = await q(`SELECT tier, started_at FROM vip_meta WHERE user_id = $1`);
    const sub = await q(`SELECT 1 AS has FROM "Subscription" WHERE "userId" = $1`);
    const granted = codes.filter((c: any) => c.kind === 'COINS').reduce((a: number, c: any) => a + (c.coins ?? 0), 0);
    const spent = sent[0]?.coins ?? 0;
    return {
      user: u, wallet, vip, subscriptionRow: sub.length > 0,
      redeemedCodes: codes, coinsGrantedByCodes: granted,
      giftsSent: sent[0], giftsReceived: recv[0],
      estimate: { coinsLeft: granted - spent, totalSpent: spent },
      note: 'coinsLeft = coin codes redeemed minus gifts sent. Test grants or other credits are not visible and would make the real balance higher.',
    };
  }

  auditLog(page = 1, limit = 30) {
    return this.prisma.moderationAction.findMany({
      include: { admin: { select: { id: true, email: true, role: true } }, report: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: Math.min(limit, 50),
    });
  }
}
