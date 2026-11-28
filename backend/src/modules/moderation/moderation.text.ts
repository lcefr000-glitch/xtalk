/** Text rules for the safety system: normalisation (Arabic and English, spelling tricks) and a fast first pass. Context is judged afterwards by the AI layer. */

export type Category = 'profanity' | 'insult' | 'sexual' | 'hate' | 'threat' | 'harassment' | 'scam' | 'link' | 'personal_info' | 'spam';
export type Risk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RuleHit { category: Category; term: string; risk: Risk; strong: boolean }

const AR_DIACRITICS = /[\u064B-\u065F\u0670\u0640\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '+': 't', '€': 'e', '£': 'l' };

/** Lower case, strip Arabic marks, unify letter forms, undo leet speak, collapse repeated letters. */
export function normalize(input: string): string {
  let s = (input ?? '').normalize('NFKC').toLowerCase().replace(AR_DIACRITICS, '');
  s = s.replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/گ/g, 'ك').replace(/پ/g, 'ب').replace(/چ/g, 'ج').replace(/ڤ/g, 'ف');
  s = s.replace(/[0-9@$!+€£]/g, (c) => (/[0-9]/.test(c) && /[a-z\u0600-\u06FF]/.test(s) ? LEET[c] ?? c : LEET[c] ?? c));
  s = s.replace(/(.)\1{1,}/g, '$1');
  return s;
}

/** Same, but with everything that is not a letter removed ("f.u.c.k" and "ك س م ك"). */
export function squash(input: string): string {
  return normalize(input).replace(/[^a-z\u0600-\u06FF]/g, '');
}

function tokens(input: string): string[] {
  return normalize(input).split(/[^a-z\u0600-\u06FF]+/).filter(Boolean);
}

interface Term { t: string; category: Category; risk: Risk; strong: boolean; sub?: boolean }
const T = (t: string, category: Category, risk: Risk, strong: boolean, sub = false): Term => ({ t: normalize(t), category, risk, strong, sub });

const TERMS: Term[] = [
  // English profanity (strong)
  T('fuck', 'profanity', 'MEDIUM', true, true), T('fucker', 'profanity', 'MEDIUM', true), T('motherfucker', 'profanity', 'MEDIUM', true, true), T('shit', 'profanity', 'MEDIUM', true),
  T('bitch', 'profanity', 'MEDIUM', true, true), T('asshole', 'profanity', 'MEDIUM', true, true), T('cunt', 'profanity', 'MEDIUM', true, true), T('dickhead', 'profanity', 'MEDIUM', true, true),
  T('bastard', 'profanity', 'MEDIUM', true), T('whore', 'profanity', 'MEDIUM', true), T('slut', 'profanity', 'MEDIUM', true), T('pussy', 'sexual', 'MEDIUM', true), T('wanker', 'profanity', 'MEDIUM', true),
  // English mild insults (need context)
  T('stupid', 'insult', 'LOW', false), T('idiot', 'insult', 'LOW', false), T('moron', 'insult', 'LOW', false), T('dumb', 'insult', 'LOW', false), T('loser', 'insult', 'LOW', false), T('ugly', 'insult', 'LOW', false), T('trash', 'insult', 'LOW', false), T('shutup', 'insult', 'LOW', false, true),
  // English hate
  T('nigger', 'hate', 'HIGH', true, true), T('nigga', 'hate', 'HIGH', true), T('faggot', 'hate', 'HIGH', true, true), T('kike', 'hate', 'HIGH', true), T('chink', 'hate', 'HIGH', true), T('retard', 'hate', 'MEDIUM', true), T('tranny', 'hate', 'HIGH', true), T('paki', 'hate', 'HIGH', true),
  // English sexual
  T('sendnudes', 'sexual', 'HIGH', true, true), T('nudes', 'sexual', 'MEDIUM', false), T('blowjob', 'sexual', 'MEDIUM', true, true), T('handjob', 'sexual', 'MEDIUM', true, true), T('porn', 'sexual', 'LOW', false), T('horny', 'sexual', 'MEDIUM', false), T('sexchat', 'sexual', 'MEDIUM', true, true),
  // Arabic strong profanity (Egyptian and Gulf), normalised forms
  T('كسمك', 'profanity', 'MEDIUM', true, true), T('كس امك', 'profanity', 'MEDIUM', true, true), T('كسم', 'profanity', 'MEDIUM', true), T('كس اختك', 'profanity', 'MEDIUM', true, true), T('متناك', 'profanity', 'MEDIUM', true, true), T('منيوك', 'profanity', 'MEDIUM', true, true),
  T('شرموطه', 'profanity', 'MEDIUM', true, true), T('شرموط', 'profanity', 'MEDIUM', true, true), T('عرص', 'profanity', 'MEDIUM', true), T('معرص', 'profanity', 'MEDIUM', true), T('خول', 'profanity', 'MEDIUM', true), T('قحبه', 'profanity', 'MEDIUM', true, true), T('لبوه', 'profanity', 'MEDIUM', true),
  T('ابن الكلب', 'profanity', 'MEDIUM', true, true), T('ابن الوسخه', 'profanity', 'MEDIUM', true, true), T('ابن المتناكه', 'profanity', 'MEDIUM', true, true), T('ابن الشرموطه', 'profanity', 'MEDIUM', true, true), T('ابن القحبه', 'profanity', 'MEDIUM', true, true), T('بنت الكلب', 'profanity', 'MEDIUM', true, true),
  T('يلعن', 'profanity', 'MEDIUM', true), T('ينعل', 'profanity', 'MEDIUM', true), T('زبي', 'sexual', 'MEDIUM', true), T('طيزك', 'sexual', 'MEDIUM', true), T('نيك', 'sexual', 'MEDIUM', false), T('انيكك', 'sexual', 'HIGH', true, true), T('سكس', 'sexual', 'MEDIUM', false), T('بزاز', 'sexual', 'MEDIUM', true),
  // Arabic mild insults (need context)
  T('حمار', 'insult', 'LOW', false), T('غبي', 'insult', 'LOW', false), T('حيوان', 'insult', 'LOW', false), T('كلب', 'insult', 'LOW', false), T('تافه', 'insult', 'LOW', false), T('وسخ', 'insult', 'LOW', false), T('زباله', 'insult', 'LOW', false), T('بهيم', 'insult', 'LOW', false), T('ياعبيط', 'insult', 'LOW', false), T('اهبل', 'insult', 'LOW', false), T('قذر', 'insult', 'LOW', false), T('حقير', 'insult', 'LOW', false),
  // Arabic hate
  T('يا عبد', 'hate', 'HIGH', false), T('يا يهودي', 'hate', 'MEDIUM', false), T('يا كافر', 'hate', 'MEDIUM', false), T('يا نصراني', 'hate', 'MEDIUM', false),
];

