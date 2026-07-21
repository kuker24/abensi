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
for cmd in docker jq openssl sha256sum stat flock df mktemp cmp; do require_command "$cmd"; done
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
RUN_ID="${TS}-$$-${RANDOM}${RANDOM}"
GIT_SHA="$(git rev-parse HEAD 2>/dev/null || printf 'unknown')"
OUT="$BACKUP_DIR/schoolhub-${TS}.dump.enc"
TMP_OUT=""
METADATA="$OUT.metadata.json"
CHECKSUM_FILE="$OUT.sha256"
COMPOSE=(docker compose -f docker-compose.production.yml --env-file "$ENV_FILE")
POSTGRES_CONTAINER_ID=""
CONTAINER_DUMP_PATH="/tmp/schoolhub-backup-${RUN_ID}.dump"
CONTAINER_VERIFY_PATH="/tmp/schoolhub-backup-${RUN_ID}.verify.dump"
HOST_DUMP_FILE=""
HOST_VERIFY_FILE=""
PASSPHRASE_FILE=""
BACKUP_PUBLISHED=false

if [[ -e "$OUT" || -e "$METADATA" || -e "$CHECKSUM_FILE" ]]; then
  echo "Backup output already exists for timestamp: $OUT" >&2
  exit 1
fi

TMP_OUT="$(mktemp "$BACKUP_DIR/.schoolhub-backup-${RUN_ID}.dump.enc.tmp.XXXXXX")"
chmod 600 "$TMP_OUT"
PASSPHRASE_FILE="$(mktemp "$BACKUP_DIR/.schoolhub-backup-${RUN_ID}.passphrase.XXXXXX")"
chmod 600 "$PASSPHRASE_FILE"
printf '%s' "$PASSPHRASE" > "$PASSPHRASE_FILE"

cleanup() {
  local code="$1"
  trap - EXIT
  set +e

  if [[ -n "$POSTGRES_CONTAINER_ID" ]]; then
    docker exec "$POSTGRES_CONTAINER_ID" sh -lc 'rm -f -- "$@"' sh \
      "$CONTAINER_DUMP_PATH" "$CONTAINER_VERIFY_PATH" >/dev/null 2>&1 || true
  fi

  for path in "$TMP_OUT" "$HOST_DUMP_FILE" "$HOST_VERIFY_FILE" "$PASSPHRASE_FILE"; do
    [[ -n "$path" ]] && rm -f -- "$path"
  done

  if (( code != 0 )) && [[ "$BACKUP_PUBLISHED" != true ]]; then
    rm -f -- "$OUT" "$METADATA" "$CHECKSUM_FILE"
  fi

  if (( code != 0 )) && [[ -n "$NOTIFY_HOOK" ]]; then
    BACKUP_STATUS=failed BACKUP_REASON="$REASON" BACKUP_PATH="$OUT" bash -lc "$NOTIFY_HOOK" >/dev/null 2>&1 || true
  fi

  exit "$code"
}
trap 'cleanup "$?"' EXIT

POSTGRES_CONTAINER_ID="$("${COMPOSE[@]}" ps -q postgres)"
if [[ -z "$POSTGRES_CONTAINER_ID" || "$POSTGRES_CONTAINER_ID" == *$'\n'* ]]; then
  echo "Expected exactly one running postgres container from Docker Compose." >&2
  exit 1
fi
if [[ "$(docker inspect --format '{{.State.Running}}' "$POSTGRES_CONTAINER_ID")" != true ]]; then
  echo "Postgres container is not running: $POSTGRES_CONTAINER_ID" >&2
  exit 1
fi

docker exec "$POSTGRES_CONTAINER_ID" sh -lc '
  umask 077
  export PGPASSWORD="$POSTGRES_PASSWORD"
  pg_dump -Fc -Z 0 -U "$POSTGRES_USER" -f "$1" "$POSTGRES_DB"
' sh "$CONTAINER_DUMP_PATH"

HOST_DUMP_FILE="$(mktemp "$BACKUP_DIR/.schoolhub-backup-${RUN_ID}.dump.XXXXXX")"
docker cp "$POSTGRES_CONTAINER_ID:$CONTAINER_DUMP_PATH" "$HOST_DUMP_FILE"
[[ -s "$HOST_DUMP_FILE" ]] || { echo "Postgres dump is empty after docker cp." >&2; exit 1; }

openssl enc -aes-256-cbc -salt -pbkdf2 -pass "file:$PASSPHRASE_FILE" -in "$HOST_DUMP_FILE" -out "$TMP_OUT"
[[ -s "$TMP_OUT" ]] || { echo "Encrypted backup is empty." >&2; exit 1; }

HOST_VERIFY_FILE="$(mktemp "$BACKUP_DIR/.schoolhub-backup-${RUN_ID}.verify.XXXXXX")"
openssl enc -d -aes-256-cbc -pbkdf2 -pass "file:$PASSPHRASE_FILE" -in "$TMP_OUT" -out "$HOST_VERIFY_FILE"
[[ -s "$HOST_VERIFY_FILE" ]] || { echo "Decrypted backup verification file is empty." >&2; exit 1; }
cmp -s "$HOST_DUMP_FILE" "$HOST_VERIFY_FILE" || { echo "Encrypted backup byte verification failed." >&2; exit 1; }

docker cp "$HOST_VERIFY_FILE" "$POSTGRES_CONTAINER_ID:$CONTAINER_VERIFY_PATH"
docker exec "$POSTGRES_CONTAINER_ID" sh -lc '
  chmod 600 "$1"
  pg_restore --list "$1" >/dev/null
' sh "$CONTAINER_VERIFY_PATH"

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
BACKUP_PUBLISHED=true

# Cleanup only after a successful new backup. Simple daily retention; weekly/monthly copies can be kept by external upload/retention policy.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'schoolhub-*.dump.enc' -o -name 'schoolhub-*.dump.enc.sha256' -o -name 'schoolhub-*.dump.enc.metadata.json' \) -mtime +"$RETENTION_DAYS" -delete

if [[ -n "$UPLOAD_HOOK" ]]; then
  BACKUP_STATUS=success BACKUP_PATH="$OUT" BACKUP_METADATA="$METADATA" bash -lc "$UPLOAD_HOOK"
fi
if [[ -n "$NOTIFY_HOOK" ]]; then
  BACKUP_STATUS=success BACKUP_PATH="$OUT" BACKUP_METADATA="$METADATA" bash -lc "$NOTIFY_HOOK" >/dev/null 2>&1 || true
fi

jq -c --arg metadataPath "$METADATA" '. + {metadataPath:$metadataPath}' "$METADATA"
