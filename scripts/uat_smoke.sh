#!/usr/bin/env bash
set -uo pipefail

BASE_URL="${BASE_URL:-}"
if [[ -z "$BASE_URL" ]] && command -v schoolhub-public-url >/dev/null 2>&1; then
  BASE_URL="$(schoolhub-public-url || true)"
fi

if [[ -z "$BASE_URL" ]]; then
  echo "ERROR: BASE_URL belum diisi."
  echo "Contoh: BASE_URL='https://app.example.sch.id' bash scripts/uat_smoke.sh"
  exit 1
fi

BASE_URL="${BASE_URL%/}"
API_BASE="$BASE_URL/api/v1"
TODAY="$(date +%F)"
GIT_SHA="$(git rev-parse HEAD 2>/dev/null || printf 'unknown')"

ADMIN_USERNAME="${ADMIN_USERNAME:-admin.tu}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
GURU_USERNAME="${GURU_USERNAME:-guru.matematika}"
GURU_PASSWORD="${GURU_PASSWORD:-}"
SISWA_USERNAME="${SISWA_USERNAME:-siswa.citra}"
SISWA_PASSWORD="${SISWA_PASSWORD:-}"
ALLOW_MUTATING_SMOKE="${ALLOW_MUTATING_SMOKE:-NO}"
UAT_LATITUDE="${UAT_LATITUDE:-}"
UAT_LONGITUDE="${UAT_LONGITUDE:-}"
UAT_ACCURACY_METER="${UAT_ACCURACY_METER:-}"
UAT_SESSION_ID="${UAT_SESSION_ID:-}"
UAT_EXPECTED_SAMESITE="${UAT_EXPECTED_SAMESITE:-Lax}"
ARTIFACT_DIR="${ARTIFACT_DIR:-artifacts}"
RESULT_JSON="${UAT_RESULT_JSON:-$ARTIFACT_DIR/uat-smoke-result.json}"
CURL_CACERT="${CURL_CACERT:-${PUBLIC_HTTPS_CACERT:-}}"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
RESULT_LOG=()
BLOCKING_BUGS=()
MUTATING_CSRF_SUCCESS=false

TMP_DIR="$(mktemp -d)"
CHECKS_FILE="$TMP_DIR/checks.jsonl"
: > "$CHECKS_FILE"
# shellcheck disable=SC2317,SC2329
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

mark_pass() {
  local name="$1"
  local http_status="${2:-}"
  PASS_COUNT=$((PASS_COUNT + 1))
  RESULT_LOG+=("PASS | $name")
  mark_result "PASS" "$name" "$http_status" ""
  echo "PASS: $name"
}

mark_fail() {
  local name="$1"
  local message="$2"
  local http_status="${3:-}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
  RESULT_LOG+=("FAIL | $name | $message")
  BLOCKING_BUGS+=("$name -> $message")
  mark_result "FAIL" "$name" "$http_status" "$message"
  echo "FAIL: $name -> $message"
}

mark_skip() {
  local name="$1"
  local message="$2"
  SKIP_COUNT=$((SKIP_COUNT + 1))
  RESULT_LOG+=("SKIP | $name | $message")
  mark_result "SKIP" "$name" "" "$message"
  echo "SKIP: $name -> $message"
}

mutating_smoke_enabled() {
  [[ "$ALLOW_MUTATING_SMOKE" == "YES" ]]
}

json_body_file() {
  local body="$1"
  local file
  file="$(mktemp "$TMP_DIR/body.XXXXXX")"
  chmod 600 "$file"
  printf '%s' "$body" > "$file"
  printf '%s' "$file"
}

csrf_config_file() {
  local token="$1"
  local file
  file="$(mktemp "$TMP_DIR/curl-csrf.XXXXXX")"
  chmod 600 "$file"
  printf 'header = "x-csrf-token: %s"\n' "$token" > "$file"
  printf '%s' "$file"
}