/** Threat and self-harm phrases, matched on the normalised text. */
const PHRASES: { re: RegExp; category: Category; risk: Risk; term: string }[] = [
  { re: /\b(i|ill|i will|im going to|gonna) (kill|murder|stab|shoot|rape|beat) (you|u|ya)\b/, category: 'threat', risk: 'CRITICAL', term: 'threat' },
  { re: /\b(kill|hang|off) yourself\b|\bkys\b|\bgo die\b|\bhope you die\b/, category: 'harassment', risk: 'HIGH', term: 'self-harm encouragement' },
  { re: /\bi know where you live\b|\bill find you\b|\bwatch your back\b/, category: 'threat', risk: 'HIGH', term: 'threat' },
  { re: /(هقتلك|هموتك|هدبحك|هذبحك|هفتحك|هقطعك|هحرقك|هفجرك|هغتصبك|هطخك|هضربك بالنار|اقتلك|راح اقتلك|بذبحك|بقتلك|رح موتك|رح اقتلك)/, category: 'threat', risk: 'CRITICAL', term: 'threat' },
  { re: /(اقتل نفسك|انتحر|روح موت|اشنق نفسك|يارب تموت|ياريت تموت|عساك تموت)/, category: 'harassment', risk: 'HIGH', term: 'self-harm encouragement' },
  { re: /(اعرف مكانك|اعرف بيتك|هلاقيك|هجيلك البيت)/, category: 'threat', risk: 'HIGH', term: 'threat' },
];

