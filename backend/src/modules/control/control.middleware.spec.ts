import { controlMiddleware } from './control.middleware';

function run(state: any, path: string, headers: any = {}) {
  const mw = controlMiddleware({ state: async () => state } as any);
  let status = 0; let body: any; let nexted = false;
  const res: any = { status(c: number) { status = c; return this; }, json(b: any) { body = b; return this; } };
  return mw({ path, headers } as any, res, () => { nexted = true; }).then(() => ({ status, body, nexted }));
}
const open = { lockdown: false, message: '', minVersionCode: 0, validAfter: 0 };

describe('controlMiddleware', () => {
  it('passes when open', async () => expect((await run(open, '/api/v1/users')).nexted).toBe(true));
  it('locks api in lockdown with 503 LOCKED', async () => {
    const r = await run({ ...open, lockdown: true, message: 'x' }, '/api/v1/users');
    expect(r.status).toBe(503); expect(r.body.code).toBe('LOCKED');
  });
  it('keeps admin, status and health reachable in lockdown', async () => {
    for (const p of ['/api/v1/admin/login', '/api/v1/app/status', '/api/v1/health'])
      expect((await run({ ...open, lockdown: true }, p)).nexted).toBe(true);
  });
  it('blocks old or missing versions with 426', async () => {
    const s = { ...open, minVersionCode: 26 };
    expect((await run(s, '/api/v1/users')).status).toBe(426);
    expect((await run(s, '/api/v1/users', { 'x-app-version': '25' })).status).toBe(426);
    expect((await run(s, '/api/v1/users', { 'x-app-version': '26' })).nexted).toBe(true);
  });
});
