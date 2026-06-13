#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-}"
if [[ -z "$BASE_URL" ]] && command -v schoolhub-public-url >/dev/null 2>&1; then
  BASE_URL="$(schoolhub-public-url || true)"
fi

if [[ -z "$BASE_URL" ]]; then
  echo "ERROR: BASE_URL belum diisi."
  echo "Contoh:"
  echo "  BASE_URL='https://<url-aktif>.trycloudflare.com' bash scripts/uat_smoke.sh"
  echo "Jika dijalankan di VPS, bisa pakai helper:"
  echo "  BASE_URL=\"\$(schoolhub-public-url)\" bash scripts/uat_smoke.sh"
  exit 1
fi

API_BASE="$BASE_URL/api/v1"
TODAY="$(date +%F)"

ADMIN_USERNAME="${ADMIN_USERNAME:-admin.tu}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
GURU_USERNAME="${GURU_USERNAME:-guru.matematika}"
GURU_PASSWORD="${GURU_PASSWORD:-}"
SISWA_USERNAME="${SISWA_USERNAME:-siswa.citra}"
SISWA_PASSWORD="${SISWA_PASSWORD:-}"
ALLOW_MUTATING_SMOKE="${ALLOW_MUTATING_SMOKE:-NO}"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

RESULT_LOG=()
BLOCKING_BUGS=()

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mark_pass() {
  local name="$1"
  PASS_COUNT=$((PASS_COUNT + 1))
  RESULT_LOG+=("PASS | $name")
  echo "PASS: $name"
}

mark_fail() {
  local name="$1"
  local message="$2"
  FAIL_COUNT=$((FAIL_COUNT + 1))
  RESULT_LOG+=("FAIL | $name | $message")
  BLOCKING_BUGS+=("$name -> $message")
  echo "FAIL: $name -> $message"
}

mark_skip() {
  local name="$1"
  local message="$2"
  SKIP_COUNT=$((SKIP_COUNT + 1))
  RESULT_LOG+=("SKIP | $name | $message")
  echo "SKIP: $name -> $message"
}

mutating_smoke_enabled() {
  [[ "$ALLOW_MUTATING_SMOKE" == "YES" ]]
}

api_call() {
  local method="$1"
  local path="$2"
  local token="${3:-}"
  local body="${4:-}"
  local output_file="$5"

  local headers=(-H "accept: application/json")
  if [[ -n "$token" ]]; then
    headers+=(-H "authorization: Bearer $token")
  fi
  if [[ -n "$body" ]]; then
    headers+=(-H "content-type: application/json")
  fi

  local url="$API_BASE$path"
  if [[ -n "$body" ]]; then
    curl -sS -X "$method" "${headers[@]}" "$url" -d "$body" -w '\n%{http_code}' > "$output_file"
  else
    curl -sS -X "$method" "${headers[@]}" "$url" -w '\n%{http_code}' > "$output_file"
  fi
}

extract_status_code() {
  tail -n 1 "$1"
}

extract_json_body() {
  sed '$d' "$1"
}

expect_status_200() {
  local name="$1"
  local file="$2"
  local code
  code="$(extract_status_code "$file")"
  if [[ "$code" == "200" || "$code" == "201" ]]; then
    mark_pass "$name"
    return 0
  fi
  local body
  body="$(extract_json_body "$file")"
  mark_fail "$name" "HTTP $code | $body"
  return 1
}

login_and_get_token() {
  local username="$1"
  local password="$2"
  local role_name="$3"
  local out_file="$TMP_DIR/login_${role_name}.txt"

  api_call "POST" "/auth/login" "" "{\"username\":\"$username\",\"password\":\"$password\"}" "$out_file"
  if ! expect_status_200 "Login $role_name ($username)" "$out_file"; then
    echo ""
    return 1
  fi

  local body token
  body="$(extract_json_body "$out_file")"
  token="$(echo "$body" | jq -r '.accessToken // empty')"
  if [[ -z "$token" ]]; then
    mark_fail "Token login $role_name" "accessToken kosong"
    echo ""
    return 1
  fi

  local returned_role
  returned_role="$(echo "$body" | jq -r '.user.role // empty')"
  if [[ -z "$returned_role" ]]; then
    mark_fail "Role login $role_name" "response user.role kosong"
    echo ""
    return 1
  fi
  mark_pass "Role login $role_name -> $returned_role"

  echo "$token"
}

