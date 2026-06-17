# Remaining Failures Before Fix

Date: 2026-06-13
Branch: `fix/full-production-readiness`
Starting HEAD: `04753f55f7360e05df215de7bb80cfe30b624fb6`
PR: https://github.com/kuker24/abensi/pull/2
Inspected CI run: https://github.com/kuker24/abensi/actions/runs/27465170676

## Environment notes

- Local node at inspection: see command output in terminal log (`node -v`).
- Requested Node 20.20.2 clean reproduction is not available in this local harness at the time of inspection.
- Docker CLI availability must be verified by command output; local Docker was previously unavailable in this harness.

## CI state before changes

From `gh pr view 2 --json statusCheckRollup` at starting HEAD:

- `validate`: FAILURE
- `docker`: FAILURE
- `codeql`: SUCCESS

## Downloaded CI evidence

- Full CI log saved locally: `/tmp/pr2-ci-27465170676/full.log`
- Artifact download attempted with `gh run download 27465170676`; GitHub returned `no valid artifacts found to download`.

## Validate job failure

Command failing in CI:

```bash
npm run test:e2e
```

CI Playwright summary:

- 15 tests using 1 worker.
- Failing tests include:
  - `form login memberi jarak lega antara kata sandi dan tombol masuk`: expected gap >= 16, received about 13.6-14.1 px.
  - `topbar search opens menu without shortcut badge`: timeout waiting for `getByLabel('Cari menu')`.
  - `tutorial awal muncul sekali, bisa diselesaikan, dan bisa dibuka ulang manual`: tutorial dialog not visible.
  - `admin dan developer melihat kontrol akun sesuai hak akses, serta developer bisa clean data`: `Hapus Permanen` button not visible.
  - `developer bisa mengaktifkan tutorial ulang untuk akun target`: `Pusat Kontrol Developer` heading not visible.

Local previous E2E result before this continuation was also red:

```text
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
8 passed, 7 failed
```

Known root causes to verify/fix:

1. E2E helpers register auth-specific routes and broad `**/api/v1/**` route handlers in overlapping ways.
2. Tests seed `schoolhub_user` in localStorage for UI-only flows; auth-critical tests need real API full-stack coverage separately.
3. Some UI tests are running against an unauthenticated login view instead of protected pages, causing missing search/topbar/developer controls.
4. Login vertical spacing is below the UI contract.
5. Tutorial mock order/shape does not deterministically produce the expected onboarding dialog.

## Docker job failure

Command sequence in CI:

```bash
docker compose -f docker-compose.production.yml config
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml up -d
# health/smoke loop
```

Docker logs from CI show API exceptions:

```text
PrismaClientKnownRequestError: The table `public.GeofencePolicy` does not exist in the current database.
PrismaClientKnownRequestError: The table `public.Session` does not exist in the current database.
```

Root cause:

- Compose starts API/worker against a fresh PostgreSQL database without applying Prisma migrations first.
- API health/live can succeed while application schema is absent, then readiness/smoke endpoints hit missing tables.

Required fix:

- Add a one-shot `migrate` service to production compose.
- API and worker must depend on successful migration completion.
- Pass both `DATABASE_URL` and `DIRECT_URL` to migrate/API/worker where required.
- Readiness must verify required schema/tables, not `SELECT 1` only.

## Unresolved acceptance risks from previous report

These remain beyond the immediate red CI fixes unless implemented in follow-up commits:

- Full-stack Playwright suite for real login/cookies/CSRF/session state is incomplete.
- Docker logs/artifacts were not uploaded in old CI run.
- SSO endpoint can be configured but callback is disabled; must be fully disabled unless implemented.
- `mustChangePassword` needs server-side guard enforcement.
- `runAutoMissedSessions` needs atomic conditional update.
- Gate duplicate prevention needs DB-backed unique constraint.
- Session generation needs DB-backed idempotency.
- Prayer scans outside configured windows need explicit rejection.
- Audit write transaction atomicity needs full refactor.
