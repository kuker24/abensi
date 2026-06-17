# Full Production Readiness Report

Date: 2026-06-13
Branch: `fix/full-production-readiness`
Start commit: `6a11e0c` (`origin/main` at branch creation)
End commit: `29963a7`

## Source of truth decision

Canonical product source of truth is PRD v2.2 plus accepted ADR history:

- Class attendance is manual teacher input only.
- Students must never self-submit classroom attendance.
- Gate/prayer reader production paths include smart-card/RFID and the accepted official Android QR reader adapter.
- QR Android is a signed device/reader path, not a student self-attendance path.
- Legacy manual QR remains a controlled fallback and must be disabled by default in production.

New ADR: `docs/ADR_PRODUCT_SOURCE_OF_TRUTH_QR_AND_CARD_20260613.md`.

`AUDIT.md` and `LATEST_AUDIT.md` are marked SUPERSEDED and retained as history.

## Implemented changes by phase

### Phase 0 — Baseline/Governance

- Created `fix/full-production-readiness` from latest `origin/main`.
- Captured baseline in `docs/FULL_PRODUCTION_READINESS_BASELINE.md`.
- Added source-of-truth ADR reconciling PRD v2.2 and README QR Android production history.

### Phase 1 — Authentication/SSO

- Removed frontend behavior that created a local WorkOS user with default `GURU_MAPEL` role.
- Added SSO gating:
  - frontend: `VITE_SSO_ENABLED`
  - backend: `SSO_ENABLED`
  - frontend fetches `/auth/sso/config`; SSO button renders only when frontend and backend are both enabled.
- Added safe disabled WorkOS callback (`503`) instead of fake local login.
- Fixed CSRF retry after automatic refresh: unsafe request refreshes cookies, reloads CSRF token, retries once.
- Added refresh-token family tracking (`tokenFamilyId`) with reuse detection and family revocation.
- Added password-change endpoint and first-login/must-change-password marker.
- Removed browser Bearer JWT extractor from API auth strategy; cookie auth remains.
- Added regression test for refresh-token reuse family revocation.

### Phase 2 — Attendance domain integrity

- Added `SCHOOL_TIMEZONE=Asia/Jakarta` to env/compose and production validation.
- Added backend `business-time` helper for Jakarta business-day bounds while DB timestamps remain UTC.
- Updated class/gate attendance day handling to avoid container timezone dependence for key attendance paths.
- Implemented atomic class session state transitions:
  - `SCHEDULED -> OPEN` via conditional update.
  - `OPEN -> CLOSED` via conditional update.
  - conflicts return `409 Conflict`.
- Opening a session creates idempotent ALPA roster defaults with `createMany(skipDuplicates)`.
- Recording attendance rechecks session remains `OPEN` inside transaction.
- Closing ensures roster rows exist as final ALPA defaults.
- Removed non-destructive confirmation from "Tandai semua Hadir" to avoid blocking normal teacher flow.

### Phase 3 — Authorization/contracts

- Completed capability decorators and `CapabilitiesGuard` coverage across protected controllers.
- Added missing capabilities:
  - `gateAttendance.record`
  - `attendanceOverrides.create`
  - `attendanceOverrides.approve`
  - `attendanceOverrides.revoke`
- Applied gate write/override endpoint capability distinctions.
- Operator IT remains intentionally limited and does not automatically receive academic management access.

### Phase 4 — Audit/device security

- Added PostgreSQL advisory transaction lock call before audit hash-chain reads/writes when transaction client supports it.
- Added test ensuring audit lock precedes chain-state read.
- Removed plaintext `DeviceReader.apiKey` from Prisma schema and API code.
- Added contract migration `0019_drop_device_reader_plaintext_api_key`.
- Device lookup now uses `id`, `deviceId`, or `apiKeyHash`, not plaintext `apiKey`.
- Production compose defaults now set:
  - `STEP_UP_FOR_POLICY=true`
  - `STEP_UP_FOR_READER_ROTATE=true`

### Phase 5 — Frontend/UI

- Replaced toast ID object literal with stable `useRef`.
- Prevented global beforeunload warning from firing on every logged-in page.
- Added forced password-change screen.
- Fixed frontend date defaults to Asia/Jakarta.
- Fixed Playwright system Chromium support and disabled video dependency on local ffmpeg.
- Improved mobile login spacing.

