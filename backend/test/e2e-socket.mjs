// WebSocket (socket.io) e2e: auth, join, realtime message delivery, typing, read.
import { io } from 'socket.io-client';

const base = 'http://localhost:3100';
let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name}`); } };
const j = async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) });
const req = (method, path, body, token) =>
  fetch(base + '/api/v1' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(j);

const regA = await req('POST', '/auth/register', { email: 'ws_a@example.com', username: 'ws_a', password: 'passw0rd1', displayName: 'A', dateOfBirth: '2000-01-01' });
const regB = await req('POST', '/auth/register', { email: 'ws_b@example.com', username: 'ws_b', password: 'passw0rd1', displayName: 'B', dateOfBirth: '2000-01-01' });
const tokA = regA.body.accessToken, tokB = regB.body.accessToken;
const conv = await req('POST', '/conversations', { userId: regB.body.user.id }, tokA);
const convId = conv.body.id;

// unauthenticated socket must be rejected
const bad = io(base, { path: '/ws', auth: { token: 'bad-token' }, transports: ['websocket'], reconnection: false });
await new Promise((resolve) => {
  // engine.io connects first; the server must then drop the unauthorized socket
  bad.on('disconnect', (reason) => { ok(reason === 'io server disconnect', 'bad token rejected'); resolve(); });
  bad.on('connect_error', () => { ok(true, 'bad token rejected'); resolve(); });
  setTimeout(() => { ok(false, 'bad token rejected (timeout)'); bad.disconnect(); resolve(); }, 4000);
});

const sockA = io(base, { path: '/ws', auth: { token: tokA }, transports: ['websocket'] });
const sockB = io(base, { path: '/ws', auth: { token: tokB }, transports: ['websocket'] });
await Promise.all([
  new Promise((r) => sockA.on('connect', r)),
  new Promise((r) => sockB.on('connect', r)),
]);
ok(sockA.connected && sockB.connected, 'both sockets connect with JWT');

const ackA = await sockA.emitWithAck('conversation:join', { conversationId: convId });
const ackB = await sockB.emitWithAck('conversation:join', { conversationId: convId });
ok(ackA.ok && ackB.ok, 'both join conversation room');

// B must receive A's realtime message
const received = new Promise((resolve) => sockB.on('message:new', resolve));
const sendAck = await sockA.emitWithAck('message:send', { conversationId: convId, type: 'TEXT', body: 'ping over socket' });
ok(sendAck.ok && sendAck.message.body === 'ping over socket', 'socket send ack');
const msg = await Promise.race([received, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]).catch(() => null);
ok(msg && msg.body === 'ping over socket', 'realtime message delivered to peer');

// typing indicator
const typing = new Promise((resolve) => sockB.on('typing', resolve));
await sockA.emitWithAck('typing', { conversationId: convId });
const t = await Promise.race([typing, new Promise((r) => setTimeout(() => r(null), 4000))]);
ok(t && t.userId === regA.body.user.id, 'typing indicator delivered');

// read receipt
const readUpd = new Promise((resolve) => sockA.on('read:update', resolve));
await sockB.emitWithAck('read', { conversationId: convId });
const ru = await Promise.race([readUpd, new Promise((r) => setTimeout(() => r(null), 4000))]);
ok(ru && ru.userId === regB.body.user.id, 'read receipt delivered');

// presence event fired on connect
const presence = new Promise((resolve) => {
  const sockC = io(base, { path: '/ws', auth: { token: tokA }, transports: ['websocket'] });
  sockC.on('presence:online', (p) => { if (p.userId) { resolve(true); } sockC.disconnect(); });
  setTimeout(() => { sockC.disconnect(); resolve(false); }, 4000);
});
ok(await presence, 'presence:online broadcast');

sockA.disconnect(); sockB.disconnect();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
