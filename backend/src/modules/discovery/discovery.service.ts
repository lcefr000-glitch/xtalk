import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DiscoveryQueryDto } from './dto/discovery-query.dto';

@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Partner search. Safety rails:
   * - minors only see minors, adults only see adults (separated experiences)
   * - blocked relationships are hidden in both directions
   * - suspended/deleted/private profiles are excluded
   * - only country (never precise location) is returned
   */
  async search(viewerId: string, query: DiscoveryQueryDto) {
    const viewer = await this.prisma.user.findUniqueOrThrow({
      where: { id: viewerId },
      select: { isMinor: true },
    });
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.UserWhereInput = {
      id: { not: viewerId },
      status: 'ACTIVE',
      deletedAt: null,
      isMinor: viewer.isMinor,
      profile: {
        is: {
          profileIsPublic: true,
          ...(query.country ? { country: query.country } : {}),
          ...(query.interest ? { interests: { has: query.interest } } : {}),
        },
      },
      blocksMade: { none: { blockedId: viewerId } },
      blocksReceived: { none: { blockerId: viewerId } },
      ...(query.q
        ? {
            OR: [
              { username: { contains: query.q.toLowerCase() } },
              { profile: { is: { displayName: { contains: query.q, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
      ...(query.native
        ? { userLanguages: { some: { languageCode: query.native, type: 'NATIVE', ...(query.proficiency ? { proficiency: query.proficiency as any } : {}) } } }
        : {}),
      ...(query.learning
        ? { userLanguages: { some: { languageCode: query.learning, type: 'LEARNING', ...(query.proficiency ? { proficiency: query.proficiency as any } : {}) } } }
        : {}),
    };

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: this.partnerSelect(),
        orderBy: { lastActiveAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { page, limit, total, results: users.map((u) => this.toPartner(u)) };
  }

  /** Complementary-skill matches: they natively speak what I learn, they learn what I speak. */
  async recommendations(viewerId: string, limit = 20) {
    const viewer = await this.prisma.user.findUniqueOrThrow({
      where: { id: viewerId },
      include: { userLanguages: true },
    });
    const myNative = viewer.userLanguages.find((l) => l.type === 'NATIVE')?.languageCode;
    const myLearning = viewer.userLanguages.filter((l) => l.type === 'LEARNING').map((l) => l.languageCode);
    if (!myNative || myLearning.length === 0) {
      return { results: [], hint: 'Set a native language and at least one learning language to get recommendations' };
    }

    const users = await this.prisma.user.findMany({
      where: {
        id: { not: viewerId },
        status: 'ACTIVE',
        deletedAt: null,
        isMinor: viewer.isMinor,
        profile: { is: { profileIsPublic: true } },
        blocksMade: { none: { blockedId: viewerId } },
        blocksReceived: { none: { blockerId: viewerId } },
        AND: [
          { userLanguages: { some: { languageCode: { in: myLearning }, type: 'NATIVE' } } },
          { userLanguages: { some: { languageCode: myNative, type: 'LEARNING' } } },
        ],
      },
      select: this.partnerSelect(),
      orderBy: { lastActiveAt: 'desc' },
      take: limit,
    });
    return { results: users.map((u) => this.toPartner(u)) };
  }

  private partnerSelect() {
    return {
      id: true,
      username: true,
      lastActiveAt: true,
      profile: {
        select: {
          displayName: true, bio: true, photoUrl: true, country: true,
          interests: true, showOnlineStatus: true, showLastActive: true,
        },
      },
      userLanguages: { include: { language: true } },
    } satisfies Prisma.UserSelect;
  }

  /** Strip presence fields the owner chose to hide. */
  private toPartner(u: any) {
    const profile = u.profile
      ? {
          ...u.profile,
          showOnlineStatus: undefined,
          showLastActive: undefined,
        }
      : null;
    return {
      id: u.id,
      username: u.username,
      lastActiveAt: u.profile?.showLastActive ? u.lastActiveAt : null,
      isOnline: u.profile?.showOnlineStatus
        ? u.lastActiveAt != null && Date.now() - new Date(u.lastActiveAt).getTime() < 5 * 60_000
        : null,
      profile,
      languages: u.userLanguages,
    };
  }
}
