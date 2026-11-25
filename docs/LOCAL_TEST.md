# Local test on a real Android phone (LAN)

1. Backend (Docker): `docker compose up -d` in the repo root, then in `backend/`:
   `cp .env.example .env` (set JWT_ACCESS_SECRET >= 32 chars), `npm ci`, `npx prisma migrate deploy`, `npm run build`, `node dist/main.js`.
   Check: `curl http://localhost:3000/api/v1/health` -> {"status":"ok","db":"up"}.
2. Phone and computer must be on the same Wi-Fi. Find the computer IP (Windows: `ipconfig`, Mac/Linux: `ip a` / `ifconfig`), e.g. 192.168.1.20.
   Allow port 3000 in the computer firewall. From the phone browser open http://192.168.1.20:3000/api/v1/health.
3. Install the debug APK. On the Login screen, type the Server URL `http://192.168.1.20:3000/` and tap Save, then fully close and reopen the app.
   (Debug builds allow http. Release builds require https.)
4. Register, log in, open Me/profile. Logs: `adb logcat | grep -i xtalk` and the backend terminal.
Emulator: no change needed, default is http://10.0.2.2:3000/.
