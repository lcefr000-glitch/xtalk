import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';

export interface GiftDef { id: string; name: string; nameAr: string; emoji: string; price: number; fx: string }

/** Gift catalog. Prices are in coins. fx picks the room animation style on the app. */
export const GIFTS: GiftDef[] = [
  { id: 'rose', name: 'Rose', nameAr: 'وردة', emoji: '🌹', price: 10, fx: 'float' },
  { id: 'coffee', name: 'Coffee', nameAr: 'قهوة', emoji: '☕', price: 30, fx: 'rain' },
  { id: 'heart', name: 'Heart', nameAr: 'قلب', emoji: '💖', price: 50, fx: 'pulse' },
  { id: 'cake', name: 'Cake', nameAr: 'كعكة', emoji: '🎂', price: 100, fx: 'bounce' },
  { id: 'teddy', name: 'Teddy bear', nameAr: 'دب تيدي', emoji: '🧸', price: 200, fx: 'bounce' },
  { id: 'crown', name: 'Crown', nameAr: 'تاج', emoji: '👑', price: 500, fx: 'zoom' },
  { id: 'rocket', name: 'Rocket', nameAr: 'صاروخ', emoji: '🚀', price: 1000, fx: 'fly' },
  { id: 'diamond', name: 'Diamond', nameAr: 'ألماسة', emoji: '💎', price: 2000, fx: 'sparkle' },
  { id: 'lion', name: 'Golden lion', nameAr: 'أسد ذهبي', emoji: '🦁', price: 5000, fx: 'shake' },
  { id: 'chichen', name: 'Chichen Itza', nameAr: 'تشيتشن إيتزا', emoji: '🏛️', price: 2999, fx: 'zoom' },
  { id: 'amethyst_wings', name: 'Amethyst Wings', nameAr: 'أجنحة الجمشت', emoji: '🦋', price: 89, fx: 'wave' },
  { id: 'magic_lamp', name: 'Magic Lamp', nameAr: 'مصباح الأمنيات', emoji: '🪔', price: 29, fx: 'sparkle' },
  { id: 'starry_star', name: 'Starry Star', nameAr: 'نجم سنوي', emoji: '🌟', price: 89, fx: 'spiral' },
  { id: 'great_sahara', name: 'Great Sahara', nameAr: 'الصحراء الكبرى', emoji: '🐪', price: 1999, fx: 'wave' },
  { id: 'mecha', name: 'Mecha', nameAr: 'ميكا متحولة', emoji: '🤖', price: 1299, fx: 'shake' },
  { id: 'golden_phoenix', name: 'Golden Phoenix', nameAr: 'العنقاء الذهبية', emoji: '🦅', price: 799, fx: 'fly' },
  { id: 'golden_ship', name: 'Golden Ship', nameAr: 'الفلك الذهبي', emoji: '⛵', price: 299, fx: 'wave' },
  { id: 'gem_ring', name: 'Gem Ring', nameAr: 'خاتم جوهرة', emoji: '💍', price: 29, fx: 'sparkle' },
  { id: 'fire_ship', name: 'Fire Ship', nameAr: 'سفينة نارية', emoji: '🚢', price: 799, fx: 'fly' },
  { id: 'new_year', name: 'New Year 2026', nameAr: 'مرحبا عام 2026', emoji: '🎆', price: 799, fx: 'fireworks' },
  { id: 'underwater_castle', name: 'Underwater Castle', nameAr: 'قصر تحت البحر', emoji: '🏰', price: 9999, fx: 'rain' },
  { id: 'mojito', name: 'Mojito', nameAr: 'موهيتو', emoji: '🍹', price: 199, fx: 'bounce' },
  { id: 'gramophone', name: 'Gramophone', nameAr: 'فونوغراف', emoji: '🎶', price: 59, fx: 'wave' },
  { id: 'alchemy', name: 'Alchemy', nameAr: 'الكيمياء', emoji: '⚗️', price: 99, fx: 'spiral' },
  { id: 'blessed_moon', name: 'Blessed Moon', nameAr: 'القمر المبارك', emoji: '🌙', price: 399, fx: 'pulse' },
  { id: 'autumn', name: 'Autumn', nameAr: 'خريف', emoji: '🍂', price: 699, fx: 'rain' },
  { id: 'pearl_girl', name: 'Girl with a Pearl', nameAr: 'الفتاة ذات القرط', emoji: '🖼️', price: 2999, fx: 'zoom' },
  { id: 'catrina', name: 'Mexican Catrina', nameAr: 'كاترينا المكسيكية', emoji: '💀', price: 999, fx: 'shake' },
  { id: 'sari', name: 'Indian Sari', nameAr: 'الساري الهندي', emoji: '👗', price: 999, fx: 'wave' },
  { id: 'mongol_baton', name: 'Mongolian Baton', nameAr: 'العباءة المنغولية', emoji: '🪈', price: 999, fx: 'spiral' },
  { id: 'thai_dress', name: 'Thai Dress', nameAr: 'الزي التايلاندي', emoji: '🎎', price: 999, fx: 'wave' },
  { id: 'harvest_queen', name: 'Harvest Queen', nameAr: 'ملكة الحصاد', emoji: '👸', price: 5999, fx: 'zoom' },
  { id: 'golden_turkey', name: 'Golden Turkey', nameAr: 'ديك رومي ذهبي', emoji: '🦃', price: 1699, fx: 'fly' },
  { id: 'candy_car', name: 'Dreamy Candy Car', nameAr: 'حلوى حالمة', emoji: '🚗', price: 499, fx: 'fly' },
  { id: 'roast_turkey', name: 'Roast Turkey', nameAr: 'ديك رومي', emoji: '🍗', price: 15, fx: 'bounce' },
  { id: 'thanks_toast', name: 'Thanks Toast', nameAr: 'نخب الشكر', emoji: '🥂', price: 89, fx: 'burst' },
  { id: 'puzzle_box', name: 'Puzzle Box', nameAr: 'صندوق الألغاز', emoji: '🎁', price: 29, fx: 'burst' },
  { id: 'treasure', name: 'Treasure', nameAr: 'الكنز', emoji: '💰', price: 599, fx: 'burst' },
  { id: 'luxury_box', name: 'Luxury Box', nameAr: 'صندوق فاخر', emoji: '🎀', price: 999, fx: 'burst' },
  { id: 'winter_globe', name: 'Winter Globe', nameAr: 'شتاء', emoji: '🔮', price: 499, fx: 'rain' },
  { id: 'cards', name: 'Playing Cards', nameAr: 'ورق اللعب', emoji: '🃏', price: 239, fx: 'spiral' },
  { id: 'bouquet', name: 'Small Bouquet', nameAr: 'باقة زهور صغيرة', emoji: '💐', price: 5, fx: 'float' },
  { id: 'word_magic', name: 'Word Magic', nameAr: 'سحر الكلمات', emoji: '🔤', price: 30, fx: 'sparkle' },
  { id: 'racing_heart', name: 'Racing Heart', nameAr: 'حمل القلب الزائد', emoji: '💓', price: 20, fx: 'pulse' },
  { id: 'frozen_seal', name: 'Frozen Seal', nameAr: 'الختم المتجمد', emoji: '🧊', price: 10, fx: 'shake' },
  { id: 'lightning', name: 'Lightning', nameAr: 'ضربة صاعقة', emoji: '⚡', price: 5, fx: 'burst' },
  { id: 'beer', name: 'Beer', nameAr: 'بيرة', emoji: '🍺', price: 59, fx: 'bounce' },
  { id: 'cheers', name: 'Cheers', nameAr: 'تشيرز', emoji: '🍻', price: 40, fx: 'burst' },
  { id: 'bingsu', name: 'Bingsu', nameAr: 'بينجيانغ قويشو', emoji: '🍧', price: 299, fx: 'rain' },
  { id: 'froyo', name: 'Frozen Yogurt', nameAr: 'زبادي مجمد', emoji: '🍨', price: 79, fx: 'bounce' },
  { id: 'magic_bottle', name: 'Magic Bottle', nameAr: 'زجاج سحر', emoji: '🧪', price: 69, fx: 'spiral' },
  { id: 'jelly_glove', name: 'Jelly Boxing Glove', nameAr: 'أخطبوط جيلي', emoji: '🥊', price: 19, fx: 'shake' },
  { id: 'lucky_seven', name: 'Lucky Seven', nameAr: 'السبعة المحظوظة', emoji: '7️⃣', price: 5, fx: 'zoom' },
  { id: 'balloon', name: 'Balloons', nameAr: 'بالونات', emoji: '🎈', price: 20, fx: 'float' },
  { id: 'fireworks', name: 'Fireworks', nameAr: 'ألعاب نارية', emoji: '🎇', price: 300, fx: 'fireworks' },
  { id: 'unicorn', name: 'Unicorn', nameAr: 'يونيكورن', emoji: '🦄', price: 1500, fx: 'fly' },
  { id: 'dragon', name: 'Dragon', nameAr: 'تنين', emoji: '🐉', price: 3000, fx: 'fly' },
  { id: 'rainbow', name: 'Rainbow', nameAr: 'قوس قزح', emoji: '🌈', price: 250, fx: 'wave' },
  { id: 'trophy', name: 'Trophy', nameAr: 'كأس', emoji: '🏆', price: 700, fx: 'zoom' },
  { id: 'kiss', name: 'Kiss', nameAr: 'قبلة', emoji: '💋', price: 15, fx: 'pulse' },
  { id: 'star_shower', name: 'Star Shower', nameAr: 'زخات النجوم', emoji: '🌠', price: 350, fx: 'rain' },
  { id: 'guitar', name: 'Guitar', nameAr: 'جيتار', emoji: '🎸', price: 120, fx: 'wave' },
  { id: 'galaxy', name: 'Galaxy', nameAr: 'مجرة', emoji: '🌌', price: 4500, fx: 'spiral' },
  { id: 'yacht', name: 'Yacht', nameAr: 'يخت', emoji: '🛥️', price: 6500, fx: 'wave' },
  { id: 'planet', name: 'Planet', nameAr: 'كوكب', emoji: '🪐', price: 2500, fx: 'spiral' },
];

