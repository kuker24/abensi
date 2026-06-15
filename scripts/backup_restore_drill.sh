#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"
mkdir -p artifacts/backup-restore
strip_prisma_schema_param() {
  local url="$1"
  url="${url/\?schema=public/}"
  url="${url/&schema=public/}"
  printf '%s' "$url"
}
SOURCE_PG_URL="$(strip_prisma_schema_param "$DATABASE_URL")"
RESTORE_PG_URL="$(strip_prisma_schema_param "$RESTORE_DATABASE_URL")"
backup="artifacts/backup-restore/drill.sql.gz.enc"
pg_dump --dbname="$SOURCE_PG_URL" | gzip -9 | openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_ENCRYPTION_PASSPHRASE -out "$backup"
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_PASSPHRASE -in "$backup" | gunzip -t
psql "$RESTORE_PG_URL" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' >/dev/null
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_PASSPHRASE -in "$backup" | gunzip | psql "$RESTORE_PG_URL" -v ON_ERROR_STOP=1 >/dev/null
DATABASE_URL="$RESTORE_DATABASE_URL" npm run audit:verify-chain
DATABASE_URL="$RESTORE_DATABASE_URL" npm run verify:post-migration -- --json=artifacts/backup-restore/post-restore-verify.json
integrity_json="$(psql "$RESTORE_PG_URL" -tAc "select json_build_object(
  'users', (select count(*) from \"User\"),
  'sessions', (select count(*) from \"Session\"),
  'gateLogs', (select count(*) from \"GateLog\"),
  'auditEntries', (select count(*) from \"AuditEntry\"),
  'sessionRoster', (select count(*) from \"SessionRoster\"),
  'outboxEvents', (select count(*) from \"OutboxEvent\"),
  'classEnrollmentOverlapConstraint', exists(select 1 from pg_constraint where conname = 'ClassEnrollment_student_no_overlap_excl'),
  'sessionRosterAttendanceFk', exists(select 1 from pg_constraint where conname = 'StudentAttendance_session_roster_fkey'),
  'outboxStatusIndex', exists(select 1 from pg_indexes where indexname = 'OutboxEvent_status_lockedAt_createdAt_idx'),
  'auditSequenceIndex', exists(select 1 from pg_indexes where indexname = 'AuditEntry_actorId_chainSequence_key')
)::text;")"
printf '%s\n' "$integrity_json" > artifacts/backup-restore/restore-integrity.json
node - "$integrity_json" <<'NODE'
const data = JSON.parse(process.argv[2]);
const requireSeeded = process.env.BACKUP_RESTORE_REQUIRE_SEEDED === 'true';
const requiredChecks = ['classEnrollmentOverlapConstraint', 'sessionRosterAttendanceFk', 'outboxStatusIndex'];
const missingChecks = requiredChecks.filter((key) => data[key] !== true);
const seededFailures = [];
if (requireSeeded) {
  for (const [key, min] of Object.entries({ users: 5, sessions: 1, gateLogs: 1, auditEntries: 1, sessionRoster: 1 })) {
    if (Number(data[key] || 0) < min) seededFailures.push(`${key}<${min}`);
  }
}
if (missingChecks.length || seededFailures.length) {
  console.error(JSON.stringify({ ok: false, missingChecks, seededFailures, data }, null, 2));
  process.exit(1);
}
NODE
printf '{"ok":true,"backup":"%s","integrity":%s}\n' "$backup" "$integrity_json" > artifacts/backup-restore/result.json
