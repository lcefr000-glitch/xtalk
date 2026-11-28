import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PushService } from '../notifications/push.service';
import { Category, Risk, RISK_ORDER, looksEducational, maxRisk, normalize, scanText } from './moderation.text';

export type ContentType = 'MESSAGE' | 'POST' | 'COMMENT' | 'LIVE' | 'NAME' | 'USER' | 'IMAGE' | 'VOICE_ROOM';
type PenaltyKind = 'WARNING' | 'FORMAL_WARNING' | 'FEATURE_MUTE' | 'TEMP_SUSPEND' | 'PERM_BAN';

interface Verdict { violation: boolean; categories: Category[]; risk: Risk; confidence: number; reason: string; context: string; source: 'rules' | 'ai' }

const WEIGHT: Record<Risk, number> = { LOW: 1, MEDIUM: 2, HIGH: 4, CRITICAL: 8 };
const CAT_AR: Record<string, string> = { profanity: 'ألفاظ نابية', insult: 'إهانة', sexual: 'محتوى جنسي', hate: 'خطاب كراهية', threat: 'تهديد', harassment: 'تحرش أو مضايقة', scam: 'احتيال', link: 'رابط غير آمن', personal_info: 'بيانات شخصية', spam: 'رسائل مزعجة' };
const CAT_EN: Record<string, string> = { profanity: 'offensive language', insult: 'insults', sexual: 'sexual content', hate: 'hate speech', threat: 'threats', harassment: 'harassment', scam: 'a scam attempt', link: 'an unsafe link', personal_info: 'personal information', spam: 'spam' };

const POLICY = `You are the safety reviewer of a language-exchange chat app (like HelloTalk). Users are learners of many languages and may joke, tease friends, quote words to learn them, or ask what a rude word means. Judge the CONTEXT and the real intent, not just keywords.
Violations: insults and bullying aimed at a person, harassment, threats and violence, racism and hate speech, sexual content or sexual solicitation, scams and harmful links, sharing someone's private data (address, phone, ID) without consent, spam.
NOT violations: friendly banter between friends, learning questions about words (even rude words), quoting or translating, mild exclamations not aimed at anyone, discussing news or education.
Return only JSON: {"violation":boolean,"categories":["profanity"|"insult"|"sexual"|"hate"|"threat"|"harassment"|"scam"|"link"|"personal_info"|"spam"],"risk":"LOW"|"MEDIUM"|"HIGH"|"CRITICAL","confidence":0..1,"context":"joke|educational|quote|abuse|threat|neutral|other","reason":"one short sentence in English"}. Risk: LOW mild rudeness, MEDIUM clear insult or explicit language aimed at someone, HIGH harassment, hate, sexual solicitation, serious scam, CRITICAL credible threats of violence or encouraging suicide.`;

@Injectable()
export class ModerationService implements OnModuleInit {
  private readonly log = new Logger('Moderation');
  private ready = false;
  private rate = new Map<string, number[]>();
  private recent = new Map<string, { t: number; n: string; target: string }[]>();
  private rateHits = new Map<string, number[]>();
  private queue: (() => Promise<void>)[] = [];
  private running = 0;
  private aiCalls: number[] = [];

  constructor(private readonly prisma: PrismaService, private readonly push: PushService) {}

