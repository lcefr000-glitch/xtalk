// Black-box API checks for the new feature modules (friends, vocabulary, progress, courses, teachers, live).
// Runs against a dev server on :3100 with DEV_EXPOSE_TOKENS=true and seeded admin (ADMIN_EMAIL/ADMIN_PASSWORD).
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
const post = (p, b, t) => req('POST', p, b, t);
const get = (p, t) => req('GET', p, undefined, t);
const put = (p, b, t) => req('PUT', p, b, t);
const del = (p, t) => req('DELETE', p, undefined, t);

// --- two users (idempotent: register, or log in when a previous run already did) ---
const registerOrLogin = async (email, username, dob) => {
  const reg = await post('/auth/register', { email, username, password: 'passw0rd1', displayName: username, dateOfBirth: dob });
  if (reg.status === 201) return reg.body;
  const login = await post('/auth/login', { email, password: 'passw0rd1' });
  return login.status === 200 ? login.body : {};
};
const regA = { body: await registerOrLogin('xt3_ali@example.com', 'xt3_ali', '2000-01-01') };
const regB = { body: await registerOrLogin('xt3_sara@example.com', 'xt3_sara', '2000-06-01') };
ok(regA.body.accessToken && regB.body.accessToken, 'two users registered');
const a = regA.body.accessToken, b = regB.body.accessToken;
const aId = regA.body.user.id, bId = regB.body.user.id;
// clean slate for the friend flow
const existing = await get(`/friends/status/${bId}`, a);
if (existing.body.status === 'FRIENDS') await del(`/friends/${bId}`, a);
if (existing.body.requestId) await del(`/friends/requests/${existing.body.requestId}`, a);

// --- friends ---
const fr = await post('/friends/requests', { userId: bId }, a);
ok(fr.status === 201 && fr.body.status === 'PENDING', 'friend request sent');
const dupReq = await post('/friends/requests', { userId: bId }, a);
ok(dupReq.status === 409, 'duplicate friend request rejected');
const incoming = await get('/friends/requests/incoming', b);
ok(incoming.status === 200 && incoming.body.length === 1 && incoming.body[0].username === 'xt3_ali', 'incoming request visible to receiver');
const acc = await post(`/friends/requests/${fr.body.id}/accept`, {}, b);
ok(acc.status === 201 && acc.body.status === 'ACCEPTED', 'friend request accepted');
const st = await get(`/friends/status/${bId}`, a);
ok(st.body.status === 'FRIENDS', 'friendship status FRIENDS');
const friendList = await get('/friends', a);
ok(friendList.body.length === 1, 'friends list has one friend');
const notif = await get('/notifications', b);
ok(notif.status === 200, 'notifications list readable after friend request');
const unfriend = await del(`/friends/${bId}`, a);
ok(unfriend.status === 200, 'unfriend works');
const st2 = await get(`/friends/status/${bId}`, a);
ok(st2.body.status === 'NONE', 'status back to NONE after unfriend');

// --- vocabulary ---
const coll = await post('/vocab/collections', { name: 'Basics', languageCode: 'en' }, a);
ok(coll.status === 201 && coll.body.id, 'collection created');
const w1 = await post('/vocab/items', { term: 'apple', languageCode: 'en', translation: 'تفاحة', translationLanguageCode: 'ar', definition: 'a fruit', collectionId: coll.body.id }, a);
ok(w1.status === 201 && w1.body.kind === 'WORD', 'word saved with kind WORD');
const w2 = await post('/vocab/items', { term: 'good morning', languageCode: 'en', translation: 'صباح الخير' }, a);
ok(w2.status === 201 && w2.body.kind === 'EXPRESSION', 'multi-word term becomes EXPRESSION');
const w3 = await post('/vocab/items', { term: 'banana', languageCode: 'en', translation: 'موز' }, a);
const w4 = await post('/vocab/items', { term: 'orange', languageCode: 'en', translation: 'برتقال' }, a);
const items = await get('/vocab/items?language=en', a);
ok(items.body.total === 4, 'four words listed');
const search = await get('/vocab/items?q=appl', a);
ok(search.body.total === 1, 'search finds apple');
const due = await get('/vocab/review/due', a);
ok(due.body.length === 4, 'all new words due immediately');
const rev = await post(`/vocab/items/${w1.body.id}/review`, { quality: 5 }, a);
ok(rev.status === 201 && rev.body.intervalDays === 1, 'first review schedules +1 day');
const revFail = await post(`/vocab/items/${w2.body.id}/review`, { quality: 1 }, a);
ok(revFail.body.intervalDays === 0 && revFail.body.repetitions === 0, 'failed review resets');
const quiz = await get('/vocab/quiz?language=en&count=4', a);
ok(quiz.body.questions.length === 4 && quiz.body.questions[0].options.length >= 2, 'quiz returns questions with options');
const vstats = await get('/vocab/stats', a);
ok(vstats.body[0]?.total === 4, 'vocab stats by language');
const otherUserItem = await del(`/vocab/items/${w1.body.id}`, b);
ok(otherUserItem.status === 404, "cannot delete another user's word");

