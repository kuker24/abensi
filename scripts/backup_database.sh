#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/schoolhub}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_DIR="${BACKUP_DIR:-/home/schoolhub/backups/database}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

cd "$ROOT_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/schoolhub-$TS.sql.gz"
TMP_OUT="$OUT.tmp"
trap 'rm -f "$TMP_OUT"' EXIT

docker compose -f docker-compose.production.yml --env-file "$ENV_FILE" exec -T postgres \
  sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -9 > "$TMP_OUT"

gunzip -t "$TMP_OUT"
mv "$TMP_OUT" "$OUT"

find "$BACKUP_DIR" -type f -name 'schoolhub-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "Backup created: $OUT"
