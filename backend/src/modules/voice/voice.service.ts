import { PushService } from '../notifications/push.service';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { CreateRoomDto, StartCallDto } from './dto/voice.dto';
import { LiveKitService } from './livekit.service';
import { SHOP_ITEMS } from '../shop/shop.catalog';

/**
 * Voice rooms + 1:1 calls: full state/signaling layer.
 * Live audio runs on LiveKit (WebRTC SFU): POST voice-rooms/:id/token returns a
 * join token whose publish rights follow the participant's role (HOST/SPEAKER can talk).
 */
const MOD_TAG = '\n\u200b#mods:';

/** Moderator ids live in a hidden tail of the room description (no schema change). */
function splitDescription(raw?: string | null): { description: string | null; mods: string[] } {
  if (!raw) return { description: raw ?? null, mods: [] };
  const i = raw.indexOf(MOD_TAG);
  if (i < 0) return { description: raw, mods: [] };
  const mods = raw.slice(i + MOD_TAG.length).split(',').map((x) => x.trim()).filter(Boolean);
  return { description: raw.slice(0, i) || null, mods };
}
function joinDescription(desc: string | null, mods: string[]): string | null {
  const base = desc ?? '';
  if (mods.length === 0) return base || null;
  return `${base}${MOD_TAG}${mods.join(',')}`;
}

export const ROOM_THEMES = ['default', 'sunset', 'ocean', 'forest', 'night', 'rose', 'gold', 'aurora'];

@Injectable()
export class VoiceService implements OnModuleInit {
  private readonly log = new Logger('Voice');
  private themesReady = false;