// --- progress ---
const prog = await get('/progress/me', a);
ok(prog.status === 200 && prog.body.totals.wordsSaved === 4, 'progress totals count saved words');
ok(prog.body.totals.reviewsDone === 2, 'progress counts reviews');
ok(prog.body.streakDays === 1, 'streak is 1 after activity today');
const firstWord = prog.body.achievements.find((x) => x.id === 'first-word');
ok(firstWord?.unlocked === true, 'first-word achievement unlocked');
const act = await post('/progress/activity', { practiceSeconds: 600 }, a);
ok(act.status === 201, 'client-reported practice time accepted');
const prog2 = await get('/progress/me', a);
ok(prog2.body.today.practiceSeconds === 600 && prog2.body.today.dailyGoalMinutes === 15, 'today practice time tracked');

// --- courses (admin authoring + learner flow) ---
const adminLogin = await post('/admin/login', { email: process.env.ADMIN_EMAIL ?? 'admin@xtalk.dev', password: process.env.ADMIN_PASSWORD ?? 'adminpass123' });
ok(adminLogin.status === 201 && adminLogin.body.accessToken, 'admin login works');
const admin = adminLogin.body.accessToken;
const course = await post('/admin/courses', { title: 'English for beginners', description: 'Start here', languageCode: 'en', level: 'BEGINNER', category: 'grammar', coverEmoji: '📗' }, admin);
ok(course.status === 201 && course.body.id, 'admin creates course');
const cid = course.body.id;
const l1 = await post(`/admin/courses/${cid}/lessons`, { title: 'Greetings', kind: 'VOCABULARY', content: '# Greetings\nHello, hi, good morning.', position: 0, durationMin: 10 }, admin);
const l2 = await post(`/admin/courses/${cid}/lessons`, { title: 'Introducing yourself', kind: 'SPEAKING', content: '# Intro\nMy name is...', position: 1, durationMin: 15 }, admin);
ok(l1.status === 201 && l2.status === 201, 'admin adds lessons');
const clash = await post(`/admin/courses/${cid}/lessons`, { title: 'Dup', kind: 'GRAMMAR', content: 'x', position: 0 }, admin);
ok(clash.status === 409, 'duplicate lesson position rejected');
const userCannotAuthor = await post('/admin/courses', { title: 'Nope', languageCode: 'en', level: 'BEGINNER' }, a);
ok(userCannotAuthor.status === 401, 'user token cannot author courses');
const list = await get('/courses?language=en', a);
ok(list.body.length === 1 && list.body[0].lesson_count === 2, 'course listed with lesson count');
const detail = await get(`/courses/${cid}`, a);
ok(detail.body.lessons.length === 2 && detail.body.enrolled === false, 'course detail with lessons');
const enr = await post(`/courses/${cid}/enroll`, {}, a);
ok(enr.status === 201 && enr.body.enrolled, 'enrolled');
const lesson = await get(`/courses/lessons/${l1.body.id}`, a);
ok(lesson.status === 200 && lesson.body.content.includes('Greetings'), 'lesson content readable');
const comp = await post(`/courses/lessons/${l1.body.id}/complete`, { score: 90 }, a);
ok(comp.status === 201 && comp.body.courseCompleted === false, 'lesson completed, course not yet');
const bm = await post(`/courses/lessons/${l1.body.id}/bookmark`, {}, a);
ok(bm.body.bookmarked === true, 'bookmark toggles on');
const comp2 = await post(`/courses/lessons/${l2.body.id}/complete`, {}, a);
ok(comp2.body.courseCompleted === true, 'course completes when all lessons done');
const enrList = await get('/courses/me/enrollments', a);
ok(enrList.body[0]?.completed_at, 'enrollment shows completion');
const lessonAch = (await get('/progress/me', a)).body.achievements.find((x) => x.id === 'lesson-1');
ok(lessonAch?.unlocked === true, 'lesson-1 achievement unlocked');