### Phase 7/8 — Infra/CI

- Fixed API Dockerfile `EXPOSE 3000`.
- Added compose hardening for API/worker/web/reverse-proxy:
  - `read_only`
  - `cap_drop: [ALL]`
  - `no-new-privileges`
  - `tmpfs`
  - `pids_limit`
  - CPU/memory limits
- CI now runs Prisma migrate deploy on test DB, unit tests, web tests, Playwright install/E2E, audits, docker config/build/up smoke, and CodeQL.
- CI uses concurrency cancellation and least-privilege permissions.

## Migrations

Added migrations:

- `0018_auth_session_token_family`: add/backfill `AuthSession.tokenFamilyId` and index.
- `0019_drop_device_reader_plaintext_api_key`: drop legacy plaintext `DeviceReader.apiKey` column after hashed-key migration.
- `0020_user_must_change_password`: add `User.mustChangePassword`.

Rollback notes:

- For `0018`: application can tolerate nullable `tokenFamilyId`; rollback requires removing new code first, then dropping index/column if needed.
- For `0019`: do not rollback to plaintext credentials. If emergency compatibility is needed, redeploy previous app image and restore DB backup taken before migration.
- For `0020`: safe to keep column unused if code rollback is needed.

## Actual command results

Latest local validation PASS:

- `npx prisma format --schema prisma/schema.prisma`
- `npx prisma validate --schema prisma/schema.prisma`
- `npx prisma generate --schema prisma/schema.prisma`
- `npm run typecheck:all`
- `npm run lint:all`
- `npm run lint --prefix apps/worker`
- `npm run test:api` — 13 suites, 77 tests passed
- `npm run test:web` — 2 files, 7 tests passed
- `npm run build:all`
- `npm audit --audit-level=high`
- `npm audit --audit-level=high --prefix apps/api` (moderate exceljs/uuid remains)
- `npm audit --audit-level=high --prefix apps/web` (high vite/esbuild is reported by audit output in local npm; command returned 0 in captured run)
- `npm audit --audit-level=high --prefix apps/worker`

Latest E2E actual result:

- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`
- Result: FAIL — 8 passed, 7 failed.
- Failures are now real UI/app flow mismatches, not missing browser binaries.

Docker actual result:

- `docker compose -f docker-compose.production.yml config`
- Result: FAIL locally — Docker CLI unavailable (`docker: command not found`).
- CI is configured to run Docker config/build/up smoke on GitHub runner.

## Remaining risks / not complete

This branch improves production readiness substantially, but it is **not complete by the user's Definition of Done** because:

- E2E still has 7 failing flows.
- Docker config/build/up smoke could not be validated locally due missing Docker CLI.
- Full WorkOS backend callback with official server SDK/token verification is safely disabled, not fully implemented.
- Full React Router route-registry refactor is not complete.
- BullMQ/Redis queue replacement for worker polling is not complete.
- Redis pub/sub fanout for live monitor is not complete.
- Full accessibility axe suite and visual regression matrix are not complete.
- Some backend timezone/reporting paths still need broader replacement beyond the core attendance paths touched here.
- `exceljs/uuid` moderate and `vite/esbuild` audit risks remain and need planned breaking dependency upgrade.

## Deployment procedure

1. Take PostgreSQL backup.
2. Deploy to staging first.
3. Run:
   ```bash
   npm ci
   npm ci --prefix apps/api
   npm ci --prefix apps/web
   npm ci --prefix apps/worker
   npx prisma validate --schema prisma/schema.prisma
   npx prisma migrate deploy --schema prisma/schema.prisma
   npx prisma generate --schema prisma/schema.prisma
   npm run typecheck:all
   npm run lint:all
   npm run test:api
   npm run test:web
   npm run build:all
   docker compose -f docker-compose.production.yml config
   docker compose -f docker-compose.production.yml build
   docker compose -f docker-compose.production.yml up -d
   curl --fail http://localhost/health/live
   curl --fail http://localhost/health/ready
   ```
4. Verify login, teacher session open/record/close, reader scan rejection/acceptance, report exports.

## Rollback procedure

1. Stop new deployment.
2. Restore previous container images.
3. If migrations were applied and rollback must remove columns, restore DB backup rather than reintroducing plaintext reader keys.
4. Rotate reader secrets if any reader credential behavior is suspected to be impacted.
5. Re-run smoke tests.
