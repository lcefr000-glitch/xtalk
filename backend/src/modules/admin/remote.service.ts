import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SHOP_ITEMS, ShopItem } from '../shop/shop.catalog';
import { GIFTS } from '../economy/economy.service';

const FX = ['float', 'rain', 'pulse', 'bounce', 'zoom', 'fly', 'sparkle', 'shake', 'wave', 'spiral', 'fireworks'];

const KINDS = ['FRAME', 'BACKGROUND'];
const MIMES = ['image/png', 'image/jpeg', 'image/webp'];

/** Remote content: shop items made from the admin panel (image upload) and key/value config the app reads at launch. */
@Injectable()
export class RemoteService implements OnModuleInit {
  private readonly log = new Logger('Remote');
  private custom = new Set<string>();
  private customGifts = new Set<string>();
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS custom_shop_items (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, name_ar TEXT NOT NULL DEFAULT '', price7 INT NOT NULL, price30 INT NOT NULL, mime TEXT NOT NULL, img BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS app_remote_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
      await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS custom_gifts (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_ar TEXT NOT NULL DEFAULT '', emoji TEXT NOT NULL, price INTEGER NOT NULL, fx TEXT NOT NULL, min_level INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await this.reloadGifts();
      await this.migrateBackgroundIds();
      await this.reload();
    } catch (e) { this.log.error('remote init failed: ' + (e as Error).message); }
  }

