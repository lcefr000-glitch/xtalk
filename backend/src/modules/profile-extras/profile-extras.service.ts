import { ForbiddenException, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { levelFor } from '../economy/economy.service';

export interface ExtrasInput {
  hometown?: string;
  occupation?: string;
  school?: string;
  gender?: string;
  mbti?: string;
  bloodType?: string;
  tagline?: string;
}

const FIELDS: { key: keyof ExtrasInput; col: string; max: number }[] = [
  { key: 'hometown', col: 'hometown', max: 80 },
  { key: 'occupation', col: 'occupation', max: 80 },
  { key: 'school', col: 'school', max: 80 },
  { key: 'gender', col: 'gender', max: 20 },
  { key: 'mbti', col: 'mbti', max: 4 },
  { key: 'bloodType', col: 'blood_type', max: 3 },
  { key: 'tagline', col: 'tagline', max: 120 },
];

@Injectable()
export class ProfileExtrasService implements OnModuleInit {
  private readonly log = new Logger('ProfileExtras');
  private ready = false;

  constructor(private readonly prisma: PrismaService) {}

  /** Additive, idempotent bootstrap: CREATE TABLE IF NOT EXISTS only. */
  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS profile_extras (
          user_id TEXT PRIMARY KEY,
          hometown TEXT, occupation TEXT, school TEXT, gender TEXT, mbti TEXT, blood_type TEXT, tagline TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      );
      this.ready = true;
      this.log.log('profile_extras table ready');
    } catch (e) {
      this.log.error('profile_extras bootstrap failed: ' + (e as Error).message);
    }
  }

  private ensureReady() {
    if (!this.ready) throw new ServiceUnavailableException('Profile details are not available right now');
  }

  private shape(r?: Record<string, string | null>) {
    return {
      hometown: r?.hometown ?? '',
      occupation: r?.occupation ?? '',
      school: r?.school ?? '',
      gender: r?.gender ?? '',
      mbti: r?.mbti ?? '',
      bloodType: r?.blood_type ?? '',
      tagline: r?.tagline ?? '',
    };
  }

  async get(userId: string) {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<Record<string, string | null>[]>`SELECT * FROM profile_extras WHERE user_id = ${userId}`;
    return this.shape(rows[0]);
  }

  async save(userId: string, input: ExtrasInput) {
    this.ensureReady();
    const cur = await this.get(userId);
    const next: Record<string, string> = { ...cur };
    for (const f of FIELDS) {
      const v = input[f.key];
      if (typeof v === 'string') next[f.key] = v.trim().slice(0, f.max);
    }
    await this.prisma.$executeRaw`
      INSERT INTO profile_extras (user_id, hometown, occupation, school, gender, mbti, blood_type, tagline)
      VALUES (${userId}, ${next.hometown}, ${next.occupation}, ${next.school}, ${next.gender}, ${next.mbti}, ${next.bloodType}, ${next.tagline})
      ON CONFLICT (user_id) DO UPDATE SET hometown = ${next.hometown}, occupation = ${next.occupation}, school = ${next.school},
        gender = ${next.gender}, mbti = ${next.mbti}, blood_type = ${next.bloodType}, tagline = ${next.tagline}, updated_at = now()`;
    return next;
  }

  private async assertVisible(viewerId: string, userId: string) {
    if (viewerId === userId) return;
    const blocked = await this.prisma.block.findFirst({
      where: { OR: [{ blockerId: viewerId, blockedId: userId }, { blockerId: userId, blockedId: viewerId }] },
    });
    if (blocked) throw new ForbiddenException('Profile unavailable');
    const prof = await this.prisma.profile.findUnique({ where: { userId }, select: { profileIsPublic: true } });
    if (prof && !prof.profileIsPublic) throw new ForbiddenException('This profile is private');
  }

  async getFor(viewerId: string, userId: string) {
    await this.assertVisible(viewerId, userId);
    return this.get(userId);
  }

  async postsOf(viewerId: string, userId: string, before?: string, limit = 20) {
    await this.assertVisible(viewerId, userId);
    const take = Math.min(Math.max(limit, 1), 50);
    const posts = await this.prisma.post.findMany({
      where: { authorId: userId, deletedAt: null, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      include: {
        author: { select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true, country: true } } } },
        images: true,
        _count: { select: { comments: { where: { deletedAt: null } }, likes: true } },
        likes: { where: { userId: viewerId }, select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
    });
    const hasMore = posts.length > take;
    const page = hasMore ? posts.slice(0, take) : posts;
    return {
      results: page.map((p) => ({
        id: p.id, body: p.body, languageCode: p.languageCode, createdAt: p.createdAt, author: p.author, images: p.images,
        commentCount: p._count.comments, likeCount: p._count.likes, likedByMe: p.likes.length > 0,
      })),
      nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
    };
  }

  /** Honor: level plus the gifts this user received (from gift_transactions; empty if the coins tables are missing). */
  async honorOf(viewerId: string, userId: string) {
    await this.assertVisible(viewerId, userId);
    let level = 1;
    let received: { giftId: string; count: number; coins: number }[] = [];
    try {
      const w = await this.prisma.$queryRaw<{ total_spent: number }[]>`SELECT total_spent FROM economy_wallets WHERE user_id = ${userId}`;
      level = levelFor(w[0]?.total_spent ?? 0);
      const rows = await this.prisma.$queryRaw<{ gift_id: string; n: number; coins: number }[]>`
        SELECT gift_id, COUNT(*)::int AS n, COALESCE(SUM(coins),0)::int AS coins FROM gift_transactions
        WHERE receiver_id = ${userId} GROUP BY gift_id ORDER BY n DESC`;
      received = rows.map((r) => ({ giftId: r.gift_id, count: r.n, coins: r.coins }));
    } catch { /* tables not ready */ }
    return {
      level,
      giftsReceived: received,
      totalGifts: received.reduce((a, b) => a + b.count, 0),
      totalCoinsReceived: received.reduce((a, b) => a + b.coins, 0),
    };
  }
}
