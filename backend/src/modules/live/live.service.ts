import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { LiveKitService } from '../voice/livekit.service';

@Injectable()
export class LiveService implements OnModuleInit {
  private readonly log = new Logger('Live');
  private ready = false;
  /** Plain class, no injected deps - reuse the voice module's LiveKit wrapper. */
  private readonly livekit = new LiveKitService();

  constructor(private readonly prisma: PrismaService, private readonly safety: SafetyService) {}

  /** Additive, idempotent bootstrap: CREATE TABLE IF NOT EXISTS + enum additions only. */
  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS live_streams (
          id TEXT PRIMARY KEY,
          host_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          category TEXT,
          language_code TEXT,
          status TEXT NOT NULL DEFAULT 'LIVE',
          current_viewers INTEGER NOT NULL DEFAULT 0,
          peak_viewers INTEGER NOT NULL DEFAULT 0,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          ended_at TIMESTAMPTZ
        )`,
      );
      await this.prisma.$executeRawUnsafe(`ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS unlisted BOOLEAN NOT NULL DEFAULT false`);
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS live_streams_status_idx ON live_streams (status, started_at)`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS live_stream_messages (
          id TEXT PRIMARY KEY,
          stream_id TEXT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          body TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'CHAT',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS live_stream_messages_stream_idx ON live_stream_messages (stream_id, created_at)`,
      );
      await this.prisma.$executeRawUnsafe(`ALTER TYPE "ReportTargetType" ADD VALUE IF NOT EXISTS 'LIVE_STREAM'`);
      this.ready = true;
      this.log.log('live streaming tables ready');
    } catch (e) {
      this.log.error('live bootstrap failed: ' + (e as Error).message);
    }
  }

  private ensureReady() {
    if (!this.ready) throw new ServiceUnavailableException('Live streaming is not available right now');
  }

  async create(hostId: string, dto: { title: string; description?: string; category?: string; languageCode?: string; unlisted?: boolean | string }) {
    this.ensureReady();
    const existing = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM live_streams WHERE host_id = ${hostId} AND status = 'LIVE'`;
    if (existing.length) {
      // One live stream per host: return the current one instead of stacking.
      return this.hostView(existing[0].id, hostId);
    }
    const id = crypto.randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO live_streams (id, host_id, title, description, category, language_code, unlisted)
      VALUES (${id}, ${hostId}, ${dto.title}, ${dto.description ?? null}, ${dto.category ?? null}, ${dto.languageCode?.toLowerCase() ?? null}, ${dto.unlisted === true || dto.unlisted === 'true'})`;
    return this.hostView(id, hostId);
  }

  private async hostView(id: string, hostId: string) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM live_streams WHERE id = ${id}`;
    const stream = rows[0];
    let media: { token: string; url: string } | null = null;
    let mediaError: string | null = null;
    try {
      const profile = await this.prisma.profile.findUnique({ where: { userId: hostId }, select: { displayName: true } });
      media = await this.livekit.createToken({
        roomId: `live-${id}`,
        userId: hostId,
        name: profile?.displayName ?? 'host',
        canPublish: true,
        video: true,
      });
    } catch (e) {
      mediaError = (e as Error).message;
    }
    return { stream, hostToken: media?.token ?? null, livekitUrl: media?.url ?? null, mediaError };
  }

