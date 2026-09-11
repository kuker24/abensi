#!/usr/bin/env bash
# Operator-readable production stabilization status (no root, no secret dump).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/schoolhub_release_pins.sh
source "$SCRIPT_DIR/lib/schoolhub_release_pins.sh"

ROOT_DIR="${ROOT_DIR:-/opt/schoolhub}"
# Capture explicit env-var overrides only (the systemd unit passes ENV_FILE/OUTPUT_*).
# Derived paths are resolved after argument parsing so --root drives them too.
ENV_FILE_EXPLICIT="${ENV_FILE:-}"
OUTPUT_JSON_EXPLICIT="${OUTPUT_JSON:-}"
OUTPUT_MD_EXPLICIT="${OUTPUT_MD:-}"
ENV_FILE_CLI=""
OUTPUT_JSON_CLI=""
OUTPUT_MD_CLI=""
PUBLIC_ORIGIN_OVERRIDE="${PUBLIC_APP_ORIGIN:-}"
LOCAL_HEALTH_BASE_URL="${LOCAL_HEALTH_BASE_URL:-http://127.0.0.1:8080}"
USE_VPS_TOPOLOGY="${USE_VPS_TOPOLOGY:-true}"

usage() {
  cat >&2 <<'EOF'
Usage: bash scripts/stabilization_status.sh [options]

Options:
  --root DIR
  --env-file FILE
  --json FILE           Default ROOT/logs/stabilization-status.json
  --md FILE             Default ROOT/logs/stabilization-status.md
  --local-health URL    Default http://127.0.0.1:8080
  -h, --help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT_DIR="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE_CLI="${2:-}"; shift 2 ;;
    --json) OUTPUT_JSON_CLI="${2:-}"; shift 2 ;;
    --md) OUTPUT_MD_CLI="${2:-}"; shift 2 ;;
    --local-health) LOCAL_HEALTH_BASE_URL="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

[[ -n "$ROOT_DIR" ]] || { echo "--root requires a value" >&2; exit 2; }

# Precedence: CLI flag > explicit env var > derived from ROOT_DIR.
ACTIVE_RELEASE_FILE="$ROOT_DIR/ACTIVE_RELEASE_SHA"
ACTIVE_API_FILE="$ROOT_DIR/ACTIVE_API_RELEASE_TAG"
ENV_FILE="${ENV_FILE_CLI:-${ENV_FILE_EXPLICIT:-$ROOT_DIR/.env}}"
OUTPUT_JSON="${OUTPUT_JSON_CLI:-${OUTPUT_JSON_EXPLICIT:-$ROOT_DIR/logs/stabilization-status.json}}"
OUTPUT_MD="${OUTPUT_MD_CLI:-${OUTPUT_MD_EXPLICIT:-$ROOT_DIR/logs/stabilization-status.md}}"

# Fail loudly: a silent mkdir failure previously still let the report claim success.
mkdir -p "$(dirname "$OUTPUT_JSON")" "$(dirname "$OUTPUT_MD")" || {
  echo "Cannot create output directories for $OUTPUT_JSON / $OUTPUT_MD" >&2
  exit 1
}

http_code() {
  local url="$1"
  curl -sS -o /dev/null -m 8 -w '%{http_code}' "$url" 2>/dev/null || printf '000'
}

active_release="$(schoolhub_read_pin_file "$ACTIVE_RELEASE_FILE" || true)"
active_api="$(schoolhub_read_pin_file "$ACTIVE_API_FILE" || true)"
env_tag=""
if [[ -f "$ENV_FILE" ]]; then
  env_tag="$(schoolhub_env_get "$ENV_FILE" SCHOOLHUB_IMAGE_TAG || true)"
fi

git_sha="unknown"
if [[ -d "$ROOT_DIR/current/.git" ]]; then
  git_sha="$(git -C "$ROOT_DIR/current" rev-parse HEAD 2>/dev/null || printf 'unknown')"
elif git rev-parse HEAD >/dev/null 2>&1; then
  git_sha="$(git rev-parse HEAD 2>/dev/null || printf 'unknown')"
fi

