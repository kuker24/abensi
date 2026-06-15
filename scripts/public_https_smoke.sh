#!/usr/bin/env bash
set -uo pipefail

PUBLIC_APP_ORIGIN="${PUBLIC_APP_ORIGIN:-${HTTPS_BASE_URL:-}}"
ADMIN_USERNAME="${ADMIN_USERNAME:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
PUBLIC_HTTP_ORIGIN="${PUBLIC_HTTP_ORIGIN:-}"
ARTIFACT_DIR="${ARTIFACT_DIR:-artifacts/public-https-smoke}"
RESULT_JSON="${PUBLIC_HTTPS_RESULT_JSON:-$ARTIFACT_DIR/result.json}"
CURL_CACERT="${CURL_CACERT:-${PUBLIC_HTTPS_CACERT:-}}"
CERT_MIN_REMAINING_DAYS="${CERT_MIN_REMAINING_DAYS:-14}"
CHECK_INTERNAL_PORTS="${PUBLIC_HTTPS_CHECK_INTERNAL_PORTS:-YES}"

if [[ -z "$PUBLIC_APP_ORIGIN" || "$PUBLIC_APP_ORIGIN" != https://* ]]; then
  echo "ERROR: PUBLIC_APP_ORIGIN=https://... is required" >&2
  exit 1
fi
if [[ -z "$ADMIN_USERNAME" || -z "$ADMIN_PASSWORD" ]]; then
  echo "ERROR: ADMIN_USERNAME and ADMIN_PASSWORD (or dedicated smoke credentials) are required" >&2
  exit 1
fi

BASE_URL="${PUBLIC_APP_ORIGIN%/}"
API_BASE="$BASE_URL/api/v1"
mkdir -p "$ARTIFACT_DIR" "$(dirname "$RESULT_JSON")"
TMP_DIR="$(mktemp -d)"
CHECKS_FILE="$TMP_DIR/checks.jsonl"
: > "$CHECKS_FILE"
trap 'rm -rf "$TMP_DIR"' EXIT

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
CURL_BASE_OPTS=(-sS --connect-timeout 10 --max-time 30)
OPENSSL_VERIFY_ARGS=()
if [[ -n "$CURL_CACERT" ]]; then
  CURL_BASE_OPTS+=(--cacert "$CURL_CACERT")
  OPENSSL_VERIFY_ARGS=(-CAfile "$CURL_CACERT")
fi

hostport="${BASE_URL#https://}"
hostport="${hostport%%/*}"
HOST="$hostport"
PORT="443"
if [[ "$hostport" == *:* ]]; then
  HOST="${hostport%%:*}"
  PORT="${hostport##*:}"
fi
if [[ -z "$PUBLIC_HTTP_ORIGIN" ]]; then
  PUBLIC_HTTP_ORIGIN="http://${hostport}"
fi

record() {
  local status="$1" name="$2" http_status="${3:-}" reason="${4:-}"
  jq -cn --arg name "$name" --arg status "$status" --arg httpStatus "$http_status" --arg reason "$reason" \
    '{name:$name,status:$status,httpStatus:(if $httpStatus=="" then null else ($httpStatus|tonumber? // null) end),reason:(if $reason=="" then null else $reason end)}' >> "$CHECKS_FILE"
}
pass() { PASS_COUNT=$((PASS_COUNT + 1)); record PASS "$1" "${2:-}" ""; echo "PASS: $1"; }
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); record FAIL "$1" "${3:-}" "$2"; echo "FAIL: $1 -> $2"; }
skip() { SKIP_COUNT=$((SKIP_COUNT + 1)); record SKIP "$1" "" "$2"; echo "SKIP: $1 -> $2"; }

write_result() {
  local status="FAIL"
  [[ "$FAIL_COUNT" -eq 0 ]] && status="PASS"
  jq -s --arg timestamp "$(date -u +%FT%TZ)" --arg base "$BASE_URL" --arg status "$status" \
    --argjson pass "$PASS_COUNT" --argjson fail "$FAIL_COUNT" --argjson skip "$SKIP_COUNT" \
    '{timestamp:$timestamp,testedBaseUrl:$base,status:$status,ok:($status=="PASS"),summary:{pass:$pass,fail:$fail,skip:$skip},checks:.}' \
    "$CHECKS_FILE" > "$RESULT_JSON"
  jq -c '.' "$RESULT_JSON"
}

body_file() {
  local body="$1" file
  file="$(mktemp "$TMP_DIR/body.XXXXXX")"
  chmod 600 "$file"
  printf '%s' "$body" > "$file"
  printf '%s' "$file"
}

csrf_config() {
  local token="$1" file
  file="$(mktemp "$TMP_DIR/csrf.XXXXXX")"
  chmod 600 "$file"
  printf 'header = "x-csrf-token: %s"\n' "$token" > "$file"
  printf '%s' "$file"
}