  /** Additive, idempotent bootstrap: CREATE TABLE IF NOT EXISTS only. */
  async onModuleInit() {
    setTimeout(() => void this.sweepRooms(), 20000);
    setInterval(() => void this.sweepRooms(), 5 * 60 * 1000).unref();
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS voice_room_themes (room_id TEXT PRIMARY KEY, theme TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
      );
      await this.prisma.$executeRawUnsafe(`ALTER TABLE voice_room_themes ADD COLUMN IF NOT EXISTS set_by TEXT`);
      this.themesReady = true;
      this.log.log('voice room themes table ready');
    } catch (e) {
      this.log.error('voice themes bootstrap failed: ' + (e as Error).message);
    }
  }

  async setTheme(hostId: string, roomId: string, theme: string) {
    const isBg = SHOP_ITEMS.some((i) => i.id === theme && i.kind === 'BACKGROUND');
    if (!isBg && !ROOM_THEMES.includes(theme)) throw new BadRequestException('Unknown theme');
    await this.requireHost(hostId, roomId);
    if (!this.themesReady) throw new BadRequestException('Themes are not available right now');
    if (isBg) {
      // Shop backgrounds need an active purchase by the host.
      const own = await this.prisma.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM user_cosmetics WHERE user_id = ${hostId} AND item_id = ${theme} AND (expires_at IS NULL OR expires_at > now())`.catch(() => []);
      if (!own.length) throw new BadRequestException('Buy this background first');
    }
    await this.prisma.$executeRaw`INSERT INTO voice_room_themes (room_id, theme, set_by) VALUES (${roomId}, ${theme}, ${hostId})
      ON CONFLICT (room_id) DO UPDATE SET theme = ${theme}, set_by = ${hostId}, updated_at = now()`;
    return { success: true, theme };
  }

  /** Room level grows with the coins gifted inside the room (same curve as user levels). */
  private async roomLevelOf(roomId: string): Promise<number> {
    try {
      const rows = await this.prisma.$queryRaw<{ s: number }[]>`SELECT COALESCE(SUM(coins),0)::int AS s FROM gift_transactions WHERE room_id = ${roomId}`;
      return Math.floor(Math.sqrt(Math.max(0, rows[0]?.s ?? 0) / 50)) + 1;
    } catch { return 1; }
  }

  private async themeOf(roomId: string): Promise<string> {
    if (!this.themesReady) return 'default';
    try {
      const rows = await this.prisma.$queryRaw<{ theme: string; set_by: string | null }[]>`SELECT theme, set_by FROM voice_room_themes WHERE room_id = ${roomId}`;
      const t = rows[0]?.theme ?? 'default';
      if (t.startsWith('bg_')) {
        // A shop background only shows while the host who set it still owns it.
        const own = rows[0]?.set_by ? await this.prisma.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM user_cosmetics WHERE user_id = ${rows[0].set_by} AND item_id = ${t} AND (expires_at IS NULL OR expires_at > now())` : [];
        return own.length ? t : 'default';
      }
      return t;
    } catch { return 'default'; }
  }
  /** Live queue of listeners asking for the stage (room id -> user ids). In memory on purpose. */
  private readonly stageRequests = new Map<string, Set<string>>();
  /** Mic invitations sent by the host/moderators; nobody is seated until the invitee accepts. */
  private readonly stageInvites = new Map<string, Set<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly safety: SafetyService,
    private readonly livekit: LiveKitService,
    private readonly push: PushService,
  ) {}

  private metaReady = false;
  private async ensureMeta() {
    if (this.metaReady) return;
    try {
      await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS voice_room_meta (room_id TEXT PRIMARY KEY, mode TEXT NOT NULL DEFAULT 'chat', topic TEXT, is_private BOOLEAN NOT NULL DEFAULT false)`);
      this.metaReady = true;
    } catch { /* retry next call */ }
  }
  private async metaMap(ids: string[]): Promise<Map<string, { mode: string; topic: string | null; isPrivate: boolean }>> {
    const m = new Map<string, { mode: string; topic: string | null; isPrivate: boolean }>();
    await this.ensureMeta();
    if (!this.metaReady || ids.length === 0) return m;
    try {
      const rows = await this.prisma.$queryRawUnsafe<{ room_id: string; mode: string; topic: string | null; is_private: boolean }[]>(
        `SELECT room_id, mode, topic, is_private FROM voice_room_meta WHERE room_id = ANY($1::text[])`, ids);
      for (const r of rows) m.set(r.room_id, { mode: r.mode, topic: r.topic, isPrivate: r.is_private });
    } catch { /* ignore */ }
    return m;
  }
  private async canSeePrivate(viewerId: string, hostId: string): Promise<boolean> {
    if (viewerId === hostId) return true;
    const f = await this.prisma.follow.findFirst({ where: { followerId: viewerId, followingId: hostId }, select: { id: true } });
    return !!f;
  }

  async createRoom(hostId: string, dto: CreateRoomDto) {
    await this.assertRoomTime(hostId);
    // One open room per person: creating another takes the host back to the one already open.
    const open = await this.prisma.voiceRoom.findFirst({ where: { hostId, isLive: true }, orderBy: { createdAt: 'desc' }, include: { participants: true } });
    if (open) {
      await this.prisma.voiceRoomParticipant.updateMany({ where: { roomId: open.id, userId: hostId }, data: { leftAt: null, role: 'HOST' } });
      return open;
    }
    const created = await this.createRoomRow(hostId, dto);
    void this.notifyFollowers(hostId, created.id, dto.title).catch(() => undefined);
    await this.ensureMeta();
    if (this.metaReady) {
      try {
        await this.prisma.$executeRawUnsafe(`INSERT INTO voice_room_meta (room_id, mode, topic, is_private) VALUES ($1, $2, $3, $4)`,
          created.id, dto.mode ?? 'chat', dto.topic?.trim() || null, !!dto.isPrivate);
      } catch { /* meta is optional */ }
    }
    return created;
  }

  private async createRoomRow(hostId: string, dto: CreateRoomDto) {
    return this.prisma.voiceRoom.create({
      data: {
        hostId,
        title: dto.title,
        description: dto.description,
        languageCode: dto.languageCode,
        participants: { create: { userId: hostId, role: 'HOST' } },
      },
      include: { participants: true },
    });
  }

  /** In-app notification for each follower who has room notifications on. Never blocks room creation. */
  private async notifyFollowers(hostId: string, roomId: string, title: string) {
    const host = await this.prisma.user.findUnique({ where: { id: hostId }, select: { username: true, profile: { select: { displayName: true } } } });
    const name = host?.profile?.displayName || host?.username || 'Someone';
    const followers = await this.prisma.follow.findMany({ where: { followingId: hostId }, select: { followerId: true }, take: 500 });
    for (const f of followers) {
      const settings = await this.prisma.userSettings.findUnique({ where: { userId: f.followerId }, select: { notifyRoomInvitations: true } });
      if (settings && settings.notifyRoomInvitations === false) continue;
      if (await this.safety.isBlockedEitherWay(hostId, f.followerId)) continue;
      await this.prisma.notification.create({
        data: { recipientId: f.followerId, actorId: hostId, type: 'ROOM_INVITATION', payload: { kind: 'room_started', roomId, title, hostName: name } },
      }).catch(() => undefined);
    }
  }

  /** Rooms opened by people the viewer follows in the last 48 hours (live first). */
  async followingFeed(viewerId: string) {
    const follows = await this.prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true }, take: 1000 });
    const ids = follows.map((f) => f.followingId);
    if (ids.length === 0) return [];
    const rooms = await this.prisma.voiceRoom.findMany({
      where: { hostId: { in: ids }, createdAt: { gt: new Date(Date.now() - 48 * 3600e3) } },
      include: {
        host: { select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true, country: true } } } },
        language: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
    const meta = await this.metaMap(rooms.map((r) => r.id));
    return rooms.map((r) => ({
      id: r.id, title: r.title, isLive: r.isLive, createdAt: r.createdAt, closedAt: r.closedAt,
      language: r.language ? { code: r.language.code, name: r.language.name } : null,
      mode: meta.get(r.id)?.mode ?? 'chat',
      host: { id: r.host.id, username: r.host.username, displayName: r.host.profile?.displayName ?? r.host.username, photoUrl: r.host.profile?.photoUrl ?? null, country: r.host.profile?.country ?? null },
    }));
  }

  async listRooms(liveOnly = true, viewerId?: string) {
    const rooms = await this.prisma.voiceRoom.findMany({
      where: liveOnly ? { isLive: true } : {},
      include: {
        host: { select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true, country: true } } } },
        language: true,
        _count: { select: { participants: { where: { leftAt: null } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const meta = await this.metaMap(rooms.map((r) => r.id));
    const out: any[] = [];
    for (const r of rooms) {
      const mt = meta.get(r.id);
      if (mt?.isPrivate && !(viewerId && (await this.canSeePrivate(viewerId, r.hostId)))) continue;
      out.push({ ...r, description: splitDescription(r.description).description, mode: mt?.mode ?? 'chat', topic: mt?.topic ?? null, isPrivate: mt?.isPrivate ?? false });
    }
    return out;
  }

  /** Room detail for a viewer: a private room is only visible to its host, their followers and people already inside. */
  async getRoomFor(viewerId: string, id: string) {
    const room = await this.getRoom(id);
    if ((room as any).isPrivate && !(await this.canSeePrivate(viewerId, room.hostId)) && !room.participants.some((p) => p.userId === viewerId)) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }

  async getRoom(id: string) {
    const room = await this.prisma.voiceRoom.findUnique({
      where: { id },
      include: {
        host: { select: { id: true, username: true } },
        language: true,
        participants: {
          where: { leftAt: null },
          include: {
            user: { select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true, country: true } } } },
          },
        },
      },
    });
    if (!room) throw new NotFoundException('Room not found');
    const { description, mods } = splitDescription(room.description);
    const mt = (await this.metaMap([id])).get(id);
    return {
      ...room,
      mode: mt?.mode ?? 'chat', topic: mt?.topic ?? null, isPrivate: mt?.isPrivate ?? false,
      description,
      moderatorIds: mods,
      theme: await this.themeOf(id),
      roomLevel: await this.roomLevelOf(id),
      stageRequests: [...(this.stageRequests.get(id) ?? [])],
      stageInvites: [...(this.stageInvites.get(id) ?? [])],
    };
  }


  // ---- daily voice-room time limit (non-VIP: 3 h per Cairo day, VIP unlimited) ----
  static readonly FREE_ROOM_SECONDS = 3 * 3600;
  private usageReady = false;
  private async ensureUsage() {
    if (this.usageReady) return;
    try {
      await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS voice_usage (user_id TEXT NOT NULL, day TEXT NOT NULL, seconds INT NOT NULL DEFAULT 0, last_beat TIMESTAMPTZ, PRIMARY KEY (user_id, day))`);
      this.usageReady = true;
    } catch { /* retried next call */ }
  }
  private async isVipUser(userId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    return !!sub && sub.plan === 'PREMIUM' && sub.status === 'ACTIVE' && (sub.expiresAt === null || sub.expiresAt > new Date());
  }
  private async usedToday(userId: string): Promise<number> {
    await this.ensureUsage();
    const r = await this.prisma.$queryRawUnsafe<{ seconds: number }[]>(
      `SELECT seconds FROM voice_usage WHERE user_id = $1 AND day = ((now() AT TIME ZONE 'Africa/Cairo')::date)::text`, userId);
    return r[0]?.seconds ?? 0;
  }
  async usage(userId: string) {
    const vip = await this.isVipUser(userId);
    const used = vip ? 0 : await this.usedToday(userId);
    const limit = VoiceService.FREE_ROOM_SECONDS;
    return { vip, limited: !vip, usedSeconds: used, limitSeconds: vip ? null : limit, remainingSeconds: vip ? null : Math.max(0, limit - used), resetsAt: 'midnight Africa/Cairo' };
  }
  private limitError() {
    return new ForbiddenException('ROOM_TIME_LIMIT: Your free voice-room time for today (3 hours) is over. Subscribe to VIP for unlimited time.');
  }
  async assertRoomTime(userId: string) {
    if (await this.isVipUser(userId)) return;
    if ((await this.usedToday(userId)) >= VoiceService.FREE_ROOM_SECONDS) throw this.limitError();
  }
  /** Called on every roster refresh by a participant: credits the time since the last beat (max 20 s per beat). */
  async tickRoomTime(userId: string, roomId: string) {
    try {
      const inRoom = await this.prisma.voiceRoomParticipant.findFirst({ where: { roomId, userId, leftAt: null }, select: { id: true } });
      if (!inRoom) return;
      if (await this.isVipUser(userId)) return;
      await this.ensureUsage();
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO voice_usage (user_id, day, seconds, last_beat) VALUES ($1, ((now() AT TIME ZONE 'Africa/Cairo')::date)::text, 0, now())
         ON CONFLICT (user_id, day) DO UPDATE SET
           seconds = voice_usage.seconds + CASE WHEN voice_usage.last_beat IS NULL THEN 0 ELSE LEAST(20, GREATEST(0, EXTRACT(EPOCH FROM (now() - voice_usage.last_beat))::int)) END,
           last_beat = now()`, userId);
    } catch { return; }
    if ((await this.usedToday(userId)) >= VoiceService.FREE_ROOM_SECONDS) {
      await this.leaveRoom(userId, roomId);
      throw this.limitError();
    }
  }

  async joinRoom(userId: string, roomId: string) {
    await this.assertRoomTime(userId);
    const room = await this.getRoom(roomId);
    if (!room.isLive) throw new ForbiddenException('Room is closed');
    if (await this.safety.isBlockedEitherWay(userId, room.hostId)) {
      throw new ForbiddenException('Cannot join this room');
    }
    if ((room as any).isPrivate && !(await this.canSeePrivate(userId, room.hostId))) {
      throw new ForbiddenException('This room is private');
    }
    const existing = await this.prisma.voiceRoomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (existing) {
      return this.prisma.voiceRoomParticipant.update({
        where: { id: existing.id },
        // Coming back always starts as a listener: a seat has to be requested (or offered) again.
        data: { leftAt: null, ...(existing.role === 'HOST' || existing.leftAt === null ? {} : { role: 'LISTENER' }) },
      });
    }
    return this.prisma.voiceRoomParticipant.create({
      data: { roomId, userId, role: 'LISTENER' },
    });
  }

  async getToken(userId: string, roomId: string) {
    await this.assertRoomTime(userId);
    const room = await this.getRoom(roomId);
    if (!room.isLive) throw new ForbiddenException('Room is closed');
    const me = room.participants.find((p) => p.userId === userId);
    if (!me) throw new ForbiddenException('Join the room first');
    const canPublish = (me.role === 'HOST' || me.role === 'SPEAKER') && !me.isMuted;
    const name = me.user.profile?.displayName || me.user.username;
    const t = await this.livekit.createToken({ roomId, userId, name, canPublish });
    return { ...t, userId, role: me.role, isMuted: me.isMuted, canPublish };
  }

  /** A listener asks the host (or a moderator) for the stage. Nobody is seated without approval. */
  async requestStage(userId: string, roomId: string) {
    const room = await this.getRoom(roomId);
    if (!room.isLive) throw new ForbiddenException('Room is closed');
    const me = room.participants.find((p) => p.userId === userId);
    if (!me) throw new ForbiddenException('Join the room first');
    if (me.role !== 'LISTENER') return { success: true, role: me.role };
    const set = this.stageRequests.get(roomId) ?? new Set<string>();
    set.add(userId);
    this.stageRequests.set(roomId, set);
    return { success: true, requested: true };
  }

  async cancelStageRequest(userId: string, roomId: string) {
    this.stageRequests.get(roomId)?.delete(userId);
    this.stageInvites.get(roomId)?.delete(userId);
    return { success: true };
  }

  async rejectStage(actorId: string, roomId: string, userId: string) {
    await this.requireManager(actorId, roomId);
    this.stageRequests.get(roomId)?.delete(userId);
    this.stageInvites.get(roomId)?.delete(userId);
    return { success: true };
  }

  async setModerator(hostId: string, roomId: string, userId: string, on: boolean) {
    const room = await this.requireHost(hostId, roomId);
    if (userId === room.hostId) return { success: true };
    if (!room.participants.some((p) => p.userId === userId)) throw new ForbiddenException('User is not in the room');
    const set = new Set(room.moderatorIds);
    if (on) set.add(userId); else set.delete(userId);
    const raw = splitDescription(room.description).description;
    await this.prisma.voiceRoom.update({ where: { id: roomId }, data: { description: joinDescription(raw, [...set]) } });
    return { success: true, moderatorIds: [...set] };
  }

  /** A speaker steps down to listener. */
  async leaveSeat(userId: string, roomId: string) {
    const room = await this.getRoom(roomId);
    const me = room.participants.find((p) => p.userId === userId);
    if (!me) throw new ForbiddenException('Join the room first');
    if (me.role === 'HOST') throw new ForbiddenException('The host keeps a seat');
    await this.prisma.voiceRoomParticipant.update({ where: { id: (me as any).id }, data: { role: 'LISTENER' } });
    await this.livekit.setCanPublish(roomId, userId, false);
    return { success: true, role: 'LISTENER' };
  }

  async leaveRoom(userId: string, roomId: string) {
    this.stageRequests.get(roomId)?.delete(userId);
    this.stageInvites.get(roomId)?.delete(userId);
    await this.prisma.voiceRoomParticipant.updateMany({
      where: { roomId, userId, leftAt: null },
      data: { leftAt: new Date() },
    });
    await this.closeIfUnattended(roomId).catch(() => undefined);
    return { success: true };
  }

  /** A room with no host and no moderator inside is closed. */
  private async closeIfUnattended(roomId: string) {
    const room = await this.prisma.voiceRoom.findUnique({ where: { id: roomId }, select: { id: true, isLive: true, hostId: true } });
    if (!room || !room.isLive) return;
    const full = await this.getRoom(roomId);
    const active = await this.prisma.voiceRoomParticipant.findMany({ where: { roomId, leftAt: null }, select: { userId: true, role: true } });
    const attended = active.some((p) => p.userId === room.hostId || p.role === 'HOST' || full.moderatorIds.includes(p.userId));
    if (attended) return;
    this.stageRequests.delete(roomId);
    this.stageInvites.delete(roomId);
    await this.prisma.$transaction([
      this.prisma.voiceRoom.update({ where: { id: roomId }, data: { isLive: false, closedAt: new Date() } }),
      this.prisma.voiceRoomParticipant.updateMany({ where: { roomId, leftAt: null }, data: { leftAt: new Date() } }),
    ]);
    await this.livekit.closeRoom(roomId).catch(() => undefined);
  }

  /** Closes rooms nobody is in, and keeps only the newest open room per host. */
  private async sweepRooms() {
    try {
      const live = await this.prisma.voiceRoom.findMany({ where: { isLive: true }, select: { id: true, hostId: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 500 });
      const seenHost = new Set<string>();
      for (const r of live) {
        const dup = seenHost.has(r.hostId);
        seenHost.add(r.hostId);
        const inside = await this.prisma.voiceRoomParticipant.count({ where: { roomId: r.id, leftAt: null } });
        if (dup || inside === 0) {
          this.stageRequests.delete(r.id);
          this.stageInvites.delete(r.id);
          await this.prisma.$transaction([
            this.prisma.voiceRoom.update({ where: { id: r.id }, data: { isLive: false, closedAt: new Date() } }),
            this.prisma.voiceRoomParticipant.updateMany({ where: { roomId: r.id, leftAt: null }, data: { leftAt: new Date() } }),
          ]);
          await this.livekit.closeRoom(r.id).catch(() => undefined);
        }
      }
    } catch (e) {
      this.log.error('room sweep failed: ' + (e as Error).message);
    }
  }

  private async requireHost(userId: string, roomId: string) {
    const room = await this.getRoom(roomId);
    if (room.hostId !== userId) throw new ForbiddenException('Only the host can do that');
    return room;
  }

  /** Host or a moderator. */
  private async requireManager(userId: string, roomId: string) {
    const room = await this.getRoom(roomId);
    if (room.hostId !== userId && !room.moderatorIds.includes(userId)) {
      throw new ForbiddenException('Only the host or a moderator can do that');
    }
    return room;
  }

  /** Moderators cannot act on the host or on other moderators. */
  private guardTarget(room: { hostId: string; moderatorIds: string[] }, actorId: string, targetId: string) {
    if (actorId === room.hostId || actorId === targetId) return;
    if (targetId === room.hostId || room.moderatorIds.includes(targetId)) {
      throw new ForbiddenException('Only the host can do that to the host or a moderator');
    }
  }

  async inviteToStage(actorId: string, roomId: string, userId: string) {
    const room = await this.requireManager(actorId, roomId);
    if (!room.isLive) throw new ForbiddenException('Room is closed');
    const target = room.participants.find((p) => p.userId === userId);
    if (!target) throw new ForbiddenException('That person is not in the room');
    if (target.role !== 'LISTENER') return { success: true, role: target.role };
    const speakers = room.participants.filter((p) => p.role === 'HOST' || p.role === 'SPEAKER').length;
    if (speakers >= 10) throw new ForbiddenException('All seats are taken');
    const set = this.stageInvites.get(roomId) ?? new Set<string>();
    set.add(userId);
    this.stageInvites.set(roomId, set);
    return { success: true, invited: true };
  }

  async declineInvite(userId: string, roomId: string) {
    this.stageInvites.get(roomId)?.delete(userId);
    return { success: true };
  }

  async acceptInvite(userId: string, roomId: string) {
    const set = this.stageInvites.get(roomId);
    if (!set?.has(userId)) throw new ForbiddenException('No invitation to accept');
    const room = await this.getRoom(roomId);
    if (!room.isLive) throw new ForbiddenException('Room is closed');
    const me = room.participants.find((p) => p.userId === userId);
    if (!me) throw new ForbiddenException('Join the room first');
    const speakers = room.participants.filter((p) => p.role === 'HOST' || p.role === 'SPEAKER').length;
    if (speakers >= 10) throw new ForbiddenException('All seats are taken');
    set.delete(userId);
    this.stageRequests.get(roomId)?.delete(userId);
    this.stageInvites.get(roomId)?.delete(userId);
    await this.prisma.voiceRoomParticipant.updateMany({ where: { roomId, userId, leftAt: null }, data: { role: 'SPEAKER' } });
    await this.livekit.setCanPublish(roomId, userId, true);
    return { success: true, role: 'SPEAKER' };
  }

  async setRole(actorId: string, roomId: string, userId: string, role: 'SPEAKER' | 'LISTENER') {
    const room = await this.requireManager(actorId, roomId);
    this.guardTarget(room, actorId, userId);
    // Seating someone who did not ask for the stage needs their acceptance: use an invitation instead.
    if (role === 'SPEAKER' && !(this.stageRequests.get(roomId)?.has(userId))) {
      throw new ForbiddenException('Send a mic invitation; the person must accept first');
    }
    if (userId === room.hostId) throw new ForbiddenException('The host keeps a seat');
    if (role === 'SPEAKER') {
      const speakers = room.participants.filter((p) => p.role === 'HOST' || p.role === 'SPEAKER').length;
      if (speakers >= 10) throw new ForbiddenException('All seats are taken');
    }
    await this.prisma.voiceRoomParticipant.updateMany({
      where: { roomId, userId, leftAt: null },
      data: { role },
    });
    this.stageRequests.get(roomId)?.delete(userId);
    this.stageInvites.get(roomId)?.delete(userId);
    await this.livekit.setCanPublish(roomId, userId, role === 'SPEAKER');
    return { success: true };
  }

  async setMuted(actorId: string, roomId: string, userId: string, muted: boolean) {
    // users can mute themselves; host or moderators can mute others
    if (actorId !== userId) {
      const room = await this.requireManager(actorId, roomId);
      this.guardTarget(room, actorId, userId);
    }
    await this.prisma.voiceRoomParticipant.updateMany({
      where: { roomId, userId, leftAt: null },
      data: { isMuted: muted },
    });
    await this.livekit.mute(roomId, userId, muted);
    return { success: true };
  }

  async removeParticipant(actorId: string, roomId: string, userId: string) {
    const room = await this.requireManager(actorId, roomId);
    this.guardTarget(room, actorId, userId);
    if (userId === room.hostId) throw new ForbiddenException('Cannot remove the host');
    this.stageRequests.get(roomId)?.delete(userId);
    this.stageInvites.get(roomId)?.delete(userId);
    await this.prisma.voiceRoomParticipant.updateMany({
      where: { roomId, userId, leftAt: null },
      data: { leftAt: new Date() },
    });
    await this.livekit.kick(roomId, userId);
    return { success: true };
  }

  async closeRoom(hostId: string, roomId: string) {
    await this.requireHost(hostId, roomId);
    this.stageRequests.delete(roomId);
    this.stageInvites.delete(roomId);
    await this.prisma.$transaction([
      this.prisma.voiceRoom.update({
        where: { id: roomId },
        data: { isLive: false, closedAt: new Date() },
      }),
      this.prisma.voiceRoomParticipant.updateMany({
        where: { roomId, leftAt: null },
        data: { leftAt: new Date() },
      }),
    ]);
    await this.livekit.closeRoom(roomId);
    return { success: true };
  }

  // ---------- 1:1 calls (signaling records) ----------

  async startCall(callerId: string, dto: StartCallDto) {
    if (callerId === dto.calleeId) throw new ForbiddenException('Cannot call yourself');
    if (await this.safety.isBlockedEitherWay(callerId, dto.calleeId)) {
      throw new ForbiddenException('Cannot call this user');
    }
    const call = await this.prisma.call.create({
      data: { callerId, calleeId: dto.calleeId, type: dto.type },
    });
    await this.prisma.notification.create({
      data: { recipientId: dto.calleeId, actorId: callerId, type: 'INCOMING_CALL', payload: { callId: call.id, type: dto.type } },
    });
    void this.push.send(dto.calleeId, 'X Talk', dto.type === 'VIDEO' ? 'Incoming video call' : 'Incoming call', { type: 'call', callId: call.id, callType: String(dto.type) }).catch(() => undefined);
    return call;
  }

  private async updateCallAs(userId: string, callId: string, role: 'callee' | 'either', data: object) {
    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundException('Call not found');
    const allowed = role === 'callee' ? call.calleeId === userId : call.calleeId === userId || call.callerId === userId;
    if (!allowed) throw new ForbiddenException('Not your call');
    return this.prisma.call.update({ where: { id: callId }, data });
  }

  acceptCall(userId: string, callId: string) {
    return this.updateCallAs(userId, callId, 'callee', { status: 'ONGOING', startedAt: new Date() });
  }

  rejectCall(userId: string, callId: string) {
    return this.updateCallAs(userId, callId, 'callee', { status: 'REJECTED', endedAt: new Date() });
  }

  endCall(userId: string, callId: string) {
    return this.updateCallAs(userId, callId, 'either', { status: 'ENDED', endedAt: new Date() });
  }

  /** LiveKit media token for a call participant (video grant for VIDEO calls). */
  async callToken(userId: string, callId: string) {
    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundException('Call not found');
    if (call.callerId !== userId && call.calleeId !== userId) throw new ForbiddenException('Not your call');
    if (call.status === 'ENDED' || call.status === 'REJECTED' || call.status === 'MISSED' || call.status === 'FAILED') {
      throw new BadRequestException('Call is over');
    }
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { displayName: true } });
    return this.livekit.createToken({
      roomId: `call-${callId}`,
      userId,
      name: profile?.displayName ?? 'caller',
      canPublish: true,
      video: call.type === 'VIDEO',
    });
  }

  callHistory(userId: string) {
    return this.prisma.call.findMany({
      where: { OR: [{ callerId: userId }, { calleeId: userId }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
