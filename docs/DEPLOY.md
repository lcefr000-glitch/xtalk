# X TaIk: deploy online (VPS, about 20 minutes)

Stack: Caddy (automatic HTTPS) -> NestJS API -> Postgres 16 + Redis 7, all in Docker.
Not deployed by us: you need a server and a domain. Nothing here has been run on a live host yet.

## 1. Get a server and a domain
- Any cheap VPS with Ubuntu 22.04/24.04 and 2 GB RAM (Hetzner CX22, DigitalOcean, Contabo, etc.).
- A domain or subdomain, for example `api.yourdomain.com`. Add a DNS **A record** pointing to the server IP.
  Wait until `ping api.yourdomain.com` shows the server IP (HTTPS certificates need this).
- Open ports 80 and 443 (UFW: `ufw allow 80,443/tcp && ufw allow 443/udp && ufw allow OpenSSH && ufw enable`).

## 2. Install Docker
```bash
curl -fsSL https://get.docker.com | sh
```

## 3. Put the code on the server
```bash
python3 XTaIk-source-installer-v2.py      # creates ./xtalk-src
cd xtalk-src
```

## 4. Configure
```bash
cp .env.prod.example .env.prod
sed -i "s/CHANGE_ME_openssl_rand_hex_32/$(openssl rand -hex 32)/" .env.prod
sed -i "s/CHANGE_ME_openssl_rand_hex_24/$(openssl rand -hex 24)/" .env.prod
nano .env.prod        # set DOMAIN, ACME_EMAIL, optionally ADMIN_EMAIL / ADMIN_PASSWORD
```
Keep `DEV_EXPOSE_TOKENS=false`. The API refuses to start in production with a weak `JWT_ACCESS_SECRET`.

## 5. Start (builds the image, runs migrations, starts everything)
```bash
./deploy/deploy.sh
./deploy/seed.sh      # loads the language list (and the admin user if ADMIN_* is set)
```
Check: `https://api.yourdomain.com/api/v1/health` returns OK. API docs: `/docs`.

## 6. Build the Android release app pointing at your server
On your computer, with the Android SDK / Android Studio:
```bash
cd android
PROD_API_BASE_URL=https://api.yourdomain.com/ ./gradlew :app:assembleRelease
# APK: app/build/outputs/apk/release/app-release.apk
```
- Release builds accept only `https://` (the build fails otherwise) and block cleartext traffic.
  Realtime chat uses the same host over `wss://` automatically.
- Debug builds keep using `API_BASE_URL` from `android/local.properties` (default `http://10.0.2.2:3000/`).
- Signing: with no keystore the release APK is signed with the debug key (fine for sideloading/testing,
  not for Google Play). For Play, create a keystore and set `XTALK_KEYSTORE`, `XTALK_KEYSTORE_PASSWORD`,
  `XTALK_KEY_ALIAS`, `XTALK_KEY_PASSWORD` before building (use `bundleRelease` for an .aab).

## Operations
- Logs: `docker compose -f docker-compose.prod.yml logs -f api`
- Update after code changes: `./deploy/deploy.sh` (migrations run automatically on every deploy)
- Backup: `./deploy/backup.sh` (add to cron: `0 3 * * * /path/to/xtalk-src/deploy/backup.sh`)
- Restore: `gunzip -c backups/FILE.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U xtalk xtalk`

## Render / Railway / Fly style hosts instead of a VPS
Skip Caddy and `docker-compose.prod.yml`; the platform provides HTTPS.
1. Create a Postgres database on the host and copy its connection string into `DATABASE_URL`.
2. Create a web service from `backend/Dockerfile` (root directory `backend`), port 3000.
3. Environment: `NODE_ENV=production`, `JWT_ACCESS_SECRET` (random 32+ chars), `DATABASE_URL`, `TRUST_PROXY=1`,
   `DEV_EXPOSE_TOKENS=false`, plus optional keys from `.env.prod.example`.
4. Pre-deploy / start command: `npx prisma migrate deploy && node dist/main.js`.
5. Run once from the host shell: `npx tsx prisma/seed.ts`.
6. Health check path: `/api/v1/health`. WebSockets must be enabled (Render and Railway allow them by default).
7. Redis is optional today (the backend does not use it yet).
Use the public `https://...` URL as `PROD_API_BASE_URL` for the Android build.

## Known gaps before a public launch
- **No email sender.** The backend has no mail provider, so verification and password-reset tokens are not
  delivered when `DEV_EXPOSE_TOKENS=false`. Login does not depend on verified email, but users cannot
  verify or reset by email until an SMTP/API mailer is added.
- **Live voice audio** needs a WebRTC media server (for example LiveKit). Rooms, roles and signalling work; audio does not yet.
- Google Play Billing needs `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` and a Play Console listing.
- Android release shrinking (R8) is off because it is not tested on a device.