  private async hiddenHosts(viewerId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    });
    const ids = new Set(rows.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)));
    for (const x of await this.safety.countryBlockedUserIds(viewerId).catch(() => [] as string[])) ids.add(x);
    return [...ids];
  }

  async list(q: { language?: string; category?: string; page: number; limit: number }, viewerId?: string) {
    this.ensureReady();
    const hide = viewerId ? await this.hiddenHosts(viewerId) : [];
    const offset = (q.page - 1) * q.limit;
    const lang = q.language?.toLowerCase() ?? null;
    const cat = q.category ?? null;
    return this.prisma.$queryRaw<unknown[]>`
      SELECT s.id, s.title, s.description, s.category, s.language_code, s.current_viewers, s.peak_viewers, s.started_at,
             u.id AS host_id, u.username AS host_username, p."displayName" AS host_display_name, p."photoUrl" AS host_photo_url, p."country" AS host_country
      FROM live_streams s
      JOIN "User" u ON u.id = s.host_id
      LEFT JOIN "Profile" p ON p."userId" = u.id
      WHERE s.status = 'LIVE'
        AND (NOT s.unlisted OR s.host_id = ${viewerId ?? ''})
        AND NOT (s.host_id = ANY(${hide}::text[]))
        AND (${lang}::text IS NULL OR s.language_code = ${lang})
        AND (${cat}::text IS NULL OR s.category = ${cat})
      ORDER BY s.current_viewers DESC, s.started_at DESC
      LIMIT ${q.limit} OFFSET ${offset}`;
  }

  async get(id: string) {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT s.*, u.username AS host_username, p."displayName" AS host_display_name, p."photoUrl" AS host_photo_url, p."country" AS host_country
      FROM live_streams s
      JOIN "User" u ON u.id = s.host_id
      LEFT JOIN "Profile" p ON p."userId" = u.id
      WHERE s.id = ${id}`;
    if (!rows.length) throw new NotFoundException('Stream not found');
    return rows[0];
  }

  async viewerToken(id: string, userId: string) {
    this.ensureReady();
    const stream = await this.get(id);
    if (stream.status !== 'LIVE') throw new NotFoundException('Stream has ended');
    if (stream.host_id === userId) return this.hostView(id, userId);
    if (await this.safety.isBlockedEitherWay(userId, stream.host_id as string)) throw new ForbiddenException('Not available');
    // Re-entering starts as a plain viewer: the stage has to be offered again.
    this.stage.get(id)?.delete(userId);
    this.invites.get(id)?.delete(userId);
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { displayName: true } });
    const media = await this.livekit.createToken({
      roomId: `live-${id}`,
      userId,
      name: profile?.displayName ?? 'viewer',
      canPublish: false,
    });
    return { stream, viewerToken: media.token, livekitUrl: media.url };
  }

  async end(id: string, userId: string) {
    this.ensureReady();
    const stream = await this.get(id);
    if (stream.host_id !== userId) throw new ForbiddenException('Only the host can end the stream');
    if (stream.status !== 'LIVE') return { success: true, status: 'ENDED' };
    await this.prisma.$executeRaw`
      UPDATE live_streams SET status = 'ENDED', ended_at = now() WHERE id = ${id}`;
    await this.livekit.closeRoom(`live-${id}`);
    this.invites.delete(id); this.stage.delete(id);
    return { success: true, status: 'ENDED' };
  }

  async kick(id: string, hostId: string, targetUserId: string) {
    this.ensureReady();
    const stream = await this.get(id);
    if (stream.host_id !== hostId) throw new ForbiddenException('Only the host can moderate the stream');
    await this.livekit.kick(`live-${id}`, targetUserId);
    return { success: true };
  }

  /** Stage state is kept in memory (one server). It resets on a redeploy and when a stream ends. */
  private readonly invites = new Map<string, Set<string>>();
  private readonly stage = new Map<string, Set<string>>();

  private async liveStream(id: string) {
    const stream = await this.get(id);
    if (stream.status !== 'LIVE') throw new NotFoundException('Stream has ended');
    return stream;
  }

  async viewers(id: string, hostId: string) {
    this.ensureReady();
    const stream = await this.liveStream(id);
    if (stream.host_id !== hostId) throw new ForbiddenException('Only the host can see the viewer list');
    const people = (await this.livekit.participants(`live-${id}`)).filter((p) => p.userId !== hostId).slice(0, 100);
    const onStage = this.stage.get(id) ?? new Set<string>();
    const invited = this.invites.get(id) ?? new Set<string>();
    return { results: people.map((p) => ({ ...p, onStage: onStage.has(p.userId), invited: invited.has(p.userId) })) };
  }

  async invite(id: string, hostId: string, targetUserId: string) {
    this.ensureReady();
    const stream = await this.liveStream(id);
    if (stream.host_id !== hostId) throw new ForbiddenException('Only the host can invite');
    if (targetUserId === hostId) throw new ForbiddenException('Not available');
    if (await this.safety.isBlockedEitherWay(targetUserId, hostId)) throw new ForbiddenException('Not available');
    const here = (await this.livekit.participants(`live-${id}`)).some((p) => p.userId === targetUserId);
    if (!here) throw new NotFoundException('That person is not watching right now');
    const set = this.invites.get(id) ?? new Set<string>();
    if (set.size >= 50) throw new ForbiddenException('Too many open invites');
    set.add(targetUserId);
    this.invites.set(id, set);
    return { success: true };
  }

  async stageState(id: string, userId: string) {
    const stream = await this.liveStream(id);
    const ids = [...(this.stage.get(id) ?? [])];
    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: [...ids, stream.host_id as string] } },
      select: { userId: true, displayName: true, photoUrl: true },
    });
    const by = new Map(profiles.map((p) => [p.userId, p]));
    const card = (uid: string) => ({ userId: uid, name: by.get(uid)?.displayName ?? '', photoUrl: by.get(uid)?.photoUrl ?? null });
    return {
      invited: this.invites.get(id)?.has(userId) === true,
      isOnStage: ids.includes(userId),
      host: card(stream.host_id as string),
      onStage: ids.map(card),
    };
  }

  async acceptInvite(id: string, userId: string) {
    this.ensureReady();
    await this.liveStream(id);
    const inv = this.invites.get(id);
    if (!inv?.has(userId)) throw new ForbiddenException('No invite');
    const st = this.stage.get(id) ?? new Set<string>();
    if (st.size >= 3) throw new ForbiddenException('The stage is full');
    inv.delete(userId);
    st.add(userId);
    this.stage.set(id, st);
    await this.livekit.setStage(`live-${id}`, userId, true);
    return { success: true };
  }

  async declineInvite(id: string, userId: string) {
    this.invites.get(id)?.delete(userId);
    return { success: true };
  }

  /** The guest leaves, or the host removes them. */
  async leaveStage(id: string, actorId: string, targetUserId?: string) {
    this.ensureReady();
    const stream = await this.get(id);
    const target = targetUserId && stream.host_id === actorId ? targetUserId : actorId;
    this.stage.get(id)?.delete(target);
    this.invites.get(id)?.delete(target);
    await this.livekit.setStage(`live-${id}`, target, false);
    return { success: true };
  }

  async messages(id: string, limit: number) {
    this.ensureReady();
    return this.prisma.$queryRaw<unknown[]>`
      SELECT m.id, m.body, m.kind, m.created_at, m.user_id, u.username, p."displayName", p."photoUrl"
      FROM live_stream_messages m
      JOIN "User" u ON u.id = m.user_id
      LEFT JOIN "Profile" p ON p."userId" = u.id
      WHERE m.stream_id = ${id}
      ORDER BY m.created_at DESC LIMIT ${limit}`;
  }

  async saveMessage(streamId: string, userId: string, body: string) {
    const id = crypto.randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO live_stream_messages (id, stream_id, user_id, body)
      VALUES (${id}, ${streamId}, ${userId}, ${body})`;
    return { id, streamId, userId, body, createdAt: new Date().toISOString() };
  }

  /** Viewer counting driven by the chat gateway (socket join/leave). */
  async adjustViewers(streamId: string, delta: number) {
    await this.prisma.$executeRaw`
      UPDATE live_streams SET
        current_viewers = GREATEST(0, current_viewers + ${delta}),
        peak_viewers = GREATEST(peak_viewers, current_viewers + ${delta})
      WHERE id = ${streamId}`;
    const rows = await this.prisma.$queryRaw<{ current_viewers: number }[]>`
      SELECT current_viewers FROM live_streams WHERE id = ${streamId}`;
    return rows[0]?.current_viewers ?? 0;
  }

  async streamOf(streamId: string) {
    const rows = await this.prisma.$queryRaw<{ id: string; status: string; host_id: string }[]>`
      SELECT id, status, host_id FROM live_streams WHERE id = ${streamId}`;
    return rows[0] ?? null;
  }

  async adminList() {
    this.ensureReady();
    return this.prisma.$queryRaw<unknown[]>`
      SELECT s.id, s.title, s.status, s.current_viewers, s.peak_viewers, s.started_at, s.ended_at,
             u.username AS host_username, p."displayName" AS host_display_name
      FROM live_streams s JOIN "User" u ON u.id = s.host_id LEFT JOIN "Profile" p ON p."userId" = u.id
      ORDER BY s.started_at DESC LIMIT 100`;
  }

  async adminEnd(id: string) {
    this.ensureReady();
    const stream = await this.get(id);
    await this.prisma.$executeRaw`UPDATE live_streams SET status = 'ENDED', ended_at = now() WHERE id = ${id} AND status = 'LIVE'`;
    await this.livekit.closeRoom(`live-${id}`);
    return { success: true, id: stream.id };
  }
}
