#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE=".env"
TARGET_SHA=""
TARGET_EVIDENCE=""
YES="NO"
DRY_RUN="NO"
RESTORE_DATABASE="NO"
BACKUP_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="${2:-.env}"; shift 2 ;;
    --target-sha) TARGET_SHA="${2:-}"; shift 2 ;;
    --target-evidence) TARGET_EVIDENCE="${2:-}"; shift 2 ;;
    --yes) YES="YES"; shift ;;
    --dry-run) DRY_RUN="YES"; shift ;;
    --restore-database) RESTORE_DATABASE="YES"; shift ;;
    --backup) BACKUP_FILE="${2:-}"; shift 2 ;;
    -h|--help) echo "Usage: bash scripts/rollback_production.sh --env-file ENV (--target-sha SHA | --target-evidence FILE) [--yes] [--dry-run] [--restore-database --backup FILE]"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

[[ -f "$ENV_FILE" ]] || { echo "Env file not found: $ENV_FILE" >&2; exit 1; }
if [[ -n "$TARGET_EVIDENCE" ]]; then
  [[ -f "$TARGET_EVIDENCE" ]] || { echo "Target evidence not found: $TARGET_EVIDENCE" >&2; exit 1; }
  TARGET_SHA="$(jq -r '.endingSha // empty' "$TARGET_EVIDENCE")"
fi
[[ -n "$TARGET_SHA" ]] || { echo "Explicit --target-sha or --target-evidence is required." >&2; exit 1; }
if [[ "$RESTORE_DATABASE" == "YES" && -z "$BACKUP_FILE" ]]; then
  echo "--restore-database requires --backup FILE. Database restore is never implicit." >&2
  exit 1
fi

COMPOSE_ARGS=(-f docker-compose.production.yml)
if [[ "${USE_VPS_TOPOLOGY:-false}" == "true" ]]; then COMPOSE_ARGS+=(-f docker-compose.vps.yml); fi
if [[ -n "${COMPOSE_EXTRA_FILES:-}" ]]; then
  IFS=':' read -r -a extra_files <<< "$COMPOSE_EXTRA_FILES"
  for file in "${extra_files[@]}"; do [[ -n "$file" ]] && COMPOSE_ARGS+=(-f "$file"); done
fi
export SCHOOLHUB_IMAGE_TAG="$TARGET_SHA"
COMPOSE=(docker compose "${COMPOSE_ARGS[@]}" --env-file "$ENV_FILE")
ROLLBACK_TS="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="artifacts/rollbacks/$ROLLBACK_TS"
mkdir -p "$LOG_DIR"

preserve_logs() {
  set +e
  "${COMPOSE[@]}" ps > "$LOG_DIR/compose-ps.txt" 2>&1
  "${COMPOSE[@]}" logs --no-color > "$LOG_DIR/compose-logs.txt" 2>&1
}

on_error() {
  local code=$?
  preserve_logs
  echo "Rollback failed. Logs: $LOG_DIR" >&2
  exit "$code"
}
trap on_error ERR

confirm() {
  if [[ "$YES" == "YES" ]]; then return 0; fi
  read -r -p "Type ROLLBACK to continue: " answer
  [[ "$answer" == "ROLLBACK" ]] || { echo "Rollback cancelled." >&2; exit 1; }
}

wait_service_ready() {
  local service="$1" timeout="${2:-180}" start id state health now
  start="$(date +%s)"
  while true; do
    id="$("${COMPOSE[@]}" ps -q "$service" || true)"
    if [[ -n "$id" ]]; then
      state="$(docker inspect -f '{{.State.Status}}' "$id" 2>/dev/null || true)"
      health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || true)"
      [[ "$state" == "running" && ( "$health" == "healthy" || "$health" == "none" ) ]] && return 0
    fi
    now="$(date +%s)"
    (( now - start > timeout )) && { echo "Timed out waiting for $service" >&2; return 1; }
    sleep 3
  done
}

current_sha="$(git rev-parse HEAD 2>/dev/null || printf 'unknown')"
echo "Current checkout SHA: $current_sha"
echo "Rollback target SHA: $TARGET_SHA"
echo "Compose files: ${COMPOSE_ARGS[*]}"
"${COMPOSE[@]}" ps || true

if [[ "$DRY_RUN" == "YES" ]]; then
  jq -n --arg ok true --arg targetSha "$TARGET_SHA" --arg dryRun true '{ok:($ok=="true"),targetSha:$targetSha,dryRun:($dryRun=="true")}' | tee "$LOG_DIR/rollback-dry-run.json"
  exit 0
fi

for image in schoolhub-api:"$TARGET_SHA" schoolhub-worker:"$TARGET_SHA" schoolhub-web:"$TARGET_SHA"; do
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    echo "Required rollback image missing locally: $image" >&2
    echo "Pull/build the exact target images first; rollback refuses to fall back to mutable tags." >&2
    exit 1
  fi
done

if [[ "$RESTORE_DATABASE" == "YES" ]]; then
  echo "WARNING: database restoration can reverse data and is separate from application rollback." >&2
  echo "Backup selected: $BACKUP_FILE" >&2
fi

confirm

"${COMPOSE[@]}" up -d --no-deps api worker web reverse-proxy
for service in api worker web reverse-proxy; do wait_service_ready "$service" 180; done

health_base="${LOCAL_HEALTH_BASE_URL:-http://127.0.0.1}"
if [[ "${USE_VPS_TOPOLOGY:-false}" == "true" && -z "${LOCAL_HEALTH_BASE_URL:-}" ]]; then health_base="http://127.0.0.1:8080"; fi
curl -fsS "$health_base/health/live" >/dev/null
curl -fsS "$health_base/health/ready" >/dev/null
"${COMPOSE[@]}" run --rm --no-deps api node dist/scripts/verify-audit-chain.js >/dev/null

if [[ "$RESTORE_DATABASE" == "YES" ]]; then
  echo "Starting explicit database restore after application rollback health verification." >&2
  restore_args=(--env-file "$ENV_FILE" --backup "$BACKUP_FILE" --restore-production)
  [[ "$YES" == "YES" ]] && restore_args+=(--yes)
  bash scripts/restore_backup.sh "${restore_args[@]}"
fi

jq -n --arg ok true --arg targetSha "$TARGET_SHA" --arg logs "$LOG_DIR" '{ok:($ok=="true"),targetSha:$targetSha,logs:$logs}' | tee "$LOG_DIR/rollback-result.json"