  async onModuleInit() {
    try {
      const q = (s: string) => this.prisma.$executeRawUnsafe(s);
      await q(`CREATE TABLE IF NOT EXISTS mod_violations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, content_type TEXT NOT NULL, content_id TEXT, excerpt TEXT, categories TEXT[] NOT NULL DEFAULT '{}', risk TEXT NOT NULL, source TEXT NOT NULL, confidence REAL, reason TEXT, action TEXT NOT NULL DEFAULT 'NONE', status TEXT NOT NULL DEFAULT 'ACTIVE', report_id TEXT, reviewed_by TEXT, reviewed_at TIMESTAMPTZ, review_note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await q(`CREATE INDEX IF NOT EXISTS mod_violations_user_idx ON mod_violations (user_id, created_at DESC)`);
      await q(`CREATE INDEX IF NOT EXISTS mod_violations_status_idx ON mod_violations (status, created_at DESC)`);
      await q(`CREATE TABLE IF NOT EXISTS mod_penalties (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, reason TEXT, violation_id TEXT, created_by TEXT NOT NULL DEFAULT 'ai', starts_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ, active BOOLEAN NOT NULL DEFAULT true, set_status BOOLEAN NOT NULL DEFAULT false, lifted_by TEXT, lifted_at TIMESTAMPTZ, lift_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await q(`CREATE INDEX IF NOT EXISTS mod_penalties_user_idx ON mod_penalties (user_id, active)`);
      await q(`CREATE TABLE IF NOT EXISTS mod_appeals (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, penalty_id TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN', admin_note TEXT, decided_by TEXT, decided_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await q(`CREATE TABLE IF NOT EXISTS mod_notices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, penalty_id TEXT, appeal_id TEXT, read BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await q(`CREATE INDEX IF NOT EXISTS mod_notices_user_idx ON mod_notices (user_id, created_at DESC)`);
      await q(`CREATE TABLE IF NOT EXISTS mod_report_meta (report_id TEXT PRIMARY KEY, verdict TEXT NOT NULL, risk TEXT, categories TEXT[] NOT NULL DEFAULT '{}', confidence REAL, reason TEXT, note TEXT, reporter_flagged BOOLEAN NOT NULL DEFAULT false, duplicate BOOLEAN NOT NULL DEFAULT false, target_user_id TEXT, processed_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await q(`CREATE TABLE IF NOT EXISTS mod_security_events (id TEXT PRIMARY KEY, user_id TEXT, kind TEXT NOT NULL, detail TEXT, ip TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await q(`CREATE TABLE IF NOT EXISTS user_mutes (user_id TEXT NOT NULL, muted_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, muted_id))`);
      await q(`CREATE TABLE IF NOT EXISTS user_hidden_content (user_id TEXT NOT NULL, content_type TEXT NOT NULL, content_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, content_type, content_id))`);
      this.ready = true;
      setInterval(() => void this.sweep(), 60_000).unref();
      this.log.log('moderation tables ready');
    } catch (e) { this.log.error('moderation bootstrap failed: ' + (e as Error).message); }
  }

  // ---------- helpers ----------
  private async lang(userId: string): Promise<'ar' | 'en'> {
    try { const p = await this.prisma.profile.findUnique({ where: { userId }, select: { interfaceLanguage: true } }); return String(p?.interfaceLanguage ?? '').toLowerCase().startsWith('ar') ? 'ar' : 'en'; } catch { return 'en'; }
  }
  private cats(c: string[], lang: 'ar' | 'en') { return c.map((x) => (lang === 'ar' ? CAT_AR : CAT_EN)[x] ?? x).join(lang === 'ar' ? '، ' : ', '); }
  private fmtUntil(d: Date | null, lang: 'ar' | 'en') { return d ? d.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' }) : ''; }

  async notice(userId: string, kind: string, en: [string, string], ar: [string, string], extra: { penaltyId?: string; appealId?: string } = {}) {
    const lang = await this.lang(userId);
    const [title, body] = lang === 'ar' ? ar : en;
    await this.prisma.$executeRaw`INSERT INTO mod_notices (id, user_id, kind, title, body, penalty_id, appeal_id) VALUES (${randomUUID()}, ${userId}, ${kind}, ${title}, ${body}, ${extra.penaltyId ?? null}, ${extra.appealId ?? null})`;
    this.push.send(userId, title, body, { type: 'moderation', kind }).catch(() => undefined);
  }

  // ---------- AI ----------
  private aiAllowed(): boolean {
    const now = Date.now();
    this.aiCalls = this.aiCalls.filter((t) => now - t < 60_000);
    if (this.aiCalls.length >= 90) return false;
    this.aiCalls.push(now);
    return true;
  }

  private async gemini(parts: unknown[], timeoutMs: number): Promise<any | null> {
    const key = process.env.GEMINI_API_KEY;
    if (!key || !this.aiAllowed()) return null;
    try {
      const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: POLICY }] }, contents: [{ role: 'user', parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const txt = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      return JSON.parse(txt.replace(/^```json|```$/g, '').trim());
    } catch { return null; }
  }

  private toVerdict(j: any): Verdict | null {
    if (!j || typeof j !== 'object') return null;
    const cats = (Array.isArray(j.categories) ? j.categories : []).filter((c: string) => c in CAT_EN) as Category[];
    const risk = RISK_ORDER.includes(j.risk) ? (j.risk as Risk) : 'LOW';
    return { violation: j.violation === true, categories: cats.length ? cats : j.violation ? ['harassment'] : [], risk, confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0)), reason: String(j.reason ?? '').slice(0, 200), context: String(j.context ?? 'other'), source: 'ai' };
  }

  async aiText(text: string, context: string[] = [], timeoutMs = 6000): Promise<Verdict | null> {
    const prompt = (context.length ? `Earlier messages for context (oldest first):\n${context.map((c) => '- ' + c.slice(0, 300)).join('\n')}\n\n` : '') + `Message to judge:\n"""${text.slice(0, 1500)}"""`;
    return this.toVerdict(await this.gemini([{ text: prompt }], timeoutMs));
  }

  async aiImage(bytes: Buffer, mime: string): Promise<Verdict | null> {
    if (bytes.length > 4_000_000 || !/^image\/(png|jpe?g|webp|gif)$/.test(mime)) return null;
    const j = await this.gemini([{ text: 'Judge this image. Violations: nudity or sexual content, graphic violence or gore, hate symbols, illegal content, harassment or humiliating images of a person, scam screenshots. Normal selfies, food, places, memes and learning material are fine. Use the same JSON format.' }, { inlineData: { mimeType: mime, data: bytes.toString('base64') } }], 15000);
    return this.toVerdict(j);
  }

  // ---------- enforcement state ----------
  async activeMute(userId: string): Promise<{ until: Date | null; kind: string } | null> {
    const r = await this.prisma.$queryRaw<{ kind: string; expires_at: Date | null }[]>`SELECT kind, expires_at FROM mod_penalties WHERE user_id = ${userId} AND active AND kind IN ('FEATURE_MUTE') AND (expires_at IS NULL OR expires_at > now()) ORDER BY expires_at DESC NULLS FIRST LIMIT 1`;
    return r[0] ? { until: r[0].expires_at, kind: r[0].kind } : null;
  }

  async assertCanSpeak(userId: string) {
    if (!this.ready) return;
    const m = await this.activeMute(userId).catch(() => null);
    if (m) throw new ForbiddenException(`Posting and messaging are paused on your account${m.until ? ' until ' + m.until.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : ''}. You can appeal from the safety notices.`);
  }

  private hit(map: Map<string, number[]>, key: string, windowMs: number): number {
    const now = Date.now();
    const arr = (map.get(key) ?? []).filter((t) => now - t < windowMs);
    arr.push(now); map.set(key, arr);
    return arr.length;
  }

  /** Anti-spam and anti-bot: send rate, repeated text, and the same text to many people. */
  private async antiSpam(userId: string, type: ContentType, text: string, target: string) {
    const lim: Record<string, [number, number]> = { MESSAGE: [14, 20_000], LIVE: [10, 15_000], POST: [6, 300_000], COMMENT: [12, 60_000] };
    const [max, win] = lim[type] ?? [20, 30_000];
    const n = this.hit(this.rate, userId + ':' + type, win);
    const norm = normalize(text).trim();
    const arr = (this.recent.get(userId) ?? []).filter((x) => Date.now() - x.t < 300_000);
    arr.push({ t: Date.now(), n: norm, target }); this.recent.set(userId, arr.slice(-40));
    const sameRecent = arr.filter((x) => x.n === norm && Date.now() - x.t < 120_000).length;
    const targets = new Set(arr.filter((x) => x.n === norm && norm.length >= 8).map((x) => x.target));
    if (targets.size >= 4) {
      await this.record({ userId, type: 'MESSAGE', excerpt: text, categories: ['spam'], risk: 'MEDIUM', source: 'AUTO', confidence: 0.9, reason: 'Same text sent to many people in a few minutes (bot-like)', applyPenalty: true, forceReview: true });
      await this.event(userId, 'bot_suspected', 'same text to ' + targets.size + ' targets');
      throw new BadRequestException('Message not sent: this looks like spam.');
    }
    if (n > max || (norm.length >= 3 && sameRecent >= 4)) {
      if (this.hit(this.rateHits, userId, 300_000) >= 5) await this.record({ userId, type, excerpt: text, categories: ['spam'], risk: 'LOW', source: 'AUTO', confidence: 0.8, reason: 'Repeated sending too fast', applyPenalty: true });
      throw new BadRequestException('You are sending too fast. Please slow down.');
    }
  }

  async event(userId: string | null, kind: string, detail: string, ip?: string) {
    try { await this.prisma.$executeRaw`INSERT INTO mod_security_events (id, user_id, kind, detail, ip) VALUES (${randomUUID()}, ${userId}, ${kind}, ${detail.slice(0, 300)}, ${ip ?? null})`; } catch { /* best effort */ }
  }

  // ---------- main check (before saving) ----------
  /** Throws a plain-English error when the text must not be sent. Mild rudeness passes and is reviewed in the background. */
  async checkText(userId: string, type: ContentType, text: string, target = '', context: string[] = []) {
    if (!this.ready || !text?.trim()) return;
    if (type !== 'NAME') { await this.assertCanSpeak(userId); await this.antiSpam(userId, type, text, target); }
    const sc = scanText(text);
    if (sc.pii === 'card number') throw new BadRequestException('Message not sent: do not share card numbers.');
    const strong = sc.hits.filter((h) => h.strong);
    let risk: Risk = 'LOW'; const cats = new Set<Category>();
    for (const h of sc.hits) { risk = maxRisk(risk, h.risk); cats.add(h.category); }
    if (sc.link) { cats.add('link'); risk = maxRisk(risk, 'MEDIUM'); }
    if (sc.scam) { cats.add('scam'); risk = maxRisk(risk, sc.link ? 'HIGH' : 'MEDIUM'); }
    // Links and scams are blocked by rules; no context excuse.
    if (sc.link || sc.scam) {
      await this.record({ userId, type, excerpt: text, categories: [...cats], risk, source: 'AUTO', confidence: 0.9, reason: sc.link ?? 'scam wording', applyPenalty: true });
      throw new BadRequestException(`Message not sent: it contains ${sc.link ?? 'a scam attempt'}.`);
    }
    if (!strong.length) {
      if (type === 'NAME' && sc.hits.length) throw new BadRequestException('This name is not allowed.');
      return;
    }
    const edu = looksEducational(text);
    const ai = await this.aiText(text, context, 5000);
    let v: Verdict;
    if (ai) v = ai;
    else v = { violation: !(edu && !strong.some((h) => h.category === 'threat')), categories: [...cats], risk, confidence: 0.75, reason: 'Matched blocked wording', context: edu ? 'educational' : 'unknown', source: 'rules' };
    if (type === 'NAME') { if (v.violation) throw new BadRequestException('This name is not allowed.'); return; }
    if (!v.violation || v.confidence < 0.6) return;
    const r = maxRisk(v.risk, strong.some((h) => h.category === 'threat') ? 'HIGH' : 'LOW');
    await this.record({ userId, type, excerpt: text, categories: v.categories.length ? v.categories : [...cats], risk: r, source: 'AUTO', confidence: v.confidence, reason: v.reason, applyPenalty: true });
    throw new BadRequestException('Message not sent: it breaks the community rules (' + (v.categories[0] ? CAT_EN[v.categories[0]] : 'abusive language') + ').');
  }

  // ---------- background scans (after saving) ----------
  private enqueue(job: () => Promise<void>) {
    if (this.queue.length > 200) return;
    this.queue.push(job); void this.pump();
  }
  private async pump() {
    while (this.running < 3 && this.queue.length) {
      const job = this.queue.shift()!;
      this.running++;
      job().catch((e) => this.log.warn('scan failed: ' + (e as Error).message)).finally(() => { this.running--; void this.pump(); });
    }
  }

  /** Text that passed the first pass is judged by the AI with its context a moment later. */
  scanLater(userId: string, type: 'MESSAGE' | 'POST' | 'COMMENT' | 'LIVE', contentId: string, text: string, imageUrls: string[] = [], contextMessages: string[] = []) {
    if (!this.ready) return;
    if (text && text.trim().length >= 10 && !/^\[\[xt:/.test(text)) {
      this.enqueue(async () => {
        const v = await this.aiText(text, contextMessages, 12000);
        if (!v || !v.violation || v.confidence < 0.7) return;
        if (v.risk === 'LOW' && v.confidence < 0.85) return;
        const removed = v.risk !== 'LOW';
        if (removed) await this.removeContent(type, contentId);
        await this.record({ userId, type, contentId, excerpt: text, categories: v.categories, risk: v.risk, source: 'AUTO', confidence: v.confidence, reason: v.reason, applyPenalty: true, removed });
      });
    }
    for (const url of imageUrls.slice(0, 4)) {
      this.enqueue(async () => {
        const img = await this.loadMedia(url);
        if (!img) return;
        const v = await this.aiImage(img.data, img.mime);
        if (!v || !v.violation || v.confidence < 0.75) return;
        await this.removeContent(type, contentId);
        await this.record({ userId, type: 'IMAGE', contentId, excerpt: '[image] ' + url.slice(0, 120), categories: v.categories, risk: maxRisk(v.risk, 'MEDIUM'), source: 'AUTO', confidence: v.confidence, reason: v.reason, applyPenalty: true, removed: true });
      });
    }
  }

  scanAvatar(userId: string, photoUrl: string | null | undefined) {
    if (!this.ready || !photoUrl) return;
    this.enqueue(async () => {
      let img: { data: Buffer; mime: string } | null = null;
      const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(photoUrl);
      if (m) img = { mime: m[1], data: Buffer.from(m[2], 'base64') };
      else img = await this.loadMedia(photoUrl);
      if (!img) return;
      const v = await this.aiImage(img.data, img.mime);
      if (!v || !v.violation || v.confidence < 0.75) return;
      await this.prisma.profile.update({ where: { userId }, data: { photoUrl: null } }).catch(() => undefined);
      await this.record({ userId, type: 'IMAGE', excerpt: '[profile photo removed]', categories: v.categories, risk: maxRisk(v.risk, 'MEDIUM'), source: 'AUTO', confidence: v.confidence, reason: v.reason, applyPenalty: true, removed: true });
    });
  }

  private async loadMedia(url: string): Promise<{ data: Buffer; mime: string } | null> {
    const m = /\/media\/([0-9a-f-]{36})/i.exec(url);
    if (!m) return null;
    try { const rows = await this.prisma.$queryRawUnsafe<{ mime: string; data: Buffer }[]>(`SELECT mime, data FROM media_files WHERE id = $1::uuid`, m[1]); return rows[0] ? { data: rows[0].data, mime: rows[0].mime } : null; } catch { return null; }
  }

  private async removeContent(type: ContentType, id: string) {
    try {
      const now = new Date();
      if (type === 'MESSAGE') await this.prisma.message.update({ where: { id }, data: { deletedAt: now } });
      else if (type === 'POST') await this.prisma.post.update({ where: { id }, data: { deletedAt: now } });
      else if (type === 'COMMENT') await this.prisma.comment.update({ where: { id }, data: { deletedAt: now } });
      else if (type === 'LIVE') await this.prisma.$executeRaw`DELETE FROM live_stream_messages WHERE id = ${id}`;
    } catch (e) { this.log.warn('remove content failed: ' + (e as Error).message); }
  }

  // ---------- violations and penalties ----------
  async record(a: { userId: string; type: ContentType; contentId?: string; excerpt: string; categories: Category[]; risk: Risk; source: 'AUTO' | 'REPORT' | 'ADMIN'; confidence: number; reason: string; applyPenalty: boolean; removed?: boolean; reportId?: string; forceReview?: boolean }) {
    const id = randomUUID();
    const needsReview = a.forceReview || a.risk === 'HIGH' || a.risk === 'CRITICAL' || a.confidence < 0.7;
    await this.prisma.$executeRaw`INSERT INTO mod_violations (id, user_id, content_type, content_id, excerpt, categories, risk, source, confidence, reason, action, status, report_id) VALUES (${id}, ${a.userId}, ${a.type}, ${a.contentId ?? null}, ${a.excerpt.slice(0, 400)}, ${a.categories}::text[], ${a.risk}, ${a.source}, ${a.confidence}, ${a.reason}, 'NONE', ${needsReview ? 'PENDING_REVIEW' : 'ACTIVE'}, ${a.reportId ?? null})`;
    let action = 'NONE';
    if (a.applyPenalty) action = await this.applyLadder(a.userId, id, a.risk, a.categories, a.removed ?? false);
    await this.prisma.$executeRaw`UPDATE mod_violations SET action = ${action} WHERE id = ${id}`;
    return { id, action };
  }

  private async score(userId: string): Promise<{ score: number; high: number; critical: number }> {
    const rows = await this.prisma.$queryRaw<{ risk: string; created_at: Date }[]>`SELECT risk, created_at FROM mod_violations WHERE user_id = ${userId} AND status <> 'REVERSED' AND created_at > now() - interval '30 days'`;
    let score = 0, high = 0, critical = 0;
    for (const r of rows) { score += WEIGHT[r.risk as Risk] ?? 1; if (r.risk === 'HIGH') high++; if (r.risk === 'CRITICAL') critical++; }
    return { score, high, critical };
  }

  /** Graded penalties. The AI never bans for good: a repeat of serious cases is queued for a person to confirm. */
  private async applyLadder(userId: string, violationId: string, risk: Risk, cats: Category[], removed: boolean): Promise<string> {
    const s = await this.score(userId); // includes the violation just stored
    let kind: PenaltyKind; let hours: number | null = null;
    if (risk === 'CRITICAL') { kind = 'TEMP_SUSPEND'; hours = s.critical >= 2 ? 24 * 14 : 24 * 7; }
    else if (risk === 'HIGH') { kind = 'TEMP_SUSPEND'; hours = s.high >= 3 ? 24 * 7 : s.high === 2 ? 72 : 24; }
    else if (risk === 'MEDIUM') { if (s.score >= 8) { kind = 'TEMP_SUSPEND'; hours = 24; } else if (s.score >= 4) { kind = 'FEATURE_MUTE'; hours = 24; } else kind = 'WARNING'; }
    else { if (s.score >= 6) { kind = 'FEATURE_MUTE'; hours = 6; } else if (s.score >= 3) kind = 'FORMAL_WARNING'; else kind = 'WARNING'; }
    const pen = await this.createPenalty(userId, kind, hours, 'ai', violationId, this.cats(cats, 'en'));
    if (kind === 'TEMP_SUSPEND' && (s.critical >= 2 || s.high >= 3)) await this.prisma.$executeRaw`UPDATE mod_violations SET review_note = 'Repeated serious violations: a person should decide on a permanent ban.', status = 'PENDING_REVIEW' WHERE id = ${violationId}`;
    return kind + (removed ? '+REMOVED' : '') + (pen ? '' : '');
  }

  async createPenalty(userId: string, kind: PenaltyKind, hours: number | null, by: string, violationId: string | null, reasonText: string) {
    const id = randomUUID();
    const expires = hours ? new Date(Date.now() + hours * 3_600_000) : null;
    const setStatus = kind === 'TEMP_SUSPEND' || kind === 'PERM_BAN';
    await this.prisma.$executeRaw`INSERT INTO mod_penalties (id, user_id, kind, reason, violation_id, created_by, expires_at, set_status) VALUES (${id}, ${userId}, ${kind}, ${reasonText}, ${violationId}, ${by}, ${expires}, ${setStatus})`;
    if (setStatus) {
      await this.prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } }).catch(() => undefined);
      await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }).catch(() => undefined);
    }
    const lang = await this.lang(userId);
    const until = this.fmtUntil(expires, lang);
    const cEn = reasonText || 'community rules'; const cAr = reasonText ? reasonText : 'قواعد المجتمع';
    const t: Record<PenaltyKind, [[string, string], [string, string]]> = {
      WARNING: [['Warning', `Your content broke the community rules (${cEn}). Please keep the chat respectful.`], ['تحذير', `محتواك خالف قواعد المجتمع (${cAr}). من فضلك حافظ على احترام الآخرين.`]],
      FORMAL_WARNING: [['Official warning', `This is an official warning: repeated rule breaks (${cEn}). More violations will limit your account.`], ['إنذار رسمي', `هذا إنذار رسمي بسبب تكرار المخالفات (${cAr}). استمرار المخالفة سيقيّد حسابك.`]],
      FEATURE_MUTE: [['Posting paused', `You cannot send messages, posts or comments until ${until} (${cEn}). You can appeal.`], ['تم إيقاف النشر مؤقتاً', `لا يمكنك إرسال رسائل أو منشورات أو تعليقات حتى ${until} (${cAr}). يمكنك تقديم اعتراض.`]],
      TEMP_SUSPEND: [['Account suspended', `Your account is suspended until ${until} (${cEn}). You can appeal.`], ['تم إيقاف الحساب مؤقتاً', `تم إيقاف حسابك حتى ${until} (${cAr}). يمكنك تقديم اعتراض.`]],
      PERM_BAN: [['Account banned', `Your account was banned (${cEn}). You can appeal.`], ['تم حظر الحساب', `تم حظر حسابك (${cAr}). يمكنك تقديم اعتراض.`]],
    };
    const [en, ar] = t[kind];
    await this.notice(userId, kind, en, ar, { penaltyId: id });
    return id;
  }

