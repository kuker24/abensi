#!/usr/bin/env bash
# shellcheck disable=SC2016
set -Eeuo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: bash scripts/deploy_production.sh ENV_FILE [--dry-run]

Environment toggles:
  USE_VPS_TOPOLOGY=true          include docker-compose.vps.yml
  COMPOSE_EXTRA_FILES=a.yml:b.yml include extra compose files
  LOCAL_HEALTH_BASE_URL=http://127.0.0.1[:port]
EOF
}

ENV_FILE=""
DRY_RUN="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    --*) echo "Unknown option: $1" >&2; usage; exit 2 ;;
    *)
      if [[ -n "$ENV_FILE" ]]; then
        echo "Only one ENV_FILE argument is supported." >&2
        exit 2
      fi
      ENV_FILE="$1"
      shift
      ;;
  esac
done
ENV_FILE="${ENV_FILE:-.env}"

STARTING_SHA="$(git rev-parse HEAD 2>/dev/null || printf 'unknown')"
TARGET_SHA="$STARTING_SHA"
DEPLOY_TS="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="${DEPLOYMENT_EVIDENCE_DIR:-artifacts/deployments/$DEPLOY_TS}"
EVIDENCE_FILE="$EVIDENCE_DIR/deployment-evidence.json"
LOG_DIR="$EVIDENCE_DIR/logs"
mkdir -p "$LOG_DIR"

COMPOSE_ARGS=(-f docker-compose.production.yml)
if [[ "${USE_VPS_TOPOLOGY:-false}" == "true" ]]; then
  COMPOSE_ARGS+=(-f docker-compose.vps.yml)
fi
if [[ -n "${COMPOSE_EXTRA_FILES:-}" ]]; then
  IFS=':' read -r -a extra_files <<< "$COMPOSE_EXTRA_FILES"
  for file in "${extra_files[@]}"; do
    [[ -n "$file" ]] && COMPOSE_ARGS+=(-f "$file")
  done
fi

export SCHOOLHUB_IMAGE_TAG="${SCHOOLHUB_IMAGE_TAG:-$TARGET_SHA}"

FINAL_STATUS="FAIL"
BACKUP_RESULT_JSON="{}"
CURRENT_IMAGES_JSON="[]"
TARGET_IMAGES_JSON="[]"
CURRENT_CONTAINERS_JSON="[]"
FINAL_CONTAINERS_JSON="[]"
MIGRATION_STATE_BEFORE_JSON="[]"
MIGRATION_STATE_AFTER_JSON="[]"
AUDIT_RESULT_JSON="{}"
PREFLIGHT_RESULT_JSON="{}"
POST_MIGRATION_RESULT_JSON="{}"
BOOTSTRAP_RESULT_JSON="{}"
DEVELOPER_BOOTSTRAP_RESULT_JSON='{"skipped":true}'
PUBLIC_HTTPS_RESULT_JSON='{"skipped":true}'
LOCAL_HEALTH_RESULT_JSON="{}"
DB_EXISTING="unknown"

compose() {
  docker compose "${COMPOSE_ARGS[@]}" --env-file "$ENV_FILE" "$@"
}

write_evidence() {
  jq -n \
    --arg startingSha "$STARTING_SHA" \
    --arg endingSha "$TARGET_SHA" \
    --arg deploymentTime "$DEPLOY_TS" \
    --arg envFile "$(basename "$ENV_FILE")" \
    --arg status "$FINAL_STATUS" \
    --arg databaseExisting "$DB_EXISTING" \
    --argjson currentImages "$CURRENT_IMAGES_JSON" \
    --argjson targetImages "$TARGET_IMAGES_JSON" \
    --argjson currentContainers "$CURRENT_CONTAINERS_JSON" \
    --argjson finalContainers "$FINAL_CONTAINERS_JSON" \
    --argjson migrationBefore "$MIGRATION_STATE_BEFORE_JSON" \
    --argjson migrationAfter "$MIGRATION_STATE_AFTER_JSON" \
    --argjson backup "$BACKUP_RESULT_JSON" \
    --argjson preflight "$PREFLIGHT_RESULT_JSON" \
    --argjson audit "$AUDIT_RESULT_JSON" \
    --argjson postMigration "$POST_MIGRATION_RESULT_JSON" \
    --argjson bootstrap "$BOOTSTRAP_RESULT_JSON" \
    --argjson developerBootstrap "$DEVELOPER_BOOTSTRAP_RESULT_JSON" \
    --argjson localHealth "$LOCAL_HEALTH_RESULT_JSON" \
    --argjson publicHttps "$PUBLIC_HTTPS_RESULT_JSON" \
    '{startingSha:$startingSha,endingSha:$endingSha,deploymentTime:$deploymentTime,envFile:$envFile,databaseExisting:$databaseExisting,currentImages:$currentImages,targetImages:$targetImages,currentContainers:$currentContainers,finalContainers:$finalContainers,migrationState:{before:$migrationBefore,after:$migrationAfter},backup:$backup,preflight:$preflight,auditVerification:$audit,postMigration:$postMigration,bootstrap:$bootstrap,developerBootstrap:$developerBootstrap,localHealth:$localHealth,publicHttps:$publicHttps,finalStatus:$status}' \
    > "$EVIDENCE_FILE"
}

