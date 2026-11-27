import * as tls from 'tls';
import * as crypto from 'crypto';

/** Minimal SMTP client (TLS on connect, AUTH LOGIN). Configured only by env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM. */
export function smtpConfigured(): boolean {
  return !!process.env.BREVO_API_KEY || !!(process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY) || !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** HTTPS mail API (Brevo). Env: BREVO_API_KEY, MAIL_FROM_EMAIL (verified sender), MAIL_FROM_NAME (optional). */
async function sendViaApi(to: string, subject: string, text: string): Promise<void> {
  if (/[\r\n]/.test(to + subject)) throw new Error('bad header');
  const email = process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER || '';
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email, name: process.env.MAIL_FROM_NAME || 'X Talk' }, to: [{ email: to }], subject, textContent: text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`mail api ${res.status} ${(await res.text()).slice(0, 120)}`);
}

/** Mailjet HTTPS API. Env: MAILJET_API_KEY, MAILJET_SECRET_KEY, MAIL_FROM_EMAIL (verified sender), MAIL_FROM_NAME. */
async function sendViaMailjet(to: string, subject: string, text: string): Promise<void> {
  if (/[\r\n]/.test(to + subject)) throw new Error('bad header');
  const email = process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER || '';
  const auth = Buffer.from(`${process.env.MAILJET_API_KEY}:${process.env.MAILJET_SECRET_KEY}`).toString('base64');
  const res = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify({ Messages: [{ From: { Email: email, Name: process.env.MAIL_FROM_NAME || 'X Talk' }, To: [{ Email: to }], Subject: subject, TextPart: text }] }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`mail api ${res.status} ${(await res.text()).slice(0, 120)}`);
}

export function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY && !process.env.BREVO_API_KEY) return sendViaMailjet(to, subject, text);
  if (process.env.BREVO_API_KEY) return sendViaApi(to, subject, text);
  const host = process.env.SMTP_HOST!;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;
  const from = process.env.SMTP_FROM || user;
  const fromAddr = (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
  if (/[\r\n]/.test(to + subject)) return Promise.reject(new Error('bad header'));
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: host }, () => {});
    sock.setTimeout(20000, () => { sock.destroy(); reject(new Error('smtp timeout')); });
    let buf = '';
    let step = 0;
    const b64 = (s: string) => Buffer.from(s).toString('base64');
    const msg = [
      `From: ${from}`, `To: ${to}`, `Subject: ${subject}`, `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@xtalk>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', 
      text.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..'), '',
    ].join('\r\n');
    const cmds: { send: string | null; ok: number }[] = [
      { send: null, ok: 220 }, { send: 'EHLO xtalk', ok: 250 }, { send: 'AUTH LOGIN', ok: 334 }, { send: b64(user), ok: 334 }, { send: b64(pass), ok: 235 },
      { send: `MAIL FROM:<${fromAddr}>`, ok: 250 }, { send: `RCPT TO:<${to}>`, ok: 250 }, { send: 'DATA', ok: 354 }, { send: msg + '\r\n.', ok: 250 }, { send: 'QUIT', ok: 221 },
    ];
    sock.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\r\n');
      if (lines.length < 2) return;
      const last = lines[lines.length - 2];
      if (!/^\d{3} /.test(last)) return; // multi-line reply not finished
      buf = '';
      const code = parseInt(last.slice(0, 3), 10);
      if (code !== cmds[step].ok) { sock.destroy(); return reject(new Error(`smtp step ${step} got ${code}`)); }
      step++;
      if (step >= cmds.length) { sock.end(); return resolve(); }
      sock.write(cmds[step].send + '\r\n');
    });
    sock.on('error', (e) => reject(e));
  });
}
