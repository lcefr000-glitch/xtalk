import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateReportDto } from './dto/report.dto';

@Injectable()
export class SafetyService implements OnModuleInit {
  private readonly log = new Logger('Safety');
  constructor(private readonly prisma: PrismaService) {}

  /** Additive, idempotent bootstrap (same pattern as the other new modules). */
  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS blocked_countries (
          user_id TEXT NOT NULL,
          country TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, country)
        )`,
      );
    } catch (e) {
      this.log.error(`blocked_countries bootstrap failed: ${(e as Error).message}`);
    }
  }

  async blockedCountries(userId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ country: string }[]>`
      SELECT country FROM blocked_countries WHERE user_id = ${userId} ORDER BY country`;
    return rows.map((r) => r.country);
  }

  /** Replace the whole set of blocked countries (ISO 3166-1 alpha-2). */
  async setBlockedCountries(userId: string, codes: string[]) {
    const clean = Array.from(new Set((codes ?? []).map((c) => String(c).trim().toUpperCase())));
    if (clean.length > 300 || clean.some((c) => !/^[A-Z]{2}$/.test(c))) {
      throw new BadRequestException('Invalid country list');
    }
    await this.prisma.$executeRaw`DELETE FROM blocked_countries WHERE user_id = ${userId}`;
    for (const c of clean) {
      await this.prisma.$executeRaw`INSERT INTO blocked_countries (user_id, country) VALUES (${userId}, ${c}) ON CONFLICT DO NOTHING`;
    }
    return { success: true, countries: clean.sort() };
  }

  /** True when either user has blocked the other's country. */
  async isCountryBlockedEitherWay(a: string, b: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ x: number }[]>`
      SELECT 1 AS x FROM blocked_countries bc
      JOIN "Profile" p ON p.country = bc.country
      WHERE (bc.user_id = ${a} AND p."userId" = ${b}) OR (bc.user_id = ${b} AND p."userId" = ${a})
      LIMIT 1`;
    return rows.length > 0;
  }

  /** Users hidden from the viewer by a country block in either direction (for search/recommendations). */
  async countryBlockedUserIds(viewerId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p."userId" AS id FROM "Profile" p
        WHERE p.country IN (SELECT country FROM blocked_countries WHERE user_id = ${viewerId})
      UNION
      SELECT bc.user_id AS id FROM blocked_countries bc
        WHERE bc.country = (SELECT country FROM "Profile" WHERE "userId" = ${viewerId})`;
    return rows.map((r) => r.id);
  }

  async block(blockerId: string, targetId: string) {
    if (blockerId === targetId) throw new BadRequestException('You cannot block yourself');
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw new NotFoundException('User not found');
    await this.prisma.$transaction([
      this.prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId: targetId } },
        update: {},
        create: { blockerId, blockedId: targetId },
      }),
      // blocking severs follows both ways
      this.prisma.follow.deleteMany({
        where: {
          OR: [
            { followerId: blockerId, followingId: targetId },
            { followerId: targetId, followingId: blockerId },
          ],
        },
      }),
    ]);
    return { success: true, blocked: true };
  }

  async unblock(blockerId: string, targetId: string) {
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId: targetId } });
    return { success: true, blocked: false };
  }

  async blockedUsers(userId: string) {
    const rows = await this.prisma.block.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          select: {
            id: true, username: true,
            profile: { select: { displayName: true, photoUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { results: rows.map((r) => ({ ...r.blocked, blockedAt: r.createdAt })) };
  }

  /** True when a block exists in either direction. */
  async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    const hit = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { id: true },
    });
    if (hit !== null) return true;
    return this.isCountryBlockedEitherWay(a, b);
  }

  async report(reporterId: string, dto: CreateReportDto) {
    return this.prisma.report.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        details: dto.details,
      },
    });
  }
}
