# X TaIk

A language exchange and social learning platform (Android + NestJS backend).

Phase 1 scope: monorepo, Docker Compose (PostgreSQL + Redis), NestJS + Prisma
foundation, authentication (JWT access + rotating refresh tokens), user
profiles, language management, and an Android app (Kotlin + Jetpack Compose)
with onboarding/authentication wired to the API.

## Layout

- `backend/` - NestJS + Prisma API (TypeScript)
- `android/` - Android app (Kotlin, Jetpack Compose, Hilt, Retrofit)
- `docker-compose.yml` - PostgreSQL 16 + Redis 7 for local development

## Quick start (backend)

```bash
cp backend/.env.example backend/.env
docker compose up -d                 # PostgreSQL + Redis
cd backend
npm install
npx prisma migrate deploy            # apply migrations
npm run prisma:seed                  # seed ISO 639-1 languages
npm run start:dev                    # http://localhost:3000  (docs at /docs)
```

See `docs/DEPLOY.md` for hosted deployment (Docker + Caddy HTTPS, Android release build).

## Quick start (Android)

Open `android/` in Android Studio (Hedgehog+), or CLI:

```bash
cd android
./gradlew assembleDebug
```

The app reads its API base URL from `API_BASE_URL` in `android/local.properties`
(default: `http://10.0.2.2:3000/` which reaches the host from an emulator).
On a physical device, set it to your machine's LAN IP, e.g.
`API_BASE_URL=http://192.168.1.20:3000/`.

## Environments

- Development: local Docker Compose, tokens logged to console (no SMTP).
- Staging / Production: see `backend/.env.example`; never commit secrets.

See `docs/PHASE1.md` for the full Phase 1 report (what was run/tested).