request() {
  local method="$1" url="$2" cookie_jar="$3" csrf="$4" body="$5" prefix="$6"
  local args=("${CURL_BASE_OPTS[@]}" -X "$method" -D "$prefix.headers" -o "$prefix.body" -w '%{http_code}' -H 'accept: application/json')
  [[ -n "$cookie_jar" ]] && args+=(--cookie "$cookie_jar" --cookie-jar "$cookie_jar")
  if [[ -n "$body" ]]; then
    args+=(-H 'content-type: application/json' --data-binary "@$(body_file "$body")")
  fi
  if [[ -n "$csrf" ]]; then
    args+=(--config "$(csrf_config "$csrf")")
  fi
  curl "${args[@]}" "$url" 2>"$prefix.err" || printf '000'
}

json_field() {
  jq -r "$2 // empty" "$1" 2>/dev/null || true
}

expect_code() {
  local name="$1" code="$2" expected="$3"
  if [[ "$code" == "$expected" ]]; then pass "$name" "$code"; else fail "$name" "expected $expected got $code" "$code"; fi
}

expect_success() {
  local name="$1" code="$2"
  if [[ "$code" == "200" || "$code" == "201" || "$code" == "204" ]]; then pass "$name" "$code"; else fail "$name" "HTTP $code" "$code"; fi
}

cookie_jar="$TMP_DIR/cookies.txt"
touch "$cookie_jar"
chmod 600 "$cookie_jar"

