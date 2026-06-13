# SchoolHub e-Hadir Production Hardening Implementation Plan

Branch: `fix/production-hardening`
Date: 2026-06-13

## Execution Principles

- Implement fixes; do not stop at reporting.
- Preserve PRD baseline: gate attendance by card/device, classroom attendance by authorized teacher only.
- Keep changes small and reviewable.
- Record every command result honestly.
- Do not introduce mock/fallback production behavior.
- Do not commit secrets.

## P0 — Must Fix Before Production Review

1. **Lock student flows to read-only**
   - Verify `/siswa/check-in` is absent.
   - Add regression tests: no self-check-in route/nav/CTA, no fake receipt/fallback attendance submission.
   - Ensure student data calls use authenticated self endpoints only.

2. **Remove browser token storage**
   - Update API client to use `credentials: 'include'` only.
   - Remove `schoolhub_access_token` localStorage writes/reads.
   - Keep at most non-sensitive cached user display state, preferably bootstrap through `/auth/me`.
   - Update unit/E2E tests to stop seeding `localStorage` tokens.

3. **Harden backend auth/session contract**
   - Stop returning access/refresh tokens in login/refresh JSON responses for browser flows.
   - Add CSRF protection for cookie-authenticated state-changing requests.
   - Add JWT issuer/audience/jti/algorithm validation.
   - Add strict environment validation and fail production startup on weak/missing secrets.
   - Add password-change/first-login-change support.

4. **Centralize capabilities**
   - Add capability matrix for `ADMIN_TU`, `OPERATOR_IT`, `GURU_MAPEL`, `GURU_PIKET`, `SISWA`, and existing `DEVELOPER` if retained.
   - Backend guard/decorator must be the source of truth for protected endpoints.
   - Frontend navigation and route protection must derive from the same matrix.
   - Add table-driven authorization tests.

5. **Fix class attendance integrity**
   - Strict session state machine with terminal `CLOSED`/`MISSED`.
   - Conditional/idempotent open and close operations.
   - Validate actor/session/student/enrollment/status before writes.
   - Reason-required correction flow with before/after audit.
   - Transactional close finalizing all enrolled students.
   - Substitute teacher explicit model/activity.

6. **Implement real device gate event flow**
   - Add `POST /api/v1/device/gate/events`.
   - HMAC/timestamp/nonce reader authentication.
   - Unique `eventId` idempotency.
   - Reject stale/replayed/invalid/inactive reader/card/user events.
   - Store rejected scans with reasons.

7. **Remove plaintext reader secrets**
   - Migrate `DeviceReader.apiKey` to hashed credential fields.
   - Reveal new raw secret only once on create/rotate.
   - Never return secret/hash in list/detail endpoints.

8. **Secure live monitoring**
   - Remove JWT query parameter support from SSE.
   - Use cookie-authenticated stream or authenticated WebSocket/fetch stream.
   - Add heartbeat, cleanup, Last-Event-ID/backpressure plan.

## P1 — Production Hardening

1. **Prisma/database refactor**
   - Consolidate to one canonical schema.
   - Create migrations for all schema changes.
   - Add constraints/indexes for academic periods, generated sessions, device event idempotency, correction records, date/range/geofence validation.
   - Fix nullable uniqueness for reconciliation flags.

2. **Backend platform hardening**
   - Typed env validation.
   - Request ID middleware and structured JSON logging with redaction.
   - Global exception filter and consistent error contract.
   - Graceful shutdown and Prisma shutdown hooks.
   - Endpoint-specific request limits/rate limits.
   - OpenAPI and metrics.
   - Map Prisma errors to safe API errors.

3. **Worker hardening**
   - Remove default worker token.
   - Internal-only/queue-based reconciliation with Redis locks.
   - No overlapping ticks, retries with backoff/jitter, DLQ, health, metrics.

4. **Frontend architecture**
   - Central auth provider with boot-time `/auth/me` validation.
   - Global 401/403 handling and refresh.
   - Lazy route modules already partly present; finish server-state abstraction.
   - Runtime response validation.
   - Remove production fallback/mock data.
   - Split giant `SchoolHubApp.tsx`, `api.ts`, `ui.tsx`, and `styles.css` by domain.

5. **UI/UX accessibility and workflow repair**
   - Generate nav from capabilities.
   - Teacher attendance flow: current session, bulk mark present, sticky save, unsaved-change guard, conflict display, close confirmation, correction-only after close.
   - WCAG 2.2 AA: landmarks, skip link, focus trap/restoration, aria-live, keyboard tabs/dialogs/tooltips, reduced motion, touch targets.
   - Test 320/375/768/1024/desktop.

6. **Testing**
   - Backend unit and real PostgreSQL integration tests.
   - Auth cookie/CSRF/session tests.
   - Capability matrix tests and escalation tests.
   - Device protocol/idempotency tests.
   - Frontend tests for auth/nav/error/accessibility.
   - E2E must use real API/test DB and no localStorage token bypass.
   - Add axe checks.

7. **CI/CD**
   - GitHub Actions PR/main: install, Prisma format/validate/generate, typecheck, lint, tests, integration services, Playwright, build, Docker build/config, audits, secret/static/container scans, migration drift.

8. **Docker/deployment hardening**
   - Pin supported Node images.
   - Non-root, prod deps only, healthcheck, init process, read-only FS/tmpfs where possible, drop caps, resource limits, log rotation.
   - Separate migration job/release step.
   - Harden Nginx/TLS/security headers/rate limits/SSE logging.
   - Document PostgreSQL backups/restore/RPO/RTO and Redis auth/persistence.

9. **Documentation**
   - Update README.
   - Add docs: architecture, security, authentication, device protocol, role matrix, migrations, backup/restore, deployment, testing, runbook.
   - Add ADRs: auth strategy, device auth, session state machine, live events, Redis usage.

## P2 — Cleanup and Maintainability

1. Remove tracked generated/cache/build artifacts after approval.
2. Reduce `any` usage and split oversized UI files.
3. Improve query plans and reporting indexes after integration tests exist.
4. Add observability dashboards and operational alerts.

## Initial Commit Plan

1. `chore: add audit and baseline documentation`
2. `fix: lock student attendance pages to read-only invariants`
3. `fix: repair web auth test provider baseline`
4. `fix: remove browser token storage`
5. `feat: add strict environment validation`
6. Continue P0 items in the order above.

## Current Baseline Blockers

- Web unit tests fail due WorkOS AuthKit provider/test setup.
- Playwright browsers are not installed in this environment.
- Docker CLI is unavailable in this environment.
- Dependency audits fail in API/web/worker.
