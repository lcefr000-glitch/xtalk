import { PushService } from '../notifications/push.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModerationService } from '../moderation/moderation.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { ProgressService } from '../progress/progress.service';
import { EditMessageDto, SendMessageDto } from './dto/message.dto';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly safety: SafetyService,
    private readonly progress: ProgressService,
    private readonly push: PushService,
    private readonly mod: ModerationService,
  ) {}

  /** Get-or-create the 1:1 conversation between two users. */
  async createDirect(meId: string, otherId: string) {
    if (meId === otherId) throw new BadRequestException('Cannot open a conversation with yourself');
    const other = await this.prisma.user.findUnique({
      where: { id: otherId },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!other || other.status !== 'ACTIVE' || other.deletedAt) {
      throw new NotFoundException('User not found');
    }
    if (await this.safety.isBlockedEitherWay(meId, otherId)) {
      throw new ForbiddenException('Cannot message this user');
    }
    const existing = await this.prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { members: { some: { userId: meId, leftAt: null } } },
          { members: { some: { userId: otherId, leftAt: null } } },
        ],
      },
    });
    if (existing) return existing;
    return this.prisma.conversation.create({
      data: {
        members: { create: [{ userId: meId }, { userId: otherId }] },
      },
    });
  }

  async listMine(meId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId: meId, leftAt: null },
      include: {
        conversation: {
          include: {
            members: {
              where: { leftAt: null },
              include: {
                user: {
                  select: {
                    id: true, username: true,
                    profile: { select: { displayName: true, photoUrl: true, country: true } },
                  },
                },
              },
            },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    return {
      results: await Promise.all(
        memberships.map(async (m) => {
          const unreadCount = await this.prisma.message.count({
            where: {
              conversationId: m.conversationId,
              deletedAt: null,
              senderId: { not: meId },
              ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
            },
          });
          return {
            id: m.conversation.id,
            updatedAt: m.conversation.updatedAt,
            members: m.conversation.members.map((cm) => cm.user),
            lastMessage: m.conversation.messages[0] ?? null,
            unreadCount,
          };
        }),
      ),
    };
  }

  async getMessages(meId: string, conversationId: string, before?: string, limit = 30) {
    await this.requireMembership(meId, conversationId);
    const take = Math.min(limit, 100);
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: { attachments: true },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
    });
    const hasMore = messages.length > take;
    const page = hasMore ? messages.slice(0, take) : messages;
    return {
      results: page.reverse(), // chronological order for the client
      nextCursor: hasMore ? page[0].createdAt.toISOString() : null,
    };
  }

  async sendMessage(meId: string, conversationId: string, dto: SendMessageDto) {
    await this.requireMembership(meId, conversationId);
    if (dto.type === 'TEXT' && !dto.body?.trim()) {
      throw new BadRequestException('Text messages need a body');
    }
    if ((dto.type === 'IMAGE' || dto.type === 'VOICE') && (dto.attachments?.length ?? 0) === 0) {
      throw new BadRequestException(`${dto.type} messages need at least one attachment`);
    }
    if (dto.type === 'TEXT' && dto.body) {
      const ctx = await this.prisma.message.findMany({ where: { conversationId, deletedAt: null, body: { not: null } }, orderBy: { createdAt: 'desc' }, take: 4, select: { body: true, senderId: true } });
      await this.mod.checkText(meId, 'MESSAGE', dto.body, conversationId, ctx.reverse().map((c) => (c.senderId === meId ? 'sender: ' : 'other: ') + (c.body ?? '')));
    } else await this.mod.assertCanSpeak(meId);
    // Block check against every other member.
    const others = await this.prisma.conversationMember.findMany({
      where: { conversationId, leftAt: null, userId: { not: meId } },
      select: { userId: true },
    });
    for (const other of others) {
      if (await this.safety.isBlockedEitherWay(meId, other.userId)) {
        throw new ForbiddenException('Cannot message this conversation');
      }
    }
    if (dto.replyToId) {
      const parent = await this.prisma.message.findUnique({ where: { id: dto.replyToId } });
      if (!parent || parent.conversationId !== conversationId || parent.deletedAt) {
        throw new BadRequestException('replyToId does not reference a message in this conversation');
      }
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderId: meId,
          type: dto.type,
          body: dto.body?.trim(),
          replyToId: dto.replyToId,
          attachments: dto.attachments?.length
            ? { create: dto.attachments.map((a) => ({ url: a.url, mimeType: a.mimeType, byteSize: a.byteSize })) }
            : undefined,
        },
        include: { attachments: true },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      // Notify other members (in-app notification; push handled by PushService).
      await tx.notification.createMany({
        data: others.map((o) => ({
          recipientId: o.userId,
          actorId: meId,
          type: 'NEW_MESSAGE' as const,
          payload: { conversationId, messageId: created.id },
        })),
      });
      return created;
    });
    for (const o of others) void this.push.send(o.userId, 'X Talk', 'New message', { type: 'message', conversationId }).catch(() => undefined);
    // Learning stats: count sent messages (best effort, never blocks sending).
    this.progress.record(meId, { messagesSent: 1 }).catch(() => undefined);
    this.mod.scanLater(meId, 'MESSAGE', message.id, message.body ?? '', (message.attachments ?? []).filter((a) => /^image\//.test(a.mimeType ?? '') || /\/media\//.test(a.url)).map((a) => a.url));
    return message;
  }

  async editMessage(meId: string, messageId: string, dto: EditMessageDto) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');
    if (message.senderId !== meId) throw new ForbiddenException('You can only edit your own messages');
    await this.mod.checkText(meId, 'MESSAGE', dto.body, message.conversationId);
    return this.prisma.message.update({
      where: { id: messageId },
      data: { body: dto.body, editedAt: new Date() },
      include: { attachments: true },
    });
  }

  async deleteMessage(meId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');
    if (message.senderId !== meId) throw new ForbiddenException('You can only delete your own messages');
    await this.prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
    return { success: true };
  }

  async markRead(meId: string, conversationId: string) {
    await this.requireMembership(meId, conversationId);
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId: meId },
      data: { lastReadAt: new Date() },
    });
    return { success: true };
  }

  async unreadTotal(meId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId: meId, leftAt: null },
    });
    let total = 0;
    for (const m of memberships) {
      total += await this.prisma.message.count({
        where: {
          conversationId: m.conversationId,
          deletedAt: null,
          senderId: { not: meId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
    }
    return { unread: total };
  }

  async requireMembership(userId: string, conversationId: string) {
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId, leftAt: null },
    });
    if (!member) throw new ForbiddenException('Not a member of this conversation');
    return member;
  }
}
