#!/usr/bin/env bash
# shellcheck disable=SC2016
set -Eeuo pipefail

ENV_FILE=".env"
BACKUP_FILE=""
TARGET_DB=""
RESTORE_PRODUCTION="NO"
YES="NO"
VERIFY_FIRST="YES"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="${2:-.env}"; shift 2 ;;
    --backup) BACKUP_FILE="${2:-}"; shift 2 ;;
    --target-database) TARGET_DB="${2:-}"; shift 2 ;;
    --restore-production) RESTORE_PRODUCTION="YES"; shift ;;
    --skip-verify) VERIFY_FIRST="NO"; shift ;;
    --yes) YES="YES"; shift ;;
    -h|--help) echo "Usage: bash scripts/restore_backup.sh --env-file ENV --backup FILE [--target-database DB | --restore-production] [--yes]"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$BACKUP_FILE" && -f "$BACKUP_FILE" ]] || { echo "Backup file not found. Use --backup FILE" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Env file not found: $ENV_FILE" >&2; exit 1; }
if [[ "$RESTORE_PRODUCTION" == "YES" && -n "$TARGET_DB" ]]; then
  echo "Choose either --target-database or --restore-production, not both." >&2
  exit 2
fi
if [[ "$RESTORE_PRODUCTION" != "YES" && -z "$TARGET_DB" ]]; then
  echo "A non-production --target-database is required unless --restore-production is explicitly set." >&2
  exit 2
fi

read_env() {
  local key="$1"
  if [[ -n "${!key:-}" ]]; then printf '%s' "${!key}"; return; fi
  awk -v key="$key" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    index($0, key "=") == 1 { value=substr($0, length(key)+2); gsub(/^[[:space:]]+|[[:space:]]+$/, "", value); if (value ~ /^".*"$/ || value ~ /^'\''.*'\''$/) value=substr(value,2,length(value)-2); print value; exit }
  ' "$ENV_FILE"
}

validate_db_name() {
  [[ "$1" =~ ^[A-Za-z0-9_][A-Za-z0-9_-]{0,62}$ ]] || { echo "Unsafe database name: $1" >&2; exit 1; }
}

confirm() {
  local message="$1"
  if [[ "$YES" == "YES" ]]; then return 0; fi
  echo "$message" >&2
  read -r -p "Type RESTORE to continue: " answer
  [[ "$answer" == "RESTORE" ]] || { echo "Restore cancelled." >&2; exit 1; }
}

PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-$(read_env BACKUP_ENCRYPTION_PASSPHRASE)}"
[[ -n "$PASSPHRASE" ]] || { echo "BACKUP_ENCRYPTION_PASSPHRASE is required" >&2; exit 1; }
COMPOSE=(docker compose -f docker-compose.production.yml --env-file "$ENV_FILE")
TMP_DIR="$(mktemp -d)"
PASSPHRASE_FILE="$TMP_DIR/passphrase"
DUMP_FILE="$TMP_DIR/restore.dump"
RESULT_JSON="${RESTORE_RESULT_JSON:-artifacts/restore/restore-result-$(date -u +%Y%m%dT%H%M%SZ).json}"
mkdir -p "$(dirname "$RESULT_JSON")"
chmod 700 "$TMP_DIR"
printf '%s' "$PASSPHRASE" > "$PASSPHRASE_FILE"
chmod 600 "$PASSPHRASE_FILE"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ -f "$BACKUP_FILE.sha256" ]]; then
  expected="$(awk '{print $1}' "$BACKUP_FILE.sha256")"
  actual="$(sha256sum "$BACKUP_FILE" | awk '{print $1}')"
  [[ "$expected" == "$actual" ]] || { echo "Backup checksum mismatch" >&2; exit 1; }
fi

if [[ "$VERIFY_FIRST" == "YES" ]]; then
  bash scripts/verify_backup.sh --env-file "$ENV_FILE" --backup "$BACKUP_FILE" >/dev/null
fi

openssl enc -d -aes-256-cbc -pbkdf2 -pass "file:$PASSPHRASE_FILE" -in "$BACKUP_FILE" -out "$DUMP_FILE"

restore_into_db() {
  local db="$1"
  validate_db_name "$db"
  "${COMPOSE[@]}" exec -T postgres sh -lc 'dropdb -U "$POSTGRES_USER" --if-exists "$1" && createdb -U "$POSTGRES_USER" "$1"' sh "$db"
  "${COMPOSE[@]}" exec -T postgres sh -lc 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-privileges' sh "$db" < "$DUMP_FILE"
}

if [[ "$RESTORE_PRODUCTION" == "YES" ]]; then
  PRODUCTION_DB="$(read_env POSTGRES_DB)"
  validate_db_name "$PRODUCTION_DB"
  checksum="$(sha256sum "$BACKUP_FILE" | awk '{print $1}')"
  echo "WARNING: production database restore is irreversible without another verified backup." >&2
  echo "Backup path: $BACKUP_FILE" >&2
  echo "Backup SHA-256: $checksum" >&2
  echo "Application write traffic will be stopped before replacement." >&2
  confirm "Confirm production database restore into '$PRODUCTION_DB'."
  "${COMPOSE[@]}" stop reverse-proxy worker api >/dev/null
  restore_into_db "$PRODUCTION_DB"
  "${COMPOSE[@]}" run --rm migrate
  "${COMPOSE[@]}" run --rm --no-deps api node dist/scripts/verify-audit-chain.js >/dev/null
  "${COMPOSE[@]}" run --rm --no-deps api node dist/scripts/verify-post-migration.js >/dev/null
  "${COMPOSE[@]}" up -d api worker web reverse-proxy >/dev/null
  restored_db="$PRODUCTION_DB"
else
  validate_db_name "$TARGET_DB"
  confirm "Restore backup into non-production database '$TARGET_DB'. Existing database with that name will be replaced."
  restore_into_db "$TARGET_DB"
  restored_db="$TARGET_DB"
fi

jq -n --arg ok true --arg backup "$BACKUP_FILE" --arg restoredDatabase "$restored_db" --arg production "$RESTORE_PRODUCTION" \
  '{ok:($ok=="true"),backup:$backup,restoredDatabase:$restoredDatabase,productionRestore:($production=="YES")}' > "$RESULT_JSON"
jq -c '.' "$RESULT_JSON"