running_json="$(schoolhub_running_service_tags_json 2>/dev/null || printf '{}')"
running_api_tag="$(echo "$running_json" | jq -r '."current-api-1".tag // ."schoolhub-api".tag // empty')"
running_web_tag="$(echo "$running_json" | jq -r '."schoolhub-web".tag // empty')"
running_worker_tag="$(echo "$running_json" | jq -r '."schoolhub-worker".tag // empty')"

containers_ok="false"
if docker ps --format '{{.Names}} {{.Status}}' 2>/dev/null | grep -Eq 'current-api-1|schoolhub-api'; then
  if ! docker ps --format '{{.Names}} {{.Status}}' 2>/dev/null | grep -E 'schoolhub-|current-api' | grep -Eqi 'unhealthy|Exited|Dead'; then
    # require core set healthy if present
    containers_ok="true"
    for name in current-api-1 schoolhub-web schoolhub-worker schoolhub-nginx schoolhub-postgres schoolhub-redis; do
      if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$name"; then
        st="$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null || echo 'missing')"
        if ! [[ "$st" =~ ^running\ (healthy|none)$ ]]; then
          containers_ok="false"
          break
        fi
      fi
    done
  fi
fi

local_live="$(http_code "$LOCAL_HEALTH_BASE_URL/health/live")"
local_ready="$(http_code "$LOCAL_HEALTH_BASE_URL/health/ready")"
# reverse-proxy may expose /api/v1 or bare /health depending on path; try API path if bare fails
if [[ "$local_live" != "200" ]]; then
  local_live="$(http_code "$LOCAL_HEALTH_BASE_URL/api/v1/health/live")"
fi
if [[ "$local_ready" != "200" ]]; then
  local_ready="$(http_code "$LOCAL_HEALTH_BASE_URL/api/v1/health/ready")"
fi

public_origin="${PUBLIC_ORIGIN_OVERRIDE:-}"
if [[ -z "$public_origin" && -f "$ENV_FILE" ]]; then
  public_origin="$(schoolhub_env_get "$ENV_FILE" PUBLIC_APP_ORIGIN || true)"
