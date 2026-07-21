# SIAB2 / SchoolHub e-Hadir

## Core Rules
- Work carefully. Keep changes small and reviewable.
- Do not delete files unless explicitly requested.
- Do not read, print, commit, or store secrets, tokens, API keys, `.env` contents, private keys, build artifacts, local reports, or private data.
- Prefer existing project patterns. Keep changes aligned with monorepo structure.
- Do not commit, push, force-push, tag, release, or deploy without explicit instruction.
- Do not alter unrelated user changes.

## Project Purpose
SIAB2 / SchoolHub e-Hadir serves MAN 1 Rokan Hulu attendance: authenticated web operations, NestJS API, queued reconciliation, Android QR readers, shared authorization constants, PostgreSQL data, and deployment tooling.

## Project State
**IN_PROGRESS.** Runtime areas, entry points, migrations, automated checks, and deployment/UAT scripts exist. `DataSekolah/generator-tanda-pengenal/` is a production source boundary: its built static bundle is integrated into web runtime at `apps/web/public/id-card-generator/`.

## Production Runtime Reference
- Production deployment at `/opt/schoolhub/current` is runtime reference for deployed source, not Git history and not a Git repository.
- Reconcile production source changes into local Git through review and scope-matched tests before any commit or later deployment; never treat runtime files as replacement Git history.
- Any VPS-to-local synchronization must exclude `.env`, databases, uploads, logs, backups, generated artifacts, build output, caches, and runtime state. Preserve local-only files unless an explicit reviewed decision covers them.

## Technology
- API: NestJS 11, TypeScript, Prisma 5, PostgreSQL, Redis, Helmet, JWT and class-validator.
- Web: React 18.3, TypeScript, Vite 8, Tailwind 3, Vitest and Playwright.
- Worker: Node.js, BullMQ, Redis, Axios, Node test runner.
- Android reader: Kotlin, Jetpack Compose, CameraX, ML Kit, OkHttp/Retrofit, Room, Android Keystore.
- Shared package: dual ESM/CommonJS JavaScript API with TypeScript declarations.
- Data layer: Prisma schema, migrations, fixtures, and TypeScript seed.
- Operations: Docker Compose plus Caddy, Nginx, systemd, `ops/`, and `scripts/` assets.
- Video composition: HyperFrames 0.7.54, HTML/CSS, paused deterministic GSAP timeline, local WOFF2 fonts, and screenshot-based visual QA.

## Entry Points
- API bootstrap and module assembly: `apps/api/src/main.ts`, `apps/api/src/app.module.ts`.
- Web bootstrap and root application: `apps/web/src/main.tsx`, `apps/web/src/App.tsx`.
- Worker bootstrap: `apps/worker/src/index.js`.
- Android Compose shell: `apps/android-reader/app/src/main/java/id/sch/man1rokanhulu/absensi/MainActivity.kt`.
- Database contract and seed: `prisma/schema.prisma`, `prisma/seed.ts`.

## Repository Structure
- `apps/api/`: HTTP API, authentication, attendance domain, Prisma and Redis integration.
- `apps/web/`: browser application and browser test suites.
- `apps/worker/`: BullMQ reconciliation and auto-missed scheduling worker.
- `apps/android-reader/`: operator QR scanner Android application.
- `packages/shared/`: roles, capabilities, and API error-code package used by API and web.
- `prisma/`: PostgreSQL schema, migrations, fixtures, and seed.
- `ops/`, `scripts/`: deployment, health, backup, security, UAT, and operational automation.
- `DataSekolah/generator-tanda-pengenal/`: React/Vite source for deployed identity-card generator; build output is copied into `apps/web/public/id-card-generator/` and served through SIAB2 web runtime.
- `Data Akun/generator-tanda-pengenal/`: separately maintained React/Vite account-card generator source. Current root evidence does not identify its build as deployed static bundle; do not assume it is independently served or is production bundle source without deployment evidence.
- `videos/siab2-tutorial/`: isolated HyperFrames product-tutorial source and QA assets. It explains SIAB2 behavior but is not application runtime source; do not change `apps/web`, `apps/api`, or `prisma` while editing this composition unless separately requested.
- `docs/`, `design/`, `tools/`, `backend/`, `web/`: supporting material or legacy/non-runtime areas. Inspect before treating as source of truth.

