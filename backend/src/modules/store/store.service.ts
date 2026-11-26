import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Coin packages sold by the owner outside the app (codes). Prices in EGP. */
export const COIN_PACKS = [
  { id: 'c100', coins: 100, priceEgp: 15 },
  { id: 'c500', coins: 500, priceEgp: 65 },
  { id: 'c1200', coins: 1200, priceEgp: 140 },
  { id: 'c3000', coins: 3000, priceEgp: 320 },
  { id: 'c7000', coins: 7000, priceEgp: 700 },
];

export type VipTier = '1m' | '3m' | '1y' | 'life';
/** VIP plans: months (null = lifetime), price in coins (in-app) and in EGP (code sold by the owner). */
export const VIP_PLANS: { tier: VipTier; months: number | null; priceCoins: number; priceEgp: number }[] = [
  { tier: '1m', months: 1, priceCoins: 1500, priceEgp: 100 },
  { tier: '3m', months: 3, priceCoins: 4000, priceEgp: 270 },
  { tier: '1y', months: 12, priceCoins: 14000, priceEgp: 900 },
  { tier: 'life', months: null, priceCoins: 30000, priceEgp: 2000 },
];

const DEFAULT_SETTINGS: Record<string, string> = {
  contact_url: 'https://www.instagram.com/k__ariem',
  contact_label: 'Instagram @k__ariem',
};
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function normalizeCode(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function formatCode(c: string) {
  return c.match(/.{1,4}/g)!.join('-');
}
function makeCode(): string {
  const b = randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

@Injectable()
export class StoreService implements OnModuleInit {
  private readonly log = new Logger('Store');
  private ready = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS store_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS redeem_codes (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          kind TEXT NOT NULL,
          coins INTEGER,
          vip_tier TEXT,
          batch_id TEXT NOT NULL,
          note TEXT,
          expires_at TIMESTAMPTZ,
          created_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          redeemed_by TEXT,
          redeemed_at TIMESTAMPTZ,
          revoked_at TIMESTAMPTZ
        )`,
      );
      await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS redeem_codes_batch_idx ON redeem_codes (batch_id)`);
      await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS redeem_codes_redeemed_idx ON redeem_codes (redeemed_by)`);
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS economy_wallets (
          user_id TEXT PRIMARY KEY, coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
          total_spent INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
      );
      this.ready = true;
      this.log.log('store tables ready');
    } catch (e) {
      this.log.error('store bootstrap failed: ' + (e as Error).message);
    }
  }

  private ensureReady() {
    if (!this.ready) throw new ServiceUnavailableException('Store is not available right now');
  }

  async settings(): Promise<Record<string, string>> {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<{ key: string; value: string }[]>`SELECT key, value FROM store_settings`;
    const out = { ...DEFAULT_SETTINGS };
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  async saveSettings(input: { contactUrl?: string; contactLabel?: string }) {
    this.ensureReady();
    const set = async (key: string, value: string) => {
      await this.prisma.$executeRaw`
        INSERT INTO store_settings (key, value) VALUES (${key}, ${value})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    };
    if (input.contactUrl !== undefined) {
      const u = input.contactUrl.trim();
      if (u && !/^(https?:\/\/|wa\.me\/|tel:|mailto:)/i.test(u)) throw new BadRequestException('Contact link must start with https://, http://, tel: or mailto:');
      await set('contact_url', u.slice(0, 300));
    }
    if (input.contactLabel !== undefined) await set('contact_label', input.contactLabel.trim().slice(0, 80));
    return this.settings();
  }

  async catalog() {
    const s = await this.settings();
    return {
      coinPacks: COIN_PACKS,
      vipPlans: VIP_PLANS.map((p) => ({ tier: p.tier, months: p.months, lifetime: p.months === null, priceCoins: p.priceCoins, priceEgp: p.priceEgp })),
      contactUrl: s.contact_url,
      contactLabel: s.contact_label,
      currency: 'EGP',
    };
  }

  // ---- granting ----
  private async addCoins(userId: string, coins: number) {
    await this.prisma.$executeRaw`
      INSERT INTO economy_wallets (user_id, coins) VALUES (${userId}, ${coins})
      ON CONFLICT (user_id) DO UPDATE SET coins = economy_wallets.coins + ${coins}, updated_at = now()`;
  }

  /** Extends active VIP (or starts it). Lifetime never expires and is never shortened. */
  async grantVip(userId: string, tier: VipTier) {
    const plan = VIP_PLANS.find((p) => p.tier === tier);
    if (!plan) throw new BadRequestException('Unknown VIP plan');
    const cur = await this.prisma.subscription.findUnique({ where: { userId } });
    const curActive = !!cur && cur.plan === 'PREMIUM' && cur.status === 'ACTIVE';
    const curLifetime = curActive && cur!.expiresAt === null;
    let expiresAt: Date | null = null;
    if (plan.months !== null) {
      if (curLifetime) return cur; // already lifetime: keep it
      const base = curActive && cur!.expiresAt && cur!.expiresAt > new Date() ? new Date(cur!.expiresAt) : new Date();
      base.setMonth(base.getMonth() + plan.months);
      expiresAt = base;
    }
    return this.prisma.subscription.upsert({
      where: { userId },
      create: { userId, plan: 'PREMIUM', status: 'ACTIVE', expiresAt },
      update: { plan: 'PREMIUM', status: 'ACTIVE', expiresAt },
    });
  }

  async wallet(userId: string) {
    const rows = await this.prisma.$queryRaw<{ coins: number }[]>`SELECT coins FROM economy_wallets WHERE user_id = ${userId}`;
    return rows[0]?.coins ?? 0;
  }

  // ---- user actions ----
  async redeem(userId: string, rawCode: string) {
    this.ensureReady();
    const code = normalizeCode(rawCode);
    if (code.length !== 12) throw new BadRequestException('Invalid code');
    // single atomic claim: only an unredeemed, unrevoked, unexpired code can be claimed
    const rows = await this.prisma.$queryRaw<{ id: string; kind: string; coins: number | null; vip_tier: string | null }[]>`
      UPDATE redeem_codes SET redeemed_by = ${userId}, redeemed_at = now()
      WHERE code = ${code} AND redeemed_by IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
      RETURNING id, kind, coins, vip_tier`;
    if (rows.length === 0) {
      const ex = await this.prisma.$queryRaw<{ redeemed_by: string | null; revoked_at: Date | null; expires_at: Date | null }[]>`
        SELECT redeemed_by, revoked_at, expires_at FROM redeem_codes WHERE code = ${code}`;
      if (!ex[0]) throw new BadRequestException('Invalid code');
      if (ex[0].redeemed_by) throw new BadRequestException('This code was already used');
      if (ex[0].revoked_at) throw new BadRequestException('This code is no longer valid');
      throw new BadRequestException('This code has expired');
    }
    const c = rows[0];
    try {
      if (c.kind === 'COINS') await this.addCoins(userId, c.coins ?? 0);
      else await this.grantVip(userId, c.vip_tier as VipTier);
    } catch (e) {
      // grant failed: release the code so the user can retry
      await this.prisma.$executeRaw`UPDATE redeem_codes SET redeemed_by = NULL, redeemed_at = NULL WHERE id = ${c.id}`;
      throw e;
    }
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    return {
      kind: c.kind, coins: c.coins, vipTier: c.vip_tier,
      balance: await this.wallet(userId),
      vipExpiresAt: sub?.plan === 'PREMIUM' ? sub.expiresAt : null,
      vipLifetime: !!sub && sub.plan === 'PREMIUM' && sub.expiresAt === null,
    };
  }

  async buyVipWithCoins(userId: string, tier: string) {
    this.ensureReady();
    const plan = VIP_PLANS.find((p) => p.tier === tier);
    if (!plan) throw new BadRequestException('Unknown VIP plan');
    // atomic deduction; does not count toward the level (total_spent) so levels stay about gifts
    const n = await this.prisma.$executeRaw`
      UPDATE economy_wallets SET coins = coins - ${plan.priceCoins}, updated_at = now()
      WHERE user_id = ${userId} AND coins >= ${plan.priceCoins}`;
    if (n === 0) throw new BadRequestException('Not enough coins');
    try {
      await this.grantVip(userId, plan.tier);
    } catch (e) {
      await this.addCoins(userId, plan.priceCoins);
      throw e;
    }
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    return { balance: await this.wallet(userId), vipTier: plan.tier, vipExpiresAt: sub?.expiresAt ?? null, vipLifetime: sub?.expiresAt === null };
  }

  // ---- admin ----
  async createBatch(adminId: string, input: { kind: string; coins?: number; vipTier?: string; count: number; expiresAt?: string; note?: string }) {
    this.ensureReady();
    const count = Math.floor(Number(input.count));
    if (!Number.isFinite(count) || count < 1 || count > 500) throw new BadRequestException('count must be 1 to 500');
    const kind = input.kind === 'VIP' ? 'VIP' : input.kind === 'COINS' ? 'COINS' : null;
    if (!kind) throw new BadRequestException('kind must be COINS or VIP');
    let coins: number | null = null;
    let tier: string | null = null;
    if (kind === 'COINS') {
      coins = Math.floor(Number(input.coins));
      if (!Number.isFinite(coins) || coins < 1 || coins > 1_000_000) throw new BadRequestException('coins must be 1 to 1000000');
    } else {
      tier = input.vipTier ?? '';
      if (!VIP_PLANS.some((p) => p.tier === tier)) throw new BadRequestException('vipTier must be 1m, 3m, 1y or life');
    }
    let exp: Date | null = null;
    if (input.expiresAt) {
      exp = new Date(input.expiresAt);
      if (Number.isNaN(exp.getTime()) || exp <= new Date()) throw new BadRequestException('expiresAt must be a future date');
    }
    const batchId = randomUUID();
    const codes: string[] = [];
    while (codes.length < count) {
      const code = makeCode();
      const n = await this.prisma.$executeRaw`
        INSERT INTO redeem_codes (id, code, kind, coins, vip_tier, batch_id, note, expires_at, created_by)
        VALUES (${randomUUID()}, ${code}, ${kind}, ${coins}, ${tier}, ${batchId}, ${input.note?.slice(0, 200) ?? null}, ${exp}, ${adminId})
        ON CONFLICT (code) DO NOTHING`;
      if (n === 1) codes.push(formatCode(code));
    }
    return { batchId, kind, coins, vipTier: tier, expiresAt: exp, codes };
  }

  async listCodes(q: { batchId?: string; status?: string; page?: number; limit?: number }) {
    this.ensureReady();
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
    const offset = (Math.max(q.page ?? 1, 1) - 1) * limit;
    const batch = q.batchId ?? null;
    const status = q.status ?? null; // unused | redeemed | revoked | expired
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT r.id, r.code, r.kind, r.coins, r.vip_tier, r.batch_id, r.note, r.expires_at, r.created_at, r.redeemed_by, r.redeemed_at, r.revoked_at,
             u.username AS redeemed_username
      FROM redeem_codes r LEFT JOIN "User" u ON u.id = r.redeemed_by
      WHERE (${batch}::text IS NULL OR r.batch_id = ${batch})
        AND (${status}::text IS NULL
          OR (${status} = 'redeemed' AND r.redeemed_by IS NOT NULL)
          OR (${status} = 'revoked' AND r.revoked_at IS NOT NULL)
          OR (${status} = 'expired' AND r.redeemed_by IS NULL AND r.revoked_at IS NULL AND r.expires_at IS NOT NULL AND r.expires_at <= now())
          OR (${status} = 'unused' AND r.redeemed_by IS NULL AND r.revoked_at IS NULL AND (r.expires_at IS NULL OR r.expires_at > now())))
      ORDER BY r.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    return rows.map((r) => ({
      id: r.id, code: formatCode(r.code), kind: r.kind, coins: r.coins, vipTier: r.vip_tier, batchId: r.batch_id, note: r.note,
      expiresAt: r.expires_at, createdAt: r.created_at, redeemedBy: r.redeemed_by, redeemedUsername: r.redeemed_username,
      redeemedAt: r.redeemed_at, revokedAt: r.revoked_at,
    }));
  }

  async revoke(id: string) {
    this.ensureReady();
    const n = await this.prisma.$executeRaw`UPDATE redeem_codes SET revoked_at = now() WHERE id = ${id} AND redeemed_by IS NULL AND revoked_at IS NULL`;
    if (n === 0) throw new NotFoundException('Code not found, already used or already revoked');
    return { id, revoked: true };
  }
}
