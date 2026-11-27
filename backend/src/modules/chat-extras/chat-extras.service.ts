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
        `CREATE TABLE IF NOT EXISTS message_fixes (
          message_id TEXT NOT NULL, corrector_id TEXT NOT NULL, fixed_text TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (message_id, corrector_id)
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS chat_pins (
          user_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, conversation_id)
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS chat_flags (
          user_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
          muted BOOLEAN NOT NULL DEFAULT false, archived BOOLEAN NOT NULL DEFAULT false,
          PRIMARY KEY (user_id, conversation_id)
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS message_stars (
          user_id TEXT NOT NULL, message_id TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, message_id)
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

  /** A chat partner suggests a corrected version of someone else's text message (one per person per message, can be replaced). */
  async fixMessage(userId: string, messageId: string, text: string) {
    this.ensureReady();
    const clean = (text ?? '').trim();
    if (!clean || clean.length > 2000) throw new BadRequestException('Correction must be 1 to 2000 characters');
    const msg = await this.prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true, deletedAt: true, senderId: true, type: true, body: true } });
    if (!msg || msg.deletedAt) throw new NotFoundException('Message not found');
    await this.assertMember(userId, msg.conversationId);
    if (msg.senderId === userId) throw new BadRequestException('You cannot correct your own message');
    if (msg.type !== 'TEXT' || !msg.body) throw new BadRequestException('Only text messages can be corrected');
    if (clean === msg.body.trim()) throw new BadRequestException('The correction is the same as the message');
    await this.prisma.$executeRaw`
      INSERT INTO message_fixes (message_id, corrector_id, fixed_text) VALUES (${messageId}, ${userId}, ${clean})
      ON CONFLICT (message_id, corrector_id) DO UPDATE SET fixed_text = ${clean}, created_at = now()`;
    return { success: true };
  }

  async removeFix(userId: string, messageId: string) {
    this.ensureReady();
    await this.prisma.$executeRaw`DELETE FROM message_fixes WHERE message_id = ${messageId} AND corrector_id = ${userId}`;
    return { success: true };
  }

  /** Corrections for the messages of one conversation, per message. */
  async fixesForConversation(userId: string, conversationId: string) {
    this.ensureReady();
    await this.assertMember(userId, conversationId);
    const rows = await this.prisma.$queryRaw<{ message_id: string; corrector_id: string; fixed_text: string; created_at: Date }[]>`
      SELECT f.message_id, f.corrector_id, f.fixed_text, f.created_at
      FROM message_fixes f JOIN "Message" m ON m.id = f.message_id
      WHERE m."conversationId" = ${conversationId} AND m."deletedAt" IS NULL
      ORDER BY f.created_at LIMIT 500`;
    const byMessage: Record<string, { correctorId: string; text: string; mine: boolean; createdAt: string }[]> = {};
    for (const r of rows) (byMessage[r.message_id] ??= []).push({ correctorId: r.corrector_id, text: r.fixed_text, mine: r.corrector_id === userId, createdAt: r.created_at.toISOString() });
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

  async flags(userId: string) {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<{ conversation_id: string; muted: boolean; archived: boolean }[]>`SELECT conversation_id, muted, archived FROM chat_flags WHERE user_id = ${userId}`;
    return { flags: rows.map((r) => ({ conversationId: r.conversation_id, muted: r.muted, archived: r.archived })) };
  }

  async setFlag(userId: string, conversationId: string, field: 'muted' | 'archived', value: boolean) {
    this.ensureReady();
    await this.assertMember(userId, conversationId);
    if (field === 'muted') {
      await this.prisma.$executeRaw`INSERT INTO chat_flags (user_id, conversation_id, muted) VALUES (${userId}, ${conversationId}, ${value}) ON CONFLICT (user_id, conversation_id) DO UPDATE SET muted = ${value}`;
    } else {
      await this.prisma.$executeRaw`INSERT INTO chat_flags (user_id, conversation_id, archived) VALUES (${userId}, ${conversationId}, ${value}) ON CONFLICT (user_id, conversation_id) DO UPDATE SET archived = ${value}`;
    }
    return { success: true, [field]: value };
  }

  async toggleStar(userId: string, messageId: string) {
    this.ensureReady();
    const msg = await this.prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true, deletedAt: true } });
    if (!msg || msg.deletedAt) throw new NotFoundException('Message not found');
    await this.assertMember(userId, msg.conversationId);
    const del = await this.prisma.$executeRaw`DELETE FROM message_stars WHERE user_id = ${userId} AND message_id = ${messageId}`;
    if (del === 0) await this.prisma.$executeRaw`INSERT INTO message_stars (user_id, message_id) VALUES (${userId}, ${messageId}) ON CONFLICT DO NOTHING`;
    return { starred: del === 0 };
  }

  /** Starred messages the user can still see (member of the conversation, not deleted). */
  async stars(userId: string) {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT m.id, m."conversationId" AS "conversationId", m.body, m."createdAt" AS "createdAt", m."senderId" AS "senderId"
      FROM message_stars s JOIN "Message" m ON m.id = s.message_id
      JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${userId} AND cm."leftAt" IS NULL
      WHERE s.user_id = ${userId} AND m."deletedAt" IS NULL ORDER BY s.created_at DESC LIMIT 100`;
    return { messages: rows };
  }

  /** Search the user's own conversations only. */
  async search(userId: string, q: string) {
    this.ensureReady();
    const term = q.trim().slice(0, 60);
    if (term.length < 2) return { messages: [] };
    const like = '%' + term.replace(/[%_\\]/g, (c) => '\\' + c) + '%';
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT m.id, m."conversationId" AS "conversationId", m.body, m."createdAt" AS "createdAt", m."senderId" AS "senderId"
      FROM "Message" m
      JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${userId} AND cm."leftAt" IS NULL
      WHERE m."deletedAt" IS NULL AND m.body ILIKE ${like} ORDER BY m."createdAt" DESC LIMIT 50`;
    return { messages: rows };
  }
}