preserve_logs() {
  set +e
  compose ps > "$LOG_DIR/compose-ps.txt" 2>&1
  compose logs --no-color > "$LOG_DIR/compose-logs.txt" 2>&1
  docker ps -a > "$LOG_DIR/docker-ps.txt" 2>&1
}

on_error() {
  local code=$?
  FINAL_STATUS="FAIL"
  preserve_logs
  FINAL_CONTAINERS_JSON="$(compose ps --format json 2>/dev/null | jq -s '.' 2>/dev/null || printf '[]')"
  write_evidence || true
  echo "Deployment failed. Evidence preserved at: $EVIDENCE_FILE" >&2
  echo "Logs preserved at: $LOG_DIR" >&2
  echo "Rollback command (application images only; database is never restored automatically):" >&2
  echo "  bash scripts/rollback_production.sh --env-file '$ENV_FILE' --target-sha '<previous-git-sha>'" >&2
  exit "$code"
}
trap on_error ERR

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command missing: $1" >&2
    exit 1
  fi
}

version_at_least() {
  local actual="$1"
  local minimum="$2"
  [[ "$(printf '%s\n%s\n' "$minimum" "$actual" | sort -V | head -n 1)" == "$minimum" ]]
}

validate_file_permissions() {
  local file="$1"
  local mode
  mode="$(stat -c '%a' "$file")"
  local perms=$((8#$mode))
  if (( (perms & 077) != 0 )); then
    echo "Env file must not be group/world-readable: $file (mode $mode). Run: chmod 600 '$file'" >&2
    exit 1
  fi
}

env_get() {
  local key="$1"
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

validate_environment_values() {
  local node_env public_origin cors_origin
  node_env="$(env_get NODE_ENV)"
  public_origin="$(env_get PUBLIC_APP_ORIGIN)"
  cors_origin="$(env_get CORS_ORIGIN)"
  [[ "$node_env" == "production" ]] || { echo "NODE_ENV must be production in $ENV_FILE" >&2; exit 1; }
  [[ "$public_origin" == https://* ]] || { echo "PUBLIC_APP_ORIGIN must be https://..." >&2; exit 1; }
  IFS=',' read -r -a cors_values <<< "$cors_origin"
  for origin in "${cors_values[@]}"; do
    origin="${origin//[[:space:]]/}"
    [[ -z "$origin" || "$origin" == https://* ]] || { echo "CORS_ORIGIN entries must be https://..." >&2; exit 1; }
  done
  for key in JWT_SECRET WORKER_TOKEN READER_SECRET_ENCRYPTION_KEY DATABASE_URL POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD; do
    [[ -n "$(env_get "$key")" ]] || { echo "$key is required in $ENV_FILE" >&2; exit 1; }
  done
}

json_lines_or_empty() {
  jq -s '.' 2>/dev/null || printf '[]'
}

container_id() {
  compose ps -q "$1"
}

wait_service_ready() {
  local service="$1"
  local timeout="${2:-180}"
  local start now id state health
  start="$(date +%s)"
  while true; do
    id="$(container_id "$service" || true)"
    if [[ -n "$id" ]]; then
      state="$(docker inspect -f '{{.State.Status}}' "$id" 2>/dev/null || true)"
      health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || true)"
      if [[ "$state" == "running" && ( "$health" == "healthy" || "$health" == "none" ) ]]; then
        return 0
      fi
    fi
    now="$(date +%s)"
    if (( now - start > timeout )); then
      echo "Timed out waiting for service $service (state=${state:-missing}, health=${health:-missing})" >&2
      return 1
    fi
    sleep 3
  done
}

migration_state() {
  compose exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT COALESCE(json_agg(row_to_json(t)), '\''[]'\''::json) FROM (SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at) t"' 2>/dev/null || printf '[]'
}

database_has_existing_data() {
  local result
  result="$(compose exec -T postgres sh -lc 'if psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema='\''public'\'' AND table_name='\''User'\''" | grep -q 1; then psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT COUNT(*) FROM \"User\""; else printf 0; fi' 2>/dev/null | tr -d '[:space:]' || printf '0')"
  [[ "${result:-0}" != "0" ]]
}

local_health_checks() {
  local base="$1"
  local live_code ready_code
  live_code="$(curl -sS -o "$LOG_DIR/local-live.json" -w '%{http_code}' "$base/health/live")"
  ready_code="$(curl -sS -o "$LOG_DIR/local-ready.json" -w '%{http_code}' "$base/health/ready")"
  jq -n --arg base "$base" --arg live "$live_code" --arg ready "$ready_code" '{base:$base,liveStatus:($live|tonumber),readyStatus:($ready|tonumber),ok:($live=="200" and $ready=="200")}'
}

run_api_script_json() {
  local script="$1"
  shift || true
  compose run --rm --no-deps api node "dist/scripts/$script" "$@" | tee "$LOG_DIR/${script%.js}.json"
}

validate_operating_environment() {
  [[ -n "${BASH_VERSION:-}" ]] || { echo "bash is required" >&2; exit 1; }
  for cmd in docker curl jq openssl stat sort awk; do require_command "$cmd"; done
  docker compose version >/dev/null
  local docker_version compose_version free_kb min_free_kb
  docker_version="$(docker version --format '{{.Server.Version}}')"
  compose_version="$(docker compose version --short)"
  version_at_least "$docker_version" "24.0.0" || { echo "Docker >=24.0.0 required, got $docker_version" >&2; exit 1; }
  version_at_least "$compose_version" "2.24.0" || { echo "Docker Compose >=2.24.0 required, got $compose_version" >&2; exit 1; }
  free_kb="$(df -Pk . | awk 'NR==2 {print $4}')"
  min_free_kb="${MIN_DEPLOY_FREE_KB:-2097152}"
  if (( free_kb < min_free_kb )); then
    echo "Insufficient disk space: ${free_kb}KB free, require ${min_free_kb}KB" >&2
    exit 1
  fi
}

main() {
  echo "== SchoolHub production deployment =="
  echo "Starting SHA: $STARTING_SHA"
  echo "Target SHA:   $TARGET_SHA"
  echo "Evidence:     $EVIDENCE_FILE"

  [[ -f "$ENV_FILE" ]] || { echo "Env file not found: $ENV_FILE" >&2; exit 1; }
  validate_operating_environment
  validate_file_permissions "$ENV_FILE"
  validate_environment_values

  compose config > "$LOG_DIR/compose-config.yml"
  if grep -Eq 'image:[[:space:]].*:latest([[:space:]]|$)' "$LOG_DIR/compose-config.yml"; then
    echo "Mutable latest image tag is not allowed in production compose config." >&2
    exit 1
  fi

  CURRENT_IMAGES_JSON="$(compose images --format json 2>/dev/null | json_lines_or_empty)"
  CURRENT_CONTAINERS_JSON="$(compose ps --format json 2>/dev/null | json_lines_or_empty)"

  if [[ "$DRY_RUN" == "true" ]]; then
    FINAL_STATUS="DRY_RUN_PASS"
    FINAL_CONTAINERS_JSON="$CURRENT_CONTAINERS_JSON"
    write_evidence
    echo "Dry-run validation passed. Evidence: $EVIDENCE_FILE"
    return 0
  fi

  compose up -d postgres redis
  wait_service_ready postgres 180
  wait_service_ready redis 120
  MIGRATION_STATE_BEFORE_JSON="$(migration_state | jq '.' 2>/dev/null || printf '[]')"

  if database_has_existing_data; then
    DB_EXISTING="true"
    echo "Existing production data detected; encrypted pre-deployment backup is mandatory."
    backup_stdout="$LOG_DIR/predeploy-backup.stdout"
    bash scripts/backup_production.sh "$ENV_FILE" --reason pre-deploy | tee "$backup_stdout"
    BACKUP_RESULT_JSON="$(tail -n 1 "$backup_stdout" | jq '.' 2>/dev/null || printf '{}')"
    [[ "$(jq -r '.ok // false' <<< "$BACKUP_RESULT_JSON")" == "true" ]] || { echo "Backup did not report ok=true" >&2; exit 1; }
  else
    DB_EXISTING="false"
    BACKUP_RESULT_JSON='{"skipped":true,"reason":"no existing production data detected"}'
  fi

  # Docker Buildx can emit local manifest-list/attestation image IDs that Docker Compose later
  # cannot inspect after a rebuild on some Docker/Compose versions. Disable default
  # attestations for VPS-local deployment images; CI still performs separate SBOM/container scans.
  export BUILDX_NO_DEFAULT_ATTESTATIONS="${BUILDX_NO_DEFAULT_ATTESTATIONS:-1}"
  compose build --pull
  TARGET_IMAGES_JSON="$(compose images --format json | json_lines_or_empty)"

  compose run --rm migrate
  MIGRATION_STATE_AFTER_JSON="$(migration_state | jq '.' 2>/dev/null || printf '[]')"

  PREFLIGHT_RESULT_JSON="$(run_api_script_json production-preflight.js | jq '.' 2>/dev/null || printf '{}')"
  POST_MIGRATION_RESULT_JSON="$(run_api_script_json verify-post-migration.js | jq '.' 2>/dev/null || printf '{}')"

  compose up -d --no-deps api
  wait_service_ready api 180
  compose up -d --no-deps worker web reverse-proxy
  for service in postgres redis api worker web reverse-proxy; do
    wait_service_ready "$service" 180
  done

  local health_base
  health_base="${LOCAL_HEALTH_BASE_URL:-http://127.0.0.1}"
  if [[ "${USE_VPS_TOPOLOGY:-false}" == "true" && -z "${LOCAL_HEALTH_BASE_URL:-}" ]]; then
    health_base="http://127.0.0.1:8080"
  fi
  LOCAL_HEALTH_RESULT_JSON="$(local_health_checks "$health_base")"
  [[ "$(jq -r '.ok' <<< "$LOCAL_HEALTH_RESULT_JSON")" == "true" ]] || { echo "Local health checks failed" >&2; exit 1; }

  AUDIT_RESULT_JSON="$(run_api_script_json verify-audit-chain.js | jq '.' 2>/dev/null || printf '{}')"
  [[ "$(jq -r '.ok // false' <<< "$AUDIT_RESULT_JSON")" == "true" ]] || { echo "Audit chain verification failed" >&2; exit 1; }

  BOOTSTRAP_RESULT_JSON="$(run_api_script_json ensure-admin.js | jq '.' 2>/dev/null || printf '{}')"
  [[ "$(jq -r '.ok // false' <<< "$BOOTSTRAP_RESULT_JSON")" == "true" ]] || { echo "Admin bootstrap failed" >&2; exit 1; }

  if [[ "$(env_get DEVELOPER_BOOTSTRAP_ENABLED)" == "true" ]]; then
    DEVELOPER_BOOTSTRAP_RESULT_JSON="$(run_api_script_json ensure-developer.js | jq '.' 2>/dev/null || printf '{}')"
    [[ "$(jq -r '.ok // false' <<< "$DEVELOPER_BOOTSTRAP_RESULT_JSON")" == "true" ]] || { echo "Developer bootstrap failed" >&2; exit 1; }
  fi

  public_origin="$(env_get PUBLIC_APP_ORIGIN)"
  if [[ -n "$public_origin" ]]; then
    https_stdout="$LOG_DIR/public-https-smoke.stdout"
    PUBLIC_APP_ORIGIN="$public_origin" ADMIN_USERNAME="$(env_get ADMIN_USERNAME)" ADMIN_PASSWORD="$(env_get ADMIN_PASSWORD)" bash scripts/public_https_smoke.sh | tee "$https_stdout"
    PUBLIC_HTTPS_RESULT_JSON="$(tail -n 1 "$https_stdout" | jq '.' 2>/dev/null || printf '{}')"
    [[ "$(jq -r '.ok // false' <<< "$PUBLIC_HTTPS_RESULT_JSON")" == "true" ]] || { echo "Public HTTPS smoke failed" >&2; exit 1; }
  fi

  FINAL_CONTAINERS_JSON="$(compose ps --format json | json_lines_or_empty)"
  FINAL_STATUS="PASS"
  write_evidence
  cp "$EVIDENCE_FILE" .last_deploy_artifact_path 2>/dev/null || true
  echo "Deployment completed successfully. Evidence: $EVIDENCE_FILE"
}

main
