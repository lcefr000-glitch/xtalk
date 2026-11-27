import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface ControlState {
  lockdown: boolean;
  message: string;
  minVersionCode: number;
  /** Where users can download the latest app (shown as a button on the update screen). */
  updateUrl: string;
  /** Access tokens issued before this time (ms since epoch) are rejected. */
  validAfter: number;
}

/** Owner kill switch state. Small key/value table, cached for a few seconds. Fails open if the DB is unreachable. */
@Injectable()
export class ControlService implements OnModuleInit {
  private readonly log = new Logger('Control');
  private cache: ControlState = { lockdown: false, message: '', minVersionCode: 0, updateUrl: '', validAfter: 0 };
  private cacheAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS app_control (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    } catch (e) {
      this.log.error('control table failed: ' + (e as Error).message);
    }
  }

  async state(): Promise<ControlState> {
    if (Date.now() - this.cacheAt < 3000) return this.cache;
    try {
      const rows = await this.prisma.$queryRawUnsafe<{ key: string; value: string }[]>(`SELECT key, value FROM app_control`);
      const m = new Map(rows.map((r) => [r.key, r.value]));
      this.cache = {
        lockdown: m.get('lockdown') === 'on',
        message: m.get('message') ?? '',
        minVersionCode: parseInt(m.get('min_version_code') ?? '0', 10) || 0,
        updateUrl: m.get('update_url') ?? '',
        validAfter: parseInt(m.get('valid_after') ?? '0', 10) || 0,
      };
      this.cacheAt = Date.now();
    } catch {
      this.cacheAt = Date.now() - 2000; // retry soon, keep the last known state
    }
    return this.cache;
  }

  private async put(key: string, value: string) {
    await this.prisma.$executeRaw`INSERT INTO app_control (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    this.cacheAt = 0;
  }

  async setLockdown(on: boolean, message?: string) {
    await this.put('lockdown', on ? 'on' : 'off');
    if (message !== undefined) await this.put('message', message.slice(0, 300));
    return this.state();
  }

  async setMinVersion(code: number) {
    await this.put('min_version_code', String(Math.max(0, Math.floor(code))));
    return this.state();
  }

  async setUpdateUrl(url: string) {
    const u = (url ?? '').trim();
    if (u && (!/^https:\/\/[^\s]+$/.test(u) || u.length > 500)) throw new Error('Update link must start with https://');
    await this.put('update_url', u);
    return this.state();
  }

  /** Reject every access token issued so far and revoke all refresh tokens. Everyone must sign in again. */
  async revokeAll() {
    await this.put('valid_after', String(Date.now()));
    const r = await this.prisma.refreshToken.updateMany({ where: { revokedAt: null }, data: { revokedAt: new Date() } });
    return { revokedRefreshTokens: r.count };
  }
}
