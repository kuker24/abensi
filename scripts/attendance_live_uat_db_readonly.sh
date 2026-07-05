#!/usr/bin/env bash
set -euo pipefail

# Read-only aggregate DB checks for PR127 attendance live UAT readiness.
# Safety: SELECT-only SQL, aggregate counts only, no PII/QR payloads/secrets printed.

COMPOSE_FILE="${PRODUCTION_COMPOSE_FILE:-docker-compose.production.yml}"
ENV_FILE="${PRODUCTION_ENV_FILE:-/opt/schoolhub/.env}"
TMP_OUT="$(mktemp)"
trap 'rm -f "$TMP_OUT"' EXIT

pass_count=0
fail_count=0
warn_count=0

pass() { pass_count=$((pass_count + 1)); printf 'PASS %s%s\n' "$1" "${2:+ — $2}"; }
fail() { fail_count=$((fail_count + 1)); printf 'FAIL %s%s\n' "$1" "${2:+ — $2}" >&2; }
warn() { warn_count=$((warn_count + 1)); printf 'WARN %s%s\n' "$1" "${2:+ — $2}"; }

value_for() {
  awk -F'|' -v key="$1" '$1 == key { print $2; found=1; exit } END { if (!found) exit 1 }' "$TMP_OUT"
}

expect_zero() {
  local key="$1" label="$2" value
  if ! value="$(value_for "$key")"; then
    fail "$label" "$key=missing"
    return
  fi
  if [ "$value" = "0" ]; then
    pass "$label" "$key=0"
  else
    fail "$label" "$key=$value"
  fi
}

expect_at_least() {
  local key="$1" min="$2" label="$3" value
  if ! value="$(value_for "$key")"; then
    fail "$label" "$key=missing"
    return
  fi
  if [ "$value" -ge "$min" ] 2>/dev/null; then
    pass "$label" "$key=$value"
  else
    fail "$label" "$key=$value min=$min"
  fi
}

observe_count() {
  local key="$1" value
  if ! value="$(value_for "$key")"; then
    fail "observed $key" "$key=missing"
  else
    pass "observed $key" "$key=$value"
  fi
}

if [ ! -f "$COMPOSE_FILE" ]; then
  fail 'production compose file exists' "$COMPOSE_FILE not found"
  printf 'Summary: PASS=%s FAIL=%s WARN=%s\n' "$pass_count" "$fail_count" "$warn_count"
  exit 1
fi

printf 'Attendance live UAT DB readiness: read-only aggregate mode\n'
printf 'Compose file: %s\n' "$COMPOSE_FILE"
printf 'Env file: hash/check only; content is never printed\n'

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' > "$TMP_OUT" <<'SQL'
select 'users_by_role:' || role::text, count(*) from "User" group by role order by role::text;
select 'active_target_without_active_qr', count(*) from "User" u where u.active=true and u.role in ('SISWA','GURU_MAPEL') and not exists (select 1 from "QrCredential" q where q."userId"=u.id and q.status='ACTIVE');
select 'classes_without_active_enrollment', count(*) from "SchoolClass" c where not exists (select 1 from "ClassEnrollment" e where e."classId"=c.id and e.active=true and e."administrativeStatus"='ACTIVE');
select 'students_without_active_enrollment', count(*) from "User" u where u.active=true and u.role='SISWA' and not exists (select 1 from "ClassEnrollment" e where e."studentId"=u.id and e.active=true and e."administrativeStatus"='ACTIVE');
select 'active_student_without_nis', count(*) from "User" u where u.active=true and u.role='SISWA' and coalesce(nullif(trim(u."nis"),''),'')='';
select 'active_teacher_without_nip', count(*) from "User" u where u.active=true and u.role='GURU_MAPEL' and coalesce(nullif(trim(u."nip"),''),'')='';
select 'device_readers_total', count(*) from "DeviceReader";
select 'revoked_readers_total', count(*) from "DeviceReader" where status='REVOKED';
select 'active_readers_total', count(*) from "DeviceReader" where status='ACTIVE';
select 'active_readers_with_secret', count(*) from "DeviceReader" where status='ACTIVE' and "readerSecretCiphertext" is not null;
select 'active_readers_with_hashed_key', count(*) from "DeviceReader" where status='ACTIVE' and "apiKeyHash" is not null;
select 'android_releases_total', count(*) from "AndroidApkRelease";
select 'android_reader_versions_total', count(*) from "MobileAndroidReaderVersion";
select 'geofence_policies_total', count(*) from "GeofencePolicy";
select 'attendance_policy_total', count(*) from "AttendancePolicy";
select 'student_attendance_total', count(*) from "StudentAttendance";
select 'gate_logs_total', count(*) from "GateLog";
select 'prayer_logs_total', count(*) from "PrayerAttendanceLog";
select 'attendance_overrides_total', count(*) from "AttendanceOverride";
select 'open_reconciliation_flags', count(*) from "ReconciliationFlag" where status='OPEN';
select 'outbox_pending', count(*) from "OutboxEvent" where status='PENDING';
select 'outbox_failed', count(*) from "OutboxEvent" where status='FAILED';
select 'audit_entries_without_hash', count(*) from "AuditEntry" where "entryHash" is null or "prevHash" is null;
SQL

