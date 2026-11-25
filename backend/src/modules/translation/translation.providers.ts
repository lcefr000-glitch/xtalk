import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

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

  isConfigured(): boolean {
    return Boolean(process.env.TRANSLATE_BASE_URL);
  }

  async translate(text: string, source: string | undefined, target: string): Promise<TranslationResult> {
    const base = process.env.TRANSLATE_BASE_URL;
    if (!base) throw new ServiceUnavailableException('Translation provider not configured (set TRANSLATE_BASE_URL)');
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
