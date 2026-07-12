#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT="${1:-scripts/backup_production.sh}"
[[ -f "$SCRIPT" ]] || { echo "Backup script not found: $SCRIPT" >&2; exit 1; }

require_text() {
  local description="$1"
  local pattern="$2"
  if ! grep -Fq -- "$pattern" "$SCRIPT"; then
    echo "Missing backup safety control: $description" >&2
    exit 1
  fi
}

forbidden_text() {
  local description="$1"
  local pattern="$2"
  if grep -Fq -- "$pattern" "$SCRIPT"; then
    echo "Unsafe backup pipeline remains: $description" >&2
    exit 1
  fi
}

require_text "mktemp requirement" 'for cmd in docker jq openssl sha256sum stat flock df mktemp cmp; do'
require_text "compose container lookup" 'POSTGRES_CONTAINER_ID="$("${COMPOSE[@]}" ps -q postgres)"'
require_text "container dump path" 'CONTAINER_DUMP_PATH="/tmp/schoolhub-backup-${RUN_ID}.dump"'
require_text "unique host encrypted temp file" 'TMP_OUT="$(mktemp "$BACKUP_DIR/.schoolhub-backup-${RUN_ID}.dump.enc.tmp.XXXXXX")"'
require_text "unique run identifier" 'RUN_ID="${TS}-$$-${RANDOM}${RANDOM}"'
require_text "container restrictive umask" '  umask 077'
require_text "custom format dump to container file" 'pg_dump -Fc -Z 0 -U "$POSTGRES_USER" -f "$1" "$POSTGRES_DB"'
require_text "host copy of container dump" 'docker cp "$POSTGRES_CONTAINER_ID:$CONTAINER_DUMP_PATH" "$HOST_DUMP_FILE"'
require_text "dump nonempty check" '[[ -s "$HOST_DUMP_FILE" ]]'
require_text "host decrypt verification output" 'openssl enc -d -aes-256-cbc -pbkdf2 -pass "file:$PASSPHRASE_FILE" -in "$TMP_OUT" -out "$HOST_VERIFY_FILE"'
require_text "byte comparison" 'cmp -s "$HOST_DUMP_FILE" "$HOST_VERIFY_FILE"'
require_text "container copy for restore format validation" 'docker cp "$HOST_VERIFY_FILE" "$POSTGRES_CONTAINER_ID:$CONTAINER_VERIFY_PATH"'
require_text "file-based pg_restore validation" 'pg_restore --list "$1" >/dev/null'
require_text "exit cleanup trap" "trap 'cleanup \"\$?\"' EXIT"
require_text "container temp cleanup" '"$CONTAINER_DUMP_PATH" "$CONTAINER_VERIFY_PATH"'
require_text "host temp cleanup" 'for path in "$TMP_OUT" "$HOST_DUMP_FILE" "$HOST_VERIFY_FILE" "$PASSPHRASE_FILE"; do'
forbidden_text "stdout pg_dump encryption stream" '  | openssl enc -aes-256-cbc -salt -pbkdf2 -pass "file:$PASSPHRASE_FILE" -out "$TMP_OUT"'
forbidden_text "stdin pg_restore validation stream" '  | "${COMPOSE[@]}" exec -T postgres sh -lc '\''pg_restore --list >/dev/null'\'''

echo "backup_production static safety checks passed"
