import * as tls from 'tls';
import * as crypto from 'crypto';

/** Minimal SMTP client (TLS on connect, AUTH LOGIN). Configured only by env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM. */
export function smtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function sendMail(to: string, subject: string, text: string): Promise<void> {
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