api_request() {
  local method="$1"
  local path="$2"
  local cookie_jar="$3"
  local csrf_token="$4"
  local body="$5"
  local prefix="$6"
  local url="$API_BASE$path"
  local body_out="$prefix.body"
  local headers_out="$prefix.headers"
  local err_out="$prefix.err"
  local args=("${CURL_BASE_OPTS[@]}" -X "$method" -D "$headers_out" -o "$body_out" -w '%{http_code}' -H 'accept: application/json')

  if [[ -n "$cookie_jar" ]]; then
    args+=(--cookie "$cookie_jar" --cookie-jar "$cookie_jar")
  fi
  if [[ -n "$body" ]]; then
    local body_file
    body_file="$(json_body_file "$body")"
    args+=(-H 'content-type: application/json' --data-binary "@$body_file")
  fi
  if [[ -n "$csrf_token" ]]; then
    local csrf_file
    csrf_file="$(csrf_config_file "$csrf_token")"
    args+=(--config "$csrf_file")
  fi

  local code
  code="$(curl "${args[@]}" "$url" 2>"$err_out" || printf '000')"
  printf '%s' "$code"
}

api_get_root() {
  local path="$1"
  local prefix="$2"
  curl "${CURL_BASE_OPTS[@]}" -D "$prefix.headers" -o "$prefix.body" -w '%{http_code}' "$BASE_URL$path" 2>"$prefix.err" || printf '000'
}

json_field() {
  local file="$1"
  local expr="$2"
  jq -r "$expr // empty" "$file" 2>/dev/null || true
}

expect_success() {
  local name="$1"
  local code="$2"
  if [[ "$code" == "200" || "$code" == "201" ]]; then
    mark_pass "$name" "$code"
    return 0
  fi
  mark_fail "$name" "HTTP $code" "$code"
  return 1
}

expect_rejected() {
  local name="$1"
  local code="$2"
  if [[ "$code" != "200" && "$code" != "201" && "$code" != "204" ]]; then
    mark_pass "$name" "$code"
    return 0
  fi
  mark_fail "$name" "request unexpectedly succeeded" "$code"
  return 1
}

new_cookie_jar() {
  local role="$1"
  local file
  file="$(mktemp "$TMP_DIR/${role}.cookies.XXXXXX")"
  chmod 600 "$file"
  printf '%s' "$file"
}

get_csrf_token() {
  local role="$1"
  local cookie_jar="$2"
  local prefix="$TMP_DIR/${role}_csrf"
  local code
  code="$(api_request GET /auth/csrf "$cookie_jar" "" "" "$prefix")"
  if [[ "$code" != "200" ]]; then
    mark_fail "CSRF token retrieval $role" "HTTP $code" "$code" >&2
    printf ''
    return 1
  fi
  local token
  token="$(json_field "$prefix.body" '.csrfToken')"
  if [[ -z "$token" ]]; then
    mark_fail "CSRF token retrieval $role" "response missing token" "$code" >&2
    printf ''
    return 1
  fi
  mark_pass "CSRF token retrieval $role" "$code" >&2
  printf '%s' "$token"
}