if [[ -z "$ADMIN_PASSWORD" || -z "$GURU_PASSWORD" || -z "$SISWA_PASSWORD" ]]; then
  echo "ERROR: ADMIN_PASSWORD, GURU_PASSWORD, dan SISWA_PASSWORD wajib diisi untuk smoke test."
  exit 1
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

if curl -sS --max-time 12 "$BASE_URL/health/live" > "$TMP_DIR/health_live.json"; then
  if [[ "$(jq -r '.status // empty' "$TMP_DIR/health_live.json" 2>/dev/null)" == "ok" ]]; then
    mark_pass "Health live"
  else
    mark_fail "Health live" "status bukan ok"
  fi
else
  mark_fail "Health live" "endpoint tidak merespons"
fi

if curl -sS --max-time 12 "$BASE_URL/health/ready" > "$TMP_DIR/health_ready.json"; then
  if [[ "$(jq -r '.status // empty' "$TMP_DIR/health_ready.json" 2>/dev/null)" == "ready" ]]; then
    mark_pass "Health ready"
  else
    mark_fail "Health ready" "status bukan ready"
  fi
else
  mark_fail "Health ready" "endpoint tidak merespons"
fi

if curl -sS --max-time 15 "$BASE_URL/" > "$TMP_DIR/root.html"; then
  if grep -qi "schoolhub" "$TMP_DIR/root.html"; then
    mark_pass "Root HTML online"
  else
    mark_fail "Root HTML online" "kata kunci SchoolHub tidak ditemukan"
  fi
else
  mark_fail "Root HTML online" "gagal memuat halaman root"
fi

ADMIN_TOKEN="$(login_and_get_token "$ADMIN_USERNAME" "$ADMIN_PASSWORD" "admin" | tail -n 1)"
if [[ -z "$ADMIN_TOKEN" ]]; then
  echo
  echo "Admin login gagal, smoke dihentikan."
  exit 1
fi

api_call "POST" "/internal/reconciliation/run" "" "{}" "$TMP_DIR/internal_without_token.txt"
INTERNAL_CODE="$(extract_status_code "$TMP_DIR/internal_without_token.txt")"
if [[ "$INTERNAL_CODE" != "200" && "$INTERNAL_CODE" != "201" ]]; then
  mark_pass "Internal worker endpoint tanpa token ditolak"
else
  mark_fail "Internal worker endpoint tanpa token ditolak" "endpoint internal menerima request publik tanpa token"
fi

api_call "POST" "/attendance/reader-scan" "" "{\"cardUid\":\"UAT-NO-SIGNATURE\"}" "$TMP_DIR/reader_without_signature.txt"
READER_UNSIGNED_CODE="$(extract_status_code "$TMP_DIR/reader_without_signature.txt")"
if [[ "$READER_UNSIGNED_CODE" != "200" && "$READER_UNSIGNED_CODE" != "201" ]]; then
  mark_pass "Reader scan tanpa signature ditolak"
else
  mark_fail "Reader scan tanpa signature ditolak" "reader-scan menerima request tanpa HMAC"
fi

api_call "GET" "/reports/dashboard" "$ADMIN_TOKEN" "" "$TMP_DIR/admin_dashboard.txt"
if expect_status_200 "Admin dashboard API" "$TMP_DIR/admin_dashboard.txt"; then
  if [[ "$(extract_json_body "$TMP_DIR/admin_dashboard.txt" | jq -r '.sessionsToday | type' 2>/dev/null)" == "number" ]]; then
    mark_pass "Admin dashboard shape"
  else
    mark_fail "Admin dashboard shape" "sessionsToday bukan number"
  fi
fi

api_call "GET" "/reports/live-monitor?page=1&limit=5" "$ADMIN_TOKEN" "" "$TMP_DIR/admin_live_monitor.txt"
if expect_status_200 "Admin live monitor API" "$TMP_DIR/admin_live_monitor.txt"; then
  if [[ "$(extract_json_body "$TMP_DIR/admin_live_monitor.txt" | jq -r '.items | type' 2>/dev/null)" == "array" ]]; then
    mark_pass "Admin live monitor shape"
  else
    mark_fail "Admin live monitor shape" "items bukan array"
  fi
