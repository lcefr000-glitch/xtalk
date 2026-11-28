import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { GeminiClient } from './gemini.client';

const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 60);

@Injectable()
export class AiService {
  private readonly usage = new Map<string, { day: string; n: number }>();

  constructor(private readonly gemini: GeminiClient) {}

  status() {
    return { enabled: this.gemini.isConfigured(), dailyLimit: DAILY_LIMIT };
  }

  /** Simple per-user daily cap so the free tier is not drained by one account. */
  private spend(userId: string) {
    const day = new Date().toISOString().slice(0, 10);
    const u = this.usage.get(userId);
    if (!u || u.day !== day) { this.usage.set(userId, { day, n: 1 }); return; }
    if (u.n >= DAILY_LIMIT) throw new HttpException('Daily AI limit reached, try again tomorrow', HttpStatus.TOO_MANY_REQUESTS);
    u.n++;
  }

  /** Grammar and writing correction with a short explanation in the learner's language. */
  async correct(userId: string, text: string, language: string, explainIn: string) {
    this.spend(userId);
    const system =
      'You are a careful language teacher. Correct the learner text. Keep their meaning and level. ' +
      'Reply as JSON: {"corrected": string, "changes": [{"from": string, "to": string, "why": string}], "score": number 0-100}. ' +
      `The text is written in language code "${language}". Write each "why" in language code "${explainIn}", one short sentence. ` +
      'If the text is already correct, return it unchanged with an empty changes list.';
    const raw = await this.gemini.generate(system, [{ role: 'user', text }], true);
    try {
      const parsed = JSON.parse(raw);
      return { corrected: String(parsed.corrected ?? text), changes: Array.isArray(parsed.changes) ? parsed.changes.slice(0, 20) : [], score: Number(parsed.score ?? 0) };
    } catch {
      throw new BadRequestException('Could not read the AI answer, try again');
    }
  }

  /** AI tutor: a short conversation partner that fixes mistakes gently. */
  async tutor(userId: string, history: { role: 'user' | 'model'; text: string }[], language: string, level: string, explainIn: string) {
    this.spend(userId);
    const system =
      `You are a friendly language tutor. Chat with the learner in language code "${language}" at CEFR level ${level}. ` +
      'Keep replies short (2 to 4 sentences) and end with one question to keep the conversation going. ' +
      `If the learner's last message has mistakes, add a final line starting with "Fix:" that corrects it and explains briefly in language code "${explainIn}".`;
    const reply = await this.gemini.generate(system, history.slice(-12));
    return { reply };
  }
}
