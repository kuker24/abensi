# Remaining Production Readiness Baseline

Date: 2026-06-14

## Repository

- Repository: `kuker24/abensi`
- PR: #2 — `fix: full production readiness hardening checkpoint`
- Branch: `fix/full-production-readiness`
- Base branch: `main`
- Starting commit: `e698bcc7e449356f529d83292d0c0da0413a422f`
- Base commit: `6a11e0c2c17709a619e879381687943621ec7215`
- Latest known green CI at baseline: `27486512572` (`validate`, `docker`, `codeql` PASS), https://github.com/kuker24/abensi/actions/runs/27486512572

## Fetch/Pull Evidence

- `git fetch --all --prune`: BLOCKED for stale remote `schoolhub-new` (`Repository not found`).
- `git fetch origin --prune`: PASS.
- `git checkout fix/full-production-readiness`: PASS.
- `git pull --ff-only`: PASS.
- Ancestor check for required minimum head `e698bcc7e449356f529d83292d0c0da0413a422f`: PASS.

## Local Tool Versions

- Node: `v26.2.0`
- npm: `11.16.0`
- PostgreSQL client/server: BLOCKED locally (`psql: command not found`; no local PostgreSQL endpoint available).
- Redis: BLOCKED locally (`redis-server: command not found`).
- Docker/Compose: BLOCKED locally (`docker: command not found`).
- Java: OpenJDK `17.0.19+10`
- Gradle: `8.7` (Android wrapper)
- Android SDK from `apps/android-reader/app/build.gradle.kts`: compileSdk `35`, minSdk `24`, targetSdk `35`, default versionCode `3`.

## Prisma Migrations at Baseline

```text
0001_init
0002_smartcard_and_extended_flags
0003_geofence_policy_extended_controls
0004_reporting_audit_escalation
0005_picket_book_and_master_ops
0006_web_operational_completion
0007_stability_performance_indexes
0008_teacher_session_checkin_checkout
0009_adaptive_qr_attendance
0010_developer_tutorial_control
0011_student_ashar_checkout_policy
0012_security_anti_cheat_hardening
0013_android_qr_reader
0014_supabase_rls_hardening
0015_device_reader_hashed_keys
0016_device_gate_events
0017_auth_session_metadata
0018_auth_session_token_family
0019_drop_device_reader_plaintext_api_key
0020_user_must_change_password
0021_gate_log_business_date
0022_audit_chain_sequence
0023_session_business_date_idempotency
0024_session_schedule_exclusion_constraints
```

`_prisma_migrations` local state: BLOCKED — no reachable local PostgreSQL (`P1001` to `postgres:5432`). CI baseline `27486512572` ran `npx prisma migrate deploy` successfully on disposable PostgreSQL.

## Baseline Commands Before Editing

| Command | Status | Evidence |
|---|---:|---|
| `npm ci` | PASS | 0 vulnerabilities |
| `npm ci --prefix apps/api` | PASS | 2 moderate vulnerabilities (ExcelJS/UUID), no high/critical |
| `npm ci --prefix apps/web` | PASS | 0 vulnerabilities |
| `npm ci --prefix apps/worker` | PASS | 0 vulnerabilities |
| `npx prisma format --schema prisma/schema.prisma` | PASS | No schema diff |
| `git diff --exit-code prisma/schema.prisma` | PASS | No diff |
| `npx prisma validate --schema prisma/schema.prisma` | PASS | Schema valid |
| `npx prisma generate --schema prisma/schema.prisma` | PASS | Client generated |
| `npx prisma migrate deploy --schema prisma/schema.prisma` | BLOCKED | `P1001`, no local PostgreSQL at `postgres:5432` |
| `npm run typecheck:all` | PASS | API + web typecheck passed |
| `npm run lint:all` | PASS | API + web lint passed |
| `npm run lint --prefix apps/worker` | PASS | `node --check src/index.js` passed |
| `npm run test:api` | PASS | 18 suites, 135 tests |
| `npm run test:web` | PASS | 3 files, 10 tests |
| `npm run test:e2e` | BLOCKED | Playwright browser executable missing locally |
| `npm run build:all` | PASS | API build + Vite web build passed |
| `npm audit --audit-level=high` | PASS | 0 high/critical |
| `npm audit --audit-level=high --prefix apps/api` | PASS | 2 moderate (ExcelJS/UUID), 0 high/critical |
| `npm audit --audit-level=high --prefix apps/web` | PASS | 0 high/critical |
| `npm audit --audit-level=high --prefix apps/worker` | PASS | 0 high/critical |
| Docker compose config/build/up/ps | BLOCKED | `docker: command not found` locally; CI docker job PASS in run `27486512572` |
| `curl --fail http://localhost/health/live` | NOT RUN | Stack could not start locally without Docker |
| `curl --fail http://localhost/health/ready` | NOT RUN | Stack could not start locally without Docker |

## Test Counts

- API Jest baseline: 18 suites / 135 tests PASS.
- Web Vitest baseline: 3 files / 10 tests PASS.
- Playwright UI-mocked baseline: 15 tests detected; local run BLOCKED by missing browser; CI run `27486512572` PASS.

## Known Vulnerabilities

- Root, web, worker: 0 high/critical.
- API: 2 moderate advisories via `exceljs -> uuid` (`GHSA-w5hq-g745-h8pq`). No `npm audit fix --force` used.

## Existing Accepted Risks / Blockers From Prompt

- Legacy `GateLog.businessDate` and `Session.businessDate` backfills used incorrect timezone interpretation in migrations 0021 and 0023.
- Existing GateLog dedupe migration preserved only minimal metadata and could have deleted forensic evidence in environments where already applied.
- Generated-session retry catches a constraint violation then queries in the same PostgreSQL transaction.
- Audit sequence migration ordered by `createdAt,id` instead of verified hash-chain topology.
- Complete atomic audit coverage requires continuing verification.
- Effective-dated enrollment is missing.
- Immutable `SessionRoster` is missing.
- Default ALPA can be counted as reviewed attendance.
- Forced-password-change frontend state requires full-stack proof.
- Calendar validation still accepts JavaScript-normalized invalid dates.
- Real PostgreSQL integration/concurrency tests are missing locally and incomplete in CI.
- Real full-stack authentication E2E is missing.
- SSO state must be made truthful.
- Worker scheduling is process-local.
- SSE/live monitor uses per-client polling.
- Android CI/release-security gates are incomplete.
- Accessibility and visual regression gates are absent.
- HTTPS production entrypoint is not verified locally.
- Supply-chain scanning requires expansion and action pinning.
- PR/readiness docs contain stale claims.
- Tracked generated/backup artifacts require hygiene review.

## Upgrade Fixture

A populated pre-0021 upgrade fixture was added under `prisma/fixtures/pre_0021_upgrade_fixture.sql`. It is intended for a database restored to migration 0020/main-era state before applying corrective migrations 0021+ and contains Jakarta-midnight GateLog rows, duplicate groups, generated/overlapping sessions, audit chain fixtures, attendance, enrollment, and auth-session data.
