# Corrective migration preflight and rollback runbook

Status: active for PR #2 hardening

## Read-only preflight

Run before applying corrective migrations to a populated clone:

```bash
npm run preflight:production -- --json=artifacts/preflight/production-readiness-preflight.json
```

The command checks:

- GateLog UTC-naive → Jakarta business-date mismatches and corrected-date collisions;
- generated Session duplicate `(weeklyScheduleId, businessDate)` collisions;
- active teacher/class/room schedule overlaps;
- effective-dated enrollment overlaps;
- StudentAttendance rows missing SessionRoster snapshots;
- audit entry inventory.

To also materialize SQL-readable rows for DBAs:

```bash
npm run preflight:production -- --write-sql-table
```

Any blocking check exits non-zero unless `--allow-blocking` is used for report-only staging diagnostics.

## Approval before destructive correction

No future destructive/deduplication correction may be applied without all of the following:

1. preflight JSON artifact attached to the deployment ticket;
2. DBA/product owner approval of the exact blocking rows;
3. encrypted backup completed and restore-tested;
4. approval token recorded in the deployment log:

```bash
export CORRECTIVE_MIGRATION_APPROVAL="<ticket-id>:<sha256-of-preflight-json>"
```

Migrations already present before this run (`0021`–`0028`) are not rewritten. Later corrective migrations must be additive and deterministic.

## Post-migration verification

Run after migrations and after restore drills:

```bash
npm run verify:post-migration -- --json=artifacts/preflight/post-migration-verify.json
npm run audit:verify-chain
```

The verifier fails if duplicate GateLogs, generated Session collisions, StudentAttendance roster gaps, or overlapping enrollments remain.

## Rollback / restore procedures

- `0025_gate_log_archive`: table is additive. Rollback is to keep archive; do not delete forensic evidence. If a deployment must be reverted, restore application image and keep table.
- `0026_correct_jakarta_business_dates`: restore from encrypted backup or replay `BusinessDateBackfillReport` under DBA supervision. Do not fabricate deleted GateLog rows; use `GateLogArchive` where available.
- `0027_audit_chain_safe_resequence`: if audit preflight fails, stop deployment. If already applied and application rollback is required, keep resequenced chain and verify with `npm run audit:verify-chain`.
- `0028_session_roster_attendance_review`: additive. Rollback image only; keep roster/review columns for historical integrity.
- `0029_effective_dated_enrollment_integrity`: restore backup for failed deploy. If application rollback is required after success, keep FK/exclusion constraints and use compatibility code only.
- `0030_session_roster_attendance_fk`: restore backup for failed deploy. If successful, do not drop FK in production without a data-integrity incident review.
