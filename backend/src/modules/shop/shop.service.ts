import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SHOP_ITEMS, ShopKind } from './shop.catalog';

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
      await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS user_cosmetics_eq_idx ON user_cosmetics (user_id) WHERE equipped`);
      this.ready = true;
    } catch { this.ready = false; }
  }

  private async ensure() { if (!this.ready) await this.onModuleInit(); if (!this.ready) throw new BadRequestException('Shop is not ready yet'); }

  async catalog(userId: string) {
    await this.ensure();
    const rows = await this.prisma.$queryRaw<{ item_id: string; equipped: boolean }[]>`SELECT item_id, equipped FROM user_cosmetics WHERE user_id = ${userId}`;
    const owned = new Map(rows.map((r) => [r.item_id, r.equipped]));
    const w = await this.prisma.$queryRaw<{ coins: number }[]>`SELECT coins FROM economy_wallets WHERE user_id = ${userId}`;
    return { coins: w[0]?.coins ?? 0, items: SHOP_ITEMS.map((i) => ({ ...i, owned: owned.has(i.id), equipped: owned.get(i.id) === true })) };
  }

  /** Coins are deducted and the item is granted in one transaction. Buying twice is refused, not charged. */
  async buy(userId: string, itemId: string) {
    await this.ensure();
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) throw new BadRequestException('Unknown item');
    await this.prisma.$transaction(async (tx) => {
      const has = await tx.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM user_cosmetics WHERE user_id = ${userId} AND item_id = ${itemId}`;
      if (has.length) throw new BadRequestException('You already own this item');
      const upd = await tx.$executeRaw`UPDATE economy_wallets SET coins = coins - ${item.price}, updated_at = now() WHERE user_id = ${userId} AND coins >= ${item.price}`;
      if (upd === 0) throw new BadRequestException('Not enough coins');
      await tx.$executeRaw`INSERT INTO user_cosmetics (user_id, item_id, kind, coins) VALUES (${userId}, ${itemId}, ${item.kind}, ${item.price})`;
    });
    return this.catalog(userId);
  }

  async equip(userId: string, itemId: string) {
    await this.ensure();
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) throw new BadRequestException('Unknown item');
    await this.prisma.$transaction(async (tx) => {
      const has = await tx.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM user_cosmetics WHERE user_id = ${userId} AND item_id = ${itemId}`;
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

  /** What other people see: the equipped frame/bubble/mic of up to 100 users. */
  async equippedFor(ids: string[]) {
    await this.ensure();
    const list = ids.slice(0, 100);
    if (!list.length) return {};
    const rows = await this.prisma.$queryRaw<{ user_id: string; item_id: string }[]>`SELECT user_id, item_id FROM user_cosmetics WHERE equipped AND user_id IN (${(await import('@prisma/client')).Prisma.join(list)})`;
    const out: Record<string, Record<string, string>> = {};
    for (const r of rows) {
      const it = SHOP_ITEMS.find((i) => i.id === r.item_id);
      if (it) (out[r.user_id] ??= {})[it.kind.toLowerCase()] = it.id;
    }
    return out;
  }
}