// --- teachers ---
const tp = await put('/teachers/me', { bio: 'Certified English teacher with 5 years of experience.', teachingLanguages: ['en'], qualifications: 'CELTA', experienceYears: 5, hourlyRateCents: 1500, availability: [{ weekday: 1, startMinute: 540, endMinute: 720 }] }, b);
ok(tp.status === 200 && tp.body.user_id === bId, 'teacher profile created');
const tsearch = await get('/teachers?language=en', a);
ok(tsearch.body.length === 1 && tsearch.body[0].avg_rating === 0, 'teacher searchable by language');
const startsAt = new Date(Date.now() + 26 * 3600_000).toISOString();
const bk = await post(`/teachers/${bId}/bookings`, { startsAt, durationMin: 60 }, a);
ok(bk.status === 201 && bk.body.priceCents === 1500, 'booking created with price');
const bkClash = await post(`/teachers/${bId}/bookings`, { startsAt, durationMin: 30 }, a);
ok(bkClash.status === 409, 'overlapping booking rejected');
const studentConfirm = await post(`/bookings/${bk.body.id}/confirm`, {}, a);
ok(studentConfirm.status === 403, 'student cannot confirm');
const confirmB = await post(`/bookings/${bk.body.id}/confirm`, {}, b);
ok(confirmB.body.status === 'CONFIRMED', 'teacher confirms');
const completeB = await post(`/bookings/${bk.body.id}/complete`, {}, b);
ok(completeB.body.status === 'COMPLETED', 'booking completed');
const rv = await post(`/bookings/${bk.body.id}/review`, { rating: 5, feedback: 'Great lesson!' }, a);
ok(rv.status === 201, 'review submitted');
const rvDup = await post(`/bookings/${bk.body.id}/review`, { rating: 4 }, a);
ok(rvDup.status === 409, 'second review rejected');
const tprof = await get(`/teachers/${bId}`, a);
ok(Number(tprof.body.avg_rating) === 5 && Number(tprof.body.review_count) === 1, 'rating aggregated on profile');
const verify = await post(`/admin/teachers/${bId}/verify`, { verified: true }, admin);
ok(verify.status === 201 && verify.body.verified === true, 'admin verifies teacher');
const verifiedOnly = await get('/teachers?language=en&verified=true', a);
ok(verifiedOnly.body.length === 1, 'verified filter works');

// --- live ---
const stream = await post('/live', { title: 'English practice live', category: 'practice', languageCode: 'en' }, a);
ok(stream.status === 201 && stream.body.stream.id, 'stream created');
ok(stream.body.hostToken === null && stream.body.mediaError?.includes('LIVEKIT'), 'host token 503 without LiveKit config (honest degradation)');
const sid = stream.body.stream.id;
const liveList = await get('/live?language=en', b);
ok(liveList.body.length === 1 && liveList.body[0].host_username === 'xt3_ali', 'live list shows stream');
const vt = await post(`/live/${sid}/token`, {}, b);
ok(vt.status === 503 || vt.status === 201, 'viewer token endpoint responds (503 without LiveKit config)');
const endByOther = await post(`/live/${sid}/end`, {}, b);
ok(endByOther.status === 403, 'non-host cannot end stream');
const end = await post(`/live/${sid}/end`, {}, a);
ok(end.status === 201 && end.body.status === 'ENDED', 'host ends stream');
const lateToken = await post(`/live/${sid}/token`, {}, b);
ok(lateToken.status === 404, 'ended stream rejects viewer tokens');
const msgs = await get(`/live/${sid}/messages`, a);
ok(msgs.status === 200 && Array.isArray(msgs.body), 'stream messages endpoint readable');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
