#!/usr/bin/env bash
# shellcheck disable=SC2016
set -Eeuo pipefail

BACKUP_FILE=""
ENV_FILE=".env"
KEEP_VERIFY_DB="${KEEP_VERIFY_DB:-NO}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup) BACKUP_FILE="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-.env}"; shift 2 ;;
    --keep-db) KEEP_VERIFY_DB=YES; shift ;;
    -h|--help) echo "Usage: bash scripts/verify_backup.sh --backup FILE --env-file ENV_FILE"; exit 0 ;;
    *) if [[ -z "$BACKUP_FILE" ]]; then BACKUP_FILE="$1"; shift; else echo "Unknown option: $1" >&2; exit 2; fi ;;
  esac
done

[[ -n "$BACKUP_FILE" && -f "$BACKUP_FILE" ]] || { echo "Backup file not found. Use --backup FILE" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Env file not found: $ENV_FILE" >&2; exit 1; }

read_env() {
  local key="$1"
  if [[ -n "${!key:-}" ]]; then printf '%s' "${!key}"; return; fi
  awk -v key="$key" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    index($0, key "=") == 1 { value=substr($0, length(key)+2); gsub(/^[[:space:]]+|[[:space:]]+$/, "", value); if (value ~ /^".*"$/ || value ~ /^'\''.*'\''$/) value=substr(value,2,length(value)-2); print value; exit }
  ' "$ENV_FILE"
}

require_command() { command -v "$1" >/dev/null 2>&1 || { echo "Required command missing: $1" >&2; exit 1; }; }
for cmd in docker jq openssl sha256sum; do require_command "$cmd"; done
docker compose version >/dev/null

PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-$(read_env BACKUP_ENCRYPTION_PASSPHRASE)}"
[[ -n "$PASSPHRASE" ]] || { echo "BACKUP_ENCRYPTION_PASSPHRASE is required" >&2; exit 1; }
COMPOSE=(docker compose -f docker-compose.production.yml --env-file "$ENV_FILE")
VERIFY_DB="schoolhub_verify_$(date +%s)_$$"
TMP_DIR="$(mktemp -d)"
PASSPHRASE_FILE="$TMP_DIR/passphrase"
DUMP_FILE="$TMP_DIR/backup.dump"
RESULT_JSON="${VERIFY_BACKUP_RESULT_JSON:-artifacts/backup-verify/$(basename "$BACKUP_FILE").verify.json}"
mkdir -p "$(dirname "$RESULT_JSON")"
chmod 700 "$TMP_DIR"
printf '%s' "$PASSPHRASE" > "$PASSPHRASE_FILE"
chmod 600 "$PASSPHRASE_FILE"

cleanup() {
  set +e
  if [[ "$KEEP_VERIFY_DB" != "YES" ]]; then
    "${COMPOSE[@]}" exec -T postgres sh -lc 'dropdb -U "$POSTGRES_USER" --if-exists "$1"' sh "$VERIFY_DB" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

checksum_expected=""
if [[ -f "$BACKUP_FILE.sha256" ]]; then
  checksum_expected="$(awk '{print $1}' "$BACKUP_FILE.sha256")"
fi
checksum_actual="$(sha256sum "$BACKUP_FILE" | awk '{print $1}')"
if [[ -n "$checksum_expected" && "$checksum_expected" != "$checksum_actual" ]]; then
  echo "Backup checksum mismatch" >&2
  exit 1
fi

openssl enc -d -aes-256-cbc -pbkdf2 -pass "file:$PASSPHRASE_FILE" -in "$BACKUP_FILE" -out "$DUMP_FILE"
"${COMPOSE[@]}" exec -T postgres sh -lc 'createdb -U "$POSTGRES_USER" "$1"' sh "$VERIFY_DB"
"${COMPOSE[@]}" exec -T postgres sh -lc 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-privileges' sh "$VERIFY_DB" < "$DUMP_FILE"

# Representative row counts and structural checks against restored database.
counts_json="$("${COMPOSE[@]}" exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$1" -tAc "select json_build_object(\
  '\''users'\'', (select count(*) from \"User\"),\
  '\''sessions'\'', (select count(*) from \"Session\"),\
  '\''gateLogs'\'', (select count(*) from \"GateLog\"),\
  '\''auditEntries'\'', (select count(*) from \"AuditEntry\"),\
  '\''auditChainState'\'', (select count(*) from \"AuditChainState\"),\
  '\''migrationRows'\'', (select count(*) from _prisma_migrations)\
)::text"' sh "$VERIFY_DB" | tr -d '\r')"

database_url="$(read_env DATABASE_URL)"
if [[ "$database_url" == *\?* ]]; then
  database_url_prefix="${database_url%%\?*}"
  database_url_query="${database_url#*\?}"
  verify_url="${database_url_prefix%/*}/${VERIFY_DB}?${database_url_query}"
else
  verify_url="${database_url%/*}/${VERIFY_DB}"
fi
AUDIT_JSON="$("${COMPOSE[@]}" run --rm --no-deps -e DATABASE_URL="$verify_url" api node dist/scripts/verify-audit-chain.js | jq '.')"
POST_JSON="$("${COMPOSE[@]}" run --rm --no-deps -e DATABASE_URL="$verify_url" api node dist/scripts/verify-post-migration.js | jq '.')"

jq -n \
  --arg backup "$BACKUP_FILE" \
  --arg checksum "$checksum_actual" \
  --arg verifyDatabase "$VERIFY_DB" \
  --argjson counts "$counts_json" \
  --argjson audit "$AUDIT_JSON" \
  --argjson postMigration "$POST_JSON" \
  '{ok:($audit.ok == true and $postMigration.ok == true),backup:$backup,checksumSha256:$checksum,verifyDatabase:$verifyDatabase,rowCounts:$counts,auditVerification:$audit,postMigration:$postMigration}' > "$RESULT_JSON"

jq -c '.' "$RESULT_JSON"
[[ "$(jq -r '.ok' "$RESULT_JSON")" == "true" ]]
