// Black-box API checks against a running server on :3100 (dev tokens enabled).
const base = 'http://localhost:3100/api/v1';
let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name}`); } };

const j = async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) });
const post = (path, body, token) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }).then(j);
const get = (path, token) =>
  fetch(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {} }).then(j);
const patch = (path, body, token) =>
  fetch(base + path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).then(j);

// health
const health = await get('/health');
ok(health.status === 200 && health.body.db === 'up', 'health: db up');

// register
const reg = await post('/auth/register', {
  email: 'mona@example.com', username: 'mona_m', password: 'passw0rd1',
  displayName: 'Mona', dateOfBirth: '2001-03-15',
});
ok(reg.status === 201 && reg.body.accessToken && reg.body.refreshToken, 'register returns token pair');
ok(reg.body.devVerificationToken, 'dev verification token exposed (dev mode)');

// duplicate email -> 409
const dup = await post('/auth/register', {
  email: 'mona@example.com', username: 'mona_x', password: 'passw0rd1',
  displayName: 'Dup', dateOfBirth: '2001-03-15',
});
ok(dup.status === 409, 'duplicate email rejected with 409');

// underage -> 400
const kid = await post('/auth/register', {
  email: 'kid@example.com', username: 'kid_user', password: 'passw0rd1',
  displayName: 'Kid', dateOfBirth: '2020-01-01',
});
ok(kid.status === 400, 'underage registration rejected');

// email verification
const ver = await post('/auth/verify-email', { token: reg.body.devVerificationToken });
ok(ver.status === 200 && ver.body.success === true, 'email verification works');

// login wrong password -> 401
const badLogin = await post('/auth/login', { email: 'mona@example.com', password: 'wrongpass1' });
ok(badLogin.status === 401, 'wrong password rejected');

// login
const login = await post('/auth/login', { email: 'mona@example.com', password: 'passw0rd1' });
ok(login.status === 200 && login.body.user.emailVerified === true, 'login ok, email verified');
const access = login.body.accessToken;
const refresh = login.body.refreshToken;

// protected route requires token
const noAuth = await get('/users/me');
ok(noAuth.status === 401, 'users/me requires auth');

// me
const me = await get('/users/me', access);
ok(me.status === 200 && me.body.username === 'mona_m' && me.body.passwordHash === undefined, 'users/me sanitized');

// profile update
const prof = await patch('/profiles/me', { bio: 'Learning German!', country: 'eg', showLastActive: false }, access);
ok(prof.status === 200 && prof.body.country === 'EG' && prof.body.showLastActive === false, 'profile update normalizes country');

// languages catalogue (public)
const langs = await get('/languages?search=german');
ok(langs.status === 200 && langs.body.some((l) => l.code === 'de'), 'language catalogue seeded + searchable');

// add native + learning language
const native = await post('/users/me/languages', { code: 'ar', type: 'NATIVE', proficiency: 'NATIVE' }, access);
ok(native.status === 201 && native.body.type === 'NATIVE', 'native language set');
const learning = await post('/users/me/languages', { code: 'de', type: 'LEARNING', proficiency: 'BEGINNER', dailyMinutes: 30 }, access);
ok(learning.status === 201, 'learning language added with goal');
const dupLang = await post('/users/me/languages', { code: 'de', type: 'LEARNING', proficiency: 'BEGINNER' }, access);
ok(dupLang.status === 409, 'duplicate learning language rejected');
const myLangs = await get('/users/me/languages', access);
ok(myLangs.body.length === 2, 'two languages on profile');

// refresh rotation
const r1 = await post('/auth/refresh', { refreshToken: refresh });
ok(r1.status === 200 && r1.body.refreshToken !== refresh, 'refresh rotates token');
// reuse of old token -> family revoked
const reuse = await post('/auth/refresh', { refreshToken: refresh });
ok(reuse.status === 401, 'reused refresh token rejected');
// the rotated token from the same family must now also be dead (family revoked)
const famDead = await post('/auth/refresh', { refreshToken: r1.body.refreshToken });
ok(famDead.status === 401, 'reuse detection revoked whole family');

// password reset flow
const fp = await post('/auth/forgot-password', { email: 'mona@example.com' });
ok(fp.status === 200 && fp.body.devResetToken, 'forgot-password dev token exposed');
const rp = await post('/auth/reset-password', { token: fp.body.devResetToken, newPassword: 'newpass1234' });
ok(rp.status === 200, 'password reset ok');
const oldLogin = await post('/auth/login', { email: 'mona@example.com', password: 'passw0rd1' });
ok(oldLogin.status === 401, 'old password dead after reset');
const newLogin = await post('/auth/login', { email: 'mona@example.com', password: 'newpass1234' });
ok(newLogin.status === 200, 'new password works');

// logout revokes refresh
const out = await post('/auth/logout', { refreshToken: newLogin.body.refreshToken });
ok(out.status === 200, 'logout ok');
const afterOut = await post('/auth/refresh', { refreshToken: newLogin.body.refreshToken });
ok(afterOut.status === 401, 'refresh dead after logout');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
