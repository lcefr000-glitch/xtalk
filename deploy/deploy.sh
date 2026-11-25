#!/usr/bin/env bash
# Build and (re)start the production stack. Run from the repo root.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.prod ] || { echo "Create .env.prod first: cp .env.prod.example .env.prod"; exit 1; }
set -a; . ./.env.prod; set +a
case "${JWT_ACCESS_SECRET:-}" in CHANGE_ME*|"") echo "Set JWT_ACCESS_SECRET in .env.prod"; exit 1;; esac
case "${POSTGRES_PASSWORD:-}" in CHANGE_ME*|"") echo "Set POSTGRES_PASSWORD in .env.prod"; exit 1;; esac
[ "${DOMAIN:-}" != "api.example.com" ] || { echo "Set DOMAIN in .env.prod"; exit 1; }
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
echo "Waiting for health..."
for i in $(seq 1 30); do
  if curl -fsS "https://${DOMAIN}/api/v1/health" >/dev/null 2>&1; then echo "OK: https://${DOMAIN}/api/v1/health"; exit 0; fi
  sleep 5
done
echo "Not healthy yet. Check: docker compose -f docker-compose.prod.yml logs --tail=100 api caddy"; exit 1