  private async sweep() {
    if (!this.ready) return;
    try {
      const done = await this.prisma.$queryRaw<{ id: string; user_id: string; set_status: boolean }[]>`UPDATE mod_penalties SET active = false WHERE active AND expires_at IS NOT NULL AND expires_at <= now() RETURNING id, user_id, set_status`;
      for (const p of done) {
        if (!p.set_status) continue;
        const other = await this.prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM mod_penalties WHERE user_id = ${p.user_id} AND active AND set_status`;
        if ((other[0]?.n ?? 0) === 0) {
          await this.prisma.user.updateMany({ where: { id: p.user_id, status: 'SUSPENDED' }, data: { status: 'ACTIVE' } });
          await this.notice(p.user_id, 'RESTORED', ['Account active again', 'Your suspension ended. Please follow the community rules.'], ['تم تفعيل حسابك', 'انتهى الإيقاف. من فضلك التزم بقواعد المجتمع.']);
        }
      }
    } catch (e) { this.log.warn('sweep failed: ' + (e as Error).message); }
  }

  // ---------- reports ----------
  private async targetOfReport(r: { targetType: string; targetId: string; reporterId: string }): Promise<{ userId: string | null; text: string; images: string[]; context: string[]; note?: string } | null> {
    try {
      if (r.targetType === 'MESSAGE') {
        const m = await this.prisma.message.findUnique({ where: { id: r.targetId }, include: { attachments: true } });
        if (!m) return null;
        const member = await this.prisma.conversationMember.findFirst({ where: { conversationId: m.conversationId, userId: r.reporterId }, select: { userId: true } });
        if (!member) return { userId: null, text: '', images: [], context: [], note: 'Reporter is not part of this conversation' };
        const prev = await this.prisma.message.findMany({ where: { conversationId: m.conversationId, createdAt: { lt: m.createdAt }, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 5, select: { body: true, senderId: true } });
        return { userId: m.senderId, text: m.body ?? '', images: m.attachments.map((a) => a.url), context: prev.reverse().map((p) => (p.senderId === m.senderId ? 'reported user: ' : 'other: ') + (p.body ?? '')) };
      }
      if (r.targetType === 'POST') {
        const p = await this.prisma.post.findUnique({ where: { id: r.targetId }, include: { images: true } });
        return p ? { userId: p.authorId, text: p.body ?? '', images: p.images.map((i) => i.url), context: [] } : null;
      }
      if (r.targetType === 'COMMENT') {
        const c = await this.prisma.comment.findUnique({ where: { id: r.targetId }, include: { post: { select: { body: true } } } });
        return c ? { userId: c.authorId, text: c.body ?? '', images: [], context: ['post: ' + (c.post?.body ?? '').slice(0, 300)] } : null;
      }
      if (r.targetType === 'USER') {
        const u = await this.prisma.user.findUnique({ where: { id: r.targetId }, select: { id: true, username: true, profile: { select: { displayName: true, bio: true } } } });
        if (!u) return null;
        const msgs = await this.prisma.$queryRaw<{ body: string }[]>`SELECT m.body FROM "Message" m JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${r.reporterId} WHERE m."senderId" = ${u.id} AND m."deletedAt" IS NULL AND m.body IS NOT NULL AND m."createdAt" > now() - interval '7 days' ORDER BY m."createdAt" DESC LIMIT 5`.catch(() => [] as { body: string }[]);
        return { userId: u.id, text: [u.username, u.profile?.displayName, u.profile?.bio].filter(Boolean).join(' | ') + (msgs.length ? '\nRecent messages to the reporter:\n' + msgs.map((x) => '- ' + x.body).join('\n') : ''), images: [], context: [], note: msgs.length ? undefined : 'No recent messages between the two accounts to check' };
      }
      return { userId: null, text: '', images: [], context: [], note: 'This kind of report needs a person' };
    } catch (e) { this.log.warn('target lookup failed: ' + (e as Error).message); return null; }
  }

  /** Called after a report is saved. Never punishes for the report itself: the content is checked first. */
  processReport(reportId: string) {
    if (!this.ready) return;
    this.enqueue(async () => {
      const rep = await this.prisma.report.findUnique({ where: { id: reportId } });
      if (!rep || rep.status !== 'OPEN') return;
      const set = async (verdict: 'VALID' | 'INVALID' | 'NEEDS_REVIEW', o: { risk?: Risk; cats?: Category[]; conf?: number; reason?: string; note?: string; flagged?: boolean; dup?: boolean; target?: string | null }) => {
        await this.prisma.$executeRaw`INSERT INTO mod_report_meta (report_id, verdict, risk, categories, confidence, reason, note, reporter_flagged, duplicate, target_user_id) VALUES (${reportId}, ${verdict}, ${o.risk ?? null}, ${o.cats ?? []}::text[], ${o.conf ?? null}, ${o.reason ?? null}, ${o.note ?? null}, ${o.flagged ?? false}, ${o.dup ?? false}, ${o.target ?? null}) ON CONFLICT (report_id) DO UPDATE SET verdict = EXCLUDED.verdict, risk = EXCLUDED.risk, categories = EXCLUDED.categories, confidence = EXCLUDED.confidence, reason = EXCLUDED.reason, note = EXCLUDED.note, reporter_flagged = EXCLUDED.reporter_flagged, duplicate = EXCLUDED.duplicate, target_user_id = EXCLUDED.target_user_id, processed_at = now()`;
        const status = verdict === 'VALID' ? 'RESOLVED' : verdict === 'INVALID' ? 'DISMISSED' : 'UNDER_REVIEW';
        await this.prisma.report.update({ where: { id: reportId }, data: { status, ...(status !== 'UNDER_REVIEW' ? { resolvedAt: new Date(), resolvedById: 'ai' } : {}) } });
      };
      // Same reporter, same target, within a day: one piece of evidence, not two.
      const dup = await this.prisma.report.count({ where: { reporterId: rep.reporterId, targetType: rep.targetType, targetId: rep.targetId, id: { not: rep.id }, createdAt: { gt: new Date(Date.now() - 86_400_000) } } });
      if (dup > 0) return set('INVALID', { note: 'Duplicate of an earlier report by the same person (not counted as new evidence)', dup: true });
      // Reporter behaviour: many dismissed reports lately means a person should look at theirs.
      const stats = await this.prisma.$queryRaw<{ total: number; bad: number }[]>`SELECT count(*)::int AS total, count(*) FILTER (WHERE r.status = 'DISMISSED' AND COALESCE(m.duplicate, false) = false)::int AS bad FROM "Report" r LEFT JOIN mod_report_meta m ON m.report_id = r.id::text WHERE r."reporterId" = ${rep.reporterId} AND r."createdAt" > now() - interval '30 days' AND r.id <> ${rep.id}`.catch(() => [{ total: 0, bad: 0 }]);
      const flagged = (stats[0]?.bad ?? 0) >= 5 && (stats[0]?.bad ?? 0) >= 0.7 * (stats[0]?.total ?? 1);
      const tgt = await this.targetOfReport(rep);
      if (!tgt) return set('NEEDS_REVIEW', { note: 'Content not found or could not be loaded', flagged });
      if (!tgt.userId) return set('NEEDS_REVIEW', { note: tgt.note ?? 'Needs a person', flagged });
      if (tgt.userId === rep.reporterId) return set('INVALID', { note: 'Reporter and target are the same account', target: tgt.userId, flagged });
      const prior = await this.prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM mod_violations WHERE user_id = ${tgt.userId} AND status <> 'REVERSED' AND created_at > now() - interval '60 days'`;
      const text = tgt.text.trim();
      const sc = text ? scanText(text) : { hits: [], link: null, pii: null, scam: false };
      let v: Verdict | null = null;
      if (text) v = await this.aiText(`${text}\n\n(Reported reason: ${rep.reason}${rep.details ? ' / ' + rep.details.slice(0, 300) : ''}. The reporter's claim is not evidence by itself.)`, tgt.context, 15000);
      let imgV: Verdict | null = null;
      for (const url of tgt.images.slice(0, 2)) { const m = await this.loadMedia(url); if (m) { const x = await this.aiImage(m.data, m.mime); if (x?.violation && (!imgV || x.confidence > imgV.confidence)) imgV = x; } }
      const best = imgV && (!v || !v.violation) ? imgV : v;
      if (!best) {
        // No AI answer: rules only, and only a person can confirm.
        if (sc.hits.some((h) => h.strong) || sc.link || sc.scam) return set('NEEDS_REVIEW', { risk: 'MEDIUM', cats: sc.hits.map((h) => h.category), note: 'AI unavailable. Rules found risky wording.', target: tgt.userId, flagged });
        return set('NEEDS_REVIEW', { note: 'AI unavailable and no clear rule match', target: tgt.userId, flagged });
      }
      if (!best.violation && best.confidence >= 0.7) {
        return set('INVALID', { risk: best.risk, conf: best.confidence, reason: best.reason, note: `Checked the content and its context (${best.context}): no violation`, target: tgt.userId, flagged });
      }
      if (best.violation && best.confidence >= 0.8 && !flagged && (prior[0]?.n ?? 0) >= 0) {
        const removed = best.risk !== 'LOW';
        if (removed) await this.removeContent(rep.targetType as ContentType, rep.targetId);
        const rec = await this.record({ userId: tgt.userId, type: rep.targetType as ContentType, contentId: rep.targetId, excerpt: text, categories: best.categories, risk: best.risk, source: 'REPORT', confidence: best.confidence, reason: best.reason, applyPenalty: true, removed, reportId: rep.id });
        return set('VALID', { risk: best.risk, cats: best.categories, conf: best.confidence, reason: best.reason, note: 'Violation confirmed by checking the content. Action: ' + rec.action, target: tgt.userId, flagged });
      }
      return set('NEEDS_REVIEW', { risk: best.risk, cats: best.categories, conf: best.confidence, reason: best.reason, note: flagged ? 'Reporter has many dismissed reports lately: a person decides' : 'Not clear enough for an automatic decision', target: tgt.userId, flagged });
    });
  }

