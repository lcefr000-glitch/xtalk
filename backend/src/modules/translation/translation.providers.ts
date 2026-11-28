import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { GeminiClient } from '../ai/gemini.client';

export interface TranslationResult {
  translatedText: string;
  detectedSource: string;
  provider: string;
}

export interface TranslationProvider {
  readonly name: string;
  translate(text: string, source: string | undefined, target: string): Promise<TranslationResult>;
}

/**
 * LibreTranslate-compatible provider: active when TRANSLATE_BASE_URL is set
 * (self-hostable, e.g. https://libretranslate.com or your own instance).
 */
@Injectable()
export class LibreTranslateProvider implements TranslationProvider {
  readonly name = 'libretranslate';

  constructor(private readonly gemini: GeminiClient) {}

  /** Gemini translation, used first when GEMINI_API_KEY is set; any other provider remains the fallback. */
  private async viaGemini(text: string, source: string | undefined, target: string): Promise<TranslationResult> {
    const system = 'You are a translation engine. Translate the user text' + (source ? ` from language code "${source}"` : '') +
      ` into language code "${target}". Keep tone, emoji and line breaks. Output only the translation, nothing else.`;
    const out = await this.gemini.generate(system, [{ role: 'user', text }]);
    return { translatedText: out, detectedSource: source ?? detectLanguage(text), provider: 'ai' };
  }

  isConfigured(): boolean {
    return Boolean(process.env.TRANSLATE_BASE_URL);
  }

  async translate(text: string, source: string | undefined, target: string): Promise<TranslationResult> {
    if (this.gemini.isConfigured()) {
      try { return await this.viaGemini(text, source, target); } catch { /* fall through to the other providers */ }
    }
    const gkey = process.env.TRANSLATE_GOOGLE_KEY;
    if (gkey) return this.google(text, source, target, gkey);
    const base = process.env.TRANSLATE_BASE_URL;
    if (!base) return this.free(text, source, target);
    const res = await fetch(`${base}/translate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        q: text, source: source ?? 'auto', target, format: 'text',
        api_key: process.env.TRANSLATE_API_KEY,
      }),
    });
    if (!res.ok) throw new ServiceUnavailableException(`Translation provider error (HTTP ${res.status})`);
    const data = (await res.json()) as { translatedText: string; detectedLanguage?: { language: string } };
    return {
      translatedText: data.translatedText,
      detectedSource: data.detectedLanguage?.language ?? source ?? 'auto',
      provider: this.name,
    };
  }

  /** Paid, higher quality: Cloud Translation Basic (v2). Used when TRANSLATE_GOOGLE_KEY is set. */
  private async google(text: string, source: string | undefined, target: string, key: string): Promise<TranslationResult> {
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: text, target, format: 'text', ...(source ? { source } : {}) }),
    });
    if (!res.ok) throw new ServiceUnavailableException(`Translation provider error (HTTP ${res.status})`);
    const data = (await res.json()) as { data?: { translations?: { translatedText: string; detectedSourceLanguage?: string }[] } };
    const t = data.data?.translations?.[0];
    if (!t) throw new ServiceUnavailableException('Translation failed');
    return { translatedText: t.translatedText, detectedSource: t.detectedSourceLanguage ?? source ?? 'auto', provider: 'cloud' };
  }

  /** Free fallback with no setup (daily quota applies). Text is sent in chunks of at most 450 bytes. */
  private async free(text: string, source: string | undefined, target: string): Promise<TranslationResult> {
    const src = (source && source !== 'auto' ? source : detectLanguage(text) === 'en' ? 'Autodetect' : detectLanguage(text)).toString();
    const chunks: string[] = [];
    let cur = '';
    for (const part of text.split(/(?<=[.!?\u061F\n])\s*/)) {
      for (let piece = part; piece.length > 0; ) {
        let take = piece;
        while (Buffer.byteLength(take) > 450) take = take.slice(0, Math.floor(take.length * 0.8));
        piece = piece.slice(take.length);
        if (Buffer.byteLength(cur + ' ' + take) > 450 && cur) { chunks.push(cur); cur = take; } else cur = cur ? cur + ' ' + take : take;
      }
    }
    if (cur) chunks.push(cur);
    const out: string[] = [];
    for (const c of chunks.slice(0, 8)) {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(c)}&langpair=${encodeURIComponent(src + '|' + target)}&de=${encodeURIComponent(process.env.TRANSLATE_CONTACT_EMAIL ?? 'sprout.x-talk@gmail.com')}`;
      const res = await fetch(url);
      if (!res.ok) throw new ServiceUnavailableException('Translation is busy, try again later');
      const data = (await res.json()) as { responseData?: { translatedText?: string }; responseStatus?: number | string };
      const t = data.responseData?.translatedText;
      if (!t || String(data.responseStatus) !== '200' || /MYMEMORY WARNING|INVALID/i.test(t)) throw new ServiceUnavailableException('Translation limit reached for today, try again later');
      out.push(t);
    }
    return { translatedText: out.join(' '), detectedSource: src === 'Autodetect' ? 'auto' : src, provider: 'free' };
  }
}

/**
 * Heuristic language detection: script-based (Arabic/CJK/Cyrillic/...),
 * falls back to English. Honest, deterministic, offline.
 */
export function detectLanguage(text: string): string {
  const counts: Record<string, number> = { ar: 0, zh: 0, ja: 0, ko: 0, ru: 0, el: 0, he: 0, hi: 0, th: 0 };
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x0600 && cp <= 0x06ff) counts.ar++;
    else if (cp >= 0x4e00 && cp <= 0x9fff) counts.zh++;
    else if (cp >= 0x3040 && cp <= 0x30ff) counts.ja++;
    else if (cp >= 0xac00 && cp <= 0xd7af) counts.ko++;
    else if (cp >= 0x0400 && cp <= 0x04ff) counts.ru++;
    else if (cp >= 0x0370 && cp <= 0x03ff) counts.el++;
    else if (cp >= 0x0590 && cp <= 0x05ff) counts.he++;
    else if (cp >= 0x0900 && cp <= 0x097f) counts.hi++;
    else if (cp >= 0x0e00 && cp <= 0x0e7f) counts.th++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : 'en';
}
