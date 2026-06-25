#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${BASE_URL:-${PUBLIC_APP_ORIGIN:-}}"
ARTIFACT_DIR="${ARTIFACT_DIR:-artifacts}"
RESULT_JSON="${POST_DEPLOY_SMOKE_RESULT_JSON:-$ARTIFACT_DIR/post-deploy-smoke-result.json}"
CURL_CACERT="${CURL_CACERT:-${PUBLIC_HTTPS_CACERT:-}}"
AUTHENTICATED_AUDIT_SMOKE="${AUTHENTICATED_AUDIT_SMOKE:-NO}"
ADMIN_USERNAME="${POST_DEPLOY_SMOKE_ADMIN_USERNAME:-${ADMIN_USERNAME:-}}"
ADMIN_PASSWORD="${POST_DEPLOY_SMOKE_ADMIN_PASSWORD:-${ADMIN_PASSWORD:-}}"

if [[ -z "$BASE_URL" ]]; then
  echo "ERROR: BASE_URL atau PUBLIC_APP_ORIGIN wajib diisi." >&2
  echo "Contoh: BASE_URL='https://absensi.example.sch.id' bash scripts/post_deploy_smoke.sh" >&2
  exit 2
fi

BASE_URL="${BASE_URL%/}"
API_BASE="$BASE_URL/api/v1"
TMP_DIR="$(mktemp -d)"
CHECKS_FILE="$TMP_DIR/checks.jsonl"
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
: > "$CHECKS_FILE"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$(dirname "$RESULT_JSON")"

CURL_BASE_OPTS=(-sS --connect-timeout 10 --max-time 30)
if [[ -n "$CURL_CACERT" ]]; then
  CURL_BASE_OPTS+=(--cacert "$CURL_CACERT")
fi

mark_result() {
  local status="$1"
  local name="$2"
  local http_status="${3:-}"
  local reason="${4:-}"
  jq -cn \
    --arg name "$name" \
    --arg status "$status" \
    --arg httpStatus "$http_status" \
    --arg reason "$reason" \
    '{name:$name,status:$status,httpStatus:(if $httpStatus == "" then null else ($httpStatus|tonumber? // null) end),reason:(if $reason == "" then null else $reason end)}' >> "$CHECKS_FILE"
}

pass() {
  local name="$1"
  local http_status="${2:-}"
  PASS_COUNT=$((PASS_COUNT + 1))
  mark_result "PASS" "$name" "$http_status" ""
  echo "PASS: $name"
}

fail() {
  local name="$1"
  local reason="$2"
  local http_status="${3:-}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
  mark_result "FAIL" "$name" "$http_status" "$reason"
  echo "FAIL: $name -> $reason" >&2
}

skip() {
  local name="$1"
  local reason="$2"
  SKIP_COUNT=$((SKIP_COUNT + 1))
  mark_result "SKIP" "$name" "" "$reason"
  echo "SKIP: $name -> $reason"
}

write_summary() {
  local status="PASS"
  if (( FAIL_COUNT > 0 )); then status="FAIL"; fi
  jq -s \
    --arg baseUrl "$BASE_URL" \
    --arg status "$status" \
    --arg generatedAt "$(date -u +%FT%TZ)" \
    --argjson passCount "$PASS_COUNT" \
    --argjson failCount "$FAIL_COUNT" \
    --argjson skipCount "$SKIP_COUNT" \
    '{baseUrl:$baseUrl,generatedAt:$generatedAt,status:$status,summary:{pass:$passCount,fail:$failCount,skip:$skipCount},checks:.}' \
    "$CHECKS_FILE" > "$RESULT_JSON"
  echo "Result: $RESULT_JSON"
}

request() {
  local method="$1"
  local url="$2"
  local prefix="$3"
  shift 3
  curl "${CURL_BASE_OPTS[@]}" -X "$method" -D "$prefix.headers" -o "$prefix.body" -w '%{http_code}' "$@" "$url" 2>"$prefix.err" || printf '000'
}

expect_status() {
  local name="$1"
  local code="$2"
  local expected="$3"
  if [[ "$code" == "$expected" ]]; then
    pass "$name" "$code"
    return 0
  fi
  fail "$name" "HTTP $code, expected $expected" "$code"
  return 1
}

header_contains() {
  local name="$1"
  local file="$2"
  local pattern="$3"
  if grep -Eiq "$pattern" "$file"; then
    pass "$name"
  else
    fail "$name" "header missing"
  fi
}

body_contains() {
  local name="$1"
  local file="$2"
  local pattern="$3"
  if grep -Eiq "$pattern" "$file"; then
    pass "$name"
  else
    fail "$name" "body marker missing"
  fi
}

