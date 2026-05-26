# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SchoolHub e-Hadir** — a digital attendance management system for MAN 1 Rokan Hulu (Indonesian Islamic boarding school). It tracks attendance via dual layers: smart card gate scanning + teacher classroom input, with automated reconciliation.

## Monorepo Structure

```
apps/api/        # NestJS 11 backend (TypeScript)
apps/web/        # React 18 + Vite 6 frontend (TypeScript)
apps/worker/     # Node.js reconciliation worker (plain JS)
prisma/          # Prisma schema + migrations (shared)
ops/nginx/       # Nginx reverse proxy configs
scripts/         # Deployment, testing, and ops automation
docs/            # Architecture, runbooks, security audits
```

## Essential Commands

### Setup
```bash
npm install
npm install --prefix apps/api
npm install --prefix apps/web
npm install --prefix apps/worker
npx prisma generate --schema prisma/schema.prisma
npm run prisma:migrate
npm run prisma:seed
```

### Development
```bash
# API (NestJS hot-reload on port 3000)
npm run start:dev --prefix apps/api

# Web (Vite dev server on port 5173)
npm run dev --prefix apps/web
```

### Build
```bash
npm run build:all          # Build all workspaces
npm run build --prefix apps/api
npm run build --prefix apps/web
```

### Testing
```bash
npm run test:api            # Jest unit tests (API)
npm run test:web            # Vitest unit tests (web)
npm run test:e2e --prefix apps/web   # Playwright E2E
npm run lint:all            # ESLint across all workspaces
npm run typecheck:all       # TypeScript checks

# Integration/smoke tests (requires running stack)
BASE_URL='http://localhost' bash scripts/uat_smoke.sh
npm run test:perf-smoke
npm run test:backend-contract
```

### Production (Docker Compose)
```bash
docker compose -f docker-compose.production.yml --env-file .env up -d --build
docker compose -f docker-compose.production.yml logs -f api
```

### Database
```bash
npm run prisma:migrate      # Run migrations
npm run prisma:seed         # Seed initial data
bash scripts/backup_database.sh
bash scripts/restore_database.sh
```

## Architecture

### Two-Layer Attendance Model
1. **Gate Layer**: Smart card tap → `GateLog` (IN/OUT direction per student)
2. **Class Layer**: Teacher input per session → `StudentAttendance` + `TeacherSessionPresence`
3. **Reconciliation**: Worker polls API to compare both layers; flags anomalies as `ReconciliationFlag` (30+ flag types, e.g., `BOLOS_KELAS`, `LUPA_TAP_GERBANG`)

### Backend (NestJS Modules)
Feature modules live in `apps/api/src/modules/`. Key modules:
- `auth/` — JWT login, passport guards, token refresh
- `identity/` — User/admin CRUD with role-based access
- `academic/` — SchoolClass, Subject, AcademicYear, Semester, Room, WeeklySchedule
- `scheduling/` — Teaching sessions (SCHEDULED → OPEN → CLOSED/MISSED)
- `attendance-gate/` — Card scan ingestion (`device-reader/` for reader management)
- `attendance-class/` — Teacher classroom attendance input
- `reconciliation/` — Anomaly detection and escalation
- `reporting/` — Excel exports (`exceljs`) and dashboard data
- `audit/` — Immutable action log for all sensitive operations
- `redis/` — Cache wrapper (Redis 7)
- `security/` — Brute-force lockout logic

### Frontend (React)
The web app is largely contained in `apps/web/src/app/SchoolHubApp.tsx` — a large single-component shell. Supporting files: `ui.tsx` (shared UI primitives), `tutorial.tsx` (in-app guide overlay), `confirm.tsx` (confirmation dialogs). Styling is Tailwind CSS with custom extensions in `styles.css` (73KB).

### Worker
`apps/worker/src/index.js` runs on a configurable interval (`WORKER_INTERVAL_MS`). It calls API endpoints to auto-mark missed sessions and trigger reconciliation sweeps. Authenticated via `WORKER_TOKEN`.

### Database Schema (Prisma)
Schema lives at `prisma/schema.prisma` (~800 lines). Key enums:
- `Role`: `ADMIN_TU`, `GURU_MAPEL`, `GURU_PIKET`, `SISWA`, `OPERATOR_IT`, `DEVELOPER`
- `SessionStatus`: `SCHEDULED`, `OPEN`, `CLOSED`, `MISSED`
- `ReaderType`: `GATE`, `MUSHOLA`, `CLASS`, `MANUAL`

## Environment Variables

Copy `.env.production.example` → `.env`. Critical variables:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection
- `JWT_SECRET` — Long random string for token signing
- `WORKER_TOKEN` — Shared secret for worker→API calls
- `READER_SECRET_ENCRYPTION_KEY` — Smart card reader auth
- `CORS_ORIGIN` / `PUBLIC_APP_ORIGIN` — Frontend URLs

## Key Conventions

- **NestJS patterns**: Each module has `*.module.ts`, `*.controller.ts`, `*.service.ts`. Guards/interceptors live in `apps/api/src/common/`.
- **Prisma**: Client is injected via `PrismaService` (`apps/api/src/prisma/`). Always run `npx prisma generate` after schema changes.
- **Security**: All card-reader endpoints require request signature verification. All admin mutations produce `AuditEntry` records.
- **Nginx rate limits**: login `10r/m`, general API `20r/s`, scanning endpoints `5r/s` — account for this in load tests.