redirect_code="$(curl "${CURL_BASE_OPTS[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' "$PUBLIC_HTTP_ORIGIN/health/live" 2>"$TMP_DIR/redirect.err" || printf '000 ')"
if grep -Eq '^30[178][[:space:]]+https://' <<< "$redirect_code"; then
  pass "HTTP redirects to HTTPS"
else
  fail "HTTP redirects to HTTPS" "unexpected redirect result"
fi

if curl "${CURL_BASE_OPTS[@]}" -fsS "$BASE_URL/health/live" -o "$ARTIFACT_DIR/live.json" -D "$ARTIFACT_DIR/live.headers"; then
  pass "TLS certificate trusted and /health/live succeeds" 200
else
  fail "TLS certificate trusted and /health/live succeeds" "curl failed without insecure mode"
fi

if openssl s_client -connect "$HOST:$PORT" -servername "$HOST" "${OPENSSL_VERIFY_ARGS[@]}" -verify_hostname "$HOST" </dev/null > "$TMP_DIR/s_client.txt" 2>&1; then
  if grep -q 'Verify return code: 0' "$TMP_DIR/s_client.txt"; then
    pass "Certificate chain trusted and hostname matches"
  else
    fail "Certificate chain trusted and hostname matches" "OpenSSL verification did not return code 0"
  fi
else
  fail "Certificate chain trusted and hostname matches" "OpenSSL connection failed"
fi

if openssl s_client -connect "$HOST:$PORT" -servername "$HOST" "${OPENSSL_VERIFY_ARGS[@]}" </dev/null 2>/dev/null | openssl x509 -out "$TMP_DIR/server.crt" 2>/dev/null; then
  end_date="$(openssl x509 -in "$TMP_DIR/server.crt" -noout -enddate | cut -d= -f2-)"
  end_epoch="$(date -d "$end_date" +%s)"
  now_epoch="$(date +%s)"
  remaining_days=$(( (end_epoch - now_epoch) / 86400 ))
  if (( remaining_days >= CERT_MIN_REMAINING_DAYS )); then
    pass "Certificate lifetime above threshold"
  else
    fail "Certificate lifetime above threshold" "remaining days ${remaining_days} below ${CERT_MIN_REMAINING_DAYS}"
  fi
else
  fail "Certificate lifetime above threshold" "unable to parse certificate"
fi

code="$(request GET "$BASE_URL/health/ready" "" "" "" "$TMP_DIR/ready")"
expect_success "/health/ready succeeds" "$code"

for header in strict-transport-security x-content-type-options x-frame-options referrer-policy permissions-policy content-security-policy; do
  if grep -iq "^$header:" "$ARTIFACT_DIR/live.headers"; then
    pass "Security header present: $header"
  else
    fail "Security header present: $header" "missing"
  fi
done

login_body="$(jq -cn --arg username "$ADMIN_USERNAME" --arg password "$ADMIN_PASSWORD" '{username:$username,password:$password,expectedRole:"admin"}')"
code="$(request POST "$API_BASE/auth/login" "$cookie_jar" "" "$login_body" "$TMP_DIR/login")"
expect_success "Login works through HTTPS" "$code"
if grep -iq '^set-cookie:.*schoolhub_access_token=.*HttpOnly' "$TMP_DIR/login.headers"; then pass "Authentication cookie is HttpOnly"; else fail "Authentication cookie is HttpOnly" "missing HttpOnly"; fi
if grep -iq '^set-cookie:.*schoolhub_access_token=.*Secure' "$TMP_DIR/login.headers"; then pass "Authentication cookie is Secure"; else fail "Authentication cookie is Secure" "missing Secure"; fi
if grep -Eiq '^set-cookie:.*schoolhub_access_token=.*SameSite=Lax' "$TMP_DIR/login.headers"; then pass "Authentication cookie SameSite=Lax"; else fail "Authentication cookie SameSite=Lax" "missing SameSite=Lax"; fi
if grep -Eiq '^set-cookie:.*schoolhub_access_token=.*Path=/' "$TMP_DIR/login.headers"; then pass "Authentication cookie Path=/"; else fail "Authentication cookie Path=/" "missing Path=/"; fi

code="$(request GET "$API_BASE/auth/me" "$cookie_jar" "" "" "$TMP_DIR/me")"
expect_success "/auth/me succeeds with cookie jar" "$code"

code="$(request POST "$API_BASE/auth/logout" "$cookie_jar" "" '{}' "$TMP_DIR/logout_no_csrf")"
expect_code "Missing CSRF mutation is rejected" "$code" 403

code="$(request GET "$API_BASE/auth/csrf" "$cookie_jar" "" "" "$TMP_DIR/csrf")"
expect_success "CSRF token endpoint succeeds" "$code"
csrf_token="$(json_field "$TMP_DIR/csrf.body" '.csrfToken')"
if [[ -n "$csrf_token" ]]; then
  code="$(request POST "$API_BASE/auth/logout" "$cookie_jar" "$csrf_token" '{}' "$TMP_DIR/logout_valid_csrf")"
  expect_success "Valid CSRF mutation succeeds" "$code"
else
  fail "Valid CSRF mutation succeeds" "CSRF token missing"
fi

code="$(request GET "$API_BASE/auth/me" "$cookie_jar" "" "" "$TMP_DIR/me_after_logout")"
if [[ "$code" == "401" || "$code" == "403" ]]; then pass "Logout invalidates the session" "$code"; else fail "Logout invalidates the session" "expected 401/403 got $code" "$code"; fi

# Re-login for SSE and final checks.
code="$(request POST "$API_BASE/auth/login" "$cookie_jar" "" "$login_body" "$TMP_DIR/login_sse")"
expect_success "Re-login for SSE succeeds" "$code"
if curl "${CURL_BASE_OPTS[@]}" --cookie "$cookie_jar" -N --max-time 10 -D "$ARTIFACT_DIR/sse.headers" "$API_BASE/reports/live-monitor/stream?limit=1" -o "$ARTIFACT_DIR/sse.txt" 2>"$TMP_DIR/sse.err" || true; then
  if grep -iq 'content-type: text/event-stream' "$ARTIFACT_DIR/sse.headers" && grep -Eq 'event: (snapshot|heartbeat)' "$ARTIFACT_DIR/sse.txt"; then
    pass "Authenticated SSE connection opens and emits event"
  else
    fail "Authenticated SSE connection opens and emits event" "SSE headers/body did not contain expected event"
  fi
else
  fail "Authenticated SSE connection opens and emits event" "curl failed"
fi

if curl "${CURL_BASE_OPTS[@]}" -fsS "$BASE_URL/" -o "$ARTIFACT_DIR/root.html"; then
  if grep -Eiq 'http://[^"'"'"' <>]+' "$ARTIFACT_DIR/root.html"; then
    fail "No mixed-content configuration detected" "root HTML contains http:// URL"
  else
    pass "No mixed-content configuration detected"
  fi
else
  fail "No mixed-content configuration detected" "root HTML fetch failed"
fi

if [[ "$CHECK_INTERNAL_PORTS" == "YES" ]]; then
  for port in 5432 6379 3000 8080; do
    if timeout 3 bash -c "</dev/tcp/$HOST/$port" >/dev/null 2>&1; then
      fail "Internal service port $port is not publicly reachable" "port is reachable"
    else
      pass "Internal service port $port is not publicly reachable"
    fi
  done
else
  skip "Internal service ports are not publicly reachable" "disabled for this fixture"
fi

csrf_token="$(request GET "$API_BASE/auth/csrf" "$cookie_jar" "" "" "$TMP_DIR/csrf_final" >/dev/null; json_field "$TMP_DIR/csrf_final.body" '.csrfToken')"
if [[ -n "$csrf_token" ]]; then
  code="$(request POST "$API_BASE/auth/logout" "$cookie_jar" "$csrf_token" '{}' "$TMP_DIR/logout_final")"
  expect_success "Final logout succeeds" "$code"
fi

if [[ "$FAIL_COUNT" -eq 0 ]]; then
  echo "RESULT: PASS"
else
  echo "RESULT: FAIL ($FAIL_COUNT checks failed)"
fi
write_result
[[ "$FAIL_COUNT" -eq 0 ]]
