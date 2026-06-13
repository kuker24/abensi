# Full Production Readiness Baseline

Date: 2026-06-13T16:59:37+07:00
Branch: `fix/full-production-readiness` from `origin/main` (`6a11e0c`)
Machine: Linux xmind 7.0.11-1-cachyos x86_64
Node: v26.2.0
npm: 11.16.0

## Command Results

| Command | Result | Notes |
|---|---|---|
| `npm ci` (root) | PASS | 0 vulnerabilities |
| `npm ci --prefix apps/api` | PASS | |
| `npm ci --prefix apps/web` | PASS | |
| `npm ci --prefix apps/worker` | PASS | |
| `npx prisma format` | PASS | |
| `npx prisma validate` | PASS | After adding `DIRECT_URL` to `.env` |
| `npx prisma generate` | PASS | |
| `npm run typecheck:all` | PASS | |
| `npm run lint:all` | PASS | API + Web |
| `npm run lint --prefix apps/worker` | PASS | |
| `npm run test:api` | PASS | 13 suites, 75 tests |
| `npm run test:web` | PASS | 2 files, 7 tests |
| `npm run build:all` | PASS | |
| `npm run test:e2e` | FAIL | Playwright browser download timeout; config version mismatch |
| `npm audit --audit-level=high` (root) | PASS | 0 vulnerabilities |
| `npm audit --audit-level=high --prefix apps/api` | FAIL | exceljs→uuid moderate (transitive) |
| `npm audit --audit-level=high --prefix apps/web` | FAIL | vite/esbuild high |
| `npm audit --audit-level=high --prefix apps/worker` | PASS | 0 vulnerabilities |

## Known Issues

- E2E blocked by Playwright browser download timeout in local environment
- `DIRECT_URL` was missing from `.env` — added during baseline
- API has `exceljs` → `uuid` moderate vulnerability (transitive from exceljs)
- Web has `vite`/`esbuild` high vulnerability (requires breaking upgrade to vite@8.x)
