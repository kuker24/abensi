> **SUPERSEDED** by `docs/FULL_PRODUCTION_READINESS_REPORT.md` and `docs/ADR_PRODUCT_SOURCE_OF_TRUTH_QR_AND_CARD_20260613.md` on 2026-06-13.  
> Retained for historical reference only.

# SchoolHub e-Hadir Production Hardening Audit

Branch: `fix/production-hardening`
Date: 2026-06-13
Primary PRD checked: `prd-ehadir-v2_2.md` because requested `prd-ehadir-v2.1.md` is not present in the working tree. The v2.2 PRD states that its technical content is the same as v2.1 with friendlier language.

## Baseline Validation Results

Raw log: `/tmp/schoolhub-baseline-production-hardening.log`

| Check | Command | Result | Notes |
|---|---|---:|---|
| Runtime | `node -v && npm -v` | PASS | Completed. |
| Root install | `npm ci` | PASS | Completed. |
| API install | `npm ci --prefix apps/api` | PASS | Completed. |
| Web install | `npm ci --prefix apps/web` | PASS | Completed. |
| Worker install | `npm ci --prefix apps/worker` | PASS | Completed. |
| Prisma format | `DIRECT_URL=... npx prisma format --schema prisma/schema.prisma` | PASS | Completed. |
| Prisma validate | `DIRECT_URL=... npx prisma validate --schema prisma/schema.prisma` | PASS | Completed. |
| Prisma generate | `DIRECT_URL=... npx prisma generate --schema prisma/schema.prisma` | PASS | Completed. |
| Typecheck | `npm run typecheck:all` | PASS | Completed. |
| Lint | `npm run lint:all` | PASS | Completed. |
| API tests | `npm run test:api` | PASS | Completed. |
| Web tests | `npm run test:web` | FAIL | `App` uses `useAuth` without `AuthKitProvider` in tests after WorkOS integration. |
| Build | `npm run build:all` | PASS | Completed. |
| Playwright E2E | `npm run test:e2e --prefix apps/web` | FAIL | Browsers missing. Playwright requested `npx playwright install`. |
| Docker config | `docker compose -f docker-compose.production.yml config` | FAIL | Docker CLI unavailable in this environment: `docker: command not found`. |
| Root high audit | `npm audit --audit-level=high` | PASS | Root only. |
| API moderate audit | `npm audit --audit-level=moderate --prefix apps/api` | FAIL | `tmp` high via dependency tree, `exceljs`/`uuid` moderate. |
| Web moderate audit | `npm audit --audit-level=moderate --prefix apps/web` | FAIL | `vite`/`esbuild` high, `react-router` moderate. |
| Worker moderate audit | `npm audit --audit-level=moderate --prefix apps/worker` | FAIL | `axios` high. |

## Confirmed Findings

### P0-001 — Requested source PRD filename is absent
- Severity: P0 process risk
- Affected files: repository root; requested `prd-ehadir-v2.1.md`; available `prd-ehadir-v2_2.md`
- Evidence: `find` shows `prd-ehadir-v2_2.md` and `prd_absensi_v2.md`, not `prd-ehadir-v2.1.md`.
- Business impact: Reviewers may compare implementation to a document not committed to the repo.
- Solution: Treat `prd-ehadir-v2_2.md` as canonical for this branch because it says technical content equals v2.1; add this note to docs and PR.

### P0-002 — Repository remote mismatch
- Severity: P0 release governance risk
- Affected files/config: Git remote
- Evidence: local remote is `git@github.com:fahmibussinesman/schoolhub-ehadir-.git`, while mission says `kuker24/abensi`.
- Business impact: Work can be pushed to the wrong review target.
- Solution: Confirm target remote before final push/PR; do not overwrite unrelated repo history.

### P0-003 — Frontend still stores authentication material in `localStorage`
- Severity: Critical
- Affected files: `apps/web/src/app/api.ts`, `apps/web/src/app/SchoolHubApp.tsx`, `apps/web/e2e/admin-guru-flows.spec.ts`, tests
- Evidence: `TOKEN_KEY = schoolhub_access_token`; code reads/writes bearer token to `localStorage`.
- Business impact: XSS can exfiltrate tokens and bypass server-side session revocation expectations.
- Solution: Move browser auth to HttpOnly Secure SameSite cookies, remove token localStorage use, call `/auth/me` on boot, use cookie credentials, update tests/E2E.

### P0-004 — Backend auth is partly cookie-based but still returns tokens and accepts bearer tokens
- Severity: Critical
- Affected files: `apps/api/src/modules/auth/auth.controller.ts`, `apps/api/src/modules/auth/jwt.strategy.ts`, `apps/api/src/modules/auth/auth.service.ts`
- Evidence: login returns `accessToken`/`refreshToken`; JWT extractor accepts `Authorization: Bearer`; SSE supports token query separately.
- Business impact: Token leakage remains possible through JS, logs, browser storage, and copied API calls.
- Solution: Stop returning token material in JSON, prefer cookie extractor, optionally keep bearer only for explicitly documented non-browser/internal clients, add CSRF for state-changing cookie requests.

### P0-005 — SSE live monitor accepts JWT in URL query
- Severity: Critical
- Affected files: `apps/api/src/modules/reporting/reporting.controller.ts`, frontend live monitor code
- Evidence: `@Sse('live-monitor/stream')` reads `@Query('token') token`.
- Business impact: Tokens can leak via URLs, logs, referrers, browser history, analytics, and error tools.
- Solution: Use cookie-authenticated SSE or WebSocket/fetch stream without URL tokens; add heartbeat and shared Redis/event pipeline later.

