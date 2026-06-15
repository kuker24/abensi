#!/usr/bin/env bash
# shellcheck disable=SC2016
set -uo pipefail

ENV_FILE=".env"
OUTPUT_JSON="${DEPLOYMENT_STATUS_JSON:-artifacts/deployment-status.json}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="${2:-.env}"; shift 2 ;;
    --json) OUTPUT_JSON="${2:-$OUTPUT_JSON}"; shift 2 ;;
    -h|--help) echo "Usage: bash scripts/deployment_status.sh --env-file ENV [--json FILE]"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

COMPOSE_ARGS=(-f docker-compose.production.yml)
if [[ "${USE_VPS_TOPOLOGY:-false}" == "true" ]]; then COMPOSE_ARGS+=(-f docker-compose.vps.yml); fi
if [[ -n "${COMPOSE_EXTRA_FILES:-}" ]]; then
  IFS=':' read -r -a extra_files <<< "$COMPOSE_EXTRA_FILES"
  for file in "${extra_files[@]}"; do [[ -n "$file" ]] && COMPOSE_ARGS+=(-f "$file"); done
fi
COMPOSE=(docker compose "${COMPOSE_ARGS[@]}" --env-file "$ENV_FILE")
mkdir -p "$(dirname "$OUTPUT_JSON")"

read_env() {
  local key="$1"
  if [[ -n "${!key:-}" ]]; then printf '%s' "${!key}"; return; fi
  [[ -f "$ENV_FILE" ]] || return 0
  awk -v key="$key" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    index($0, key "=") == 1 { value=substr($0, length(key)+2); gsub(/^[[:space:]]+|[[:space:]]+$/, "", value); if (value ~ /^".*"$/ || value ~ /^'\''.*'\''$/) value=substr(value,2,length(value)-2); print value; exit }
  ' "$ENV_FILE"
}

json_lines_or_empty() { jq -s '.' 2>/dev/null || printf '[]'; }

status_json="$("${COMPOSE[@]}" ps --format json 2>/dev/null | json_lines_or_empty)"
images_json="$("${COMPOSE[@]}" images --format json 2>/dev/null | json_lines_or_empty)"
health_base="${LOCAL_HEALTH_BASE_URL:-http://127.0.0.1}"
if [[ "${USE_VPS_TOPOLOGY:-false}" == "true" && -z "${LOCAL_HEALTH_BASE_URL:-}" ]]; then health_base="http://127.0.0.1:8080"; fi
live_code="$(curl -sS -o /tmp/schoolhub-status-live.json -w '%{http_code}' "$health_base/health/live" 2>/dev/null || printf '000')"
ready_code="$(curl -sS -o /tmp/schoolhub-status-ready.json -w '%{http_code}' "$health_base/health/ready" 2>/dev/null || printf '000')"

migration_json="$("${COMPOSE[@]}" exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT COALESCE(json_agg(row_to_json(t)), '\''[]'\''::json) FROM (SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 10) t"' 2>/dev/null || printf '[]')"
audit_json="$("${COMPOSE[@]}" run --rm --no-deps api node dist/scripts/verify-audit-chain.js 2>/dev/null | jq '.' 2>/dev/null || printf '{"ok":false,"error":"audit verification unavailable"}')"

BACKUP_DIR="${BACKUP_DIR:-$(read_env BACKUP_DIR)}"
BACKUP_DIR="${BACKUP_DIR:-/opt/schoolhub/backups}"
latest_backup=""
backup_age_seconds="null"
if [[ -d "$BACKUP_DIR" ]]; then
  latest_backup="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'schoolhub-*.dump.enc' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n 1 | cut -d' ' -f2- || true)"
  if [[ -n "$latest_backup" ]]; then
    now="$(date +%s)"
    mtime="$(stat -c '%Y' "$latest_backup")"
    backup_age_seconds="$((now - mtime))"
  fi
fi