check_auth_cookie_attributes() {
  local role="$1"
  local headers_file="$2"
  local auth_cookie_line
  auth_cookie_line="$(grep -i '^set-cookie:' "$headers_file" | grep -i 'schoolhub_access_token=' | head -n 1 | tr -d '\r' || true)"
  if [[ -z "$auth_cookie_line" ]]; then
    mark_fail "Auth cookie present $role" "schoolhub_access_token Set-Cookie header missing"
    return 1
  fi
  mark_pass "Auth cookie present $role"

  if grep -Eiq ';[[:space:]]*HttpOnly([;[:space:]]|$)' <<< "$auth_cookie_line"; then
    mark_pass "Auth cookie HttpOnly $role"
    mark_pass "Auth cookie not exposed through JavaScript $role"
  else
    mark_fail "Auth cookie HttpOnly $role" "HttpOnly attribute missing"
  fi

  if [[ "$BASE_URL" == https://* ]]; then
    if grep -Eiq ';[[:space:]]*Secure([;[:space:]]|$)' <<< "$auth_cookie_line"; then
      mark_pass "Auth cookie Secure $role"
    else
      mark_fail "Auth cookie Secure $role" "Secure attribute missing on HTTPS"
    fi
  else
    mark_skip "Auth cookie Secure $role" "BASE_URL is not HTTPS"
  fi

  if grep -Eiq ";[[:space:]]*SameSite=${UAT_EXPECTED_SAMESITE}([;[:space:]]|$)" <<< "$auth_cookie_line"; then
    mark_pass "Auth cookie SameSite=$UAT_EXPECTED_SAMESITE $role"
  else
    mark_fail "Auth cookie SameSite $role" "SameSite=$UAT_EXPECTED_SAMESITE missing"
  fi

  if grep -Eiq ';[[:space:]]*Path=/([;[:space:]]|$)' <<< "$auth_cookie_line"; then
    mark_pass "Auth cookie Path=/ $role"
  else
    mark_fail "Auth cookie Path $role" "Path=/ missing"
  fi
}

login_role() {
  local role_label="$1"
  local username="$2"
  local password="$3"
  local expected_role="$4"
  local expected_area="$5"
  local cookie_jar="$6"
  local prefix="$TMP_DIR/login_${role_label}"
  local body
  body="$(jq -cn --arg username "$username" --arg password "$password" --arg expectedRole "$expected_area" '{username:$username,password:$password,expectedRole:$expectedRole}')"
  local code
  code="$(api_request POST /auth/login "$cookie_jar" "" "$body" "$prefix")"
  if ! expect_success "Login $role_label" "$code"; then
    return 1
  fi
  check_auth_cookie_attributes "$role_label" "$prefix.headers"

  local returned_role returned_username
  returned_role="$(json_field "$prefix.body" '.user.role')"
  returned_username="$(json_field "$prefix.body" '.user.username')"
  if [[ "$returned_role" == "$expected_role" ]]; then
    mark_pass "Login role $role_label -> $expected_role"
  else
    mark_fail "Login role $role_label" "expected $expected_role got ${returned_role:-empty}"
  fi
  if [[ "$returned_username" == "$username" ]]; then
    mark_pass "Login username $role_label"
  else
    mark_fail "Login username $role_label" "unexpected username in response"
  fi

  local me_prefix="$TMP_DIR/me_${role_label}"
  code="$(api_request GET /auth/me "$cookie_jar" "" "" "$me_prefix")"
  if expect_success "/auth/me $role_label" "$code"; then
    returned_role="$(json_field "$me_prefix.body" '.user.role')"
    returned_username="$(json_field "$me_prefix.body" '.user.username')"
    if [[ "$returned_role" == "$expected_role" && "$returned_username" == "$username" ]]; then
      mark_pass "/auth/me identity $role_label"
    else
      mark_fail "/auth/me identity $role_label" "role or username mismatch"
    fi
  fi
}

logout_and_verify() {
  local role_label="$1"
  local cookie_jar="$2"
  local token
  token="$(get_csrf_token "$role_label logout" "$cookie_jar")" || return 1
  local prefix="$TMP_DIR/logout_${role_label}"
  local code
  code="$(api_request POST /auth/logout "$cookie_jar" "$token" '{}' "$prefix")"
  if ! expect_success "Logout $role_label with CSRF" "$code"; then
    return 1
  fi
  local me_prefix="$TMP_DIR/me_after_logout_${role_label}"
  code="$(api_request GET /auth/me "$cookie_jar" "" "" "$me_prefix")"
  if [[ "$code" == "401" || "$code" == "403" ]]; then
    mark_pass "Logout invalidates session $role_label" "$code"
  else
    mark_fail "Logout invalidates session $role_label" "expected 401/403 got $code" "$code"
  fi
}

require_mutating_geo() {
  if ! mutating_smoke_enabled; then
    return 0
  fi
  local missing=()
  [[ -z "$UAT_LATITUDE" ]] && missing+=(UAT_LATITUDE)
  [[ -z "$UAT_LONGITUDE" ]] && missing+=(UAT_LONGITUDE)
  [[ -z "$UAT_ACCURACY_METER" ]] && missing+=(UAT_ACCURACY_METER)
  if [[ "${#missing[@]}" -gt 0 ]]; then
    mark_fail "Mutating geolocation env" "missing ${missing[*]}"
    return 1
  fi
  if ! jq -en --arg lat "$UAT_LATITUDE" --arg lng "$UAT_LONGITUDE" --arg acc "$UAT_ACCURACY_METER" '
    ($lat|tonumber) as $latitude |
    ($lng|tonumber) as $longitude |
    ($acc|tonumber) as $accuracy |
    ($latitude >= -90 and $latitude <= 90 and $longitude >= -180 and $longitude <= 180 and $accuracy >= 0)
  ' >/dev/null; then
    mark_fail "Mutating geolocation env" "coordinate variables are invalid"
    return 1
  fi
  mark_pass "Mutating geolocation env"
}

geo_payload() {
  jq -cn \
    --arg lat "$UAT_LATITUDE" \
    --arg lng "$UAT_LONGITUDE" \
    --arg acc "$UAT_ACCURACY_METER" \
    --arg capturedAt "$(date -u +%FT%TZ)" \
    '{latitude:($lat|tonumber),longitude:($lng|tonumber),accuracyMeter:($acc|tonumber),capturedAt:$capturedAt,source:"browser_geolocation"}'
}

write_result_json() {
  local final_status="FAIL"
  [[ "$FAIL_COUNT" -eq 0 ]] && final_status="PASS"
  jq -s \
    --arg timestamp "$(date -u +%FT%TZ)" \
    --arg testedBaseUrl "$BASE_URL" \
    --arg gitSha "$GIT_SHA" \
    --arg mode "$(mutating_smoke_enabled && printf 'mutating' || printf 'read-only')" \
    --arg status "$final_status" \
    --argjson pass "$PASS_COUNT" \
    --argjson fail "$FAIL_COUNT" \
    --argjson skip "$SKIP_COUNT" \
    '{timestamp:$timestamp,testedBaseUrl:$testedBaseUrl,gitSha:$gitSha,mode:$mode,status:$status,summary:{pass:$pass,fail:$fail,skip:$skip},checks:.}' \
    "$CHECKS_FILE" > "$RESULT_JSON"
}

finish() {
  write_result_json
  echo
  if [[ "$FAIL_COUNT" -eq 0 ]]; then
    echo "RESULT: PASS (tanpa bug blocking dari smoke otomatis)"
  else
    echo "RESULT: FAIL ($FAIL_COUNT blocking issue)"
  fi
  echo
  echo "Summary:"
  echo "  PASS : $PASS_COUNT"
  echo "  FAIL : $FAIL_COUNT"
  echo "  SKIP : $SKIP_COUNT"
  echo "  JSON : $RESULT_JSON"
  echo
  echo "Detailed Results:"
  for line in "${RESULT_LOG[@]}"; do
    echo "  - $line"
  done
  if [[ "${#BLOCKING_BUGS[@]}" -gt 0 ]]; then
    echo
    echo "Blocking Bugs:"
    for bug in "${BLOCKING_BUGS[@]}"; do
      echo "  - $bug"
    done
  fi
  [[ "$FAIL_COUNT" -eq 0 ]]
}

if [[ -z "$ADMIN_PASSWORD" || -z "$GURU_PASSWORD" || -z "$SISWA_PASSWORD" ]]; then
  echo "ERROR: ADMIN_PASSWORD, GURU_PASSWORD, dan SISWA_PASSWORD wajib diisi untuk smoke test."
  exit 1
fi

if ! require_mutating_geo; then
  finish
  exit 1
fi

legacy_pattern='[Aa]uthorization:|access''Token'
if grep -Eq "$legacy_pattern" "$0"; then
  mark_fail "Legacy browser auth header dependency absent" "script still contains legacy token response/header pattern"
else
  mark_pass "Legacy browser auth header dependency absent"
fi

echo "== SchoolHub Core UAT Smoke =="
echo "BASE_URL=$BASE_URL"
echo "DATE=$TODAY"
if mutating_smoke_enabled; then
  echo "MODE=mutating UAT (ALLOW_MUTATING_SMOKE=YES)"
else
  echo "MODE=read-only production smoke"
fi
echo

code="$(api_get_root /health/live "$TMP_DIR/health_live")"
if [[ "$code" == "200" && "$(json_field "$TMP_DIR/health_live.body" '.status')" == "ok" ]]; then
  mark_pass "Health live" "$code"
else
  mark_fail "Health live" "HTTP $code or status not ok" "$code"
fi

code="$(api_get_root /health/ready "$TMP_DIR/health_ready")"
if [[ "$code" == "200" && "$(json_field "$TMP_DIR/health_ready.body" '.status')" == "ready" ]]; then
  mark_pass "Health ready" "$code"
else
  mark_fail "Health ready" "HTTP $code or status not ready" "$code"
fi

code="$(api_get_root / "$TMP_DIR/root")"
if [[ "$code" == "200" ]] && grep -qi "schoolhub\|e-Hadir\|MAN 1" "$TMP_DIR/root.body"; then
  mark_pass "Root HTML online" "$code"
else
  mark_fail "Root HTML online" "HTTP $code or expected app marker missing" "$code"
fi

ADMIN_COOKIE_JAR="$(new_cookie_jar admin)"
GURU_COOKIE_JAR="$(new_cookie_jar guru)"
SISWA_COOKIE_JAR="$(new_cookie_jar siswa)"
INVALID_COOKIE_JAR="$(new_cookie_jar invalid)"

if ! login_role admin "$ADMIN_USERNAME" "$ADMIN_PASSWORD" ADMIN_TU admin "$ADMIN_COOKIE_JAR"; then
  echo
  echo "Admin login gagal, smoke dihentikan."
  finish
  exit 1
fi

invalid_body="$(jq -cn --arg username "$ADMIN_USERNAME" --arg password "invalid-uat-password" '{username:$username,password:$password,expectedRole:"admin"}')"
code="$(api_request POST /auth/login "$INVALID_COOKIE_JAR" "" "$invalid_body" "$TMP_DIR/invalid_login")"
if [[ "$code" == "401" || "$code" == "403" || "$code" == "429" ]]; then
  mark_pass "Invalid credentials fail" "$code"
else
  mark_fail "Invalid credentials fail" "expected 401/403/429 got $code" "$code"
fi

code="$(api_request POST /auth/logout "$ADMIN_COOKIE_JAR" "" '{}' "$TMP_DIR/logout_without_csrf")"
if [[ "$code" == "403" ]]; then
  mark_pass "Missing CSRF mutation fails" "$code"
else
  mark_fail "Missing CSRF mutation fails" "expected 403 got $code" "$code"
fi

code="$(api_request POST /internal/reconciliation/run "" "" '{}' "$TMP_DIR/internal_without_worker")"
expect_rejected "Internal worker endpoint without worker signature rejected" "$code" || true

code="$(api_request POST /attendance/reader-scan "" "" '{"cardUid":"UAT-NO-SIGNATURE"}' "$TMP_DIR/reader_without_signature")"
expect_rejected "Reader scan without signature rejected" "$code" || true

code="$(api_request GET '/reports/dashboard' "$ADMIN_COOKIE_JAR" "" "" "$TMP_DIR/admin_dashboard")"
if expect_success "Admin dashboard API" "$code"; then
  if [[ "$(json_field "$TMP_DIR/admin_dashboard.body" '.sessionsToday | type')" == "number" ]]; then
    mark_pass "Admin dashboard shape"
  else
    mark_fail "Admin dashboard shape" "sessionsToday bukan number"
  fi
fi

code="$(api_request GET '/reports/live-monitor?page=1&limit=5' "$ADMIN_COOKIE_JAR" "" "" "$TMP_DIR/admin_live_monitor")"
if expect_success "Admin live monitor API" "$code"; then
  if [[ "$(json_field "$TMP_DIR/admin_live_monitor.body" '.items | type')" == "array" ]]; then
    mark_pass "Admin live monitor shape"
  else
    mark_fail "Admin live monitor shape" "items bukan array"
  fi
fi

code="$(api_request GET '/identity/users?page=1&limit=2' "$ADMIN_COOKIE_JAR" "" "" "$TMP_DIR/admin_users")"
if expect_success "Admin list users API" "$code"; then
  if [[ "$(json_field "$TMP_DIR/admin_users.body" '.meta.total | type')" == "number" ]]; then
    mark_pass "Admin list users pagination"
  else
    mark_fail "Admin list users pagination" "meta.total tidak valid"
  fi
fi

admin_csrf="$(get_csrf_token admin "$ADMIN_COOKIE_JAR")" || admin_csrf=""
code="$(api_request GET '/reconciliation/flags?status=OPEN&page=1&limit=1' "$ADMIN_COOKIE_JAR" "" "" "$TMP_DIR/admin_flags_open")"
if expect_success "Admin list open flags API" "$code"; then
  OPEN_FLAG_ID="$(json_field "$TMP_DIR/admin_flags_open.body" '.items[0].id')"
  if [[ -n "$OPEN_FLAG_ID" ]]; then
    if mutating_smoke_enabled; then
      RESOLVE_BODY="$(jq -cn --arg reason "UAT resolve otomatis ${TODAY} validasi alur admin" '{reason:$reason}')"
      code="$(api_request POST "/reconciliation/flags/${OPEN_FLAG_ID}/resolve" "$ADMIN_COOKIE_JAR" "$admin_csrf" "$RESOLVE_BODY" "$TMP_DIR/admin_flag_resolve")"
      if expect_success "Admin resolve anomaly flag" "$code"; then
        MUTATING_CSRF_SUCCESS=true
        RESOLVE_STATUS="$(json_field "$TMP_DIR/admin_flag_resolve.body" '.status')"
        if [[ "$RESOLVE_STATUS" == "RESOLVED" ]]; then
          mark_pass "Admin resolve status check"
        else
          mark_fail "Admin resolve status check" "status bukan RESOLVED"
        fi
      fi
    else
      mark_skip "Admin resolve anomaly flag" "read-only smoke tidak mengubah flag produksi"
    fi
  else
    mark_skip "Admin resolve anomaly flag" "tidak ada open flag untuk direview"
  fi
fi

if ! login_role guru "$GURU_USERNAME" "$GURU_PASSWORD" GURU_MAPEL guru "$GURU_COOKIE_JAR"; then
  echo
  echo "Guru login gagal, smoke dihentikan."
  finish
  exit 1
fi

guru_csrf="$(get_csrf_token guru "$GURU_COOKIE_JAR")" || guru_csrf=""
code="$(api_request GET '/attendance/class-sessions?page=1&limit=200' "$GURU_COOKIE_JAR" "" "" "$TMP_DIR/guru_sessions")"
if ! expect_success "Guru list class sessions API" "$code"; then
  echo
  echo "Guru tidak bisa melihat sesi, smoke dihentikan."
  finish
  exit 1
fi

if [[ -n "$UAT_SESSION_ID" ]]; then
  GURU_SESSION_ID="$(jq -r --arg sid "$UAT_SESSION_ID" '(.items // []) | map(select(.id == $sid)) | .[0].id // empty' "$TMP_DIR/guru_sessions.body" 2>/dev/null || true)"
  if [[ -z "$GURU_SESSION_ID" ]]; then
    mark_fail "Guru pilih sesi uji" "UAT_SESSION_ID $UAT_SESSION_ID tidak tersedia untuk guru uji"
    finish
    exit 1
  fi
elif mutating_smoke_enabled; then
  GURU_SESSION_ID="$(jq -r '
    (.items // []) as $items
    | ([$items[] | select(.status=="SCHEDULED")] | .[0].id)
      // ([$items[] | select(.status=="OPEN")] | .[0].id)
      // empty
  ' "$TMP_DIR/guru_sessions.body" 2>/dev/null || true)"
else
  GURU_SESSION_ID="$(jq -r '
    (.items // []) as $items
    | ([$items[] | select(.status=="SCHEDULED")] | .[0].id)
      // ([$items[] | select(.status=="CLOSED")] | .[0].id)
      // ([$items[] | select(.status=="OPEN")] | .[0].id)
      // empty
  ' "$TMP_DIR/guru_sessions.body" 2>/dev/null || true)"
fi
GURU_SESSION_STATUS="$(jq -r --arg sid "$GURU_SESSION_ID" '(.items // []) | map(select(.id == $sid)) | .[0].status // empty' "$TMP_DIR/guru_sessions.body" 2>/dev/null || true)"

if [[ -z "$GURU_SESSION_ID" ]]; then
  if mutating_smoke_enabled; then
    mark_fail "Guru pilih sesi uji" "tidak ada sesi tersedia"
    finish
    exit 1
  else
    mark_skip "Guru pilih sesi uji" "tidak ada sesi; read-only smoke lanjut ke cek siswa"
  fi
else
  mark_pass "Guru pilih sesi uji ($GURU_SESSION_ID - $GURU_SESSION_STATUS)"
fi

if [[ -n "$GURU_SESSION_ID" ]]; then
  if ! mutating_smoke_enabled; then
    mark_skip "Guru buka sesi" "read-only smoke tidak membuka sesi"
  elif [[ "$GURU_SESSION_STATUS" != "OPEN" ]]; then
    code="$(api_request POST "/attendance/class-sessions/${GURU_SESSION_ID}/open" "$GURU_COOKIE_JAR" "$guru_csrf" "$(geo_payload)" "$TMP_DIR/guru_open_session")"
    if expect_success "Guru buka sesi dengan payload geolocation kontrak" "$code"; then
      MUTATING_CSRF_SUCCESS=true
      OPEN_STATUS="$(json_field "$TMP_DIR/guru_open_session.body" '.status')"
      if [[ "$OPEN_STATUS" == "OPEN" ]]; then
        mark_pass "Guru open status check"
      else
        mark_fail "Guru open status check" "status setelah buka bukan OPEN"
      fi
    fi
  else
    mark_skip "Guru buka sesi" "sesi sudah OPEN sejak awal"
  fi

  code="$(api_request GET "/attendance/class-sessions/${GURU_SESSION_ID}/roster" "$GURU_COOKIE_JAR" "" "" "$TMP_DIR/guru_roster")"
  if expect_success "Guru load roster" "$code"; then
    ROSTER_COUNT="$(json_field "$TMP_DIR/guru_roster.body" '.roster | length')"
    if [[ "${ROSTER_COUNT:-0}" -gt 0 ]]; then
      mark_pass "Guru roster non-empty"
    elif mutating_smoke_enabled; then
      mark_fail "Guru roster non-empty" "roster kosong"
    else
      mark_skip "Guru roster non-empty" "roster kosong pada read-only smoke"
    fi
  fi

  ROSTER_STUDENT_IDS="$(jq -r '(.roster // [])[].studentId' "$TMP_DIR/guru_roster.body" 2>/dev/null || true)"
  if ! mutating_smoke_enabled; then
    mark_skip "UAT scan/override siswa" "read-only smoke tidak membuat scan atau override"
  elif [[ -n "$ROSTER_STUDENT_IDS" ]]; then
    while IFS= read -r sid; do
      [[ -z "$sid" ]] && continue
      qr_body="$(jq -cn --arg userId "$sid" '{userId:$userId,readerType:"GATE",direction:"IN",manualReason:"UAT scan gerbang siswa sebelum presensi kelas"}')"
      code="$(api_request POST /attendance/qr-scan "$ADMIN_COOKIE_JAR" "$admin_csrf" "$qr_body" "$TMP_DIR/qr_gate_${sid}")"
      if [[ "$code" == "409" ]]; then
        mark_pass "UAT scan gerbang siswa $sid idempotent/anti-duplikat aktif" "$code"
      else
        if expect_success "UAT scan gerbang siswa $sid" "$code"; then MUTATING_CSRF_SUCCESS=true; fi
      fi
      override_body="$(jq -cn --arg studentId "$sid" '{studentId:$studentId,scope:"CLASS_ELIGIBILITY",reason:"UAT memberi override kelas setelah verifikasi petugas"}')"
      code="$(api_request POST /attendance/overrides "$ADMIN_COOKIE_JAR" "$admin_csrf" "$override_body" "$TMP_DIR/override_class_${sid}")"
      if expect_success "UAT override syarat kelas siswa $sid" "$code"; then MUTATING_CSRF_SUCCESS=true; fi
    done <<< "$ROSTER_STUDENT_IDS"
  else
    mark_skip "UAT scan/override siswa" "tidak ada siswa pada roster"
  fi

  code="$(api_request GET "/attendance/class-sessions/${GURU_SESSION_ID}/roster" "$GURU_COOKIE_JAR" "" "" "$TMP_DIR/guru_roster_after_qr")"
  ROSTER_FOR_SAVE="$TMP_DIR/guru_roster_after_qr"
  if [[ "$code" != "200" ]]; then
    ROSTER_FOR_SAVE="$TMP_DIR/guru_roster"
  fi

  ATTENDANCE_ITEMS="$(jq -c '(.roster // []) | map({studentId,status:"IZIN",note:("UAT smoke save " + (now | todateiso8601)),confirm:true,updatedAt})' "$ROSTER_FOR_SAVE.body" 2>/dev/null || echo '[]')"
  if ! mutating_smoke_enabled; then
    mark_skip "Guru save attendance batch" "read-only smoke tidak menulis presensi"
  elif [[ "$ATTENDANCE_ITEMS" == "[]" ]]; then
    mark_fail "Guru save attendance batch" "tidak ada item roster untuk disimpan"
  else
    code="$(api_request PUT "/attendance/class-sessions/${GURU_SESSION_ID}/attendance" "$GURU_COOKIE_JAR" "$guru_csrf" "$(jq -cn --argjson items "$ATTENDANCE_ITEMS" '{items:$items}')" "$TMP_DIR/guru_save_attendance")"
    if expect_success "Guru save attendance batch" "$code"; then
      MUTATING_CSRF_SUCCESS=true
      UPDATED_COUNT="$(json_field "$TMP_DIR/guru_save_attendance.body" '.updated')"
      if [[ "${UPDATED_COUNT:-0}" -gt 0 ]]; then
        mark_pass "Guru save attendance count"
      else
        mark_fail "Guru save attendance count" "updated tidak lebih dari 0"
      fi
    fi
  fi

  code="$(api_request GET "/attendance/class-sessions/${GURU_SESSION_ID}/roster" "$GURU_COOKIE_JAR" "" "" "$TMP_DIR/guru_roster_after_save")"
  if expect_success "Guru reload roster after save" "$code"; then
    FIRST_STUDENT_ID="$(json_field "$TMP_DIR/guru_roster_after_save.body" '.roster[0].studentId')"
  else
    FIRST_STUDENT_ID=""
  fi

  if mutating_smoke_enabled; then
    close_body="$(jq -cn --argjson geo "$(geo_payload)" '$geo + {earlyCheckoutReason:"UAT menutup sesi lebih awal untuk validasi otomatis."}')"
    code="$(api_request POST "/attendance/class-sessions/${GURU_SESSION_ID}/close" "$GURU_COOKIE_JAR" "$guru_csrf" "$close_body" "$TMP_DIR/guru_close_session")"
    if expect_success "Guru tutup sesi" "$code"; then
      MUTATING_CSRF_SUCCESS=true
      CLOSE_STATUS="$(json_field "$TMP_DIR/guru_close_session.body" '.status')"
      if [[ "$CLOSE_STATUS" == "CLOSED" ]]; then
        mark_pass "Guru close status check"
      else
        mark_fail "Guru close status check" "status setelah tutup bukan CLOSED"
      fi
    fi
  else
    mark_skip "Guru tutup sesi" "read-only smoke tidak menutup sesi"
  fi

  if ! mutating_smoke_enabled; then
    mark_skip "Guru koreksi presensi" "read-only smoke tidak mengubah presensi"
  elif [[ -n "$FIRST_STUDENT_ID" ]]; then
    correction_body="$(jq -cn '{status:"HADIR",reason:"UAT koreksi valid minimal sepuluh karakter",note:"koreksi smoke"}')"
    code="$(api_request PATCH "/attendance/class-sessions/${GURU_SESSION_ID}/attendance/${FIRST_STUDENT_ID}" "$GURU_COOKIE_JAR" "$guru_csrf" "$correction_body" "$TMP_DIR/guru_correction")"
    if expect_success "Guru koreksi presensi" "$code"; then
      MUTATING_CSRF_SUCCESS=true
      CORRECTION_ID="$(json_field "$TMP_DIR/guru_correction.body" '.id')"
      if [[ -n "$CORRECTION_ID" ]]; then
        mark_pass "Guru koreksi response id"
      else
        mark_fail "Guru koreksi response id" "id koreksi kosong"
      fi
    fi
  else
    mark_skip "Guru koreksi presensi" "tidak ada siswa pada roster"
  fi
fi

if ! login_role siswa "$SISWA_USERNAME" "$SISWA_PASSWORD" SISWA siswa "$SISWA_COOKIE_JAR"; then
  echo
  echo "Siswa login gagal, smoke dihentikan."
  finish
  exit 1
fi

code="$(api_request GET '/reports/my-attendance?days=30' "$SISWA_COOKIE_JAR" "" "" "$TMP_DIR/siswa_my_attendance")"
if expect_success "Siswa my-attendance API" "$code"; then
  SISWA_ROLE="$(json_field "$TMP_DIR/siswa_my_attendance.body" '.role')"
  if [[ "$SISWA_ROLE" == "SISWA" ]]; then
    mark_pass "Siswa role payload check"
  else
    mark_fail "Siswa role payload check" "role payload bukan SISWA"
  fi
fi

if mutating_smoke_enabled; then
  if [[ "$MUTATING_CSRF_SUCCESS" == "true" ]]; then
    mark_pass "Valid CSRF mutation succeeds in mutating mode"
  else
    mark_fail "Valid CSRF mutation succeeds in mutating mode" "no protected mutating request succeeded"
  fi
else
  mark_skip "Valid CSRF mutation succeeds in mutating mode" "mutating smoke disabled"
fi

logout_and_verify admin "$ADMIN_COOKIE_JAR" || true
logout_and_verify guru "$GURU_COOKIE_JAR" || true
logout_and_verify siswa "$SISWA_COOKIE_JAR" || true

if finish; then
  exit 0
fi
exit 1
