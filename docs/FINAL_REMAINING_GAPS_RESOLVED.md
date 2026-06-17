# Final Remaining Gaps Resolved

Date: 2026-06-13
PR: https://github.com/kuker24/abensi/pull/2
Branch: `fix/full-production-readiness`
Starting commit for this continuation: `04753f55f7360e05df215de7bb80cfe30b624fb6`
Ending local commit before push: see latest `git rev-parse HEAD` after this document commit.
Inspected failing CI run: `27465170676`

## Original failures inspected

### validate job

Root failure: `npm run test:e2e` failed in GitHub Actions.

Observed failures:

- Login password-to-submit spacing was below 16px.
- Broad `**/api/v1/**` Playwright route mocks intercepted `/auth/me` and caused authenticated pages to render login.
- UI tests changed roles in the same page while auth route handlers accumulated stale state.
- Tutorial auto-open test expected onboarding, but the app only mounted the tutorial component after manual enable.
- Developer permanent-delete test checked the wrong tab and did not acknowledge the custom risk confirmation.

### docker job

Root failure: API/worker started against a fresh database before Prisma migrations.

CI log evidence from `27465170676`:

```text
The table `public.GeofencePolicy` does not exist in the current database.
The table `public.Session` does not exist in the current database.
```

## Fixes implemented

### E2E/UI

- Updated route mocks so catch-all handlers call `route.fallback()` for `/api/v1/auth/*` instead of swallowing auth endpoints.
- Made `setStoredAuth()` clear stale `/auth/me` handlers before installing the next role's mock.
- Added deterministic Playwright reporter configuration:
  - list
  - HTML
  - JUnit
  - trace on first retry
  - screenshot on failure
  - timezone `Asia/Jakarta`
  - locale `id-ID`
  - one worker
- Fixed login vertical spacing by increasing login-card field spacing.
- Mounted onboarding component for authenticated users; it still opens only when `/tutorials/me` says `shouldShow=true`.
- Updated developer permanent-delete test to select `Buat/Edit Akun` and acknowledge the custom `Lanjutkan` confirmation.
- Removed non-destructive confirmation from "Tandai semua Hadir" normal teacher flow.

### Docker/readiness

- Added `migrate` one-shot service to `docker-compose.production.yml`:
  - uses API image
  - runs `npx prisma migrate deploy --schema prisma/schema.prisma`
  - depends on healthy Postgres
  - passes `DATABASE_URL` and `DIRECT_URL`
  - API/worker depend on migration completion
- Added `DIRECT_URL` to API compose environment.
- Strengthened `/health/ready` and `/health/detail` to verify critical tables exist:
  - `_prisma_migrations`
  - `User`
  - `Session`
  - `GeofencePolicy`
  - `AuthSession`
  - `GateLog`
  - `AuditEntry`
- Added CI artifact upload for:
  - `apps/web/playwright-report`
  - `apps/web/test-results`
  - Docker compose ps/log diagnostics

### Security/domain fixes

- Server-side `mustChangePassword` enforcement added in JWT strategy.
- Allowed only auth endpoints needed to change/logout while password is required.
- Direct protected API calls now fail with HTTP 403 code `PASSWORD_CHANGE_REQUIRED`.
- Successful password change now:
  - updates password hash;
  - clears `mustChangePassword`;
  - increments `sessionVersion`;
  - revokes active auth sessions;
  - writes audit in the same transaction;
  - clears auth cookies in the controller response.
- SSO config no longer advertises enabled just because WorkOS env vars exist. It requires `SSO_IMPLEMENTATION_READY=true`; otherwise frontend cannot render a clickable SSO flow to a 503 callback.
- `runAutoMissedSessions()` now uses conditional `updateMany` with `status=SCHEDULED`. If the session changed concurrently, it skips teacher presence, flags, notification, reconciliation, and `session.missed` audit.

### Dependency audit

- Upgraded web Vite toolchain to resolve high severity Vite/esbuild audit failures:
  - `vite@8.0.16`
  - latest `@vitejs/plugin-react`
- `npm audit --audit-level=high --prefix apps/web` now reports `found 0 vulnerabilities`.

