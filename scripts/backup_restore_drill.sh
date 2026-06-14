#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"
mkdir -p artifacts/backup-restore
strip_prisma_schema_param() {
  local url="$1"
  url="${url/\?schema=public/}"
  url="${url/&schema=public/}"
  printf '%s' "$url"
}
SOURCE_PG_URL="$(strip_prisma_schema_param "$DATABASE_URL")"
RESTORE_PG_URL="$(strip_prisma_schema_param "$RESTORE_DATABASE_URL")"
backup="artifacts/backup-restore/drill.sql.gz.enc"
pg_dump --dbname="$SOURCE_PG_URL" | gzip -9 | openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_ENCRYPTION_PASSPHRASE -out "$backup"
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_PASSPHRASE -in "$backup" | gunzip -t
psql "$RESTORE_PG_URL" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' >/dev/null
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_PASSPHRASE -in "$backup" | gunzip | psql "$RESTORE_PG_URL" -v ON_ERROR_STOP=1 >/dev/null
RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" DATABASE_URL="$RESTORE_DATABASE_URL" npm run audit:verify-chain
DATABASE_URL="$RESTORE_DATABASE_URL" npm run verify:post-migration -- --json=artifacts/backup-restore/post-restore-verify.json
printf '{"ok":true,"backup":"%s"}\n' "$backup" > artifacts/backup-restore/result.json
