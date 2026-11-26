import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConversationsService } from './conversations.service';
import { SendMessageDto } from './dto/message.dto';
import { LiveService } from '../live/live.service';

/**
 * Real-time chat gateway (socket.io, path /ws).
 * Auth: client passes the JWT access token in handshake `auth.token`.
 */
@WebSocketGateway({ path: '/ws', cors: { origin: true } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly live: LiveService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth as Record<string, unknown>)?.token as string;
      if (!token) throw new Error('missing token');
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.get('jwtAccessSecret', { infer: true }),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, status: true, deletedAt: true },
      });
      if (!user || user.status !== 'ACTIVE' || user.deletedAt) throw new Error('inactive');
      client.data.userId = user.id;
      client.join(`user:${user.id}`);
      await this.prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
      // Presence fan-out: anyone sharing a conversation sees them online.
      this.server.emit('presence:online', { userId: user.id });
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (userId) this.server.emit('presence:offline', { userId });
    // Live streams the socket was watching lose a viewer.
    const streams = (client.data.liveStreams as Set<string> | undefined) ?? new Set<string>();
    for (const streamId of streams) {
      const count = await this.live.adjustViewers(streamId, -1).catch(() => null);
      if (count !== null) this.server.to(`live:${streamId}`).emit('live:viewers', { streamId, viewers: count });
    }
  }

  @SubscribeMessage('live:join')
  async onLiveJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { streamId: string }) {
    try {
      const stream = await this.live.streamOf(body.streamId);
      if (!stream || stream.status !== 'LIVE') throw new Error('stream not live');
      client.join(`live:${stream.id}`);
      const set = ((client.data.liveStreams as Set<string> | undefined) ?? new Set<string>());
      if (!set.has(stream.id)) {
        set.add(stream.id);
        client.data.liveStreams = set;
        const count = await this.live.adjustViewers(stream.id, 1);
        this.server.to(`live:${stream.id}`).emit('live:viewers', { streamId: stream.id, viewers: count });
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'join failed' };
    }
  }

  @SubscribeMessage('live:leave')
  async onLiveLeave(@ConnectedSocket() client: Socket, @MessageBody() body: { streamId: string }) {
    const set = (client.data.liveStreams as Set<string> | undefined) ?? new Set<string>();
    if (set.delete(body.streamId)) {
      client.leave(`live:${body.streamId}`);
      const count = await this.live.adjustViewers(body.streamId, -1).catch(() => null);
      if (count !== null) this.server.to(`live:${body.streamId}`).emit('live:viewers', { streamId: body.streamId, viewers: count });
    }
    return { ok: true };
  }

  @SubscribeMessage('live:message')
  async onLiveMessage(@ConnectedSocket() client: Socket, @MessageBody() body: { streamId: string; body: string }) {
    const userId = client.data.userId as string;
    try {
      const text = (body.body ?? '').trim();
      if (!text || text.length > 500) throw new Error('invalid message');
      const stream = await this.live.streamOf(body.streamId);
      if (!stream || stream.status !== 'LIVE') throw new Error('stream not live');
      const saved = await this.live.saveMessage(stream.id, userId, text);
      const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { displayName: true, photoUrl: true } });
      const payload = { ...saved, displayName: profile?.displayName ?? null, photoUrl: profile?.photoUrl ?? null };
      this.server.to(`live:${stream.id}`).emit('live:message', payload);
      return { ok: true, message: payload };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'send failed' };
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @SubscribeMessage('message:send')
  async onSend(@ConnectedSocket() client: Socket, @MessageBody() dto: SendMessageDto & { conversationId: string }) {
    const userId = client.data.userId as string;
    try {
      const message = await this.conversations.sendMessage(userId, dto.conversationId, dto);
      this.server.to(`conv:${dto.conversationId}`).emit('message:new', message);
      return { ok: true, message };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'send failed' };
    }
  }

  @SubscribeMessage('conversation:join')
  async onJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    const userId = client.data.userId as string;
    try {
      await this.conversations.requireMembership(userId, body.conversationId);
      client.join(`conv:${body.conversationId}`);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'join failed' };
    }
  }

  @SubscribeMessage('typing')
  async onTyping(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    const userId = client.data.userId as string;
    try {
      await this.conversations.requireMembership(userId, body.conversationId);
      client.to(`conv:${body.conversationId}`).emit('typing', { conversationId: body.conversationId, userId });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('read')
  async onRead(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    const userId = client.data.userId as string;
    await this.conversations.markRead(userId, body.conversationId).catch(() => null);
    client.to(`conv:${body.conversationId}`).emit('read:update', { conversationId: body.conversationId, userId });
    return { ok: true };
  }
}
