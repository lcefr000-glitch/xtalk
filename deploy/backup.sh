#!/usr/bin/env bash
# Dump the database to ./backups/xtalk-YYYYmmdd-HHMM.sql.gz  (run daily from cron)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
set -a; . ./.env.prod; set +a
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-xtalk}" "${POSTGRES_DB:-xtalk}" | gzip > "backups/xtalk-$(date +%Y%m%d-%H%M).sql.gz"
ls -1t backups | tail -n +15 | xargs -r -I{} rm -- "backups/{}"
