import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AdminGuard } from './admin.guard';

function owner(req: any) {
  if (req.admin?.role !== 'SUPER_ADMIN') throw new ForbiddenException('Owner (SUPER_ADMIN) only');
}

/** Endpoints for the private X Admin app. Owner (SUPER_ADMIN) only. Passwords are never readable. */
@Public()
@UseGuards(AdminGuard)
@Controller('admin/x')
export class AdminXController {
  private ready = false;
  constructor(private readonly prisma: PrismaService) {}

  private async ensure() {
    if (this.ready) return;
    await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS admin_deleted_accounts (
      user_id TEXT PRIMARY KEY, email TEXT NOT NULL, username TEXT NOT NULL, password_hash TEXT NOT NULL,
      display_name TEXT, email_verified BOOLEAN NOT NULL DEFAULT false, prev_status TEXT NOT NULL,
      deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_by TEXT, restored_at TIMESTAMPTZ)`);
    this.ready = true;
  }

  private async audit(adminId: string, action: string, notes: string) {
    try { await this.prisma.moderationAction.create({ data: { adminId, action: 'WARN', targetId: adminId, notes: `${action}: ${notes}`.slice(0, 500) } }); } catch { /* best effort */ }
  }

  /** Newest registrations first. Pass before=<ISO createdAt of the last row> to page, or after=<ISO> to poll for new ones. */
  @Get('signups')
  async signups(@Req() req: any, @Query('after') after?: string, @Query('before') before?: string, @Query('limit') limit?: string) {
    owner(req);
    const n = Math.min(Math.max(parseInt(limit ?? '30', 10) || 30, 1), 100);
    const createdAt: any = {};
    if (after && !Number.isNaN(Date.parse(after))) createdAt.gt = new Date(after);
    if (before && !Number.isNaN(Date.parse(before))) createdAt.lt = new Date(before);
    const rows = await this.prisma.user.findMany({
      where: Object.keys(createdAt).length ? { createdAt } : {},
      orderBy: { createdAt: 'desc' }, take: n,
      select: { id: true, email: true, username: true, dateOfBirth: true, isMinor: true, emailVerified: true, status: true, createdAt: true, lastActiveAt: true,
        profile: { select: { displayName: true, country: true, interfaceLanguage: true } } },
    });
    const total = await this.prisma.user.count();
    return { total, rows };
  }

  /** Profile photo bytes for the X Admin app (photos are stored as data links or web links). */
  @Get('users/:id/photo')
  async photo(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Res() res: any) {
    owner(req);
    const r = await this.prisma.profile.findUnique({ where: { userId: id }, select: { photoUrl: true } });
    const u = r?.photoUrl;
    if (!u) throw new NotFoundException('No photo');
    const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(u);
    if (m) { res.set({ 'Content-Type': m[1], 'Cache-Control': 'private, max-age=300' }); return res.send(Buffer.from(m[2], 'base64')); }
    if (u.startsWith('https://')) return res.json({ url: u });
    throw new NotFoundException('No photo');
  }

  @Get('users/:id')
  async detail(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    owner(req); await this.ensure();
    const u = await this.prisma.user.findUnique({ where: { id }, select: { id: true, email: true, username: true, dateOfBirth: true, isMinor: true, emailVerified: true, status: true, createdAt: true, lastActiveAt: true, deletedAt: true,
      profile: { select: { displayName: true, bio: true, country: true, interfaceLanguage: true } } } });
    const hasPhoto = (await this.prisma.profile.count({ where: { userId: id, photoUrl: { not: null } } })) > 0;
    if (!u) throw new NotFoundException('User not found');
    const one = async (sql: string) => { try { return (await this.prisma.$queryRawUnsafe<any[]>(sql, id))[0] ?? null; } catch { return null; } };
    const counts = await one(`SELECT
      (SELECT count(*)::int FROM "Post" WHERE "authorId"=$1 AND "deletedAt" IS NULL) AS posts,
      (SELECT count(*)::int FROM "Comment" WHERE "authorId"=$1) AS comments,
      (SELECT count(*)::int FROM "Follow" WHERE "followingId"=$1) AS followers,
      (SELECT count(*)::int FROM "Follow" WHERE "followerId"=$1) AS following,
      (SELECT count(*)::int FROM "Report" WHERE "targetId"=$1) AS reports_against`);
    const wallet = await one(`SELECT coins, total_spent, (SELECT COALESCE(points,0)::float/10 FROM economy_diamonds WHERE user_id=$1) AS diamonds FROM economy_wallets WHERE user_id=$1`);
    const sub = await this.prisma.subscription.findUnique({ where: { userId: id }, select: { plan: true, status: true, expiresAt: true } });
    const snap = await one(`SELECT deleted_at, restored_at, email, username FROM admin_deleted_accounts WHERE user_id=$1`);
    const extra = await one(`SELECT
      (SELECT count(*)::int FROM gift_transactions WHERE sender_id=$1) AS gifts_sent,
      (SELECT count(*)::int FROM gift_transactions WHERE receiver_id=$1) AS gifts_received,
      (SELECT count(*)::int FROM "VoiceRoomParticipant" WHERE "userId"=$1) AS room_joins,
      (SELECT count(*)::int FROM user_cosmetics WHERE user_id=$1) AS cosmetics_owned`);
    return { user: { ...u, hasPhoto }, extra, counts, wallet, vip: sub, adminDeleteSnapshot: snap && !snap.restored_at ? snap : null };
  }

  /** Reversible delete: saves email/username/password hash, frees them, hides posts. Restore brings everything back. */
  @Post('users/:id/delete')
  async softDelete(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    owner(req); await this.ensure();
    const u = await this.prisma.user.findUnique({ where: { id }, include: { profile: true } });
    if (!u) throw new NotFoundException('User not found');
    if (u.status === 'DELETED') throw new BadRequestException('Already deleted');
    const tag = id.replace(/-/g, '').slice(0, 12);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.$executeRaw`INSERT INTO admin_deleted_accounts (user_id, email, username, password_hash, display_name, email_verified, prev_status, deleted_by)
        VALUES (${id}, ${u.email}, ${u.username}, ${u.passwordHash}, ${u.profile?.displayName ?? null}, ${u.emailVerified}, ${u.status}, ${req.admin?.id ?? null})
        ON CONFLICT (user_id) DO UPDATE SET email=EXCLUDED.email, username=EXCLUDED.username, password_hash=EXCLUDED.password_hash, display_name=EXCLUDED.display_name,
          email_verified=EXCLUDED.email_verified, prev_status=EXCLUDED.prev_status, deleted_at=now(), deleted_by=EXCLUDED.deleted_by, restored_at=NULL`,
      this.prisma.user.update({ where: { id }, data: { status: 'DELETED', deletedAt: now, email: `deleted-${tag}@deleted.invalid`, username: `deleted_${tag}`, passwordHash: require('crypto').randomBytes(32).toString('hex') } }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } }),
      this.prisma.$executeRaw`UPDATE "Post" SET "deletedAt" = ${now} WHERE "authorId" = ${id} AND "deletedAt" IS NULL`,
    ]);
    await this.audit(req.admin?.id, 'ADMIN_DELETE', id);
    return { deleted: true, restorable: true };
  }

  /** Restores an account deleted with POST users/:id/delete (not self-deleted ones: those lost their data). */
  @Post('users/:id/restore')
  async restore(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    owner(req); await this.ensure();
    const rows = await this.prisma.$queryRaw<any[]>`SELECT * FROM admin_deleted_accounts WHERE user_id = ${id} AND restored_at IS NULL`;
    if (!rows.length) throw new BadRequestException('No admin-delete snapshot for this user (self-deleted accounts cannot be restored here)');
    const s = rows[0];
    const clash = await this.prisma.user.findFirst({ where: { id: { not: id }, OR: [{ email: s.email }, { username: s.username }] }, select: { id: true } });
    if (clash) throw new BadRequestException('Email or username is now used by another account');
    const delAt: Date = s.deleted_at;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status: s.prev_status === 'DELETED' ? 'ACTIVE' : s.prev_status, deletedAt: null, email: s.email, username: s.username, passwordHash: s.password_hash, emailVerified: s.email_verified } }),
      this.prisma.$executeRaw`UPDATE "Post" SET "deletedAt" = NULL WHERE "authorId" = ${id} AND "deletedAt" >= ${new Date(delAt.getTime() - 1000)} AND "deletedAt" <= ${new Date(delAt.getTime() + 5000)}`,
      this.prisma.$executeRaw`UPDATE admin_deleted_accounts SET restored_at = now() WHERE user_id = ${id}`,
    ]);
    await this.audit(req.admin?.id, 'ADMIN_RESTORE', id);
    return { restored: true };
  }

  /** The old password is never shown. Admin sets a new one (min 10 chars) and tells the owner of the account. */
  @Post('users/:id/reset-password')
  async resetPassword(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: { password?: string }) {
    owner(req);
    const pw = body?.password ?? '';
    if (pw.length < 10 || pw.length > 128) throw new BadRequestException('Password must be 10 to 128 characters');
    const u = await this.prisma.user.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!u || u.status === 'DELETED') throw new NotFoundException('User not found');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash: await argon2.hash(pw) } }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit(req.admin?.id, 'ADMIN_RESET_PASSWORD', id);
    return { ok: true };
  }

  @Get('rooms')
  async rooms(@Req() req: any, @Query('live') live?: string) {
    owner(req);
    return this.prisma.voiceRoom.findMany({
      where: live === 'false' ? {} : { isLive: true }, orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, title: true, isLive: true, createdAt: true, closedAt: true, host: { select: { id: true, username: true } }, _count: { select: { participants: true } } },
    });
  }

  @Post('rooms/:id/close')
  async closeRoom(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    owner(req);
    const r = await this.prisma.voiceRoom.updateMany({ where: { id, isLive: true }, data: { isLive: false, closedAt: new Date() } });
    await this.audit(req.admin?.id, 'ROOM_CLOSE', id);
    return { closed: r.count };
  }

  @Get('posts')
  async posts(@Req() req: any, @Query('search') search?: string) {
    owner(req);
    return this.prisma.post.findMany({
      where: { deletedAt: null, ...(search ? { body: { contains: search, mode: 'insensitive' as const } } : {}) },
      orderBy: { createdAt: 'desc' }, take: 40,
      select: { id: true, body: true, createdAt: true, author: { select: { id: true, username: true } }, _count: { select: { comments: true, likes: true } } },
    });
  }

  @Post('posts/:id/remove')
  async removePost(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    owner(req);
    const r = await this.prisma.post.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
    await this.audit(req.admin?.id, 'POST_REMOVE', id);
    return { removed: r.count };
  }

  /** Manual grant. Coins are added to the wallet (max 1,000,000 per call). */
  @Post('users/:id/grant-coins')
  async grantCoins(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() b: { coins?: number }) {
    owner(req);
    const c = Number(b?.coins);
    if (!Number.isInteger(c) || c < 1 || c > 1_000_000) throw new BadRequestException('coins must be 1 to 1,000,000');
    const u = await this.prisma.user.findUnique({ where: { id }, select: { status: true } });
    if (!u || u.status === 'DELETED') throw new NotFoundException('User not found');
    await this.prisma.$executeRaw`INSERT INTO economy_wallets (user_id, coins) VALUES (${id}, ${c})
      ON CONFLICT (user_id) DO UPDATE SET coins = economy_wallets.coins + ${c}, updated_at = now()`;
    await this.audit(req.admin?.id, 'GRANT_COINS', `${id} +${c}`);
    return { ok: true };
  }

  @Post('users/:id/grant-vip')
  async grantVip(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() b: { tier?: string }) {
    owner(req);
    const months: Record<string, number | null> = { '1m': 1, '3m': 3, '1y': 12, life: null };
    if (!b?.tier || !(b.tier in months)) throw new BadRequestException('tier must be 1m, 3m, 1y or life');
    const u = await this.prisma.user.findUnique({ where: { id }, select: { status: true } });
    if (!u || u.status === 'DELETED') throw new NotFoundException('User not found');
    const m = months[b.tier];
    let exp: Date | null = null;
    if (m !== null) { exp = new Date(); exp.setMonth(exp.getMonth() + m); }
    await this.prisma.subscription.upsert({ where: { userId: id }, create: { userId: id, plan: 'PREMIUM', status: 'ACTIVE', expiresAt: exp }, update: { plan: 'PREMIUM', status: 'ACTIVE', expiresAt: exp } });
    await this.prisma.$executeRaw`INSERT INTO vip_meta (user_id, tier) VALUES (${id}, ${b.tier}) ON CONFLICT (user_id) DO UPDATE SET tier = ${b.tier}, started_at = now(), updated_at = now()`;
    await this.audit(req.admin?.id, 'GRANT_VIP', `${id} ${b.tier}`);
    return { ok: true };
  }
}