json_equals() {
  local name="$1"
  local file="$2"
  local jq_expr="$3"
  local expected="$4"
  local value
  value="$(jq -r "$jq_expr // empty" "$file" 2>/dev/null || true)"
  if [[ "$value" == "$expected" ]]; then
    pass "$name"
  else
    fail "$name" "unexpected JSON value"
  fi
}

root_prefix="$TMP_DIR/root"
root_code="$(request GET "$BASE_URL/" "$root_prefix" -H 'accept: text/html')"
expect_status "public root returns 200" "$root_code" "200" || true
if [[ "$root_code" == "200" ]]; then
  header_contains "public root content-type html" "$root_prefix.headers" '^content-type:.*text/html' || true
  body_contains "public root contains SPA root" "$root_prefix.body" '<div[^>]+id="root"' || true
  header_contains "public root has x-content-type-options nosniff" "$root_prefix.headers" '^x-content-type-options:.*nosniff' || true
  header_contains "public root has content-security-policy" "$root_prefix.headers" '^content-security-policy:' || true
  if [[ "$BASE_URL" == https://* ]]; then
    header_contains "public root has HSTS on HTTPS" "$root_prefix.headers" '^strict-transport-security:' || true
  else
    skip "public root HSTS" "BASE_URL is not HTTPS"
  fi
fi

health_prefix="$TMP_DIR/health"
health_code="$(request GET "$API_BASE/health/live" "$health_prefix" -H 'accept: application/json')"
expect_status "API live health returns 200" "$health_code" "200" || true
if [[ "$health_code" == "200" ]]; then
  json_equals "API live health status ok" "$health_prefix.body" '.status' 'ok' || true
fi

audit_route_prefix="$TMP_DIR/audit_route"
audit_route_code="$(request GET "$BASE_URL/admin/audit" "$audit_route_prefix" -H 'accept: text/html')"
expect_status "admin audit SPA route returns 200" "$audit_route_code" "200" || true
if [[ "$audit_route_code" == "200" ]]; then
  header_contains "admin audit route content-type html" "$audit_route_prefix.headers" '^content-type:.*text/html' || true
fi

if [[ "$AUTHENTICATED_AUDIT_SMOKE" == "YES" ]]; then
  if [[ -z "$ADMIN_USERNAME" || -z "$ADMIN_PASSWORD" ]]; then
    fail "authenticated audit smoke prerequisites" "admin credentials env missing"
  else
    cookie_jar="$TMP_DIR/admin.cookies"
    chmod 600 "$cookie_jar"
    login_body="$TMP_DIR/login.json"
    jq -cn --arg username "$ADMIN_USERNAME" --arg password "$ADMIN_PASSWORD" '{username:$username,password:$password,expectedRole:"admin"}' > "$login_body"
    chmod 600 "$login_body"
    login_prefix="$TMP_DIR/login"
    login_code="$(request POST "$API_BASE/auth/login" "$login_prefix" --cookie-jar "$cookie_jar" -H 'accept: application/json' -H 'content-type: application/json' --data-binary "@$login_body")"
    expect_status "admin login for authenticated smoke" "$login_code" "200" || true

    if [[ "$login_code" == "200" ]]; then
      audit_api_prefix="$TMP_DIR/audit_api"
      audit_api_code="$(request GET "$API_BASE/audit?page=1&limit=5" "$audit_api_prefix" --cookie "$cookie_jar" --cookie-jar "$cookie_jar" -H 'accept: application/json')"
      expect_status "authenticated audit API returns 200" "$audit_api_code" "200" || true
      if [[ "$audit_api_code" == "200" ]]; then
        if jq -e '.items | type == "array"' "$audit_api_prefix.body" >/dev/null 2>&1; then
          pass "authenticated audit API returns items array"
        else
          fail "authenticated audit API returns items array" "items is not an array"
        fi
        item_count="$(jq -r '.items | length' "$audit_api_prefix.body" 2>/dev/null || printf '0')"
        if [[ "$item_count" == "0" ]]; then
          skip "authenticated audit sequence serialization" "audit list is empty"
        elif jq -e '.items[0].sequence | type == "string"' "$audit_api_prefix.body" >/dev/null 2>&1; then
          pass "authenticated audit sequence serialized as string"
        else
          fail "authenticated audit sequence serialized as string" "sequence is not a string"
        fi
      fi
    fi
  fi
else
  skip "authenticated audit API smoke" "set AUTHENTICATED_AUDIT_SMOKE=YES with admin env to enable"
fi

write_summary
if (( FAIL_COUNT > 0 )); then
  exit 1
fi
