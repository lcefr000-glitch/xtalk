import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { CreateRoomDto, StartCallDto } from './dto/voice.dto';
import { LiveKitService } from './livekit.service';

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
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS voice_room_themes (room_id TEXT PRIMARY KEY, theme TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
      );
      this.themesReady = true;
      this.log.log('voice room themes table ready');
    } catch (e) {
      this.log.error('voice themes bootstrap failed: ' + (e as Error).message);
    }
  }

  async setTheme(hostId: string, roomId: string, theme: string) {
    if (!ROOM_THEMES.includes(theme)) throw new BadRequestException('Unknown theme');
    await this.requireHost(hostId, roomId);
    if (!this.themesReady) throw new BadRequestException('Themes are not available right now');
    await this.prisma.$executeRaw`INSERT INTO voice_room_themes (room_id, theme) VALUES (${roomId}, ${theme})
      ON CONFLICT (room_id) DO UPDATE SET theme = ${theme}, updated_at = now()`;
    return { success: true, theme };
  }

  private async themeOf(roomId: string): Promise<string> {
    if (!this.themesReady) return 'default';
    try {
      const rows = await this.prisma.$queryRaw<{ theme: string }[]>`SELECT theme FROM voice_room_themes WHERE room_id = ${roomId}`;
      return rows[0]?.theme ?? 'default';
    } catch { return 'default'; }
  }
  /** Live queue of listeners asking for the stage (room id -> user ids). In memory on purpose. */
  private readonly stageRequests = new Map<string, Set<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly safety: SafetyService,
    private readonly livekit: LiveKitService,
  ) {}

  async createRoom(hostId: string, dto: CreateRoomDto) {
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

  async listRooms(liveOnly = true) {
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
    return rooms.map((r) => ({ ...r, description: splitDescription(r.description).description }));
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
    return {
      ...room,
      description,
      moderatorIds: mods,
      theme: await this.themeOf(id),
      stageRequests: [...(this.stageRequests.get(id) ?? [])],
    };
  }

  async joinRoom(userId: string, roomId: string) {
    const room = await this.getRoom(roomId);
    if (!room.isLive) throw new ForbiddenException('Room is closed');
    if (await this.safety.isBlockedEitherWay(userId, room.hostId)) {
      throw new ForbiddenException('Cannot join this room');
    }
    const existing = await this.prisma.voiceRoomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (existing) {
      return this.prisma.voiceRoomParticipant.update({
        where: { id: existing.id },
        data: { leftAt: null },
      });
    }
    return this.prisma.voiceRoomParticipant.create({
      data: { roomId, userId, role: 'LISTENER' },
    });
  }

  async getToken(userId: string, roomId: string) {
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
    return { success: true };
  }

  async rejectStage(actorId: string, roomId: string, userId: string) {
    await this.requireManager(actorId, roomId);
    this.stageRequests.get(roomId)?.delete(userId);
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
    await this.prisma.voiceRoomParticipant.updateMany({
      where: { roomId, userId, leftAt: null },
      data: { leftAt: new Date() },
    });
    return { success: true };
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

  async setRole(actorId: string, roomId: string, userId: string, role: 'SPEAKER' | 'LISTENER') {
    const room = await this.requireManager(actorId, roomId);
    this.guardTarget(room, actorId, userId);
    if (userId === room.hostId) throw new ForbiddenException('The host keeps a seat');
    if (role === 'SPEAKER') {
      const speakers = room.participants.filter((p) => p.role === 'HOST' || p.role === 'SPEAKER').length;
      if (speakers >= 8) throw new ForbiddenException('All seats are taken');
    }
    await this.prisma.voiceRoomParticipant.updateMany({
      where: { roomId, userId, leftAt: null },
      data: { role },
    });
    this.stageRequests.get(roomId)?.delete(userId);
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
