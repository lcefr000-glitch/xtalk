import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SHOP_DAYS, SHOP_ITEMS, ShopItem, ShopKind } from './shop.catalog';

@Injectable()
export class ShopService implements OnModuleInit {
  private ready = false;
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS user_cosmetics (
          user_id TEXT NOT NULL, item_id TEXT NOT NULL, kind TEXT NOT NULL, equipped BOOLEAN NOT NULL DEFAULT false,
          coins INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, item_id)
        )`,
      );
      await this.prisma.$executeRawUnsafe(`ALTER TABLE user_cosmetics ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
      await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS user_cosmetics_eq_idx ON user_cosmetics (user_id) WHERE equipped`);
      this.ready = true;
    } catch { this.ready = false; }
  }

  private async ensure() { if (!this.ready) await this.onModuleInit(); if (!this.ready) throw new BadRequestException('Shop is not ready yet'); }

  private async grantRows(userId: string) {
    return this.prisma.$queryRaw<{ item_id: string; equipped: boolean; expires_at: Date | null }[]>`SELECT item_id, equipped, expires_at FROM user_cosmetics WHERE user_id = ${userId} AND (expires_at IS NULL OR expires_at > now())`;
  }

  /** Every item with the caller's ownership: owned only while not expired (expiresAt null = kept forever). */
  async catalog(userId: string) {
    await this.ensure();
    const rows = await this.grantRows(userId);
    const owned = new Map(rows.map((r) => [r.item_id, r]));
    const w = await this.prisma.$queryRaw<{ coins: number }[]>`SELECT coins FROM economy_wallets WHERE user_id = ${userId}`;
    return {
      coins: w[0]?.coins ?? 0,
      days: SHOP_DAYS,
      items: SHOP_ITEMS.map((i) => {
        const o = owned.get(i.id);
        return { ...i, price: i.price7, owned: !!o, equipped: o?.equipped === true, expiresAt: o?.expires_at ? o.expires_at.toISOString() : null, forever: !!o && !o.expires_at };
      }),
    };
  }

  /** Coins are deducted and the item (or every item in a pack) is granted for 7 or 30 days in one transaction. Buying again extends the time. */
  async buy(userId: string, itemId: string, days = 7) {
    await this.ensure();
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) throw new BadRequestException('Unknown item');
    if (!(SHOP_DAYS as readonly number[]).includes(days)) throw new BadRequestException('Choose 7 or 30 days');
    const price = days === 30 ? item.price30 : item.price7;
    const granted = item.kind === 'PACK' ? (item.includes ?? []).map((id) => SHOP_ITEMS.find((x) => x.id === id)).filter((x): x is ShopItem => !!x) : [item];
    await this.prisma.$transaction(async (tx) => {
      const forever = await tx.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM user_cosmetics WHERE user_id = ${userId} AND item_id = ${itemId} AND expires_at IS NULL`;
      if (forever.length && item.kind !== 'PACK') throw new BadRequestException('You already own this item');
      const upd = await tx.$executeRaw`UPDATE economy_wallets SET coins = coins - ${price}, updated_at = now() WHERE user_id = ${userId} AND coins >= ${price}`;
      if (upd === 0) throw new BadRequestException('Not enough coins');
      for (const g of [...(item.kind === 'PACK' ? [item] : []), ...granted]) {
        // Items kept forever stay forever; others get today (or their current end) plus the chosen days.
        await tx.$executeRaw`INSERT INTO user_cosmetics (user_id, item_id, kind, coins, expires_at)
          VALUES (${userId}, ${g.id}, ${g.kind}, ${g === item ? price : 0}, now() + (${days} * interval '1 day'))
          ON CONFLICT (user_id, item_id) DO UPDATE SET
            expires_at = CASE WHEN user_cosmetics.expires_at IS NULL THEN NULL
              ELSE GREATEST(user_cosmetics.expires_at, now()) + (${days} * interval '1 day') END,
            coins = user_cosmetics.coins + ${g === item ? price : 0}`;
      }
    });
    return this.catalog(userId);
  }

  async equip(userId: string, itemId: string) {
    await this.ensure();
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item || item.kind === 'PACK') throw new BadRequestException('Unknown item');
    await this.prisma.$transaction(async (tx) => {
      const has = await tx.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM user_cosmetics WHERE user_id = ${userId} AND item_id = ${itemId} AND (expires_at IS NULL OR expires_at > now())`;
      if (!has.length) throw new BadRequestException('Buy this item first');
      await tx.$executeRaw`UPDATE user_cosmetics SET equipped = false WHERE user_id = ${userId} AND kind = ${item.kind}`;
      await tx.$executeRaw`UPDATE user_cosmetics SET equipped = true WHERE user_id = ${userId} AND item_id = ${itemId}`;
    });
    return this.catalog(userId);
  }

  async unequip(userId: string, kind: ShopKind) {
    await this.ensure();
    await this.prisma.$executeRaw`UPDATE user_cosmetics SET equipped = false WHERE user_id = ${userId} AND kind = ${kind}`;
    return this.catalog(userId);
  }

  /** True when the user owns this item right now (used for room backgrounds). */
  async ownsActive(userId: string, itemId: string) {
    await this.ensure();
    const r = await this.prisma.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM user_cosmetics WHERE user_id = ${userId} AND item_id = ${itemId} AND (expires_at IS NULL OR expires_at > now())`;
    return r.length > 0;
  }

  /** What other people see: the equipped frame/bubble/mic of up to 100 users. */
  async equippedFor(ids: string[]) {
    await this.ensure();
    const list = ids.slice(0, 100);
    if (!list.length) return {};
    const rows = await this.prisma.$queryRaw<{ user_id: string; item_id: string }[]>`SELECT user_id, item_id FROM user_cosmetics WHERE equipped AND (expires_at IS NULL OR expires_at > now()) AND user_id IN (${(await import('@prisma/client')).Prisma.join(list)})`;
    const out: Record<string, Record<string, string>> = {};
    for (const r of rows) {
      const it = SHOP_ITEMS.find((i) => i.id === r.item_id);
      if (it) (out[r.user_id] ??= {})[it.kind.toLowerCase()] = it.id;
    }
    return out;
  }
}