fi

api_call "GET" "/identity/users?page=1&limit=2" "$ADMIN_TOKEN" "" "$TMP_DIR/admin_users.txt"
if expect_status_200 "Admin list users API" "$TMP_DIR/admin_users.txt"; then
  if [[ "$(extract_json_body "$TMP_DIR/admin_users.txt" | jq -r '.meta.total | type' 2>/dev/null)" == "number" ]]; then
    mark_pass "Admin list users pagination"
  else
    mark_fail "Admin list users pagination" "meta.total tidak valid"
  fi
fi

api_call "GET" "/reconciliation/flags?status=OPEN&page=1&limit=1" "$ADMIN_TOKEN" "" "$TMP_DIR/admin_flags_open.txt"
if expect_status_200 "Admin list open flags API" "$TMP_DIR/admin_flags_open.txt"; then
  OPEN_FLAG_ID="$(extract_json_body "$TMP_DIR/admin_flags_open.txt" | jq -r '.items[0].id // empty' 2>/dev/null)"
  if [[ -n "$OPEN_FLAG_ID" ]]; then
    if mutating_smoke_enabled; then
      RESOLVE_BODY="{\"reason\":\"UAT resolve otomatis ${TODAY} validasi alur admin\"}"
      api_call "POST" "/reconciliation/flags/${OPEN_FLAG_ID}/resolve" "$ADMIN_TOKEN" "$RESOLVE_BODY" "$TMP_DIR/admin_flag_resolve.txt"
      if expect_status_200 "Admin resolve anomaly flag" "$TMP_DIR/admin_flag_resolve.txt"; then
        RESOLVE_STATUS="$(extract_json_body "$TMP_DIR/admin_flag_resolve.txt" | jq -r '.status // empty' 2>/dev/null)"
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

GURU_TOKEN="$(login_and_get_token "$GURU_USERNAME" "$GURU_PASSWORD" "guru" | tail -n 1)"
if [[ -z "$GURU_TOKEN" ]]; then
  echo
  echo "Guru login gagal, smoke dihentikan."
  exit 1
fi

api_call "GET" "/attendance/class-sessions?page=1&limit=200" "$GURU_TOKEN" "" "$TMP_DIR/guru_sessions.txt"
if ! expect_status_200 "Guru list class sessions API" "$TMP_DIR/guru_sessions.txt"; then
  echo
  echo "Guru tidak bisa melihat sesi, smoke dihentikan."
  exit 1
fi

