import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface PrivacyDto {
  showCountry: boolean;
  showFollowLists: boolean;
  discoverable: boolean;
  hideMoments: boolean;
  hideVisitors: boolean;
}

const DEFAULTS: PrivacyDto = { showCountry: true, showFollowLists: true, discoverable: true, hideMoments: false, hideVisitors: false };
const COLS: Record<keyof PrivacyDto, string> = {
  showCountry: 'show_country', showFollowLists: 'show_follow_lists', discoverable: 'discoverable', hideMoments: 'hide_moments', hideVisitors: 'hide_visitors',
};

@Injectable()
export class PrivacyService implements OnModuleInit {
  private readonly log = new Logger('Privacy');
  private ready = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS privacy_settings (
          user_id TEXT PRIMARY KEY,
          show_country BOOLEAN NOT NULL DEFAULT true,
          show_follow_lists BOOLEAN NOT NULL DEFAULT true,
          discoverable BOOLEAN NOT NULL DEFAULT true,
          hide_moments BOOLEAN NOT NULL DEFAULT false,
          hide_visitors BOOLEAN NOT NULL DEFAULT false,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      );
      this.ready = true;
    } catch (e) {
      this.log.error('privacy bootstrap failed: ' + (e as Error).message);
    }
  }

  async get(userId: string): Promise<PrivacyDto> {
    if (!this.ready) return { ...DEFAULTS };
    const r = await this.prisma.$queryRawUnsafe<any[]>(`SELECT * FROM privacy_settings WHERE user_id = $1`, userId);
    if (!r.length) return { ...DEFAULTS };
    const x = r[0];
    return { showCountry: x.show_country, showFollowLists: x.show_follow_lists, discoverable: x.discoverable, hideMoments: x.hide_moments, hideVisitors: x.hide_visitors };
  }

  async isVip(userId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    return !!sub && sub.plan === 'PREMIUM' && sub.status === 'ACTIVE' && (sub.expiresAt === null || sub.expiresAt > new Date());
  }

  async update(userId: string, patch: Partial<PrivacyDto>) {
    if (!this.ready) throw new BadRequestException('Not available right now');
    const keys = (Object.keys(COLS) as (keyof PrivacyDto)[]).filter((k) => typeof patch[k] === 'boolean');
    if (patch.hideVisitors === true && !(await this.isVip(userId))) throw new ForbiddenException('Hiding your visits is a VIP feature');
    if (keys.length) {
      const cols = keys.map((k) => COLS[k]);
      const vals = keys.map((k) => patch[k] as boolean);
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO privacy_settings (user_id, ${cols.join(', ')}) VALUES ($1, ${vals.map((_, i) => '$' + (i + 2)).join(', ')})
         ON CONFLICT (user_id) DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, updated_at = now()`,
        userId, ...vals,
      );
    }
    return this.get(userId);
  }

  /** Users whose flag has the given (non-default) value. */
  async idsWhere(col: 'discoverable' | 'hide_moments' | 'show_follow_lists' | 'show_country', value: boolean): Promise<string[]> {
    if (!this.ready) return [];
    const r = await this.prisma.$queryRawUnsafe<{ user_id: string }[]>(`SELECT user_id FROM privacy_settings WHERE ${col} = $1`, value);
    return r.map((x) => x.user_id);
  }

  async idsAmong(col: 'show_country', value: boolean, ids: string[]): Promise<Set<string>> {
    if (!this.ready || !ids.length) return new Set();
    const r = await this.prisma.$queryRawUnsafe<{ user_id: string }[]>(`SELECT user_id FROM privacy_settings WHERE ${col} = $1 AND user_id = ANY($2::text[])`, value, ids);
    return new Set(r.map((x) => x.user_id));
  }

  /** A visit is recorded unless a VIP viewer chose to hide theirs. */
  async shouldRecordView(viewerId: string): Promise<boolean> {
    const p = await this.get(viewerId);
    if (!p.hideVisitors) return true;
    return !(await this.isVip(viewerId));
  }
}
