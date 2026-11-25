import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { CreateRoomDto, StartCallDto } from './dto/voice.dto';
import { LiveKitService } from './livekit.service';

/**
 * Voice rooms + 1:1 calls: full state/signaling layer.
 * Live audio runs on LiveKit (WebRTC SFU): POST voice-rooms/:id/token returns a
 * join token whose publish rights follow the participant's role (HOST/SPEAKER can talk).
 */
@Injectable()
export class VoiceService {
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

  listRooms(liveOnly = true) {
    return this.prisma.voiceRoom.findMany({
      where: liveOnly ? { isLive: true } : {},
      include: {
        host: { select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true } } } },
        language: true,
        _count: { select: { participants: { where: { leftAt: null } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
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
            user: { select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true } } } },
          },
        },
      },
    });
    if (!room) throw new NotFoundException('Room not found');
    return room;
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

  async leaveRoom(userId: string, roomId: string) {
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

  async setRole(hostId: string, roomId: string, userId: string, role: 'SPEAKER' | 'LISTENER') {
    await this.requireHost(hostId, roomId);
    await this.prisma.voiceRoomParticipant.updateMany({
      where: { roomId, userId, leftAt: null },
      data: { role },
    });
    await this.livekit.setCanPublish(roomId, userId, role === 'SPEAKER' || userId === hostId);
    return { success: true };
  }

  async setMuted(hostId: string, roomId: string, userId: string, muted: boolean) {
    // users can mute themselves; only the host can mute others
    if (hostId !== userId) await this.requireHost(hostId, roomId);
    await this.prisma.voiceRoomParticipant.updateMany({
      where: { roomId, userId, leftAt: null },
      data: { isMuted: muted },
    });
    await this.livekit.mute(roomId, userId, muted);
    return { success: true };
  }

  async removeParticipant(hostId: string, roomId: string, userId: string) {
    await this.requireHost(hostId, roomId);
    await this.prisma.voiceRoomParticipant.updateMany({
      where: { roomId, userId, leftAt: null },
      data: { leftAt: new Date() },
    });
    await this.livekit.kick(roomId, userId);
    return { success: true };
  }

  async closeRoom(hostId: string, roomId: string) {
    await this.requireHost(hostId, roomId);
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

  callHistory(userId: string) {
    return this.prisma.call.findMany({
      where: { OR: [{ callerId: userId }, { calleeId: userId }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