GURU_SESSION_ID="$(extract_json_body "$TMP_DIR/guru_sessions.txt" | jq -r '
  (.items // []) as $items
  | ([$items[] | select(.status=="SCHEDULED")] | .[0].id)
    // ([$items[] | select(.status=="CLOSED")] | .[0].id)
    // ([$items[] | select(.status=="OPEN")] | .[0].id)
    // empty
' 2>/dev/null)"

GURU_SESSION_STATUS="$(extract_json_body "$TMP_DIR/guru_sessions.txt" | jq -r --arg sid "$GURU_SESSION_ID" '
  (.items // []) | map(select(.id == $sid)) | .[0].status // empty
' 2>/dev/null)"

if [[ -z "$GURU_SESSION_ID" ]]; then
  if mutating_smoke_enabled; then
    mark_fail "Guru pilih sesi uji" "tidak ada sesi tersedia"
    echo
    echo "Tidak ada sesi guru, smoke dihentikan."
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
  api_call "POST" "/attendance/class-sessions/${GURU_SESSION_ID}/open" "$GURU_TOKEN" '{"lat":0,"lng":0}' "$TMP_DIR/guru_open_session.txt"
  if expect_status_200 "Guru buka sesi" "$TMP_DIR/guru_open_session.txt"; then
    OPEN_STATUS="$(extract_json_body "$TMP_DIR/guru_open_session.txt" | jq -r '.status // empty' 2>/dev/null)"
    if [[ "$OPEN_STATUS" == "OPEN" ]]; then
      mark_pass "Guru open status check"
    else
      mark_fail "Guru open status check" "status setelah buka bukan OPEN"
    fi
  fi
else
  mark_skip "Guru buka sesi" "sesi sudah OPEN sejak awal"
fi

api_call "GET" "/attendance/class-sessions/${GURU_SESSION_ID}/roster" "$GURU_TOKEN" "" "$TMP_DIR/guru_roster.txt"
if expect_status_200 "Guru load roster" "$TMP_DIR/guru_roster.txt"; then
  ROSTER_COUNT="$(extract_json_body "$TMP_DIR/guru_roster.txt" | jq -r '.roster | length' 2>/dev/null)"
  if [[ "${ROSTER_COUNT:-0}" -gt 0 ]]; then
    mark_pass "Guru roster non-empty"
  elif mutating_smoke_enabled; then
    mark_fail "Guru roster non-empty" "roster kosong"
  else
    mark_skip "Guru roster non-empty" "roster kosong pada read-only smoke"
  fi
fi

ROSTER_STUDENT_IDS="$(extract_json_body "$TMP_DIR/guru_roster.txt" | jq -r '(.roster // [])[].studentId' 2>/dev/null || true)"
if ! mutating_smoke_enabled; then
  mark_skip "UAT scan/override siswa" "read-only smoke tidak membuat scan atau override"
elif [[ -n "$ROSTER_STUDENT_IDS" ]]; then
  while IFS= read -r sid; do
    [[ -z "$sid" ]] && continue
    api_call "POST" "/attendance/qr-scan" "$ADMIN_TOKEN" "{\"userId\":\"$sid\",\"readerType\":\"GATE\",\"direction\":\"IN\",\"manualReason\":\"UAT scan gerbang siswa sebelum presensi kelas\"}" "$TMP_DIR/qr_gate_${sid}.txt"
    QR_GATE_CODE="$(extract_status_code "$TMP_DIR/qr_gate_${sid}.txt")"
    if [[ "$QR_GATE_CODE" == "409" ]]; then
      QR_GATE_BODY="$(extract_json_body "$TMP_DIR/qr_gate_${sid}.txt")"
      if echo "$QR_GATE_BODY" | grep -Eqi "duplikat|sudah tercatat"; then
        mark_pass "UAT scan gerbang siswa $sid idempotent/anti-duplikat aktif"
      else
        mark_fail "UAT scan gerbang siswa $sid" "HTTP 409 tidak sesuai | $QR_GATE_BODY"
      fi
    else
      expect_status_200 "UAT scan gerbang siswa $sid" "$TMP_DIR/qr_gate_${sid}.txt" || true
    fi
    api_call "POST" "/attendance/overrides" "$ADMIN_TOKEN" "{\"studentId\":\"$sid\",\"scope\":\"CLASS_ELIGIBILITY\",\"reason\":\"UAT memberi override kelas setelah verifikasi petugas\"}" "$TMP_DIR/override_class_${sid}.txt"
    expect_status_200 "UAT override syarat kelas siswa $sid" "$TMP_DIR/override_class_${sid}.txt" || true
  done <<< "$ROSTER_STUDENT_IDS"
else
  mark_skip "UAT scan/override siswa" "tidak ada siswa pada roster"
fi

api_call "GET" "/attendance/class-sessions/${GURU_SESSION_ID}/roster" "$GURU_TOKEN" "" "$TMP_DIR/guru_roster_after_qr.txt"
ROSTER_FOR_SAVE="$TMP_DIR/guru_roster_after_qr.txt"
if [[ "$(extract_status_code "$TMP_DIR/guru_roster_after_qr.txt")" != "200" ]]; then
  ROSTER_FOR_SAVE="$TMP_DIR/guru_roster.txt"
fi

ATTENDANCE_ITEMS="$(extract_json_body "$ROSTER_FOR_SAVE" | jq -c '
  (.roster // []) | map({
    studentId,
    status: "IZIN",
    note: ("UAT smoke save " + (now | todateiso8601))
  })
' 2>/dev/null || echo '[]')"

if ! mutating_smoke_enabled; then
  mark_skip "Guru save attendance batch" "read-only smoke tidak menulis presensi"
elif [[ "$ATTENDANCE_ITEMS" == "[]" ]]; then
  mark_fail "Guru save attendance batch" "tidak ada item roster untuk disimpan"
else
  api_call "PUT" "/attendance/class-sessions/${GURU_SESSION_ID}/attendance" "$GURU_TOKEN" "{\"items\":$ATTENDANCE_ITEMS}" "$TMP_DIR/guru_save_attendance.txt"
  if expect_status_200 "Guru save attendance batch" "$TMP_DIR/guru_save_attendance.txt"; then
    UPDATED_COUNT="$(extract_json_body "$TMP_DIR/guru_save_attendance.txt" | jq -r '.updated // 0' 2>/dev/null)"
    if [[ "${UPDATED_COUNT:-0}" -gt 0 ]]; then
      mark_pass "Guru save attendance count"
    else
      mark_fail "Guru save attendance count" "updated tidak lebih dari 0"
    fi
  fi
fi

api_call "GET" "/attendance/class-sessions/${GURU_SESSION_ID}/roster" "$GURU_TOKEN" "" "$TMP_DIR/guru_roster_after_save.txt"
if expect_status_200 "Guru reload roster after save" "$TMP_DIR/guru_roster_after_save.txt"; then
  FIRST_STUDENT_ID="$(extract_json_body "$TMP_DIR/guru_roster_after_save.txt" | jq -r '.roster[0].studentId // empty' 2>/dev/null)"
else
  FIRST_STUDENT_ID=""
fi

if mutating_smoke_enabled; then
  api_call "POST" "/attendance/class-sessions/${GURU_SESSION_ID}/close" "$GURU_TOKEN" '{"earlyCheckoutReason":"UAT menutup sesi lebih awal untuk validasi otomatis."}' "$TMP_DIR/guru_close_session.txt"
  if expect_status_200 "Guru tutup sesi" "$TMP_DIR/guru_close_session.txt"; then
    CLOSE_STATUS="$(extract_json_body "$TMP_DIR/guru_close_session.txt" | jq -r '.status // empty' 2>/dev/null)"
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
  CORRECTION_BODY="{\"status\":\"HADIR\",\"reason\":\"UAT koreksi valid minimal sepuluh karakter\",\"note\":\"koreksi smoke\"}"
  api_call "PATCH" "/attendance/class-sessions/${GURU_SESSION_ID}/attendance/${FIRST_STUDENT_ID}" "$GURU_TOKEN" "$CORRECTION_BODY" "$TMP_DIR/guru_correction.txt"
  if expect_status_200 "Guru koreksi presensi" "$TMP_DIR/guru_correction.txt"; then
    CORRECTION_ID="$(extract_json_body "$TMP_DIR/guru_correction.txt" | jq -r '.id // empty' 2>/dev/null)"
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

SISWA_TOKEN="$(login_and_get_token "$SISWA_USERNAME" "$SISWA_PASSWORD" "siswa" | tail -n 1)"
if [[ -z "$SISWA_TOKEN" ]]; then
  echo
  echo "Siswa login gagal, smoke dihentikan."
  exit 1
fi

api_call "GET" "/reports/my-attendance?days=30" "$SISWA_TOKEN" "" "$TMP_DIR/siswa_my_attendance.txt"
if expect_status_200 "Siswa my-attendance API" "$TMP_DIR/siswa_my_attendance.txt"; then
  SISWA_ROLE="$(extract_json_body "$TMP_DIR/siswa_my_attendance.txt" | jq -r '.role // empty' 2>/dev/null)"
  if [[ "$SISWA_ROLE" == "SISWA" ]]; then
    mark_pass "Siswa role payload check"
  else
    mark_fail "Siswa role payload check" "role payload bukan SISWA"
  fi
fi

if [[ "$FAIL_COUNT" -eq 0 ]]; then
  echo
  echo "RESULT: PASS (tanpa bug blocking dari smoke otomatis)"
else
  echo
  echo "RESULT: FAIL ($FAIL_COUNT blocking issue)"
fi

echo
echo "Summary:"
echo "  PASS : $PASS_COUNT"
echo "  FAIL : $FAIL_COUNT"
echo "  SKIP : $SKIP_COUNT"
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

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
