import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';

export interface CorrectionResult {
  correctedText: string;
  explanation: string;
  provider: string;
}

/**
 * Correction provider chain:
 * 1. LanguageTool-compatible HTTP API when CORRECT_BASE_URL is set
 *    (self-hostable; https://languagetool.org).
 * 2. Built-in rule-based fallback (deterministic, honest): fixes doubled
 *    spaces, missing terminal punctuation, lowercased sentence starts, "i"->I
 *    in English. It is NOT an AI and reports exactly what it changed.
 */
@Injectable()
export class CorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
  ) {}

  async correct(text: string, language?: string): Promise<CorrectionResult> {
    const base = process.env.CORRECT_BASE_URL;
    if (base) {
      const res = await fetch(`${base}/v2/check`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ text, language: language ?? 'auto' }).toString(),
      });
      if (!res.ok) throw new ServiceUnavailableException(`Correction provider error (HTTP ${res.status})`);
      const data = (await res.json()) as {
        matches: Array<{ offset: number; length: number; message: string; replacements: Array<{ value: string }> }>;
      };
      let corrected = '';
      let cursor = 0;
      const notes: string[] = [];
      for (const m of data.matches) {
        const replacement = m.replacements[0]?.value;
        if (replacement !== undefined) {
          corrected += text.slice(cursor, m.offset) + replacement;
          cursor = m.offset + m.length;
          notes.push(m.message);
        }
      }
      corrected += text.slice(cursor);
      return {
        correctedText: corrected,
        explanation: notes.length ? notes.join('; ') : 'No issues found',
        provider: 'languagetool',
      };
    }
    return this.ruleBased(text, language);
  }

  private ruleBased(text: string, language?: string): CorrectionResult {
    const changes: string[] = [];
    let out = text;

    const noDoubles = out.replace(/ {2,}/g, ' ');
    if (noDoubles !== out) { changes.push('Removed doubled spaces'); out = noDoubles; }

    const trimmed = out.trim();
    if (trimmed !== out) { changes.push('Trimmed surrounding whitespace'); out = trimmed; }

    if (out.length > 0 && /^[a-z]/.test(out)) {
      out = out[0].toUpperCase() + out.slice(1);
      changes.push('Capitalized the first letter');
    }
    if (out.length > 0 && !/[.!?؟]$/.test(out)) {
      out += '.';
      changes.push('Added terminal punctuation');
    }
    if ((language ?? 'en') === 'en') {
      const fixed = out.replace(/\bi\b/g, 'I');
      if (fixed !== out) { changes.push('"i" -> "I"'); out = fixed; }
    }

    return {
      correctedText: out,
      explanation: changes.length
        ? changes.join('; ')
        : 'No issues found by the rule-based fallback (configure CORRECT_BASE_URL for full grammar checking)',
      provider: 'rules-fallback',
    };
  }

  /** Persist a correction for a chat message (original stays visible). */
  async correctMessage(userId: string, messageId: string, language?: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt || !message.body) throw new NotFoundException('Message not found');
    await this.conversations.requireMembership(userId, message.conversationId);
    const result = await this.correct(message.body, language);
    return this.prisma.messageCorrection.create({
      data: {
        messageId,
        correctorId: userId,
        correctedText: result.correctedText,
        explanation: result.explanation,
        provider: result.provider,
      },
    });
  }

  /** AI tutor: OpenAI-compatible endpoint when AI_TUTOR_BASE_URL+KEY set. */
  async tutor(userId: string, message: string, language?: string) {
    const base = process.env.AI_TUTOR_BASE_URL;
    const key = process.env.AI_TUTOR_API_KEY;
    if (!base || !key) {
      throw new ServiceUnavailableException(
        'AI tutor provider not configured (set AI_TUTOR_BASE_URL and AI_TUTOR_API_KEY)',
      );
    }
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.AI_TUTOR_MODEL ?? 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a concise language tutor inside X TaIk. Reply in the user's interface language, focus on ${language ?? 'the target language'}, give short examples.`,
          },
          { role: 'user', content: message },
        ],
        max_tokens: 500,
      }),
    });
    if (!res.ok) throw new ServiceUnavailableException(`AI tutor error (HTTP ${res.status})`);
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return { reply: data.choices[0]?.message.content ?? '', provider: 'openai-compatible' };
  }
}
