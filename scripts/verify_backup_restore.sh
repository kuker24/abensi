#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/schoolhub}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-/home/schoolhub/backups/database}"
BACKUP_FILE="${1:-}"
TEST_DB="${TEST_DB:-schoolhub_restore_test}"

if [[ -z "$BACKUP_FILE" ]]; then
  BACKUP_FILE="$(find "$BACKUP_DIR" -type f -name 'schoolhub-*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2- || true)"
fi

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found." >&2
  exit 1
fi

cd "$ROOT_DIR"
gunzip -t "$BACKUP_FILE"

docker compose -f docker-compose.production.yml --env-file "$ENV_FILE" exec -T postgres \
  sh -lc 'dropdb -U "$POSTGRES_USER" --if-exists "$1" && createdb -U "$POSTGRES_USER" "$1"' sh "$TEST_DB"

zcat "$BACKUP_FILE" | docker compose -f docker-compose.production.yml --env-file "$ENV_FILE" exec -T postgres \
  sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$1" >/dev/null' sh "$TEST_DB"

TABLE_COUNT="$(docker compose -f docker-compose.production.yml --env-file "$ENV_FILE" exec -T postgres \
  sh -lc 'psql -U "$POSTGRES_USER" "$1" -tAc "select count(*) from information_schema.tables where table_schema = '\''public'\'';"' sh "$TEST_DB" | tr -d '[:space:]')"

docker compose -f docker-compose.production.yml --env-file "$ENV_FILE" exec -T postgres \
  sh -lc 'dropdb -U "$POSTGRES_USER" --if-exists "$1"' sh "$TEST_DB"

if [[ "${TABLE_COUNT:-0}" -le 0 ]]; then
  echo "Restore verification failed: no tables restored." >&2
  exit 1
fi

echo "Backup restore verification passed: $BACKUP_FILE ($TABLE_COUNT tables)."
