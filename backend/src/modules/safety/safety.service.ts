import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateReportDto } from './dto/report.dto';

@Injectable()
export class SafetyService {
  constructor(private readonly prisma: PrismaService) {}

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
    return hit !== null;
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
