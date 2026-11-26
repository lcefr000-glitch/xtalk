import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';

@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService, private readonly safety: SafetyService) {}

  async follow(followerId: string, targetId: string) {
    if (followerId === targetId) throw new BadRequestException('You cannot follow yourself');
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!target || target.status !== 'ACTIVE' || target.deletedAt) {
      throw new NotFoundException('User not found');
    }
    const blocked = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: followerId, blockedId: targetId },
          { blockerId: targetId, blockedId: followerId },
        ],
      },
    });
    if (blocked || (await this.safety.isCountryBlockedEitherWay(followerId, targetId))) throw new ForbiddenException('Cannot follow this user');

    await this.prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId: targetId } },
      update: {},
      create: { followerId, followingId: targetId },
    });
    await this.prisma.notification.create({
      data: { recipientId: targetId, actorId: followerId, type: 'NEW_FOLLOWER' },
    });
    return { success: true, following: true };
  }

  async unfollow(followerId: string, targetId: string) {
    await this.prisma.follow.deleteMany({ where: { followerId, followingId: targetId } });
    return { success: true, following: false };
  }

  async followers(userId: string, page = 1, limit = 20) {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.follow.count({ where: { followingId: userId } }),
      this.prisma.follow.findMany({
        where: { followingId: userId },
        include: {
          follower: {
            select: {
              id: true, username: true,
              profile: { select: { displayName: true, photoUrl: true, country: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { page, limit, total, results: rows.map((r) => r.follower) };
  }

  async following(userId: string, page = 1, limit = 20) {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.follow.count({ where: { followerId: userId } }),
      this.prisma.follow.findMany({
        where: { followerId: userId },
        include: {
          following: {
            select: {
              id: true, username: true,
              profile: { select: { displayName: true, photoUrl: true, country: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { page, limit, total, results: rows.map((r) => r.following) };
  }
}