### P0-006 — DeviceReader stores plaintext API key
- Severity: Critical
- Affected files: `prisma/schema.prisma`, `apps/api/src/modules/device-reader/device-reader.service.ts`, seed scripts
- Evidence: `DeviceReader.apiKey String @unique`; seed uses `shr_reader_gate_primary_2026`.
- Business impact: DB exposure compromises all readers; predictable demo key can be abused if retained.
- Solution: Add `apiKeyHash`, `keyPrefix`, `keyLast4`, `keyRotatedAt`; migrate existing keys to hashes; reveal raw secret only once on create/rotate; never list raw/hash.

### P0-007 — Human JWT gate tap endpoint remains a primary gate path
- Severity: Critical product integrity risk
- Affected files: `apps/api/src/modules/attendance-gate/attendance-gate.controller.ts`, `apps/api/src/modules/attendance-gate/attendance-gate.service.ts`
- Evidence: protected `POST /attendance/gate/tap` manually records gate scans for human actors.
- Business impact: Gate attendance can be created from admin/picket UI instead of a device-authenticated reader flow, weakening card-reader baseline.
- Solution: Split manual audited correction from device-authenticated `/device/gate/events`; make reader event idempotent by `eventId`.

### P0-008 — Authorization is role-list based and duplicated instead of centralized capabilities
- Severity: High
- Affected files: controllers under `apps/api/src/modules/**`, `apps/web/src/app/SchoolHubApp.tsx`
- Evidence: `@Roles(...)` lists are repeated; frontend has separate `ROUTE_ACCESS` and nav arrays.
- Business impact: Drift can expose functions to Operator IT or hide/show incorrect UI; hard to test matrix coverage.
- Solution: Add shared capability definitions, backend guard/decorator, frontend nav derived from the same matrix, and table-driven tests.

### P0-009 — Session state machine has gaps needing hard concurrency/domain enforcement
- Severity: High
- Affected files: `apps/api/src/modules/attendance-class/attendance-class.service.ts`, Prisma schema/migrations
- Evidence: service exists but audit found need for conditional updates, terminal state enforcement, explicit substitute activity, final row creation at close, and 409 domain errors.
- Business impact: Concurrent opens/closes or unauthorized writes can corrupt classroom attendance and teacher presence.
- Solution: Implement strict `SCHEDULED -> OPEN -> CLOSED` and `SCHEDULED -> MISSED` transitions with conditional updates and integration tests.

### P0-010 — Student self-check-in route appears already absent, but tests must protect this invariant
- Severity: High
- Affected files: `apps/web/src/app/SchoolHubApp.tsx`, `apps/web/src/app/pages/siswa/MyAttendancePage.jsx`, route tests
- Evidence: no `/siswa/check-in`, `StudentCheckInPage`, or `Mulai Absen Masuk` found in current source. Student nav is read-only.
- Business impact: Regression could reintroduce PRD-contradictory self attendance.
- Solution: Add tests asserting no self check-in route/nav/CTA and that student pages only show self data.

### P1-001 — Duplicate Prisma schema exists under API app
- Severity: High
- Affected files: `prisma/schema.prisma`, `apps/api/prisma/schema.prisma`, `apps/api/package.json`, Dockerfiles
- Evidence: previous history showed `apps/api/prisma/schema.prisma` diverged; tooling now partly references root schema but duplicate still exists.
- Business impact: Migrations/client generation can drift and break production deploys.
- Solution: Remove duplicate or make it a generated/symlink source; all tooling should use root `prisma/schema.prisma`.

### P1-002 — Dependency vulnerabilities in API/Web/Worker
- Severity: High
- Affected files: package manifests/locks
- Evidence: baseline audit failures: API `tmp` high and `uuid` moderate via `exceljs`; web `vite/esbuild` high and `react-router` moderate; worker `axios` high.
- Business impact: Supply-chain and runtime risk; CI should block high severity.
- Solution: Upgrade dependencies with tests/build validation; avoid force downgrades that break exports.

### P1-003 — Web tests fail after WorkOS AuthKit integration
- Severity: High
- Affected files: `apps/web/src/App.test.tsx`, `apps/web/src/app/workos-auth.tsx`, app provider wiring
- Evidence: `useAuth must be used within an AuthKitProvider`.
- Business impact: PRs cannot reliably validate login shell behavior.
- Solution: Add provider/test mock or isolate WorkOS optional integration behind safe provider boundary.

### P1-004 — Docker validation/build cannot run in current environment
- Severity: Medium operational blocker
- Affected files: Docker configs
- Evidence: `docker: command not found`.
- Business impact: Container hardening cannot be validated here; must run on a Docker-capable runner/VPS.
- Solution: Add CI Docker jobs and document local/VPS validation steps.

### P1-005 — Worker depends on token-based public HTTP calls
- Severity: High
- Affected files: `apps/worker/src/index.js`, internal reconciliation controllers, compose env
- Evidence: worker calls internal URLs with `WORKER_TOKEN`; production instruction says no default token and internal endpoint must not be public.
- Business impact: If exposed, internal reconciliation/missed-session jobs can be triggered by attackers.
- Solution: Move to Redis queue/internal network signed requests with no public exposure; add locks/retries/DLQ.

### P2-001 — Repository contains generated/cache/build artifacts
- Severity: Medium repo hygiene/performance
- Affected files: `apps/android-reader/build/**`, `apps/android-reader/.gradle/**` and potentially screenshots/artifacts
- Evidence: repository file inventory includes thousands of Gradle cache/build files.
- Business impact: Slow review, larger clone, accidental binary churn.
- Solution: Update `.gitignore`, remove tracked build/cache artifacts in a separate cleanup commit if approved.