## Global Contracts
- API global prefix: `/api/v1`. Health paths: `/api/v1/health/live`, `/api/v1/health/ready`; metrics also expose `/metrics` and `/api/v1/metrics`.
- API applies Helmet, CSRF protection, CORS, request IDs, and `ValidationPipe` with `whitelist`, `transform`, and `forbidNonWhitelisted`.
- Production QR reader scans use `POST /api/v1/attendance/qr-reader-scan`. Device activation, timestamp, nonce, body hash, and HMAC signed headers protect reader requests.
- Android reader provisioning is capped at four server-pinned targets: `READER_DEV_TEST_01` permits `CHECK_ONLY`; `READER_IDENTITY_01` permits test-only `GATE_IN`/`GATE_OUT`/`MUSHOLA` validation without attendance writes; two live readers use `GATE_IN`/`GATE_OUT`/`MUSHOLA`. Administrators issue a short-lived, one-time activation code through `POST /api/v1/device-readers/:id/android/provision-code`; reader secret and stable target modes remain server-controlled. Gate readers expose separate `GATE_IN` ("Scan Datang") and `GATE_OUT` ("Scan Pulang") menus so operators pick direction explicitly instead of the legacy first/second-scan auto-detect; `GATE_OUT` requires a same-day `GATE_IN` and the `MIN_GATE_STAY_MINUTES` guard first.
- `POST /api/v1/attendance/qr-scan` remains authenticated legacy/manual flow; do not route Android reader traffic there.
- Login-lockout status and recovery use `/api/v1/auth/admin/login-lockout`; only `ADMIN_TU` and `DEVELOPER` may clear a lockout, with an audit reason. Recovery resets limiter state only; it never bypasses or changes password verification.
- Shared roles, capabilities, and API error codes originate in `packages/shared`; update runtime consumers and type declarations together when its public contract changes.
- Prisma changes require migration review and generated client refresh. Never place credentials in schema, seeds, docs, or commits.
- Student `nkd` is a dedicated four-digit SISWA-only identifier. It is unique, immutable after issuance, and non-reusable through `StudentNkdRegistry`; do not substitute username, NIS/NISN, QR short code, or smart-card UID.
- Academic student import requires an exact active academic-year code with exactly one active finite semester. Source password columns are ignored; passwords are generated server-side, force first-login change, and enrollments end at semester bounds. Credential plaintext is one-time export only and must not persist in browser state.
- Production identity-card bundle source is `DataSekolah/generator-tanda-pengenal/`. Its `npm run build` output must be synchronized to `apps/web/public/id-card-generator/` before web deployment; root scripts declare no separate generator sync command.
- Student cards display NISN and NKD as separate values and preserve the opaque active QR payload. Private batch output belongs only in ignored `Data Akun/simpanakun/<class>/` with directory mode `700`, PNG mode `600`, opaque filenames, and count/pixel/QR verification before replacing prior output.
- Nginx protects `/id-card-generator/` and `/admin/master-data/id-card-generator/` with `auth_request /api/v1/internal/access/id-card-generator`. That internal API endpoint uses `JwtAuthGuard` and allows only `ADMIN_TU`, `DEVELOPER`, and `OPERATOR_IT`; retain source-bundle, proxy, and access-control coupling together.

## Common Commands
Run from repository root unless command says otherwise.

- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:seed`
- `npm run typecheck:all`
- `npm run test:api`
- `npm run test:web`
- `npm run test --prefix apps/worker`
- `npm run test:unit`
- `npm run build:all`
- `npm run lint:all`
- `npm run test:e2e`
- `npm run test:backend-contract`
- `npm run test:integration`
- `npm run test:concurrency`
- `npm run test:outbox-sse`
- `npm run test:e2e:full-stack`
- `npm run test:a11y`
- `npm run test:visual`
- `npm run security:audit`
- `npm run security:secrets`
- `npm run security:android`
- `npm run uat:smoke`
- `npm run validate:final`
- `npm run dev --prefix videos/siab2-tutorial`
- `npm run check --prefix videos/siab2-tutorial`

## Verification
- API change: run closest Jest test, then `npm run typecheck --prefix apps/api` and/or `npm run lint --prefix apps/api`.
- Web change: run closest Vitest/Playwright test, then `npm run typecheck --prefix apps/web` and/or `npm run lint --prefix apps/web`.
- DataSekolah generator source change: run `npm run test --prefix 'DataSekolah/generator-tanda-pengenal'`, `npm run lint --prefix 'DataSekolah/generator-tanda-pengenal'`, and `npm run build --prefix 'DataSekolah/generator-tanda-pengenal'`; synchronize resulting bundle to `apps/web/public/id-card-generator/`, then run web checks matching static-bundle/deployment scope. Verify protected URLs with authorized and unauthorized roles when proxy or access behavior changes.
- Worker change: run `npm run test --prefix apps/worker`; run `npm run lint --prefix apps/worker` when syntax or tests change.
- Android change: follow `apps/android-reader/README.md`; JDK 17/21 and Android SDK required. Use `./test-jdk17.sh` or `./gradlew testDebugUnitTest` when environment permits.
- Prisma change: review migration, run `npm run prisma:generate`, then targeted API checks. Apply migration only with environment approval.
- Cross-service behavior: choose existing root contract, integration, full-stack, UAT, or security command matching scope. Do not run deploy commands without explicit approval.
- HyperFrames video change: run `hyperframes lint --verbose` and `hyperframes check --strict` from `videos/siab2-tutorial/`; inspect fresh snapshots/contact sheets for every interaction beat. Preview is allowed; render, publish, or upload only with explicit user approval.

## Known Constraints
- Production services require environment configuration and external PostgreSQL/Redis; do not inspect `.env` files.
- Android release signing requires local keystore material; never read or commit it. Release networking requires HTTPS; debug alone may allow HTTP.
- Operational, UAT, production-readiness, backup, restore, and deployment scripts may require real infrastructure or credentials. Treat them as manual-only unless authorized.
- Use pre-commit for lightweight commit-time checks; run Gitleaks before a requested commit/push. Use Semgrep CE, OSV-Scanner, Knip, and Playwright only when scope needs them. Use StrykerJS only on explicit request.
- Store ADRs under `docs/adr/` for major technical decisions. Use OMNI for long output, Context7 for current external guidance, Serena for symbol navigation/refactors, and Repomix for external review context when available.

## Child DOX Index
- `apps/api/AGENTS.md` — API ownership, HTTP and QR-reader contracts.
- `apps/web/AGENTS.md` — web application ownership and browser checks.
- `apps/worker/AGENTS.md` — BullMQ worker contracts and checks.
- `apps/android-reader/AGENTS.md` — Android scanner contracts and security constraints.
- `packages/shared/AGENTS.md` — shared public authorization contract.
- `prisma/AGENTS.md` — data schema, migration, and seed guidance.
- `Data Akun/generator-tanda-pengenal/AGENTS.md` — separate account-card generator source guidance; deployed-bundle source is not confirmed here.
- `DataSekolah/generator-tanda-pengenal/AGENTS.md` — deployed school-card generator source, static-bundle synchronization, and access coupling.
- `videos/siab2-tutorial/AGENTS.md` — isolated HyperFrames composition, deterministic timeline, local asset, screenshot, QA, and render-approval contracts.