  // ---------- user side ----------
  async myNotices(userId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`SELECT id, kind, title, body, penalty_id AS "penaltyId", read, created_at AS "createdAt" FROM mod_notices WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50`;
    return { unread: rows.filter((r) => !r.read).length, notices: rows };
  }
  async readNotices(userId: string) { await this.prisma.$executeRaw`UPDATE mod_notices SET read = true WHERE user_id = ${userId} AND NOT read`; return { ok: true }; }

  async myStatus(userId: string) {
    const penalties = await this.prisma.$queryRaw<any[]>`SELECT p.id, p.kind, p.reason, p.expires_at AS "expiresAt", p.created_at AS "createdAt", (SELECT status FROM mod_appeals a WHERE a.penalty_id = p.id ORDER BY a.created_at DESC LIMIT 1) AS "appealStatus" FROM mod_penalties p WHERE p.user_id = ${userId} AND p.active AND p.kind <> 'WARNING' AND p.kind <> 'FORMAL_WARNING' AND (p.expires_at IS NULL OR p.expires_at > now()) ORDER BY p.created_at DESC`;
    return { penalties };
  }

  async appeal(userId: string, penaltyId: string, text: string) {
    const t = String(text ?? '').trim();
    if (t.length < 5 || t.length > 1000) throw new BadRequestException('Write between 5 and 1000 characters');
    const p = await this.prisma.$queryRaw<any[]>`SELECT id, user_id FROM mod_penalties WHERE id = ${penaltyId}`;
    if (!p[0] || p[0].user_id !== userId) throw new NotFoundException('Penalty not found');
    const open = await this.prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM mod_appeals WHERE penalty_id = ${penaltyId} AND status = 'OPEN'`;
    if ((open[0]?.n ?? 0) > 0) throw new BadRequestException('You already have an open appeal for this');
    const decided = await this.prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM mod_appeals WHERE penalty_id = ${penaltyId} AND status = 'REJECTED'`;
    if ((decided[0]?.n ?? 0) >= 2) throw new BadRequestException('This decision was already reviewed twice');
    const id = randomUUID();
    await this.prisma.$executeRaw`INSERT INTO mod_appeals (id, user_id, penalty_id, text) VALUES (${id}, ${userId}, ${penaltyId}, ${t})`;
    return { id, status: 'OPEN' };
  }

