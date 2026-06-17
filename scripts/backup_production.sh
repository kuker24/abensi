#!/usr/bin/env bash
# shellcheck disable=SC2016
set -Eeuo pipefail

ENV_FILE="${1:-}"
if [[ -z "$ENV_FILE" || "$ENV_FILE" == --* ]]; then
  ENV_FILE="${ENV_FILE:-.env}"
else
  shift || true
fi
REASON="manual"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --reason) REASON="${2:-manual}"; shift 2 ;;
    -h|--help) echo "Usage: bash scripts/backup_production.sh ENV_FILE [--reason REASON]"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

[[ -f "$ENV_FILE" ]] || { echo "Env file not found: $ENV_FILE" >&2; exit 1; }

read_env() {
  local key="$1"
  if [[ -n "${!key:-}" ]]; then
    printf '%s' "${!key}"
    return
  fi
  awk -v key="$key" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    index($0, key "=") == 1 {
      value=substr($0, length(key)+2)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      if (value ~ /^".*"$/ || value ~ /^'\''.*'\''$/) value=substr(value, 2, length(value)-2)
      print value
      exit
    }
  ' "$ENV_FILE"
}

require_command() { command -v "$1" >/dev/null 2>&1 || { echo "Required command missing: $1" >&2; exit 1; }; }
for cmd in docker jq openssl sha256sum stat flock df; do require_command "$cmd"; done
docker compose version >/dev/null

BACKUP_DIR="${BACKUP_DIR:-$(read_env BACKUP_DIR)}"
BACKUP_DIR="${BACKUP_DIR:-/opt/schoolhub/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-$(read_env BACKUP_RETENTION_DAYS)}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
MIN_FREE_KB="${BACKUP_MIN_FREE_KB:-$(read_env BACKUP_MIN_FREE_KB)}"
MIN_FREE_KB="${MIN_FREE_KB:-1048576}"
PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-$(read_env BACKUP_ENCRYPTION_PASSPHRASE)}"
NOTIFY_HOOK="${BACKUP_NOTIFICATION_HOOK:-$(read_env BACKUP_NOTIFICATION_HOOK)}"
UPLOAD_HOOK="${BACKUP_UPLOAD_HOOK:-$(read_env BACKUP_UPLOAD_HOOK)}"

if [[ -z "$PASSPHRASE" ]]; then
  echo "BACKUP_ENCRYPTION_PASSPHRASE is required for production backups." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
free_kb="$(df -Pk "$BACKUP_DIR" | awk 'NR==2 {print $4}')"
if (( free_kb < MIN_FREE_KB )); then
  echo "Insufficient free disk for backup: ${free_kb}KB < ${MIN_FREE_KB}KB" >&2
  exit 1
fi

LOCK_FILE="$BACKUP_DIR/.schoolhub-backup.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another backup is already running (lock: $LOCK_FILE)." >&2
  exit 1
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
GIT_SHA="$(git rev-parse HEAD 2>/dev/null || printf 'unknown')"
OUT="$BACKUP_DIR/schoolhub-${TS}.dump.enc"
TMP_OUT="$OUT.tmp"
PASSPHRASE_FILE="$(mktemp)"
chmod 600 "$PASSPHRASE_FILE"
printf '%s' "$PASSPHRASE" > "$PASSPHRASE_FILE"
METADATA="$OUT.metadata.json"
CHECKSUM_FILE="$OUT.sha256"
COMPOSE=(docker compose -f docker-compose.production.yml --env-file "$ENV_FILE")

failure_notify() {
  local code=$?
  rm -f "$TMP_OUT" "$PASSPHRASE_FILE"
  if [[ -n "$NOTIFY_HOOK" ]]; then
    BACKUP_STATUS=failed BACKUP_REASON="$REASON" BACKUP_PATH="$OUT" bash -lc "$NOTIFY_HOOK" >/dev/null 2>&1 || true
  fi
  exit "$code"
}
trap failure_notify ERR
trap 'rm -f "$PASSPHRASE_FILE"' EXIT

"${COMPOSE[@]}" ps postgres >/dev/null
"${COMPOSE[@]}" exec -T postgres sh -lc 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -Fc -Z 0 -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -pass "file:$PASSPHRASE_FILE" -out "$TMP_OUT"

openssl enc -d -aes-256-cbc -pbkdf2 -pass "file:$PASSPHRASE_FILE" -in "$TMP_OUT" \
  | "${COMPOSE[@]}" exec -T postgres sh -lc 'pg_restore --list >/dev/null'

chmod 600 "$TMP_OUT"
mv "$TMP_OUT" "$OUT"
sha256sum "$OUT" > "$CHECKSUM_FILE"
chmod 600 "$CHECKSUM_FILE"
CHECKSUM="$(awk '{print $1}' "$CHECKSUM_FILE")"
SIZE_BYTES="$(stat -c '%s' "$OUT")"

jq -n \
  --arg ok true \
  --arg timestamp "$TS" \
  --arg reason "$REASON" \
  --arg gitSha "$GIT_SHA" \
  --arg path "$OUT" \
  --arg checksum "$CHECKSUM" \
  --arg checksumFile "$CHECKSUM_FILE" \
  --argjson sizeBytes "$SIZE_BYTES" \
  '{ok:($ok=="true"),timestamp:$timestamp,reason:$reason,gitSha:$gitSha,path:$path,checksumSha256:$checksum,checksumFile:$checksumFile,sizeBytes:$sizeBytes,encrypted:true,format:"pg_dump_custom"}' > "$METADATA"
chmod 600 "$METADATA"

# Cleanup only after a successful new backup. Simple daily retention; weekly/monthly copies can be kept by external upload/retention policy.
find "$BACKUP_DIR" -type f \( -name 'schoolhub-*.dump.enc' -o -name 'schoolhub-*.dump.enc.sha256' -o -name 'schoolhub-*.dump.enc.metadata.json' \) -mtime +"$RETENTION_DAYS" -delete

if [[ -n "$UPLOAD_HOOK" ]]; then
  BACKUP_STATUS=success BACKUP_PATH="$OUT" BACKUP_METADATA="$METADATA" bash -lc "$UPLOAD_HOOK"
fi
if [[ -n "$NOTIFY_HOOK" ]]; then
  BACKUP_STATUS=success BACKUP_PATH="$OUT" BACKUP_METADATA="$METADATA" bash -lc "$NOTIFY_HOOK" >/dev/null 2>&1 || true
fi

jq -c --arg metadataPath "$METADATA" '. + {metadataPath:$metadataPath}' "$METADATA"
