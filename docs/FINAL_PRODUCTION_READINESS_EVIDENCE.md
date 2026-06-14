# Final Production Readiness Evidence

Date: 2026-06-14

Final recommendation: **NOT READY FOR MERGE**

This document refreshes the production-readiness evidence after the split CI matrix turned green. It is intentionally conservative: CI is green for the implemented gates, but several requested production-readiness scope items remain incomplete or externally unverifiable.

## Branch / PR

- Repository: `kuker24/abensi`
- Branch: `fix/full-production-readiness`
- PR: #2
- Starting implementation head: `e2ab0435cdb9f2f2c6d952fb6fae417d46107d1b`
- Latest verified implementation head before this docs-only refresh: `64569cf379bf078d4ead118519bb5fbe0195457d`
- No merge to `main` was performed.

## Commits added after `e2ab043`

- `1c90221` — docs: establish production readiness execution ledger
- `e8a525f` — fix: require explicit attendance review confirmation
- `3774635` — feat: enforce effective dated class enrollment
- `b216814` — fix: enforce immutable session roster attendance integrity
- `2d8c005` — test: add corrective migration preflight suite
- `9f37c1e` — fix: cryptographically preflight audit chain
- `98be9f8` — test: add real postgres integration and concurrency suites
- `dfadcd0` — test: add real full stack security e2e
- `bdb18ca` — feat: replace worker polling with redis queues
- `5a5259b` — feat: stream live monitor through outbox events
- `0b8f5a4` — test: add accessibility and visual gates
- `21c8f74` — feat: verify production https entrypoint
- `981f6d4` — ci: add supply chain and release security gates
- `d9ce031` — ops: add backup restore observability gates
- `185a3e0` — ci: split production readiness validation gates
- `4f06bf5` — docs: refresh production readiness evidence
- `5f52cd3` — fix: repair production readiness CI gates
- `5db1db4` — fix: address remaining CI validation failures
- `3b8a1ae` — fix: satisfy a11y and seeded roster gates
- `79ec607` — fix: stabilize full stack and accessibility gates
- `054d7ef` — fix: generate api prisma client for runtime
- `3e8a5db` — test: stabilize playwright production gates
- `77475eb` — fix: preserve csrf login exemptions behind prefix
- `f0536f7` — test: use prefixed full stack api paths
- `64569cf` — test: normalize full stack api base url

## Migrations added in this continuation

- `0029_effective_dated_enrollment_integrity`
- `0030_session_roster_attendance_fk`
- `0031_outbox_event_stream`

## Database constraints added

- Removed the legacy permanent Prisma uniqueness on `ClassEnrollment(classId, studentId)` during migration `0029`.
- Added ClassEnrollment FKs for academic year, semester, createdBy, endedBy.
- Added ClassEnrollment period integrity checks and PostgreSQL GiST exclusion to prevent overlapping enrollment periods per student.
- Added composite FK `StudentAttendance(sessionId, studentId)` → `SessionRoster(sessionId, studentId)`.
- Added StudentAttendance FKs for `confirmedById` and `correctedById`.
- Added `OutboxEvent` table and indexes for replayable live-monitor events.

## Local validation evidence

PASS, run during this continuation:

