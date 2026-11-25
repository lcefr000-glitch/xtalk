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