disk_json="$(df -Pk / . 2>/dev/null | awk 'NR>1 {gsub(/%/, "", $5); printf "{\"filesystem\":\"%s\",\"mount\":\"%s\",\"usedPercent\":%s,\"availableKb\":%s}\n", $1, $6, $5, $4}' | jq -s '.')"
memory_json="$(free -m 2>/dev/null | awk '/Mem:/ {printf "{\"totalMb\":%s,\"usedMb\":%s,\"freeMb\":%s}", $2,$3,$4}' || printf '{}')"

cert_json='{"skipped":true}'
public_origin="$(read_env PUBLIC_APP_ORIGIN)"
if [[ "$public_origin" == https://* ]]; then
  hostport="${public_origin#https://}"; hostport="${hostport%%/*}"; host="${hostport%%:*}"; port="443"; [[ "$hostport" == *:* ]] && port="${hostport##*:}"
  if openssl s_client -connect "$host:$port" -servername "$host" </dev/null 2>/dev/null | openssl x509 -noout -enddate > /tmp/schoolhub-cert-date.txt 2>/dev/null; then
    end_date="$(cut -d= -f2- /tmp/schoolhub-cert-date.txt)"
    end_epoch="$(date -d "$end_date" +%s 2>/dev/null || printf 0)"
    now_epoch="$(date +%s)"
    cert_json="$(jq -n --arg endDate "$end_date" --argjson remainingDays "$(((end_epoch - now_epoch) / 86400))" '{notAfter:$endDate,remainingDays:$remainingDays}')"
  fi
fi

latest_evidence="$(find artifacts/deployments -path '*/deployment-evidence.json' -type f -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n 1 | cut -d' ' -f2- || true)"
latest_evidence_json='null'
if [[ -n "$latest_evidence" ]]; then latest_evidence_json="$(jq '.' "$latest_evidence" 2>/dev/null || printf 'null')"; fi

git_sha="$(git rev-parse HEAD 2>/dev/null || printf 'unknown')"
queue_json="$("${COMPOSE[@]}" exec -T redis redis-cli ping 2>/dev/null | awk '{printf "{\"redisPing\":\"%s\"}", $1}' || printf '{"redisPing":"unavailable"}')"

jq -n \
  --arg timestamp "$(date -u +%FT%TZ)" \
  --arg gitSha "$git_sha" \
  --arg healthBase "$health_base" \
  --arg live "$live_code" \
  --arg ready "$ready_code" \
  --arg backupPath "$latest_backup" \
  --argjson backupAgeSeconds "$backup_age_seconds" \
  --argjson containers "$status_json" \
  --argjson images "$images_json" \
  --argjson migrations "$migration_json" \
  --argjson audit "$audit_json" \
  --argjson disk "$disk_json" \
  --argjson memory "$memory_json" \
  --argjson cert "$cert_json" \
  --argjson queue "$queue_json" \
  --argjson latestEvidence "$latest_evidence_json" \
  '{timestamp:$timestamp,gitSha:$gitSha,containers:$containers,images:$images,health:{base:$healthBase,liveStatus:($live|tonumber? // 0),readyStatus:($ready|tonumber? // 0)},migrationState:$migrations,auditChain:$audit,backup:{latestPath:$backupPath,ageSeconds:$backupAgeSeconds},disk:$disk,memory:$memory,certificate:$cert,queue:$queue,latestDeploymentEvidence:$latestEvidence}' > "$OUTPUT_JSON"

echo "SchoolHub deployment status"
echo "  Git SHA:      $git_sha"
echo "  Health:       live=$live_code ready=$ready_code ($health_base)"
echo "  Audit chain:  $(jq -r '.auditChain.ok // false' "$OUTPUT_JSON")"
echo "  Latest backup:${latest_backup:- none}"
echo "  JSON:         $OUTPUT_JSON"
jq -c '.' "$OUTPUT_JSON"