- `npm run prisma:generate`
- `npm run typecheck:all`
- `npm run lint:all`
- `npm run lint --prefix apps/worker`
- `npm run test:api` — 21 suites / 157 tests PASS after CSRF regression coverage was added
- `npm run test:web` — 3 files / 10 tests PASS
- `npm run build:all`
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:ui` — 15 tests PASS locally
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:a11y` — 6 tests PASS locally
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:visual` — 3 tests PASS locally
- `npm run security:secrets`
- `npm run security:license`
- `npm run security:sbom`
- Root/API/Web/Worker `npm audit --audit-level=high` PASS; API still has the documented moderate ExcelJS→UUID advisory with time-limited risk acceptance.

Local limitations:

- Docker is unavailable in this execution environment.
- Local PostgreSQL/Redis are unavailable; real DB/Redis validation was delegated to CI service containers.
- Owner-controlled public TLS endpoint and Android protected signing secrets are unavailable locally.

## CI validation evidence

PASS — split CI matrix completed successfully for PR run `27500077999` at head `64569cf379bf078d4ead118519bb5fbe0195457d`.

Run URL: <https://github.com/kuker24/abensi/actions/runs/27500077999>

Successful jobs:

- `validate` — PASS, job `81281222495`
- `android` — PASS, job `81281222488`
- `docker` — PASS, job `81281222536`
- `codeql` — PASS, job `81281222522`
- `postgres-integration` — PASS, job `81281222543`
- `upgrade-migrations` — PASS, job `81281222494`
- `security-supply-chain` — PASS, job `81281222500`
- `web-quality-gates` — PASS, job `81281222549`
- `full-stack-e2e` — PASS, job `81281222571`
- `backup-restore-drill` — PASS, job `81281222589`

The matching push run `27500076812` also completed successfully at the same head.

## Implemented blocker closures

PASS/PARTIAL:

- Attendance review semantics: no-op save confirms zero rows; backend requires explicit confirmation; frontend tracks dirty/explicit rows; bulk present/ALPA endpoints added; optimistic `updatedAt` version checks reject stale saves.
- Effective-dated enrollment: periods and semester/year validation added; transfer workflow is serializable; history/API/UI paths added; overlapping primary enrollment is DB-enforced.
- SessionRoster integrity: mutable current-enrollment fallback removed from class attendance paths; missing roster raises `SESSION_ROSTER_MISSING`; audited repair workflow and composite FK added.
- Migration safety: read-only production preflight, post-migration verifier, upgrade migration suite entrypoint, approval/rollback docs, and additive corrective migrations added.
- Audit chain: cryptographic preflight uses canonical JSON and validates chain topology/state before resequencing workflows.
- Real PostgreSQL tests: integration/concurrency scripts now run in CI against PostgreSQL service containers.
- Full-stack security E2E: real API/web/PostgreSQL/Redis/cookie/CSRF Playwright gate now passes without localStorage auth seeding.
- Worker: interval polling replaced with Redis/BullMQ repeatable jobs, retries/backoff, DLQ, graceful shutdown, health file, and signed internal requests with nonce replay protection.
- SSE/live monitor: per-client 5-second DB polling removed; outbox replay, heartbeat, auth, and connection limits added.
- A11y/visual: axe WCAG checks and deterministic visual gates now pass in CI.
- HTTPS: TLS termination model documented; Nginx forwarded-proto redirect/HSTS behavior and HTTPS smoke script added.
- Supply chain/release: current GitHub Actions pinned to SHAs; Dependabot, secret scan, license check, SBOM, Trivy wrapper, Android release security script, and ExcelJS risk acceptance added.
- Ops: encrypted backup/restore support, restore drill, structured logs, metrics endpoint, RPO/RTO and rollback docs added.
- Hygiene: stale tracked backup trees removed; `backups/` ignored; Playwright E2E/a11y/visual specs excluded from Vitest.

## Remaining risks / incomplete scope

FAIL/PENDING — these are why the recommendation remains **NOT READY FOR MERGE** despite green CI:

- React Router typed registry refactor remains incomplete; manual route maps and `pushState` navigation still exist.
- Upgrade migration fixtures are not yet comprehensive populated legacy datasets for every abort/repair scenario.
- PostgreSQL concurrency coverage is improved but still not a complete matrix for every critical race condition.
- Full-stack E2E covers core auth/cookies/CSRF/self-report, but not every gate/prayer/geofence/SSE production flow requested.
- HTTPS smoke still requires an owner-controlled public TLS endpoint or CI TLS fixture; this environment cannot prove real external TLS.
- Android release signing is guarded by scripts/docs, but protected signing secrets were not available here.
- Moderate ExcelJS→UUID advisory is accepted by documented risk acceptance, not fully eliminated.
- GitHub Actions currently emit Node.js 20 action-deprecation warnings; they are warnings, not current gate failures, but should be tracked.

## Final recommendation

**NOT READY FOR MERGE** until the remaining non-CI scope gaps above are either implemented, explicitly re-scoped by the owner, or accepted with production sign-off.
