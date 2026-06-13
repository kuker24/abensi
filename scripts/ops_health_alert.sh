#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/schoolhub}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
BASE_URL="${ALERT_BASE_URL:-${BASE_URL:-}}"
WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
MIN_BACKUP_AGE_HOURS="${ALERT_MIN_BACKUP_AGE_HOURS:-26}"
BACKUP_DIR="${BACKUP_DIR:-/home/schoolhub/backups/database}"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/output/health-alert}"
mkdir -p "$LOG_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/$TS.log"
LATEST_FILE="$LOG_DIR/latest-status.json"

if [[ -z "$BASE_URL" ]] && command -v schoolhub-public-url >/dev/null 2>&1; then
  BASE_URL="$(schoolhub-public-url || true)"
fi

failures=()
passes=()

record_pass() { passes+=("$1"); echo "PASS: $1" | tee -a "$LOG_FILE"; }
record_fail() { failures+=("$1"); echo "FAIL: $1" | tee -a "$LOG_FILE"; }

check_url() {
  local name="$1" url="$2"
  if curl -fsS --max-time 20 "$url" >/dev/null; then record_pass "$name"; else record_fail "$name"; fi
}

if [[ -n "$BASE_URL" ]]; then
  check_url "health-live" "$BASE_URL/health/live"
  check_url "health-ready" "$BASE_URL/health/ready"
  check_url "root-html" "$BASE_URL/"
else
  record_fail "base-url-not-found"
fi

if [[ -d "$ROOT_DIR" ]]; then
  cd "$ROOT_DIR"
  if docker compose -f docker-compose.production.yml --env-file "$ENV_FILE" ps --format json >/tmp/schoolhub-compose-ps.json 2>/dev/null; then
    if grep -q 'unhealthy\|exited\|dead' /tmp/schoolhub-compose-ps.json; then record_fail "container-status"; else record_pass "container-status"; fi
  else
    record_fail "docker-compose-ps"
  fi
else
  record_fail "root-dir-missing"
fi

if systemctl is-active --quiet schoolhub-db-backup.timer; then record_pass "backup-timer-active"; else record_fail "backup-timer-active"; fi

latest_backup="$(find "$BACKUP_DIR" -type f -name 'schoolhub-*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2- || true)"
if [[ -n "$latest_backup" ]]; then
  now=$(date +%s)
  mtime=$(stat -c %Y "$latest_backup")
  age_hours=$(( (now - mtime) / 3600 ))
  if ! gunzip -t "$latest_backup" >/dev/null 2>&1; then
    record_fail "backup-corrupt"
  elif (( age_hours <= MIN_BACKUP_AGE_HOURS )); then
    record_pass "backup-age-${age_hours}h"
  else
    record_fail "backup-too-old-${age_hours}h"
  fi
else
  record_fail "backup-not-found"
fi

status="ok"
if (( ${#failures[@]} > 0 )); then status="fail"; fi

python3 - "$LATEST_FILE" "$status" "${#passes[@]}" "${#failures[@]}" "$BASE_URL" <<'PY'
import json, sys, datetime
path, status, pass_count, fail_count, base_url = sys.argv[1:]
json.dump({
  "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "status": status,
  "pass": int(pass_count),
  "fail": int(fail_count),
  "baseUrl": base_url,
}, open(path, 'w'), indent=2)
PY

if [[ "$status" == "fail" && -n "$WEBHOOK_URL" ]]; then
  msg="SchoolHub health alert FAIL on $(hostname): ${failures[*]}"
  curl -fsS --max-time 20 -H 'content-type: application/json' -d "{\"text\":$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$msg")}" "$WEBHOOK_URL" >/dev/null || true
fi

cat "$LATEST_FILE"
[[ "$status" == "ok" ]]
