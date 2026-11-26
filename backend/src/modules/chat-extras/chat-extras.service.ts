import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const ALLOWED = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F64F}'];

@Injectable()
export class ChatExtrasService implements OnModuleInit {
  private readonly log = new Logger('ChatExtras');
  private ready = false;

  constructor(private readonly prisma: PrismaService) {}

  /** Additive, idempotent bootstrap: CREATE TABLE IF NOT EXISTS only. */
  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS message_reactions (
          message_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (message_id, user_id, emoji)
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS chat_pins (
          user_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, conversation_id)
        )`,
      );
      this.ready = true;
      this.log.log('chat extras tables ready');
    } catch (e) {
      this.log.error('chat extras bootstrap failed: ' + (e as Error).message);
    }
  }

  private ensureReady() {
    if (!this.ready) throw new ServiceUnavailableException('Not available right now');
  }

  private async assertMember(userId: string, conversationId: string) {
    const m = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!m || m.leftAt) throw new ForbiddenException('Not a member of this conversation');
  }

  /** Toggle one emoji reaction on a message. */
  async react(userId: string, messageId: string, emoji: string) {
    this.ensureReady();
    if (!ALLOWED.includes(emoji)) throw new BadRequestException('Unsupported reaction');
    const msg = await this.prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true, deletedAt: true } });
    if (!msg || msg.deletedAt) throw new NotFoundException('Message not found');
    await this.assertMember(userId, msg.conversationId);
    const del = await this.prisma.$executeRaw`DELETE FROM message_reactions WHERE message_id = ${messageId} AND user_id = ${userId} AND emoji = ${emoji}`;
    if (del === 0) {
      await this.prisma.$executeRaw`INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (${messageId}, ${userId}, ${emoji}) ON CONFLICT DO NOTHING`;
    }
    return { success: true, active: del === 0 };
  }

  /** Reactions for the messages of one conversation, grouped per message. */
  async forConversation(userId: string, conversationId: string) {
    this.ensureReady();
    await this.assertMember(userId, conversationId);
    const rows = await this.prisma.$queryRaw<{ message_id: string; emoji: string; n: number; mine: boolean }[]>`
      SELECT r.message_id, r.emoji, COUNT(*)::int AS n, BOOL_OR(r.user_id = ${userId}) AS mine
      FROM message_reactions r JOIN "Message" m ON m.id = r.message_id
      WHERE m."conversationId" = ${conversationId}
      GROUP BY r.message_id, r.emoji ORDER BY MIN(r.created_at)`;
    const byMessage: Record<string, { emoji: string; count: number; mine: boolean }[]> = {};
    for (const r of rows) (byMessage[r.message_id] ??= []).push({ emoji: r.emoji, count: r.n, mine: r.mine });
    return { byMessage };
  }

  async pins(userId: string) {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<{ conversation_id: string }[]>`SELECT conversation_id FROM chat_pins WHERE user_id = ${userId} ORDER BY created_at`;
    return { ids: rows.map((r) => r.conversation_id) };
  }

  async togglePin(userId: string, conversationId: string) {
    this.ensureReady();
    await this.assertMember(userId, conversationId);
    const del = await this.prisma.$executeRaw`DELETE FROM chat_pins WHERE user_id = ${userId} AND conversation_id = ${conversationId}`;
    if (del === 0) await this.prisma.$executeRaw`INSERT INTO chat_pins (user_id, conversation_id) VALUES (${userId}, ${conversationId}) ON CONFLICT DO NOTHING`;
    return { pinned: del === 0 };
  }
}
