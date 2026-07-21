# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Guidance

Read root `AGENTS.md` before changing code, then read the nearest child `AGENTS.md` for the area being changed. Child guidance exists under `apps/api/`, `apps/web/`, `apps/worker/`, `apps/android-reader/`, `packages/shared/`, `prisma/`, both card-generator directories, and `videos/siab2-tutorial/`. Architecture decisions belong in `docs/adr/`. No Cursor or Copilot rule files are present.

The working tree may contain unrelated local or production-reconciliation work. Preserve it. Production files under `/opt/schoolhub/current` are deployed-runtime reference, not Git history. Never replace repository state wholesale from that directory.

## System Overview

SchoolHub e-Hadir is MAN 1 Rokan Hulu's attendance system. Its production flow combines authenticated administration, teacher classroom attendance, smart-card or QR gate and prayer scans, scheduled reconciliation, reporting, audit logging, and Android reader provisioning.

### Runtime and Source Boundaries

- `apps/api/`: NestJS 11 API. Bootstrap is `src/main.ts`; module assembly is `src/app.module.ts`.
- `apps/web/`: React 18.3, Vite 8, and Tailwind 3 browser app. Flow is `src/main.tsx` to `src/App.tsx` to the main shell in `src/app/SchoolHubApp.tsx`.
- `apps/worker/`: Node.js and BullMQ worker. `src/index.js` schedules Redis-backed repeatable `auto-missed` and `reconciliation` jobs and calls signed internal API endpoints.
- `apps/android-reader/`: Kotlin, Jetpack Compose, CameraX, ML Kit, Retrofit/OkHttp, Room, and Android Keystore reader app. Entry shell is `MainActivity.kt`.
- `packages/shared/`: public roles, capabilities, and API error-code contract, exported as ESM, CommonJS, and TypeScript declarations. Keep all formats and consumers synchronized.
- `prisma/`: PostgreSQL schema, migrations, fixtures, and TypeScript seed. PostgreSQL is system of record; Redis backs cache and BullMQ.
- `DataSekolah/generator-tanda-pengenal/`: production identity-card generator source. Its Vite build is copied into `apps/web/public/id-card-generator/`; it is not a standalone deployed service.
- `Data Akun/generator-tanda-pengenal/`: separately maintained account-card generator. Current repository evidence does not establish it as production bundle source.
- `ops/` and `scripts/`: Docker, Caddy/Nginx, systemd, deployment, backup, security, migration, UAT, and validation automation.
- `tools/apk-builder/`: APK-builder tooling related to Android distribution.
- `videos/siab2-tutorial/`: isolated HyperFrames tutorial composition, not application runtime.
- `docs/`, `design/`, `backend/`, `web/`, `Laporan/`, and similar top-level areas may contain documentation, data, supporting tools, or legacy material. Inspect ownership before treating them as runtime source.

Root npm workspaces include only `packages/*`. API, web, worker, Android, and both generators are separate build roots.

## Architecture and Data Flow

### Attendance Domain

1. Gate smart-card or QR scans create `GateLog` records with business date, direction, reader/device identity, event deduplication fields, and signed-request metadata.
2. Prayer-mode scans create `PrayerAttendanceLog` records.
3. Teachers record class attendance as `StudentAttendance` and `TeacherSessionPresence`. Students do not self-submit classroom attendance.
4. `Session` and `SessionRoster` preserve effective roster snapshots while scheduling moves sessions through `SCHEDULED`, `OPEN`, `CLOSED`, or `MISSED`.
5. BullMQ worker jobs call internal API operations that mark missed sessions and reconcile gate and class evidence into `ReconciliationFlag` records.
6. Sensitive mutations create append-only, hash-chained `AuditEntry` records. Transactional `OutboxEvent` records support event delivery. Do not assume the proposed general SSE architecture in `docs/ADR_SSE_EVENT_STREAM.md` is fully implemented.

### QR Credential and Card Flow

The API is authority for official QR credentials. It creates opaque `schoolhub:qr:v1:` payloads, stores a hash plus encrypted ciphertext, revokes replaced credentials, and audits generation or rotation. The production generator fetches canonical official card DTOs from API export endpoints and must refuse production output containing fallback QR data. Browser-generated identities or claims are untrusted.

`DataSekolah/generator-tanda-pengenal/` builds the protected static generator bundle. Nginx protects `/id-card-generator/` and `/admin/master-data/id-card-generator/` through `auth_request /api/v1/internal/access/id-card-generator`; API access is limited to `ADMIN_TU`, `DEVELOPER`, and `OPERATOR_IT`. Coordinate generator source, copied bundle, web deployment, Nginx, and API access checks when this boundary changes.

### Android Reader Trust Boundary

Production Android scans use `POST /api/v1/attendance/qr-reader-scan`. `POST /api/v1/attendance/qr-scan` is legacy authenticated manual flow and must not receive Android reader traffic.

