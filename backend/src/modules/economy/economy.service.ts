import { BadRequestException, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface GiftDef { id: string; name: string; emoji: string; price: number }

/** Gift catalog. Prices are in (test) coins. */
export const GIFTS: GiftDef[] = [
  { id: 'rose', name: 'Rose', emoji: '🌹', price: 10 },
  { id: 'coffee', name: 'Coffee', emoji: '☕', price: 30 },
  { id: 'heart', name: 'Heart', emoji: '💖', price: 50 },
  { id: 'cake', name: 'Cake', emoji: '🎂', price: 100 },
  { id: 'teddy', name: 'Teddy bear', emoji: '🧸', price: 200 },
  { id: 'crown', name: 'Crown', emoji: '👑', price: 500 },
  { id: 'rocket', name: 'Rocket', emoji: '🚀', price: 1000 },
  { id: 'diamond', name: 'Diamond', emoji: '💎', price: 2000 },
  { id: 'lion', name: 'Golden lion', emoji: '🦁', price: 5000 },
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

  constructor(private readonly prisma: PrismaService) {}

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
    if ((process.env.DEV_BILLING ?? 'on') === 'off') throw new BadRequestException('Test coins are disabled');
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

  async roomGifts(roomId: string, sinceIso?: string) {
    this.ensureReady();
    const since = sinceIso && !Number.isNaN(Date.parse(sinceIso)) ? new Date(sinceIso) : new Date(Date.now() - 60_000);
    const rows = await this.prisma.$queryRaw<
      { id: string; sender_id: string; receiver_id: string; gift_id: string; coins: number; created_at: Date; sender_spent: number | null }[]
    >`
      SELECT g.id, g.sender_id, g.receiver_id, g.gift_id, g.coins, g.created_at, w.total_spent AS sender_spent
      FROM gift_transactions g LEFT JOIN economy_wallets w ON w.user_id = g.sender_id
      WHERE g.room_id = ${roomId} AND g.created_at > ${since}
      ORDER BY g.created_at ASC LIMIT 50`;
    return rows.map((r) => ({
      id: r.id, senderId: r.sender_id, receiverId: r.receiver_id, giftId: r.gift_id, coins: r.coins,
      createdAt: r.created_at.toISOString(), senderLevel: levelFor(r.sender_spent ?? 0),
    }));
  }
}