fi
public_live="000"
public_ready="000"
if [[ "$public_origin" == https://* || "$public_origin" == http://* ]]; then
  public_live="$(http_code "$public_origin/api/v1/health/live")"
  public_ready="$(http_code "$public_origin/api/v1/health/ready")"
fi

disk_json="$(df -Pk / | awk 'NR==2 {gsub(/%/,"",$5); printf "{\"usedPercent\":%s,\"availableKb\":%s,\"filesystem\":\"%s\"}", $5, $4, $1}')"
disk_used="$(echo "$disk_json" | jq -r '.usedPercent')"
images_count="$(docker images --format '{{.Repository}}' 2>/dev/null | grep -c '^schoolhub-' || true)"
docker_df_images="$(docker system df 2>/dev/null | awk '/^Images/ {print $4}' || true)"

# Pin alignment: env tag, ACTIVE pins, running api/web/worker should match one SHA when possible.
pins_aligned="false"
if schoolhub_is_git_sha "$running_api_tag" \
  && [[ -n "$running_web_tag" && -n "$running_worker_tag" ]] \
  && [[ "$running_api_tag" == "$running_web_tag" && "$running_api_tag" == "$running_worker_tag" ]] \
  && [[ "$active_release" == "$running_api_tag" && "$active_api" == "$running_api_tag" ]] \
  && [[ "$env_tag" == "$running_api_tag" ]]; then
  pins_aligned="true"
fi

health_ok="false"
if [[ "$local_live" == "200" && "$local_ready" == "200" ]]; then
  health_ok="true"
fi
public_ok="true"
if [[ -n "$public_origin" ]]; then
  if [[ "$public_live" != "200" || "$public_ready" != "200" ]]; then
    public_ok="false"
  fi
fi

disk_ok="true"
if [[ "${disk_used:-100}" =~ ^[0-9]+$ ]] && (( disk_used >= 85 )); then
  disk_ok="false"
fi

overall="ok"
[[ "$containers_ok" == "true" ]] || overall="degraded"
[[ "$health_ok" == "true" ]] || overall="degraded"
[[ "$public_ok" == "true" ]] || overall="degraded"
[[ "$pins_aligned" == "true" ]] || overall="degraded"
[[ "$disk_ok" == "true" ]] || overall="degraded"

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

jq -n \
  --arg ts "$timestamp" \
  --arg overall "$overall" \
  --arg gitSha "$git_sha" \
  --arg activeRelease "$active_release" \
  --arg activeApi "$active_api" \
  --arg envTag "$env_tag" \
  --arg runningApi "$running_api_tag" \
  --arg runningWeb "$running_web_tag" \
  --arg runningWorker "$running_worker_tag" \
  --argjson running "$running_json" \
  --argjson containersOk "$([ "$containers_ok" == "true" ] && echo true || echo false)" \
  --argjson pinsAligned "$([ "$pins_aligned" == "true" ] && echo true || echo false)" \
  --argjson healthOk "$([ "$health_ok" == "true" ] && echo true || echo false)" \
  --argjson publicOk "$([ "$public_ok" == "true" ] && echo true || echo false)" \
  --argjson diskOk "$([ "$disk_ok" == "true" ] && echo true || echo false)" \
  --arg localLive "$local_live" \
  --arg localReady "$local_ready" \
  --arg publicLive "$public_live" \
  --arg publicReady "$public_ready" \
  --arg publicOrigin "$public_origin" \
  --arg localBase "$LOCAL_HEALTH_BASE_URL" \
  --argjson disk "$disk_json" \
  --argjson schoolhubImageCount "${images_count:-0}" \
  --arg dockerImagesSize "$docker_df_images" \
  '{
    timestamp:$ts,
    overall:$overall,
    gitSha:$gitSha,
    pins:{
      activeRelease:$activeRelease,
      activeApiReleaseTag:$activeApi,
      schoolhubImageTag:$envTag,
      runningApi:$runningApi,
      runningWeb:$runningWeb,
      runningWorker:$runningWorker,
      aligned:$pinsAligned
    },
    running:$running,
    containersOk:$containersOk,
    health:{
      ok:$healthOk,
      localBase:$localBase,
      localLive:($localLive|tonumber? // 0),
      localReady:($localReady|tonumber? // 0),
      publicOrigin:$publicOrigin,
      publicLive:($publicLive|tonumber? // 0),
      publicReady:($publicReady|tonumber? // 0),
      publicOk:$publicOk
    },
    disk: ($disk + {ok:$diskOk}),
    images:{schoolhubRepoTagCount:$schoolhubImageCount, dockerImagesSize:$dockerImagesSize}
  }' >"$OUTPUT_JSON"

{
  echo "# SchoolHub stabilization status"
  echo
  echo "- Generated: \`$timestamp\`"
  echo "- Overall: **$overall**"
  echo "- Git SHA (current tree): \`$git_sha\`"
  echo "- Pins aligned: \`$pins_aligned\`"
  echo "  - ACTIVE_RELEASE_SHA: \`${active_release:-<missing>}\`"
  echo "  - ACTIVE_API_RELEASE_TAG: \`${active_api:-<missing>}\`"
  echo "  - SCHOOLHUB_IMAGE_TAG: \`${env_tag:-<missing>}\`"
  echo "  - running api/web/worker: \`${running_api_tag:-?}\` / \`${running_web_tag:-?}\` / \`${running_worker_tag:-?}\`"
  echo "- Containers ok: \`$containers_ok\`"
  echo "- Local health: live=$local_live ready=$local_ready ($LOCAL_HEALTH_BASE_URL)"
  echo "- Public health: live=$public_live ready=$public_ready (${public_origin:-none})"
  echo "- Disk used: ${disk_used}%"
  echo "- schoolhub image tags: $images_count"
  echo
  echo "JSON: \`$OUTPUT_JSON\`"
} >"$OUTPUT_MD"

echo "SchoolHub stabilization status: $overall"
echo "  pins aligned: $pins_aligned"
echo "  containers:   $containers_ok"
echo "  local health: live=$local_live ready=$local_ready"
echo "  public:       live=$public_live ready=$public_ready"
echo "  disk used:    ${disk_used}%"
echo "  json:         $OUTPUT_JSON"
echo "  md:           $OUTPUT_MD"

[[ "$overall" == "ok" ]]
