# Production Completion Baseline

Generated: 2026-06-14

## Repository Baseline

| Item | Value |
| --- | --- |
| Repository | `kuker24/abensi` |
| Branch | `fix/full-production-readiness` |
| PR | #2 — `fix: full production readiness hardening checkpoint` |
| Base branch | `main` |
| Known base commit | `6a11e0c2c17709a619e879381687943621ec7215` |
| Starting commit | `6d0b9618ee7f3c5c5b5540ddb89861c77a9ab7eb` |
| Minimum required head | `6d0b9618ee7f3c5c5b5540ddb89861c77a9ab7eb` |
| Minimum head verification | PASS — `git merge-base --is-ancestor 6d0b9618ee7f3c5c5b5540ddb89861c77a9ab7eb HEAD` |
| `git fetch --all --prune` | FAIL — stale/inaccessible remote `schoolhub-new` returned `Repository not found`; `git fetch origin --prune` PASS |
| Working tree before baseline doc | Clean |

## Toolchain Inventory

| Component | Actual result |
| --- | --- |
| Node.js | `v26.2.0` |
| npm | `11.16.0` |
| Local PostgreSQL CLI/server | NOT INSTALLED — `psql: command not found`, `postgres: command not found` |
| Production PostgreSQL image | `postgres:16-alpine` from `docker-compose.production.yml` |
| Local Redis CLI/server | NOT INSTALLED — `redis-server: command not found` |
| Production Redis image | `redis:7-alpine` from `docker-compose.production.yml` |
| Java | `openjdk version "17.0.19" 2026-04-21` |
| System Gradle | NOT INSTALLED — `gradle: command not found` |
| Gradle wrapper | `gradle-8.7-bin.zip` (`apps/android-reader/gradle/wrapper/gradle-wrapper.properties`) |
| Android SDK | Local `ANDROID_HOME`/`ANDROID_SDK_ROOT` unset |
| Android compile SDK | `compileSdk = 35`, `targetSdk = 35`, `minSdk = 24` |
| Docker | NOT INSTALLED — `docker: command not found` |
| Docker Compose | NOT INSTALLED — `docker: command not found` |
| Latest migration directory | `0021_gate_log_business_date` |

## Baseline Validation Commands

### Dependency install

| Command | Status | Evidence |
| --- | --- | --- |
| `npm ci` | PASS | `added 30 packages ... found 0 vulnerabilities` |
| `npm ci --prefix apps/api` | PASS | `added 667 packages ... 2 moderate severity vulnerabilities` |
| `npm ci --prefix apps/web` | PASS | `added 305 packages ... found 0 vulnerabilities` |
| `npm ci --prefix apps/worker` | PASS | `added 27 packages ... found 0 vulnerabilities` |

### Prisma and database

| Command | Status | Evidence |
| --- | --- | --- |
| `npx prisma format --schema prisma/schema.prisma` | PASS | `Formatted prisma/schema.prisma in 75ms` |
| `git diff --exit-code prisma/schema.prisma` | PASS | no diff |
| `npx prisma validate --schema prisma/schema.prisma` | PASS | `The schema at prisma/schema.prisma is valid` |
| `npx prisma generate --schema prisma/schema.prisma` | PASS | `Generated Prisma Client (v5.22.0)` |
| `npx prisma migrate deploy --schema prisma/schema.prisma` | BLOCKED | `P1001: Can't reach database server at postgres:5432` |

### Static checks and tests

| Command | Status | Evidence |
| --- | --- | --- |
| `npm run typecheck:all` | PASS | API and web `tsc --noEmit` completed |
| `npm run lint:all` | PASS | API ESLint and web ESLint completed |
| `npm run lint --prefix apps/worker` | PASS | `node --check src/index.js` completed |
| `npm run test:api` | PASS | 18 test suites, 134 tests passed |
| `npm run test:web` | PASS | 3 test files, 10 tests passed |
| `npm run test:e2e` | BLOCKED | 15/15 Playwright tests failed before execution because Chromium binary is not installed at `/home/fahmi/.cache/ms-playwright/chromium_headless_shell-1217/...`; message: `Please run npx playwright install` |
| `npm run build:all` | PASS | API build completed; Vite web production build completed |

### Dependency audit

| Command | Status | Evidence |
| --- | --- | --- |
| `npm audit --audit-level=high` | PASS | `found 0 vulnerabilities` |
| `npm audit --audit-level=high --prefix apps/api` | PASS_WITH_MODERATE_RISK | command exit 0; npm reports 2 moderate vulnerabilities: `exceljs -> uuid <11.1.1` |
| `npm audit --audit-level=high --prefix apps/web` | PASS | `found 0 vulnerabilities` |
| `npm audit --audit-level=high --prefix apps/worker` | PASS | `found 0 vulnerabilities` |

### Docker and HTTP smoke

