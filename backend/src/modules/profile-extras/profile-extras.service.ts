import { PrivacyService } from '../privacy/privacy.service';
import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
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

  constructor(private readonly prisma: PrismaService, private readonly privacy: PrivacyService) {}

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
      await this.prisma.$executeRawUnsafe(`ALTER TABLE profile_extras ADD COLUMN IF NOT EXISTS cover_url TEXT`);
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS user_wishlist (
          user_id TEXT NOT NULL, gift_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, gift_id)
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS profile_views (
          viewer_id TEXT NOT NULL, viewed_id TEXT NOT NULL, viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(), views INTEGER NOT NULL DEFAULT 1,
          PRIMARY KEY (viewer_id, viewed_id)
        )`,
      );
      await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS profile_views_viewed_idx ON profile_views (viewed_id, viewed_at DESC)`);
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
      coverUrl: r?.cover_url ?? '',
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
    const { coverUrl: _keepCover, ...curRest } = cur as Record<string, string>;
    const next: Record<string, string> = { ...curRest };
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

  /** Cover/background picture as a small JPEG data URI (the API body limit is about 100 KB). Empty string removes it. */
  async setCover(userId: string, coverUrl: string) {
    this.ensureReady();
    const v = (coverUrl ?? '').trim();
    if (v !== '' && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v) || v.length > 90_000)) {
      throw new BadRequestException('Cover must be a small JPEG (max about 65 KB)');
    }
    await this.prisma.$executeRaw`
      INSERT INTO profile_extras (user_id, cover_url) VALUES (${userId}, ${v === '' ? null : v})
      ON CONFLICT (user_id) DO UPDATE SET cover_url = ${v === '' ? null : v}, updated_at = now()`;
    return { coverUrl: v };
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

  async wishlistOf(viewerId: string, userId: string) {
    await this.assertVisible(viewerId, userId);
    const rows = await this.prisma.$queryRaw<{ gift_id: string }[]>`SELECT gift_id FROM user_wishlist WHERE user_id = ${userId} ORDER BY position`;
    return { giftIds: rows.map((r) => r.gift_id) };
  }

  async setWishlist(userId: string, giftIds: string[]) {
    this.ensureReady();
    const ids = Array.from(new Set(giftIds.filter((g) => typeof g === 'string' && g.length > 0 && g.length <= 40))).slice(0, 3);
    await this.prisma.$executeRaw`DELETE FROM user_wishlist WHERE user_id = ${userId}`;
    for (let i = 0; i < ids.length; i++) {
      await this.prisma.$executeRaw`INSERT INTO user_wishlist (user_id, gift_id, position) VALUES (${userId}, ${ids[i]}, ${i}) ON CONFLICT DO NOTHING`;
    }
    return { giftIds: ids };
  }

  async postsOf(viewerId: string, userId: string, before?: string, limit = 20) {
    if (viewerId !== userId && (await this.privacy.get(userId)).hideMoments) return { results: [], nextCursor: null, hidden: true };
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

  /** VIP-only list of who viewed my profile. Non-VIP users only get the count. */
  async visitors(userId: string) {
    this.ensureReady();
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    const vip = !!sub && sub.plan === 'PREMIUM' && sub.status === 'ACTIVE' && (!sub.expiresAt || sub.expiresAt > new Date());
    const totalRows = await this.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM profile_views WHERE viewed_id = ${userId}`;
    const total = Number(totalRows[0]?.n ?? 0);
    if (!vip) return { vip: false, total, results: [] };
    const rows = await this.prisma.$queryRaw<{ viewer_id: string; viewed_at: Date; views: number }[]>`
      SELECT viewer_id, viewed_at, views FROM profile_views WHERE viewed_id = ${userId} ORDER BY viewed_at DESC LIMIT 50`;
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.viewer_id) }, deletedAt: null },
      select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true, country: true } } },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return {
      vip: true,
      total,
      results: rows.filter((r) => byId.has(r.viewer_id)).map((r) => ({ ...byId.get(r.viewer_id)!, viewedAt: r.viewed_at, views: r.views })),
    };
  }
}