Provisioning uses one short-lived, one-time activation code for one of four server-pinned targets. `READER_DEV_TEST_01` is `CHECK_ONLY`; `READER_IDENTITY_01`, `READER_GATE_PRAYER_01`, and `READER_GATE_PRAYER_02` allow `GATE_IN`, `GATE_OUT`, and `MUSHOLA`. Reader identity and allowed modes remain server-controlled.

Each request includes device ID, timestamp, nonce, body hash, and HMAC-SHA256 signature. API verifies reader activation, replay window, body integrity, app policy, credential state, user state, and scan mode. Android keeps the reader secret in Keystore-backed encrypted preferences and encrypts its offline queue with AES/GCM. Network and retryable server failures remain queued; terminal business rejections are sanitized and removed. `CHECK_ONLY` never mutates attendance.

### API and Edge Contracts

- Global API prefix: `/api/v1`.
- Health: `/api/v1/health/live` and `/api/v1/health/ready`.
- Metrics: `/metrics` and `/api/v1/metrics`.
- API bootstrap applies Helmet, CSRF protection, CORS, request IDs, and strict validation with whitelist, transform, and rejection of unknown fields.
- Nginx is the HTTP edge, protected static-route gate, security-header layer, and rate limiter. Current limits include login `10r/m`, general API `20r/s`, and scan paths `5r/s`.
- Worker authentication is separate from browser and reader authentication. Internal worker calls use `WORKER_TOKEN` and signed job headers.
- Student `nkd` is a unique, immutable, non-reusable four-digit SISWA identifier backed by `StudentNkdRegistry`. It is not username, NIS, NISN, QR short code, or card UID.

### Deployment Topology

`docker-compose.production.yml` runs PostgreSQL 16, Redis 7 with AOF, one-shot migrations, API, worker, web static Nginx, and reverse proxy. `docker-compose.vps.yml` supports host-managed TLS; `docker-compose.supabase.yml` uses managed PostgreSQL and a different frontend topology. Confirm the selected topology before operational work.

## Setup and Development Commands

Use lockfiles for reproducible setup:

```bash
npm ci
npm ci --prefix apps/api
npm ci --prefix apps/web
npm ci --prefix apps/worker
npm run prisma:generate
```

Both generator directories have separate lockfiles when work there requires dependencies:

```bash
npm ci --prefix 'DataSekolah/generator-tanda-pengenal'
npm ci --prefix 'Data Akun/generator-tanda-pengenal'
```

Database commands require an approved, correctly targeted `DATABASE_URL`:

```bash
npm run prisma:migrate
npm run prisma:seed
```

Development servers:

```bash
npm run start:dev --prefix apps/api
npm run dev --prefix apps/web
npm run start --prefix apps/worker
```

## Build, Lint, and Typecheck

```bash
npm run build:all
npm run lint:all
npm run typecheck:all
npm run build --prefix apps/api
npm run build --prefix apps/web
npm run lint --prefix apps/worker
```

Generator source changes require their local lint, test, and build commands. After a production generator build, synchronize its build output into `apps/web/public/id-card-generator/` and run matching web/proxy checks before deployment.

Android requires Android SDK plus JDK 17 or 21. From `apps/android-reader/`:

```bash
source ./env-jdk17.sh
./test-jdk17.sh
./build-debug-jdk17.sh
# Equivalent direct tasks:
./gradlew testDebugUnitTest
./gradlew assembleDebug
```

Release build needs local signing material and explicit release authorization.

## Tests

Common suites from repository root:

```bash
npm run test:unit
npm run test:api
npm run test:web
npm run test --prefix apps/worker
npm run test:e2e
npm run test:backend-contract
npm run test:integration
npm run test:concurrency
npm run test:outbox-sse
npm run test:e2e:full-stack
npm run test:a11y
npm run test:visual
```

Run one test file:

```bash
npm run test --prefix apps/api -- src/modules/example/example.spec.ts
npm run test --prefix apps/web -- src/path/example.test.ts
npm run test:e2e --prefix apps/web -- e2e/example.spec.ts
npm run test --prefix apps/worker -- test/example.test.js
```

Run one Android test class or method from `apps/android-reader/`:

```bash
./gradlew :app:testDebugUnitTest --tests 'id.sch.man1rokanhulu.absensi.ExampleTest'
```

Full-stack tests require PostgreSQL and Redis configuration. Accessibility, visual, and full-stack wrappers select dedicated Playwright configs and ports. CI `web-quality-gates` is source of truth for visual baselines; do not update snapshots from an arbitrary local renderer.

## Security and Release Validation

Select checks matching change scope:

```bash
npm run security:audit
npm run security:secrets
npm run security:android
npm run audit:preflight-chain
npm run audit:verify-chain
npm run preflight:production
npm run verify:post-migration
npm run validate:final
```

Operational, migration, backup/restore, UAT, deployment, and post-deploy commands may access real infrastructure. Verify exact environment and target before running them. Stryker mutation testing is manual-only per `docs/adr/0001-local-quality-gates.md`.

Production deployment reference:

```bash
docker compose -f docker-compose.production.yml --env-file .env up -d --build
docker compose -f docker-compose.production.yml logs -f api
```

Do not run deployment or release commands without explicit user instruction.
