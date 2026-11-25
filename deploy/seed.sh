#!/usr/bin/env bash
# Seed languages (+ first admin if ADMIN_EMAIL/ADMIN_PASSWORD are set in .env.prod). Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm api npx tsx prisma/seed.ts
