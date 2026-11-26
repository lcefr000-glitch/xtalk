import { PrivacyService } from '../privacy/privacy.service';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { DiscoveryQueryDto } from './dto/discovery-query.dto';

/** 0-100: language swap fit (50), shared interests (up to 30), recently active (20). */
export function matchScore(viewer: any, u: any): number {
  const vl = viewer.userLanguages ?? [];
  const ul = u.userLanguages ?? [];
  const vNative = vl.filter((l: any) => l.type === 'NATIVE').map((l: any) => l.languageCode);
  const vLearn = vl.filter((l: any) => l.type === 'LEARNING').map((l: any) => l.languageCode);
  const theyTeach = ul.some((l: any) => l.type === 'NATIVE' && vLearn.includes(l.languageCode));
  const theyLearn = ul.some((l: any) => l.type === 'LEARNING' && vNative.includes(l.languageCode));
  let score = (theyTeach ? 25 : 0) + (theyLearn ? 25 : 0);
  const mine: string[] = viewer.profile?.interests ?? viewer.interests ?? [];
  const theirs: string[] = u.profile?.interests ?? [];
  const shared = theirs.filter((i) => mine.includes(i)).length;
  score += Math.min(30, shared * 10);
  if (u.lastActiveAt && Date.now() - new Date(u.lastActiveAt).getTime() < 24 * 3600_000) score += 20;
  return Math.min(100, score);
}

@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService, private readonly safety: SafetyService, private readonly privacy: PrivacyService) {}

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
      select: { isMinor: true, profile: { select: { interests: true } }, userLanguages: true },
    });
    const hidden = [...(await this.safety.countryBlockedUserIds(viewerId)), ...(await this.privacy.idsWhere('discoverable', false))];
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.UserWhereInput = {
      id: { not: viewerId, notIn: hidden },
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

    const byMatch = query.sort === 'match';
    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: this.partnerSelect(),
        orderBy: { lastActiveAt: 'desc' },
        skip: byMatch ? 0 : (page - 1) * limit,
        take: byMatch ? 200 : limit,
      }),
    ]);
    let results = users.map((u) => ({ ...this.toPartner(u), matchScore: matchScore(viewer, u) }));
    if (byMatch) {
      results.sort((a, b) => b.matchScore - a.matchScore);
      results = results.slice((page - 1) * limit, page * limit);
    }
    return { page, limit, total, results };
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

    const hidden = [...(await this.safety.countryBlockedUserIds(viewerId)), ...(await this.privacy.idsWhere('discoverable', false))];
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: viewerId, notIn: hidden },
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
    const results = users.map((u) => ({ ...this.toPartner(u), matchScore: matchScore(viewer as any, u) }));
    results.sort((a, b) => b.matchScore - a.matchScore);
    return { results };
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