/** Level grows with the total coins spent: level 1 at 0, 2 at 50, 3 at 200, 4 at 450 ... (50 * (n-1)^2). */
export function levelFor(totalSpent: number): number {
  return Math.floor(Math.sqrt(Math.max(0, totalSpent) / 50)) + 1;
}
export function spentForLevel(level: number): number {
  return 50 * (level - 1) * (level - 1);
}

const TEST_GRANT = 500;
const TEST_BALANCE_CAP = 5000;

@Injectable()
export class EconomyService implements OnModuleInit {
  private readonly log = new Logger('Economy');
  private ready = false;

  constructor(private readonly prisma: PrismaService, private readonly safety: SafetyService) {}

  /** Additive, idempotent bootstrap: only CREATE ... IF NOT EXISTS. Never alters or drops anything. */
  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS economy_wallets (
          user_id TEXT PRIMARY KEY,
          coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
          total_spent INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS gift_transactions (
          id TEXT PRIMARY KEY,
          sender_id TEXT NOT NULL,
          receiver_id TEXT NOT NULL,
          room_id TEXT,
          gift_id TEXT NOT NULL,
          coins INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS gift_transactions_room_idx ON gift_transactions (room_id, created_at)`,
      );
      this.ready = true;
      this.log.log('economy tables ready');
    } catch (e) {
      this.log.error('economy bootstrap failed: ' + (e as Error).message);
    }
  }

  private ensureReady() {
    if (!this.ready) throw new ServiceUnavailableException('Coins are not available right now');
  }

  gifts() {
    return GIFTS;
  }

  async me(userId: string) {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<{ coins: number; total_spent: number }[]>`
      SELECT coins, total_spent FROM economy_wallets WHERE user_id = ${userId}`;
    const coins = rows[0]?.coins ?? 0;
    const totalSpent = rows[0]?.total_spent ?? 0;
    const level = levelFor(totalSpent);
    return { coins, totalSpent, level, nextLevelAt: spentForLevel(level + 1), levelStartsAt: spentForLevel(level) };
  }

  async levelOf(userId: string) {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<{ total_spent: number }[]>`
      SELECT total_spent FROM economy_wallets WHERE user_id = ${userId}`;
    return { userId, level: levelFor(rows[0]?.total_spent ?? 0) };
  }

  async levelsOf(ids: string[]) {
    this.ensureReady();
    const clean = Array.from(new Set(ids.filter((x) => typeof x === 'string' && x.length > 0))).slice(0, 100);
    const levels: Record<string, number> = {};
    for (const id of clean) levels[id] = 1;
    if (clean.length) {
      const rows = await this.prisma.$queryRaw<{ user_id: string; total_spent: number }[]>`
        SELECT user_id, total_spent FROM economy_wallets WHERE user_id = ANY(${clean}::text[])`;
      for (const r of rows) levels[r.user_id] = levelFor(r.total_spent ?? 0);
    }
    return { levels };
  }

  /** TEST ONLY: free coins, no payment. Disabled with DEV_BILLING=off. */
  async testGrant(userId: string) {
    this.ensureReady();
    if (process.env.DEV_BILLING !== 'on') throw new BadRequestException('Test coins are disabled');
    const cur = await this.me(userId);
    if (cur.coins >= TEST_BALANCE_CAP) throw new BadRequestException('You already have plenty of test coins');
    await this.prisma.$executeRaw`
      INSERT INTO economy_wallets (user_id, coins) VALUES (${userId}, ${TEST_GRANT})
      ON CONFLICT (user_id) DO UPDATE SET coins = economy_wallets.coins + ${TEST_GRANT}, updated_at = now()`;
    return this.me(userId);
  }

  async sendGift(senderId: string, roomId: string, receiverId: string, giftId: string) {
    this.ensureReady();
    const gift = GIFTS.find((g) => g.id === giftId);
    if (!gift) throw new BadRequestException('Unknown gift');
    if (receiverId === senderId) throw new BadRequestException('You cannot gift yourself');
    const room = await this.prisma.voiceRoom.findUnique({ where: { id: roomId }, select: { id: true, isLive: true } });
    if (!room || !room.isLive) throw new BadRequestException('Room is not live');
    const members = await this.prisma.voiceRoomParticipant.findMany({
      where: { roomId, userId: { in: [senderId, receiverId] }, leftAt: null },
      select: { userId: true },
    });
    if (members.length < 2) throw new BadRequestException('Both people must be in the room');
    // Atomic deduction: fails (0 rows) when the balance is too low.
    const updated = await this.prisma.$executeRaw`
      UPDATE economy_wallets SET coins = coins - ${gift.price}, total_spent = total_spent + ${gift.price}, updated_at = now()
      WHERE user_id = ${senderId} AND coins >= ${gift.price}`;
    if (updated === 0) throw new BadRequestException('Not enough coins');
    const id = (await import('crypto')).randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO gift_transactions (id, sender_id, receiver_id, room_id, gift_id, coins)
      VALUES (${id}, ${senderId}, ${receiverId}, ${roomId}, ${giftId}, ${gift.price})`;
    return { id, gift, wallet: await this.me(senderId) };
  }

  async roomGifts(roomId: string, sinceIso?: string, viewerId?: string) {
    this.ensureReady();
    if (viewerId) {
      const inRoom = await this.prisma.voiceRoomParticipant.findFirst({ where: { roomId, userId: viewerId, leftAt: null }, select: { id: true } });
      if (!inRoom) throw new ForbiddenException('Join the room first');
    }
    const since = sinceIso && !Number.isNaN(Date.parse(sinceIso)) ? new Date(sinceIso) : new Date(Date.now() - 60_000);
    const rows = await this.prisma.$queryRaw<
      { id: string; sender_id: string; receiver_id: string; gift_id: string; coins: number; created_at: Date; sender_spent: number | null }[]
    >`
      SELECT g.id, g.sender_id, g.receiver_id, g.gift_id, g.coins, g.created_at, w.total_spent AS sender_spent
      FROM gift_transactions g LEFT JOIN economy_wallets w ON w.user_id = g.sender_id
      WHERE g.room_id = ${roomId} AND date_trunc('milliseconds', g.created_at) > ${since}
      ORDER BY g.created_at ASC LIMIT 50`;
    return rows.map((r) => ({
      id: r.id, senderId: r.sender_id, receiverId: r.receiver_id, giftId: r.gift_id, coins: r.coins,
      createdAt: r.created_at.toISOString(), senderLevel: levelFor(r.sender_spent ?? 0),
    }));
  }

  /** Public leaderboard. kind=spent (gift coins sent in a rolling window) or level (lifetime spend). */
  async leaderboard(viewerId: string, kind: string, period: string) {
    this.ensureReady();
    const hidden = new Set<string>(await this.safety.countryBlockedUserIds(viewerId).catch(() => []));
    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    });
    for (const b of blocks) hidden.add(b.blockerId === viewerId ? b.blockedId : b.blockerId);
    let raw: { uid: string; amt: number }[];
    let meAmt = 0;
    let ahead = 0;
    if (kind === 'level') {
      raw = await this.prisma.$queryRaw<{ uid: string; amt: number }[]>`
        SELECT user_id AS uid, total_spent AS amt FROM economy_wallets WHERE total_spent > 0 ORDER BY total_spent DESC, user_id LIMIT 150`;
      const m = await this.prisma.$queryRaw<{ amt: number }[]>`SELECT total_spent AS amt FROM economy_wallets WHERE user_id = ${viewerId}`;
      meAmt = m[0]?.amt ?? 0;
      if (meAmt > 0) {
        const c = await this.prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM economy_wallets WHERE total_spent > ${meAmt}`;
        ahead = c[0]?.n ?? 0;
      }
    } else {
      const ms = period === 'hour' ? 3600e3 : period === 'month' ? 30 * 86400e3 : 86400e3;
      const since = new Date(Date.now() - ms);
      raw = await this.prisma.$queryRaw<{ uid: string; amt: number }[]>`
        SELECT sender_id AS uid, SUM(coins)::int AS amt FROM gift_transactions WHERE created_at > ${since}
        GROUP BY sender_id ORDER BY amt DESC, sender_id LIMIT 150`;
      const m = await this.prisma.$queryRaw<{ amt: number | null }[]>`
        SELECT SUM(coins)::int AS amt FROM gift_transactions WHERE sender_id = ${viewerId} AND created_at > ${since}`;
      meAmt = m[0]?.amt ?? 0;
      if (meAmt > 0) {
        const c = await this.prisma.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM (SELECT sender_id FROM gift_transactions WHERE created_at > ${since}
          GROUP BY sender_id HAVING SUM(coins) > ${meAmt}) t`;
        ahead = c[0]?.n ?? 0;
      }
    }
    const cand = raw.filter((r) => !hidden.has(r.uid));
    const ids = cand.map((r) => r.uid);
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids }, status: 'ACTIVE', deletedAt: null },
          select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true, country: true } } },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const subs = ids.length
      ? await this.prisma.subscription.findMany({
          where: { userId: { in: ids }, plan: 'PREMIUM', status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          select: { userId: true, expiresAt: true },
        })
      : [];
    const vip = new Map(subs.map((x) => [x.userId, x.expiresAt === null ? 'LIFETIME' : 'TIMED']));
    const entries = cand
      .filter((r) => byId.has(r.uid))
      .slice(0, 50)
      .map((r, i) => {
        const u = byId.get(r.uid)!;
        return {
          rank: i + 1,
          userId: u.id,
          username: u.username,
          displayName: u.profile?.displayName ?? u.username,
          photoUrl: u.profile?.photoUrl ?? null,
          country: u.profile?.country ?? null,
          vip: vip.get(u.id) ?? null,
          amount: r.amt,
          level: kind === 'level' ? levelFor(r.amt) : undefined,
        };
      });
    return {
      kind: kind === 'level' ? 'level' : 'spent',
      period: kind === 'level' ? null : period === 'hour' || period === 'month' ? period : 'day',
      entries,
      me: { amount: meAmt, level: kind === 'level' ? levelFor(meAmt) : undefined, rank: meAmt > 0 ? ahead + 1 : null },
    };
  }

  /** Top gifters inside one room. period: day | month | total. Viewer must be in the room. */
  async roomLeaderboard(viewerId: string, roomId: string, period: string) {
    this.ensureReady();
    const inRoom = await this.prisma.voiceRoomParticipant.findFirst({ where: { roomId, userId: viewerId, leftAt: null }, select: { id: true } });
    if (!inRoom) throw new ForbiddenException('Join the room first');
    const since = period === 'total' ? new Date(0) : new Date(Date.now() - (period === 'month' ? 30 * 86400e3 : 86400e3));
    const raw = await this.prisma.$queryRaw<{ uid: string; amt: number }[]>`
      SELECT sender_id AS uid, SUM(coins)::int AS amt FROM gift_transactions
      WHERE room_id = ${roomId} AND created_at > ${since}
      GROUP BY sender_id ORDER BY amt DESC, sender_id LIMIT 50`;
    const ids = raw.map((r) => r.uid);
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids }, status: 'ACTIVE', deletedAt: null },
          select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true, country: true } } },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const subs = ids.length
      ? await this.prisma.subscription.findMany({
          where: { userId: { in: ids }, plan: 'PREMIUM', status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          select: { userId: true, expiresAt: true },
        })
      : [];
    const vip = new Map(subs.map((x) => [x.userId, x.expiresAt === null ? 'LIFETIME' : 'TIMED']));
    const lv = await this.levelsOf(ids);
    const entries = raw
      .filter((r) => byId.has(r.uid))
      .map((r, i) => {
        const u = byId.get(r.uid)!;
        return {
          rank: i + 1, userId: u.id, username: u.username,
          displayName: u.profile?.displayName ?? u.username, photoUrl: u.profile?.photoUrl ?? null,
          country: u.profile?.country ?? null, vip: vip.get(u.id) ?? null, amount: r.amt,
          level: lv.levels[u.id] ?? 1,
        };
      });
    return { period: period === 'total' || period === 'month' ? period : 'day', entries };
  }
}
