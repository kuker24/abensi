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
if [[ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]]; then
  OUT="$BACKUP_DIR/schoolhub-$TS.sql.gz.enc"
else
  OUT="$BACKUP_DIR/schoolhub-$TS.sql.gz"
fi
TMP_OUT="$OUT.tmp"
trap 'rm -f "$TMP_OUT"' EXIT

if [[ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]]; then
  docker compose -f docker-compose.production.yml --env-file "$ENV_FILE" exec -T postgres \
    sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -9 | \
    openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_ENCRYPTION_PASSPHRASE -out "$TMP_OUT"
  openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_PASSPHRASE -in "$TMP_OUT" | gunzip -t
else
  docker compose -f docker-compose.production.yml --env-file "$ENV_FILE" exec -T postgres \
    sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -9 > "$TMP_OUT"
  gunzip -t "$TMP_OUT"
fi
mv "$TMP_OUT" "$OUT"

find "$BACKUP_DIR" -type f \( -name 'schoolhub-*.sql.gz' -o -name 'schoolhub-*.sql.gz.enc' \) -mtime +"$RETENTION_DAYS" -delete

echo "Backup created: $OUT"
