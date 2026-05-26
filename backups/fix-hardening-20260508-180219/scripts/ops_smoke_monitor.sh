#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_ROOT="${OUT_ROOT:-output/smoke-monitor}"
mkdir -p "$OUT_ROOT"
OUT_ROOT_ABS="$(cd "$OUT_ROOT" && pwd)"

STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$OUT_ROOT_ABS/$STAMP"
mkdir -p "$RUN_DIR"

LOG_FILE="$RUN_DIR/smoke.log"
STATUS_FILE="$OUT_ROOT_ABS/latest-status.json"
LATEST_PTR="$OUT_ROOT_ABS/latest"

BASE_URL="${BASE_URL:-}"
if [[ -z "$BASE_URL" ]] && command -v schoolhub-public-url >/dev/null 2>&1; then
  BASE_URL="$(schoolhub-public-url || true)"
fi

if [[ -z "$BASE_URL" ]]; then
  cat >"$STATUS_FILE" <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","status":"error","message":"BASE_URL kosong"}
EOF
  exit 1
fi

ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
read_env_value() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  grep -m1 "^${key}=" "$ENV_FILE" | cut -d= -f2- || true
}

ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(read_env_value ADMIN_PASSWORD)}"
DEFAULT_USER_PASSWORD="${DEFAULT_USER_PASSWORD:-$(read_env_value DEFAULT_USER_PASSWORD)}"
GURU_PASSWORD="${GURU_PASSWORD:-$DEFAULT_USER_PASSWORD}"
SISWA_PASSWORD="${SISWA_PASSWORD:-$DEFAULT_USER_PASSWORD}"

set +e
BASE_URL="$BASE_URL" ADMIN_PASSWORD="$ADMIN_PASSWORD" GURU_PASSWORD="$GURU_PASSWORD" SISWA_PASSWORD="$SISWA_PASSWORD" bash scripts/uat_smoke.sh >"$LOG_FILE" 2>&1
RUN_EXIT="$?"
set -e

PASS_COUNT="$(awk '/^  PASS :/{print $3}' "$LOG_FILE" | tail -n 1)"
FAIL_COUNT="$(awk '/^  FAIL :/{print $3}' "$LOG_FILE" | tail -n 1)"
SKIP_COUNT="$(awk '/^  SKIP :/{print $3}' "$LOG_FILE" | tail -n 1)"

PASS_COUNT="${PASS_COUNT:-0}"
FAIL_COUNT="${FAIL_COUNT:-0}"
SKIP_COUNT="${SKIP_COUNT:-0}"

if [[ "$RUN_EXIT" -eq 0 ]]; then
  STATUS="pass"
else
  STATUS="fail"
fi

cat >"$RUN_DIR/summary.json" <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","status":"$STATUS","baseUrl":"$BASE_URL","pass":$PASS_COUNT,"fail":$FAIL_COUNT,"skip":$SKIP_COUNT,"exitCode":$RUN_EXIT,"logFile":"$LOG_FILE"}
EOF

ln -sfn "$RUN_DIR" "$LATEST_PTR"
cp "$RUN_DIR/summary.json" "$STATUS_FILE"

if [[ "$RUN_EXIT" -ne 0 ]]; then
  exit "$RUN_EXIT"
fi