  /** The app only draws room backgrounds whose id starts with bg_, so custom backgrounds get that prefix (one-time rename of earlier cx_ ids, including purchases and room themes). */
  private async migrateBackgroundIds() {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM custom_shop_items WHERE kind = 'BACKGROUND' AND id LIKE 'cx\\_%'`);
    for (const r of rows) {
      const nid = 'bg_' + r.id;
      await this.prisma.$executeRaw`UPDATE custom_shop_items SET id = ${nid} WHERE id = ${r.id}`;
      await this.prisma.$executeRaw`UPDATE user_cosmetics SET item_id = ${nid} WHERE item_id = ${r.id}`.catch(() => 0);
      await this.prisma.$executeRaw`UPDATE voice_room_themes SET theme = ${nid} WHERE theme = ${r.id}`.catch(() => 0);
    }
  }

  /** Mirrors the stored custom items into the live shop list so buy, equip and room themes accept them. */
  async reload() {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string; kind: string; name: string; name_ar: string; price7: number; price30: number }[]>(`SELECT id, kind, name, name_ar, price7, price30 FROM custom_shop_items ORDER BY created_at`);
    for (const id of this.custom) { const i = SHOP_ITEMS.findIndex((x) => x.id === id); if (i >= 0) SHOP_ITEMS.splice(i, 1); }
    this.custom = new Set();
    for (const r of rows) {
      const it: ShopItem = { id: r.id, kind: r.kind as ShopItem['kind'], name: r.name, nameAr: r.name_ar, colors: ['#FFFFFF'], style: r.kind === 'BACKGROUND' ? 'scene_' + r.id : 'img_frame', price7: r.price7, price30: r.price30, isNew: true, imageUrl: `/api/v1/app/shop-img/${r.id}` };
      SHOP_ITEMS.unshift(it); this.custom.add(r.id);
    }
  }

  async reloadGifts() {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string; name: string; name_ar: string; emoji: string; price: number; fx: string; min_level: number | null }[]>(`SELECT id, name, name_ar, emoji, price, fx, min_level FROM custom_gifts ORDER BY created_at`);
    for (const id of this.customGifts) { const i = GIFTS.findIndex((x) => x.id === id); if (i >= 0) GIFTS.splice(i, 1); }
    this.customGifts = new Set();
    for (const r of rows) { GIFTS.push({ id: r.id, name: r.name, nameAr: r.name_ar, emoji: r.emoji, price: r.price, fx: r.fx, ...(r.min_level ? { minLevel: r.min_level } : {}) }); this.customGifts.add(r.id); }
  }

  async addGift(d: { name: string; nameAr: string; emoji: string; price: number; fx: string; minLevel?: number }) {
    const name = String(d.name ?? '').trim().slice(0, 40); if (!name) throw new BadRequestException('Name is required');
    const emoji = String(d.emoji ?? '').trim(); if (!emoji || [...emoji].length > 8) throw new BadRequestException('Emoji is required (1 to 8 characters)');
    const price = Math.floor(Number(d.price)); if (!(price > 0) || price > 1_000_000) throw new BadRequestException('Price must be between 1 and 1000000 coins');
    if (!FX.includes(d.fx)) throw new BadRequestException('Style must be one of: ' + FX.join(', '));
    const ml = d.minLevel ? Math.floor(Number(d.minLevel)) : null;
    if (ml !== null && !(ml >= 1 && ml <= 100)) throw new BadRequestException('Level must be 1 to 100');
    const id = 'gx_' + randomBytes(5).toString('hex');
    await this.prisma.$executeRaw`INSERT INTO custom_gifts (id, name, name_ar, emoji, price, fx, min_level) VALUES (${id}, ${name}, ${String(d.nameAr ?? '').trim().slice(0, 40)}, ${emoji}, ${price}, ${d.fx}, ${ml})`;
    await this.reloadGifts();
    return { id };
  }

  async removeGift(id: string) {
    await this.prisma.$executeRaw`DELETE FROM custom_gifts WHERE id = ${id}`;
    await this.reloadGifts();
    return { ok: true };
  }

  listGifts() { return GIFTS.filter((g) => this.customGifts.has(g.id)); }
  giftStyles() { return FX; }

  async addItem(d: { kind: string; name: string; nameAr: string; price7: number; price30: number; mime: string; img: Buffer }) {
    if (!KINDS.includes(d.kind)) throw new BadRequestException('Kind must be FRAME or BACKGROUND');
    if (!MIMES.includes(d.mime)) throw new BadRequestException('Image must be PNG, JPEG or WebP');
    if (!d.img?.length || d.img.length > 2_000_000) throw new BadRequestException('Image must be under 2 MB');
    const name = d.name.trim().slice(0, 40); if (!name) throw new BadRequestException('Name is required');
    if (!(d.price7 > 0) || !(d.price30 > 0)) throw new BadRequestException('Prices must be above 0');
    const id = (d.kind === 'BACKGROUND' ? 'bg_cx_' : 'cx_') + randomBytes(5).toString('hex');
    await this.prisma.$executeRaw`INSERT INTO custom_shop_items (id, kind, name, name_ar, price7, price30, mime, img) VALUES (${id}, ${d.kind}, ${name}, ${d.nameAr.trim().slice(0, 40)}, ${Math.floor(d.price7)}, ${Math.floor(d.price30)}, ${d.mime}, ${d.img})`;
    await this.reload();
    return { id };
  }

  async removeItem(id: string) {
    await this.prisma.$executeRaw`DELETE FROM custom_shop_items WHERE id = ${id}`;
    await this.reload();
    return { ok: true };
  }

  async listItems() { return SHOP_ITEMS.filter((i) => this.custom.has(i.id)).map((i) => ({ id: i.id, kind: i.kind, name: i.name, nameAr: i.nameAr, price7: i.price7, price30: i.price30, imageUrl: i.imageUrl })); }

  async image(id: string) {
    const r = await this.prisma.$queryRaw<{ mime: string; img: Buffer }[]>`SELECT mime, img FROM custom_shop_items WHERE id = ${id}`;
    return r[0] ?? null;
  }

  async config() {
    const rows = await this.prisma.$queryRawUnsafe<{ key: string; value: string }[]>(`SELECT key, value FROM app_remote_config`);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async saveConfig(values: Record<string, string>) {
    for (const [k, v] of Object.entries(values ?? {})) {
      if (!/^[a-z0-9_]{1,40}$/.test(k)) throw new BadRequestException('Bad key: ' + k);
      const val = String(v ?? '').slice(0, 500);
      if (k === 'apk_url' && val && !val.startsWith('https://')) throw new BadRequestException('APK link must start with https://');
      if (k === 'latest_version_code' && val && !/^\d{1,6}$/.test(val)) throw new BadRequestException('Version code must be a number');
      if (val === '') await this.prisma.$executeRaw`DELETE FROM app_remote_config WHERE key = ${k}`;
      else await this.prisma.$executeRaw`INSERT INTO app_remote_config (key, value) VALUES (${k}, ${val}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    }
    return this.config();
  }
}