| Command | Status | Evidence |
| --- | --- | --- |
| `docker compose -f docker-compose.production.yml config` | BLOCKED | `docker: command not found`, exit 127 |
| `docker compose -f docker-compose.production.yml build` | BLOCKED | `docker: command not found`, exit 127 |
| `docker compose -f docker-compose.production.yml up -d` | BLOCKED | `docker: command not found`, exit 127 |
| `docker compose -f docker-compose.production.yml ps` | BLOCKED | `docker: command not found`, exit 127 |
| `curl --fail http://localhost/health/live` | BLOCKED | no local stack; `Failed to connect to localhost port 80`, exit 7 |
| `curl --fail http://localhost/health/ready` | BLOCKED | no local stack; `Failed to connect to localhost port 80`, exit 7 |

## Test Inventory at Baseline

| Suite | Count / status |
| --- | --- |
| API unit tests | 18 suites / 134 tests PASS locally |
| Web unit tests | 3 files / 10 tests PASS locally |
| Existing mocked Playwright E2E | 15 tests configured; local run BLOCKED by missing browser binary |
| Integration tests | Not yet present as required root script |
| PostgreSQL concurrency tests | Not yet present as required root script |
| Full-stack real-auth E2E | Not yet present as required root script |
| Accessibility tests | Not yet present as required root script |
| Visual regression tests | Not yet present as required root script |
| Android local tests | Not run in baseline; Android SDK unavailable locally |

## Current CI Run

Latest successful CI on this head:

- Run: `27485650153`
- Head: `6d0b9618ee7f3c5c5b5540ddb89861c77a9ab7eb`
- Status: PASS
- URL: <https://github.com/kuker24/abensi/actions/runs/27485650153>

Previous same-head CI also passed:

- Run: `27485649502`
- Jobs observed: `validate`, `docker`, `codeql` PASS
- URL: <https://github.com/kuker24/abensi/actions/runs/27485649502>

## Known Production-Readiness Gaps to Close

1. Audit hash-chain not proven atomically bound to every sensitive mutation.
2. Session generation idempotency not enforced by database uniqueness.
3. No PostgreSQL-level teacher/class/room overlap constraints.
4. No immutable historical session roster snapshot.
5. Default ALPA still conflates defaulted and teacher-reviewed rows.
6. Password-change UX can retain stale local authenticated state.
7. Calendar date validation needs stricter real-date rejection.
8. No real full-stack E2E with true auth/cookies/CSRF/PostgreSQL/Redis.
9. No complete real PostgreSQL concurrency test suite.
10. SSO can be made truthy by configuration without a complete callback flow.
11. Worker remains process-local polling and is not multi-replica safe.
12. Live monitor still relies on database polling rather than event streaming.
13. Android reader is not yet built/tested in CI in this branch.
14. Frontend routing remains monolithic/manual.
15. Accessibility and visual regression gates are incomplete.
16. HTTPS production entrypoint is not locally/CI-smoke proven.
17. Supply-chain CI matrix is incomplete; actions pinning, secret scan, container scan, SBOM remain.
18. PR/readiness documentation is not synchronized with the latest implementation.
19. `backups/` or stale backup source tree presence must be verified and cleaned if tracked.
20. Moderate `exceljs -> uuid` advisory remains unresolved or must receive formal risk acceptance.

## Current Accepted Risks

| Risk | Current status | Notes |
| --- | --- | --- |
| `exceljs -> uuid <11.1.1` moderate advisory | Existing informal acceptance in older docs; not yet formalized for final production readiness | `npm audit --audit-level=high --prefix apps/api` exits 0, but `npm ci --prefix apps/api` reports 2 moderate vulnerabilities. Final work must either fix, isolate, patch, or create formal accepted-risk record with owner and expiry. |
| Local validation environment lacks Docker/PostgreSQL/Redis/Android SDK/Playwright browser | Environment limitation, not production acceptance | CI provides Docker/PostgreSQL/Playwright evidence for current head; final acceptance still requires explicit evidence for all new gates. |

## Current Production Topology from `docker-compose.production.yml`

- `postgres`: `postgres:16-alpine`, persistent `postgres_data`, healthcheck via `pg_isready`.
- `redis`: `redis:7-alpine`, AOF enabled, persistent `redis_data`, healthcheck via `redis-cli ping`.
- `migrate`: one-shot Prisma migrate service using `apps/api/Dockerfile`, read-only filesystem, dropped capabilities, waits for PostgreSQL healthy.
- `api`: NestJS service on internal port 3000, read-only filesystem, dropped capabilities, depends on migrate and Redis, healthcheck `/api/v1/health/live`.
- `worker`: Node worker container using internal API endpoints, read-only filesystem, dropped capabilities, local health file in tmpfs.
- `web`: Vite/Nginx static frontend, read-only filesystem, dropped capabilities, internal port 8080.
- `reverse-proxy`: unprivileged Nginx, read-only filesystem, dropped capabilities, publishes host port 80 to container 8080, uses `ops/nginx/reverse-proxy.conf`.
- TLS is not currently exposed by this compose file; HTTPS production entrypoint remains a required gap.

## Baseline Conclusion

Baseline is not production-ready. Current branch is CI-green and has substantial hardening, but final readiness requires implementation and evidence for the remaining phases listed above.
