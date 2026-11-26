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
      { expiresIn: '8h' },
    );
    return { accessToken: token, role: admin.role, expiresIn: 8 * 3600 };
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

  auditLog(page = 1, limit = 30) {
    return this.prisma.moderationAction.findMany({
      include: { admin: { select: { id: true, email: true, role: true } }, report: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: Math.min(limit, 50),
    });
  }
}