## Tests added/updated

- `apps/api/src/modules/auth/jwt.strategy.spec.ts`
  - denies protected endpoints when password change is required;
  - allows `/auth/change-password`;
  - rejects JWTs without `jti`.
- `apps/api/src/modules/auth/auth.service.spec.ts`
  - password change revokes sessions, increments session version, and writes audit.
- `apps/api/src/modules/reconciliation/reconciliation.service.spec.ts`
  - auto-missed race conflict skips all side effects.
- `apps/web/e2e/admin-guru-flows.spec.ts`
  - route mocking corrected;
  - role switching made deterministic;
  - custom confirmation flow handled correctly.

## Local command evidence

PASS locally:

```text
npx prisma format --schema prisma/schema.prisma
git diff --exit-code prisma/schema.prisma
npx prisma validate --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
npm run typecheck:all
npm run lint:all
npm run lint --prefix apps/worker
npm run test:api
npm run test:web
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
npm run build:all
npm audit --audit-level=high
npm audit --audit-level=high --prefix apps/api
npm audit --audit-level=high --prefix apps/web
npm audit --audit-level=high --prefix apps/worker
```

Observed output highlights:

- API tests: `14 passed, 14 total`; `82 passed, 82 total`.
- Web tests: `2 passed`; `7 passed`.
- Playwright E2E: `15 passed`.
- Web audit: `found 0 vulnerabilities`.
- Root audit: `found 0 vulnerabilities`.
- Worker audit: `found 0 vulnerabilities`.
- API high audit passed; moderate `exceljs -> uuid` remains and does not fail `--audit-level=high`.

Blocked locally:

```text
docker compose -f docker-compose.production.yml config
```

Reason:

```text
docker: command not found
```

Docker validation is therefore delegated to GitHub Actions `docker` job after push.

## Migration notes

No new Prisma migration was added in this continuation. Existing migration behavior changed operationally through compose:

- production Docker now runs `prisma migrate deploy` once before API/worker startup.
- readiness now fails if required schema/tables are missing.

## CI reference

Pre-fix red CI: `27465170676`.
Post-fix CI: pending after push; update PR #2 checks before merge.

## Remaining accepted risks / not fully resolved

The immediate red CI causes were addressed locally, but the full user-provided Definition of Done still contains major work not completed in this continuation:

- Full real-API Playwright full-stack suite for all auth/cookie/CSRF/device cases is not yet implemented.
- Real PostgreSQL concurrency tests for all requested race cases are not fully implemented.
- Gate duplicate prevention DB constraint is not added.
- Session generation DB idempotency constraint is not added.
- Prayer outside-window rejection is not implemented.
- Full timezone audit across every production path is not complete.
- Full audit-chain `auditedTransaction` refactor is not complete.
- Historical SessionRoster snapshot model is not implemented.
- React Router route-registry refactor is not complete.
- Worker remains HTTP polling; BullMQ/Redis queue refactor is not complete.
- Live monitor still needs Redis pub/sub/streams replacement.
- Full CI split into all requested independent jobs is not complete.
- Accessibility axe suite and visual regression matrix are not complete.
- API moderate `exceljs -> uuid` remains; high audit gate passes, but replacement/upgrade should be planned.

## Deployment procedure

1. Take database backup.
2. Deploy branch to staging.
3. Run `npx prisma migrate deploy --schema prisma/schema.prisma` through the new migrate service.
4. Start API/worker only after migration completion.
5. Verify:
   - `/health/live` returns 200;
   - `/health/ready` returns 200 and critical tables exist;
   - login sets cookies;
   - `/auth/me` works;
   - forced password change blocks protected endpoints and clears cookies after change;
   - teacher session open/record/close works;
   - auto-missed does not overwrite open sessions;
   - device scan smoke path still works.

## Rollback procedure

1. Stop new services.
2. Restore previous images.
3. Do not reintroduce plaintext reader API keys.
4. If database changes were applied by earlier migrations and rollback requires schema reversal, restore from backup rather than destructive manual edits.
5. Rotate session/reader secrets if any auth/device behavior is suspected compromised.
6. Re-run smoke tests before reopening traffic.