  async mute(userId: string, targetId: string) {
    if (userId === targetId) throw new BadRequestException('You cannot mute yourself');
    await this.prisma.$executeRaw`INSERT INTO user_mutes (user_id, muted_id) VALUES (${userId}, ${targetId}) ON CONFLICT DO NOTHING`; return { ok: true };
  }
  async unmute(userId: string, targetId: string) { await this.prisma.$executeRaw`DELETE FROM user_mutes WHERE user_id = ${userId} AND muted_id = ${targetId}`; return { ok: true }; }
  async mutedIds(userId: string): Promise<string[]> {
    if (!this.ready) return [];
    const r = await this.prisma.$queryRaw<{ muted_id: string }[]>`SELECT muted_id FROM user_mutes WHERE user_id = ${userId}`.catch(() => []);
    return r.map((x) => x.muted_id);
  }
  async mutedList(userId: string) {
    const ids = await this.mutedIds(userId);
    if (!ids.length) return [];
    return this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true } } } });
  }
  async hide(userId: string, type: string, id: string) {
    if (!['MESSAGE', 'POST', 'COMMENT'].includes(type)) throw new BadRequestException('Unsupported content type');
    await this.prisma.$executeRaw`INSERT INTO user_hidden_content (user_id, content_type, content_id) VALUES (${userId}, ${type}, ${id}) ON CONFLICT DO NOTHING`; return { ok: true };
  }
  async hiddenIds(userId: string, type: string): Promise<string[]> {
    if (!this.ready) return [];
    const r = await this.prisma.$queryRaw<{ content_id: string }[]>`SELECT content_id FROM user_hidden_content WHERE user_id = ${userId} AND content_type = ${type}`.catch(() => []);
    return r.map((x) => x.content_id);
  }

  // ---------- admin side ----------
  async stats() {
    const one = async <T>(p: Promise<T[]>) => (await p)[0];
    const r = await one(this.prisma.$queryRaw<any[]>`SELECT
      (SELECT count(*)::int FROM "Report") AS reports_total,
      (SELECT count(*)::int FROM "Report" WHERE status = 'OPEN') AS reports_new,
      (SELECT count(*)::int FROM "Report" WHERE status = 'UNDER_REVIEW') AS reports_review,
      (SELECT count(*)::int FROM "Report" WHERE status = 'RESOLVED') AS reports_valid,
      (SELECT count(*)::int FROM "Report" WHERE status = 'DISMISSED') AS reports_rejected,
      (SELECT count(DISTINCT user_id)::int FROM mod_penalties WHERE active AND kind = 'PERM_BAN') AS users_banned,
      (SELECT count(DISTINCT user_id)::int FROM mod_penalties WHERE active AND kind = 'TEMP_SUSPEND' AND (expires_at IS NULL OR expires_at > now())) AS users_suspended,
      (SELECT count(DISTINCT user_id)::int FROM mod_penalties WHERE active AND kind = 'FEATURE_MUTE' AND (expires_at IS NULL OR expires_at > now())) AS users_muted,
      (SELECT count(*)::int FROM mod_violations WHERE created_at > now() - interval '24 hours') AS violations_24h,
      (SELECT count(*)::int FROM mod_violations WHERE created_at > now() - interval '7 days') AS violations_7d,
      (SELECT count(*)::int FROM mod_violations WHERE status = 'PENDING_REVIEW') AS pending_review,
      (SELECT count(*)::int FROM mod_appeals WHERE status = 'OPEN') AS appeals_open,
      (SELECT count(*)::int FROM mod_report_meta WHERE reporter_flagged) AS flagged_reporters_reports,
      (SELECT count(*)::int FROM mod_security_events WHERE created_at > now() - interval '24 hours') AS security_events_24h`);
    return r;
  }

  violations(q: { user?: string; status?: string; risk?: string; limit?: number }) {
    const lim = Math.min(Math.max(q.limit ?? 50, 1), 200);
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT v.id, v.user_id AS "userId", u.username, v.content_type AS "contentType", v.content_id AS "contentId", v.excerpt, v.categories, v.risk, v.source, v.confidence, v.reason, v.action, v.status, v.review_note AS "reviewNote", v.created_at AS "createdAt" FROM mod_violations v LEFT JOIN "User" u ON u.id = v.user_id WHERE ($1::text IS NULL OR v.user_id = $1 OR u.username ILIKE '%' || $1 || '%') AND ($2::text IS NULL OR v.status = $2) AND ($3::text IS NULL OR v.risk = $3) ORDER BY v.created_at DESC LIMIT ${lim}`, q.user || null, q.status || null, q.risk || null);
  }

  async reviewQueue() {
    const violations = await this.violations({ status: 'PENDING_REVIEW', limit: 100 });
    const reports = await this.prisma.$queryRaw<any[]>`SELECT r.id, r."targetType", r."targetId", r.reason, r.details, r."createdAt", m.verdict, m.risk, m.categories, m.confidence, m.reason AS "aiReason", m.note, m.reporter_flagged AS "reporterFlagged", m.target_user_id AS "targetUserId" FROM "Report" r LEFT JOIN mod_report_meta m ON m.report_id = r.id::text WHERE r.status = 'UNDER_REVIEW' ORDER BY r."createdAt" ASC LIMIT 100`;
    return { violations, reports };
  }

  async reportsList(status?: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT r.id, r."targetType", r."targetId", r.reason, r.details, r.status, r."createdAt", r."resolvedAt", m.verdict, m.risk, m.categories, m.confidence, m.reason AS "aiReason", m.note, m.reporter_flagged AS "reporterFlagged", m.duplicate, ru.username AS "reporterUsername" FROM "Report" r LEFT JOIN mod_report_meta m ON m.report_id = r.id::text LEFT JOIN "User" ru ON ru.id = r."reporterId" WHERE ($1::text IS NULL OR r.status::text = $1) ORDER BY r."createdAt" DESC LIMIT 100`, status || null);
  }

  async decideViolation(adminId: string, id: string, decision: 'CONFIRM' | 'OVERTURN', note?: string) {
    const v = (await this.prisma.$queryRaw<any[]>`SELECT id, user_id, risk FROM mod_violations WHERE id = ${id}`)[0];
    if (!v) throw new NotFoundException('Violation not found');
    if (decision === 'OVERTURN') {
      await this.prisma.$executeRaw`UPDATE mod_violations SET status = 'REVERSED', reviewed_by = ${adminId}, reviewed_at = now(), review_note = ${note ?? 'Overturned by a person'} WHERE id = ${id}`;
      const pens = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM mod_penalties WHERE violation_id = ${id} AND active`;
      for (const p of pens) await this.liftPenalty(adminId, p.id, 'AI decision overturned');
    } else {
      await this.prisma.$executeRaw`UPDATE mod_violations SET status = 'ACTIVE', reviewed_by = ${adminId}, reviewed_at = now(), review_note = ${note ?? 'Confirmed by a person'} WHERE id = ${id}`;
    }
    return { ok: true };
  }

  async decideReport(adminId: string, reportId: string, verdict: 'VALID' | 'INVALID', note?: string) {
    const rep = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!rep) throw new NotFoundException('Report not found');
    if (verdict === 'VALID') {
      const tgt = await this.targetOfReport({ targetType: rep.targetType, targetId: rep.targetId, reporterId: rep.reporterId });
      if (tgt?.userId) {
        await this.removeContent(rep.targetType as ContentType, rep.targetId);
        await this.record({ userId: tgt.userId, type: rep.targetType as ContentType, contentId: rep.targetId, excerpt: tgt.text, categories: ['harassment'], risk: 'MEDIUM', source: 'ADMIN', confidence: 1, reason: note ?? rep.reason, applyPenalty: true, removed: true, reportId });
      }
    }
    await this.prisma.report.update({ where: { id: reportId }, data: { status: verdict === 'VALID' ? 'RESOLVED' : 'DISMISSED', resolvedAt: new Date(), resolvedById: adminId } });
    await this.prisma.$executeRaw`INSERT INTO mod_report_meta (report_id, verdict, note) VALUES (${reportId}, ${verdict}, ${note ?? 'Decided by a person'}) ON CONFLICT (report_id) DO UPDATE SET verdict = EXCLUDED.verdict, note = EXCLUDED.note, processed_at = now()`;
    return { ok: true };
  }

  penalties(q: { user?: string; active?: boolean }) {
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT p.id, p.user_id AS "userId", u.username, p.kind, p.reason, p.created_by AS "createdBy", p.expires_at AS "expiresAt", p.active, p.created_at AS "createdAt", p.lifted_by AS "liftedBy", p.lifted_at AS "liftedAt" FROM mod_penalties p LEFT JOIN "User" u ON u.id = p.user_id WHERE ($1::text IS NULL OR p.user_id = $1 OR u.username ILIKE '%' || $1 || '%') AND ($2::boolean IS NULL OR p.active = $2) ORDER BY p.created_at DESC LIMIT 100`, q.user || null, q.active ?? null);
  }

  async liftPenalty(adminId: string, penaltyId: string, reason?: string) {
    const p = (await this.prisma.$queryRaw<any[]>`UPDATE mod_penalties SET active = false, lifted_by = ${adminId}, lifted_at = now(), lift_reason = ${reason ?? null} WHERE id = ${penaltyId} AND active RETURNING user_id, set_status`)[0];
    if (!p) return { ok: true, note: 'Already inactive' };
    if (p.set_status) {
      const other = await this.prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM mod_penalties WHERE user_id = ${p.user_id} AND active AND set_status`;
      if ((other[0]?.n ?? 0) === 0) await this.prisma.user.updateMany({ where: { id: p.user_id, status: 'SUSPENDED' }, data: { status: 'ACTIVE' } });
    }
    return { ok: true };
  }

  async manualPenalty(adminId: string, role: string, userId: string, kind: PenaltyKind, hours: number | null, reason: string) {
    if (!['WARNING', 'FORMAL_WARNING', 'FEATURE_MUTE', 'TEMP_SUSPEND', 'PERM_BAN'].includes(kind)) throw new BadRequestException('Unknown penalty');
    if (kind === 'PERM_BAN' && role !== 'SUPER_ADMIN') throw new ForbiddenException('Only the owner can ban permanently');
    if ((kind === 'FEATURE_MUTE' || kind === 'TEMP_SUSPEND') && !(hours && hours > 0 && hours <= 24 * 365)) throw new BadRequestException('Hours required');
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) throw new NotFoundException('User not found');
    const id = await this.createPenalty(userId, kind, kind === 'PERM_BAN' || kind === 'WARNING' || kind === 'FORMAL_WARNING' ? null : hours, adminId, null, String(reason ?? '').slice(0, 200) || 'community rules');
    return { id };
  }

  appeals(status?: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT a.id, a.user_id AS "userId", u.username, a.penalty_id AS "penaltyId", p.kind AS "penaltyKind", p.reason AS "penaltyReason", a.text, a.status, a.admin_note AS "adminNote", a.created_at AS "createdAt", a.decided_at AS "decidedAt", (SELECT v.excerpt FROM mod_violations v WHERE v.id = p.violation_id) AS excerpt FROM mod_appeals a LEFT JOIN "User" u ON u.id = a.user_id LEFT JOIN mod_penalties p ON p.id = a.penalty_id WHERE ($1::text IS NULL OR a.status = $1) ORDER BY a.created_at DESC LIMIT 100`, status || null);
  }

  async decideAppeal(adminId: string, id: string, accept: boolean, note?: string) {
    const a = (await this.prisma.$queryRaw<any[]>`UPDATE mod_appeals SET status = ${accept ? 'ACCEPTED' : 'REJECTED'}, admin_note = ${note ?? null}, decided_by = ${adminId}, decided_at = now() WHERE id = ${id} AND status = 'OPEN' RETURNING user_id, penalty_id`)[0];
    if (!a) throw new BadRequestException('Appeal not found or already decided');
    if (accept) {
      await this.liftPenalty(adminId, a.penalty_id, 'Appeal accepted');
      await this.prisma.$executeRaw`UPDATE mod_violations SET status = 'REVERSED', reviewed_by = ${adminId}, reviewed_at = now(), review_note = 'Appeal accepted' WHERE id = (SELECT violation_id FROM mod_penalties WHERE id = ${a.penalty_id})`;
      await this.notice(a.user_id, 'APPEAL_ACCEPTED', ['Appeal accepted', 'We reviewed your appeal and removed the penalty. Sorry for the mistake.'], ['تم قبول الاعتراض', 'راجعنا اعتراضك وتم إلغاء العقوبة. نعتذر عن الخطأ.'], { appealId: id });
    } else {
      await this.notice(a.user_id, 'APPEAL_REJECTED', ['Appeal rejected', `We reviewed your appeal and the decision stays.${note ? ' ' + note : ''}`], ['تم رفض الاعتراض', `راجعنا اعتراضك وسيبقى القرار كما هو.${note ? ' ' + note : ''}`], { appealId: id });
    }
    return { ok: true };
  }

  async searchUsers(q: string) {
    const s = String(q ?? '').trim();
    if (!s) return [];
    const users = await this.prisma.user.findMany({
      where: { OR: [{ id: s.length === 36 ? s : '00000000-0000-0000-0000-000000000000' }, { username: { contains: s, mode: 'insensitive' } }, { email: { contains: s, mode: 'insensitive' } }, { profile: { displayName: { contains: s, mode: 'insensitive' } } }] },
      select: { id: true, username: true, email: true, status: true, profile: { select: { displayName: true } } }, take: 20,
    });
    const out: any[] = [];
    for (const u of users) {
      const c = await this.prisma.$queryRaw<{ v: number; p: number }[]>`SELECT (SELECT count(*)::int FROM mod_violations WHERE user_id = ${u.id} AND status <> 'REVERSED') AS v, (SELECT count(*)::int FROM mod_penalties WHERE user_id = ${u.id} AND active AND kind NOT IN ('WARNING','FORMAL_WARNING') AND (expires_at IS NULL OR expires_at > now())) AS p`;
      out.push({ ...u, violations: c[0]?.v ?? 0, activePenalties: c[0]?.p ?? 0 });
    }
    return out;
  }

  async userHistory(userId: string) {
    return { violations: await this.violations({ user: userId, limit: 100 }), penalties: await this.penalties({ user: userId }), events: await this.prisma.$queryRaw<any[]>`SELECT kind, detail, created_at AS "createdAt" FROM mod_security_events WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 30` };
  }

  securityEvents() { return this.prisma.$queryRaw<any[]>`SELECT e.id, e.user_id AS "userId", u.username, e.kind, e.detail, e.ip, e.created_at AS "createdAt" FROM mod_security_events e LEFT JOIN "User" u ON u.id = e.user_id ORDER BY e.created_at DESC LIMIT 100`; }
}