const SHORTENERS = ['bit.ly', 'tinyurl.com', 'goo.gl', 'is.gd', 'cutt.ly', 'shorturl.at', 'rb.gy', 'ow.ly', 'buff.ly', 'tiny.cc', 't.ly', 'rebrand.ly', 'bl.ink', 'v.gd'];
const BAD_TLDS = ['zip', 'mov', 'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'xyz', 'click', 'work', 'loan', 'country', 'kim'];
const SCAM = /(verify your account|confirm your (account|password)|your account (will be|has been) (suspended|locked)|send (me )?(money|gift ?card|bitcoin|crypto|usdt)|western union|investment opportunity|double your (money|coins)|free (coins|robux|vip|iphone)|you (have )?won|click (here|the link) to claim|whatsapp me to earn|earn \$?\d+ (daily|per day)|انقر على الرابط|اربح (الاف|الاف الدولارات|مجانا)|حول لي (فلوس|مبلغ|رصيد)|فلوس مجانا|كروت شحن|ادخل بياناتك|بيانات (بطاقتك|حسابك)|تحقق من حسابك|ربح مضمون|مضاعفه (الاموال|فلوسك))/;

export function findUrls(text: string): string[] {
  return (text.match(/\b((?:https?:\/\/|www\.)[^\s<>"']+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|me|co|ly|gl|app|xyz|top|zip|mov|tk|ml|ga|cf|gq|click|work|loan|info|biz|ru|cn)(?:\/[^\s<>"']*)?)/gi) ?? []);
}

export function unsafeLink(text: string): string | null {
  for (const raw of findUrls(text)) {
    const u = raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    const host = u.split(/[/?#:]/)[0];
    if (!host) continue;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return 'link to a raw IP address';
    if (host.includes('xn--')) return 'link with a disguised domain';
    if (SHORTENERS.includes(host)) return 'shortened link';
    const tld = host.split('.').pop() ?? '';
    if (BAD_TLDS.includes(tld)) return 'link to a high-risk domain';
    if (/(login|verify|secure|account|wallet|giveaway).*(\.|-)(com|net|org)$/.test(host) && host.split('.').length >= 3) return 'link that looks like a phishing page';
  }
  return null;
}

export function personalInfo(text: string): string | null {
  const t = text.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  if (/\b(?:\d[ -]?){15,16}\b/.test(t) && luhn(t.replace(/\D/g, '').slice(0, 19))) return 'card number';
  if (/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/.test(t)) return 'email address';
  if (/(\+?\d[\d\s-]{8,14}\d)/.test(t) && (t.match(/\d/g)?.length ?? 0) >= 9) return 'phone number';
  return null;
}

function luhn(d: string): boolean {
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0; let alt = false;
  for (let i = d.length - 1; i >= 0; i--) { let n = d.charCodeAt(i) - 48; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
  return sum % 10 === 0;
}

const EDU = /(what (does|is) .{0,40}mean|meaning of|translate|how do you say|how to say|is it (rude|offensive|bad)|معنى|يعني ايه|يعني اي|ترجمه|ترجم|ازاي اقول|كلمه|word|slang)/;

export function looksEducational(text: string): boolean { return EDU.test(normalize(text)); }

/** Fast first pass. Returns every hit; the service decides what to do with them. */
export function scanText(text: string): { hits: RuleHit[]; link: string | null; pii: string | null; scam: boolean } {
  const hits: RuleHit[] = [];
  const toks = tokens(text);
  const joined = ' ' + toks.join(' ') + ' ';
  const sq = squash(text);
  const seen = new Set<string>();
  const add = (h: RuleHit) => { const k = h.category + ':' + h.term; if (!seen.has(k)) { seen.add(k); hits.push(h); } };
  for (const t of TERMS) {
    const bare = t.t.replace(/\s+/g, '');
    const phrase = t.t.includes(' ');
    let hit = false;
    if (phrase) hit = joined.includes(" " + t.t + " ") || !!(t.sub && sq.includes(bare));
    else if (t.sub && bare.length >= 4) hit = sq.includes(bare) || toks.includes(t.t);
    else if (t.sub) hit = toks.some((x) => x === t.t || x.startsWith(t.t) && x.length <= t.t.length + 3);
    else hit = toks.includes(t.t) || toks.includes('ال' + t.t) || toks.some((x) => x.length > t.t.length && /[\u0600-\u06FF]/.test(x) && x.length <= t.t.length + 2 && (x.endsWith(t.t) && 'وبكلف'.includes(x[0]) || x.startsWith(t.t)));
    if (hit) add({ category: t.category, term: t.t, risk: t.risk, strong: t.strong });
  }
  const n = ' ' + normalize(text) + ' ';
  for (const p of PHRASES) if (p.re.test(n) || p.re.test(text.toLowerCase())) add({ category: p.category, term: p.term, risk: p.risk, strong: true });
  return { hits, link: unsafeLink(text), pii: personalInfo(text), scam: SCAM.test(text.toLowerCase()) || SCAM.test(normalize(text)) };
}

export const RISK_ORDER: Risk[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const maxRisk = (a: Risk, b: Risk): Risk => (RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b);
