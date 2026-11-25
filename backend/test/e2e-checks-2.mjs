// Phase 2-8 API checks against the same dev server on :3100.
const base = 'http://localhost:3100/api/v1';
let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name}`); } };
const j = async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) });
const req = (method, path, body, token) =>
  fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(j);

const register = async (email, username, dob = '2000-05-05') => {
  const r = await req('POST', '/auth/register', { email, username, password: 'passw0rd1', displayName: username, dateOfBirth: dob });
  return r.body.accessToken;
};

// two adult users with complementary languages
const ali = await register('ali@example.com', 'ali_a');
const bert = await register('bert@example.com', 'bert_b');
await req('POST', '/users/me/languages', { code: 'ar', type: 'NATIVE', proficiency: 'NATIVE' }, ali);
await req('POST', '/users/me/languages', { code: 'de', type: 'LEARNING', proficiency: 'BEGINNER' }, ali);
await req('POST', '/users/me/languages', { code: 'de', type: 'NATIVE', proficiency: 'NATIVE' }, bert);
await req('POST', '/users/me/languages', { code: 'ar', type: 'LEARNING', proficiency: 'ELEMENTARY' }, bert);

// discovery
const search = await req('GET', '/discovery/search?native=de', undefined, ali);
ok(search.status === 200 && search.body.results.some((u) => u.username === 'bert_b'), 'discovery: find German natives');
const recs = await req('GET', '/discovery/recommendations', undefined, ali);
ok(recs.status === 200 && recs.body.results.some((u) => u.username === 'bert_b'), 'recommendations: complementary match');

// minor separation
const kidTok = await register('kid@example.com', 'kid_k', new Date(Date.now() - 14 * 365.25 * 86400000).toISOString().slice(0, 10));
const kidSearch = await req('GET', '/discovery/search', undefined, kidTok);
ok(kidSearch.status === 200 && kidSearch.body.results.every((u) => !['ali_a', 'bert_b'].includes(u.username)), 'minors never see adults');

// follows + notifications
const bertId = search.body.results.find((u) => u.username === 'bert_b').id;
const f = await req('POST', `/users/${bertId}/follow`, undefined, ali);
ok(f.status === 201 && f.body.following === true, 'follow works');
const notifs = await req('GET', '/notifications', undefined, bert);
ok(notifs.body.results.some((n) => n.type === 'NEW_FOLLOWER'), 'follower notification created');

// conversations + messages
const conv = await req('POST', '/conversations', { userId: bertId }, ali);
ok(conv.status === 201 && conv.body.id, 'conversation created');
const convId = conv.body.id;
const msg = await req('POST', `/conversations/${convId}/messages`, { type: 'TEXT', body: 'Hallo! Wie geht es dir?' }, ali);
ok(msg.status === 201 && msg.body.id, 'message sent');
const unread = await req('GET', '/conversations/unread-count', undefined, bert);
ok(unread.body.unread === 1, 'unread count = 1 for recipient');
const read = await req('POST', `/conversations/${convId}/read`, undefined, bert);
const unread2 = await req('GET', '/conversations/unread-count', undefined, bert);
ok(unread2.body.unread === 0, 'read resets unread count');
const edited = await req('PATCH', `/messages/${msg.body.id}`, { body: 'Hallo! Wie geht es dir? :)' }, ali);
ok(edited.status === 200 && edited.body.editedAt, 'message edit works');
const notMine = await req('PATCH', `/messages/${msg.body.id}`, { body: 'hijack' }, bert);
ok(notMine.status === 403, 'others cannot edit my message');

// translation without provider -> honest 503
const t = await req('POST', '/translate', { text: 'Hallo', target: 'ar' }, ali);
ok(t.status === 503, 'translate 503 without provider configured');
const det = await req('POST', '/translate/detect', { text: 'مرحبا بالعالم' }, ali);
ok(det.status === 201 || det.status === 200, 'detect endpoint answers');
ok(det.body.language === 'ar', 'script heuristic detects Arabic');

// corrections rule-based fallback
const corr = await req('POST', '/corrections', { text: 'i  like learning german', language: 'en' }, ali);
ok(corr.status === 201 && corr.body.correctedText.startsWith('I') && corr.body.provider === 'rules-fallback', 'rule-based correction works');

// moments
const post = await req('POST', '/posts', { body: 'My first moment!', languageCode: 'en' }, ali);
ok(post.status === 201, 'post created');
const feed = await req('GET', '/feed', undefined, bert);
ok(feed.status === 200 && feed.body.results.some((p) => p.body === 'My first moment!'), 'post visible in feed');
const comment = await req('POST', `/posts/${post.body.id}/comments`, { body: 'Nice!' }, bert);
ok(comment.status === 201, 'comment created');
const like = await req('POST', `/posts/${post.body.id}/like`, undefined, bert);
ok(like.status === 201 && like.body.liked, 'like works');
const postDetail = await req('GET', `/posts/${post.body.id}`, undefined, ali);
ok(postDetail.body._count.likes === 1 && postDetail.body._count.comments === 1, 'counters correct');

// report + admin flow
const rep = await req('POST', '/reports', { targetType: 'POST', targetId: post.body.id, reason: 'spam test' }, bert);
ok(rep.status === 201 && rep.body.status === 'OPEN', 'report filed');
const adminLogin = await req('POST', '/admin/login', { email: 'admin@xtalk.dev', password: 'adminpass123' });
ok(adminLogin.status === 201 && adminLogin.body.accessToken, 'admin login works');
const adminTok = adminLogin.body.accessToken;
const reports = await req('GET', '/admin/reports?status=OPEN', undefined, adminTok);
ok(reports.body.results.length >= 1, 'admin sees open reports');
const resolved = await req('POST', `/admin/reports/${rep.body.id}/resolve`, { action: 'DISMISS_REPORT', notes: 'test' }, adminTok);
ok(resolved.status === 201 && resolved.body.success, 'report resolved with audit action');
const stats = await req('GET', '/admin/stats', undefined, adminTok);
ok(stats.status === 200 && stats.body.users >= 3, 'admin stats work');
const noAdmin = await req('GET', '/admin/stats', undefined, ali);
ok(noAdmin.status === 403 || noAdmin.status === 401, 'regular users blocked from admin');

// voice rooms
const room = await req('POST', '/voice-rooms', { title: 'Arabic practice', languageCode: 'ar' }, ali);
ok(room.status === 201 && room.body.isLive, 'voice room created');
const joined = await req('POST', `/voice-rooms/${room.body.id}/join`, undefined, bert);
ok(joined.status === 201 && joined.body.role === 'LISTENER', 'join as listener');
const promote = await req('POST', `/voice-rooms/${room.body.id}/role`, { userId: bertId, role: 'SPEAKER' }, ali);
ok(promote.status === 201, 'host promotes to speaker');
const closedByOther = await req('POST', `/voice-rooms/${room.body.id}/close`, undefined, bert);
ok(closedByOther.status === 403, 'non-host cannot close room');
const closed = await req('POST', `/voice-rooms/${room.body.id}/close`, undefined, ali);
ok(closed.status === 201, 'host closes room');

// calls
const call = await req('POST', '/calls', { calleeId: bertId, type: 'AUDIO' }, ali);
ok(call.status === 201 && call.body.status === 'RINGING', 'call starts ringing');
const accepted = await req('POST', `/calls/${call.body.id}/accept`, undefined, bert);
ok(accepted.body.status === 'ONGOING', 'callee accepts');
const ended = await req('POST', `/calls/${call.body.id}/end`, undefined, ali);
ok(ended.body.status === 'ENDED', 'call ends');

// subscriptions
const sub = await req('GET', '/subscriptions/me', undefined, ali);
ok(sub.status === 200 && sub.body.plan === 'FREE', 'default FREE plan');
const ent = await req('GET', '/subscriptions/entitlements', undefined, ali);
ok(ent.body.features.includes('messaging'), 'entitlements listed');
const verify = await req('POST', '/subscriptions/google-play/verify', { productId: 'premium', purchaseToken: 'x' }, ali);
ok(verify.status === 503, 'billing verify honestly 503 without credentials');

// block severs messaging
const blocked = await req('POST', `/users/${bertId}/block`, undefined, ali);
ok(blocked.status === 201, 'block works');
const sendAfterBlock = await req('POST', `/conversations/${convId}/messages`, { type: 'TEXT', body: 'still there?' }, ali);
ok(sendAfterBlock.status === 403, 'blocked conversation refuses messages');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
