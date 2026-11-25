# X TaIk - Phase 1 report

## What was built

Monorepo with backend (NestJS 10 + Prisma 5 + PostgreSQL) and Android app
(Kotlin 2.0.21, Jetpack Compose, Material 3, Hilt, Retrofit, DataStore, Room).

- Docker Compose: PostgreSQL 16 + Redis 7 (dev)
- Prisma schema: all 28 entities from the spec (User, Profile, Language,
  UserLanguage, LearningGoal, RefreshToken, verification/reset tokens,
  Conversation/Message family, Post family, Follow/Like/Notification,
  VoiceRoom/Call, Block/Report/AdminUser/ModerationAction, Subscription/
  PaymentTransaction) with UUID keys, FK constraints, indexes, soft deletes
- Initial migration generated from the schema (`prisma/migrations/0001_init`)
- Seed: 184 ISO 639-1 languages with native names and RTL flags
- Auth: register (age-gated 13+, minor flag), login, email verification,
  forgot/reset password, JWT access tokens (15 min), rotating opaque refresh
  tokens (30 days) with reuse detection that revokes the whole token family,
  logout / logout-all, account soft delete
- Profiles: get/update (bio, country ISO alpha-2, interests, privacy flags,
  interface language)
- Languages: public searchable catalogue; per-user native (exactly one) +
  learning languages with proficiency and daily goals
- Security: helmet, global rate limiting (auth routes stricter), argon2id
  hashing, refresh tokens stored hashed only, uniform anti-enumeration
  responses on resend/forgot, Prisma P2002 -> 409 mapping, global validation
- Swagger docs at /docs, health check at /api/v1/health
- Android: splash -> onboarding -> login/register (validated client-side,
  same rules as backend) -> email verification -> language selection
  (public catalogue, native vs learning exclusivity) -> learning goals ->
  home shell with 5 tabs. Profile tab loads the real profile (Room-cached),
  edits bio/country, logs out. Token rotation on 401 via OkHttp
  authenticator. Dark/light Material 3 theme, RTL-ready.

## What was actually executed (in this build environment)

- Backend unit tests: 25/25 passed (jest)
- Backend e2e against REAL PostgreSQL 19 (embedded): migrations applied,
  184 languages seeded, 25/25 API checks passed (register, duplicates,
  age gate, verify-email, login, profile, languages, refresh rotation,
  reuse-detection family revocation, password reset, logout)
- `nest build`: clean
- Android unit tests: 12/12 passed (validators, auth VM, language VM)
- `assembleDebug`: app-debug.apk built (debug-signed, installable)

## What was NOT done (honest limits)

- App was never run on an emulator or device (none available here): no
  Compose UI tests, no runtime verification of screens
- Docker Compose file is untested (no Docker here); the same Postgres
  version family was exercised via embedded PG instead
- Email sending is dev-mode logging only (DEV_EXPOSE_TOKENS=true returns
  tokens in API responses; turn OFF outside dev)
- APK is debug-signed; release signing setup is a Phase 9 item
- Redis is provisioned but not yet used by the backend (reserved for
  Phase 2+ caching/rate-limit storage)
- Android uses cleartext HTTP for LAN dev; add a network security config
  before any real deployment

## Run it

Backend:
```
docker compose up -d
cd backend && cp .env.example .env
npm install
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev
```

Android: open android/ in Android Studio, or `./gradlew assembleDebug`.
Set API_BASE_URL in android/local.properties (default http://10.0.2.2:3000/;
on a physical device use your PC's LAN IP, e.g. http://192.168.1.20:3000/).