expect_zero 'active_target_without_active_qr' 'all active student/teacher targets have active QR'
expect_zero 'classes_without_active_enrollment' 'all classes have active enrollment'
expect_zero 'students_without_active_enrollment' 'all active students have active enrollment'
expect_zero 'active_student_without_nis' 'all active students have NIS'
expect_zero 'active_teacher_without_nip' 'all active teachers have NIP'
expect_at_least 'attendance_policy_total' 1 'attendance policy exists'
expect_at_least 'geofence_policies_total' 1 'geofence policy exists'
expect_at_least 'active_readers_total' "${MIN_ACTIVE_READERS:-1}" 'active reader inventory exists'
expect_at_least 'active_readers_with_secret' "${MIN_ACTIVE_READERS_WITH_SECRET:-1}" 'active readers have encrypted signing secret'
expect_at_least 'active_readers_with_hashed_key' "${MIN_ACTIVE_READERS_WITH_HASHED_KEY:-1}" 'active readers have hashed API key'
expect_at_least 'android_releases_total' 1 'APK release inventory exists'
expect_at_least 'android_reader_versions_total' 1 'Android reader version inventory exists'
expect_zero 'outbox_failed' 'outbox has no failed events'

outbox_pending="$(value_for 'outbox_pending' || echo missing)"
if [ "$outbox_pending" = "0" ]; then
  pass 'outbox has no pending backlog' 'outbox_pending=0'
elif [ "$outbox_pending" = "missing" ]; then
  fail 'outbox pending backlog count available' 'outbox_pending=missing'
else
  warn 'outbox pending backlog needs operator review' "outbox_pending=$outbox_pending"
fi

audit_without_hash="$(value_for 'audit_entries_without_hash' || echo missing)"
if [ "$audit_without_hash" = "0" ]; then
  pass 'audit chain has no un-hashed entries' 'audit_entries_without_hash=0'
elif [ "$audit_without_hash" = "missing" ]; then
  fail 'audit un-hashed entry count available' 'audit_entries_without_hash=missing'
else
  warn 'audit chain has legacy un-hashed entries' "audit_entries_without_hash=$audit_without_hash"
fi

observe_count 'device_readers_total'
observe_count 'revoked_readers_total'
observe_count 'student_attendance_total'
observe_count 'gate_logs_total'
observe_count 'prayer_logs_total'
observe_count 'attendance_overrides_total'
observe_count 'open_reconciliation_flags'

printf 'Summary: PASS=%s FAIL=%s WARN=%s\n' "$pass_count" "$fail_count" "$warn_count"
[ "$fail_count" -eq 0 ]
