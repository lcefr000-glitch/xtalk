import { Injectable, ServiceUnavailableException } from '@nestjs/common';

/** Thin Gemini client. The key is read from GEMINI_API_KEY (server environment only). */
@Injectable()
export class GeminiClient {
  isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  private model(): string {
    return process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
  }

  async generate(system: string, contents: { role: 'user' | 'model'; text: string }[], json = false): Promise<string> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new ServiceUnavailableException('AI is not set up on this server yet');
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model()}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: contents.map((c) => ({ role: c.role, parts: [{ text: c.text }] })),
        generationConfig: { temperature: 0.3, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw new ServiceUnavailableException(`AI provider error (HTTP ${res.status})`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    if (!text) throw new ServiceUnavailableException('AI returned no answer');
    return text;
  }
}
