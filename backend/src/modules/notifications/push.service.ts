import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createSign } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Push delivery through Firebase Cloud Messaging (HTTP v1). Needs FIREBASE_SERVICE_ACCOUNT (the service account JSON) in the environment; without it nothing is sent and the in-app notification list still works. */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private sa: { client_email: string; private_key: string; project_id: string } | null = null;
  private tok: { v: string; exp: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (raw) { const j = JSON.parse(raw); if (j.client_email && j.private_key && j.project_id) this.sa = j; }
      await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS push_tokens (token TEXT PRIMARY KEY, user_id UUID NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS push_tokens_user ON push_tokens (user_id)`);
      this.logger.log(this.sa ? 'FCM enabled' : 'FCM not configured');
    } catch (e) { this.logger.error('push init failed: ' + (e as Error).message); }
  }

  async register(userId: string, token: string) {
    const t = String(token ?? '').slice(0, 400);
    if (t.length < 20) return { ok: false };
    await this.prisma.$executeRaw`INSERT INTO push_tokens (token, user_id) VALUES (${t}, ${userId}::uuid) ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = now()`;
    return { ok: true };
  }

  async unregister(token: string) { await this.prisma.$executeRaw`DELETE FROM push_tokens WHERE token = ${String(token ?? '')}`; return { ok: true }; }

  private async accessToken(): Promise<string> {
    if (this.tok && this.tok.exp > Date.now() + 60000) return this.tok.v;
    const sa = this.sa!; const now = Math.floor(Date.now() / 1000);
    const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = b({ alg: 'RS256', typ: 'JWT' }) + '.' + b({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
    const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig }) });
    const j: any = await r.json();
    if (!j.access_token) throw new Error('token exchange failed');
    this.tok = { v: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return this.tok.v;
  }

  /** Data-only high priority message: the app builds the notification itself (ringing style for calls). Never throws. */
  async send(userId: string, title: string, body: string, data: Record<string, string> = {}) {
    if (!this.sa) return { delivered: false, provider: 'none' };
    try {
      const rows = await this.prisma.$queryRaw<{ token: string }[]>`SELECT token FROM push_tokens WHERE user_id = ${userId}::uuid ORDER BY updated_at DESC LIMIT 5`;
      if (!rows.length) return { delivered: false, provider: 'fcm' };
      const at = await this.accessToken(); let ok = 0;
      for (const r of rows) {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.sa.project_id}/messages:send`, { method: 'POST', headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { token: r.token, android: { priority: 'HIGH', ttl: data.type === 'call' ? '45s' : '3600s' }, data: { ...data, title, body } } }) });
        if (res.ok) ok++;
        else if (res.status === 404 || res.status === 400) { const t: any = await res.json().catch(() => ({})); if (JSON.stringify(t).includes('UNREGISTERED') || JSON.stringify(t).includes('INVALID_ARGUMENT')) await this.unregister(r.token); }
      }
      return { delivered: ok > 0, provider: 'fcm' };
    } catch (e) { this.logger.warn('push failed: ' + (e as Error).message); return { delivered: false, provider: 'fcm' }; }
  }
}
