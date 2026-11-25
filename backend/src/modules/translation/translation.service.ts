import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { LibreTranslateProvider, TranslationResult, detectLanguage } from './translation.providers';

@Injectable()
export class TranslationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly provider: LibreTranslateProvider,
  ) {}

  translate(text: string, source: string | undefined, target: string): Promise<TranslationResult> {
    return this.provider.translate(text, source, target);
  }

  detect(text: string) {
    return { language: detectLanguage(text), provider: 'script-heuristic' };
  }

  /** Translate a chat message; the result is persisted (saved translations). */
  async translateMessage(userId: string, messageId: string, target: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt || !message.body) throw new NotFoundException('Message not found');
    await this.conversations.requireMembership(userId, message.conversationId);

    const cached = await this.prisma.messageTranslation.findUnique({
      where: { messageId_userId_targetLanguage: { messageId, userId, targetLanguage: target } },
    });
    if (cached) return cached;

    const result = await this.provider.translate(message.body, undefined, target);
    return this.prisma.messageTranslation.create({
      data: {
        messageId, userId, targetLanguage: target,
        translatedText: result.translatedText, provider: result.provider,
      },
    });
  }

  /** The user's saved/used translations, newest first. */
  async history(userId: string, page = 1, limit = 30) {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.messageTranslation.count({ where: { userId } }),
      this.prisma.messageTranslation.findMany({
        where: { userId },
        include: { message: { select: { body: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: Math.min(limit, 50),
      }),
    ]);
    return {
      page, limit, total,
      results: rows.map((r) => ({
        id: r.id, original: r.message.body, translatedText: r.translatedText,
        targetLanguage: r.targetLanguage, provider: r.provider, createdAt: r.createdAt,
      })),
    };
  }

  async deleteSaved(userId: string, id: string) {
    await this.prisma.messageTranslation.deleteMany({ where: { id, userId } });
    return { success: true };
  }
}
