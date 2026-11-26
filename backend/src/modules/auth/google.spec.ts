import { generateKeyPairSync, createSign } from 'crypto';
import { AuthService } from './auth.service';

const b = (o: any) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

describe('google id token verify', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const svc: any = new AuthService({} as any, {} as any, {} as any);
  svc.googleKeys = async () => ({ k1: publicKey.export({ type: 'spki', format: 'pem' }) as string });
  const mk = (over: any = {}, key = privateKey) => {
    const h = b({ alg: 'RS256', kid: 'k1' });
    const p = b({ iss: 'accounts.google.com', aud: 'cid', exp: Math.floor(Date.now() / 1000) + 600, email: 'A@x.com', email_verified: true, ...over });
    const s = createSign('RSA-SHA256').update(`${h}.${p}`).sign(key).toString('base64url');
    return `${h}.${p}.${s}`;
  };
  beforeAll(() => { process.env.GOOGLE_CLIENT_ID = 'cid'; });
  it('accepts valid', async () => { expect((await svc.verifyGoogleIdToken(mk())).email).toBe('a@x.com'); });
  it('rejects wrong aud', async () => { await expect(svc.verifyGoogleIdToken(mk({ aud: 'other' }))).rejects.toThrow(); });
  it('rejects expired', async () => { await expect(svc.verifyGoogleIdToken(mk({ exp: 1 }))).rejects.toThrow(); });
  it('rejects unverified email', async () => { await expect(svc.verifyGoogleIdToken(mk({ email_verified: false }))).rejects.toThrow(); });
  it('rejects bad signature', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    await expect(svc.verifyGoogleIdToken(mk({}, other))).rejects.toThrow();
  });
});
