# AGENTS.md

## Core Rules
- Work carefully and make small, reviewable changes.
- Do not delete files unless explicitly requested.
- Do not commit secrets, tokens, API keys, `.env`, build artifacts, local reports, or private data.
- Prefer existing project patterns before adding new architecture.
- Keep changes minimal and aligned with the current monorepo structure.
- Do not push unless explicitly instructed.
- Do not force push unless explicitly instructed.

## Project Snapshot
- Product: SIAB2 / SchoolHub e-Hadir attendance system for MAN 1 Rokan Hulu.
- Backend: NestJS API in `apps/api` with Prisma/PostgreSQL and Redis integration.
- Frontend: React + Vite + Tailwind app in `apps/web`.
- Worker: Node.js reconciliation worker in `apps/worker`.
- Shared schema/migrations: `prisma/`.
- Deployment/config: Docker Compose, Nginx/Caddy/systemd assets under `ops/`.

## Tooling
- Use OMNI for long/noisy terminal output.
- Use Context7 for current docs/API/framework guidance.
- Use Serena for symbol search, references, and precise refactors when available.
- Use existing Jest/Vitest/Node test scripts before adding new test tooling.
- Use TypeScript typecheck for API/web changes.
- Run `npm run prisma:generate` after Prisma schema changes or when Prisma client types are stale.
- Use pre-commit for lightweight commit-time checks.
- Use ADR markdown in `docs/adr/` for major technical decisions.
- Use Semgrep CE for local static security scan.
- Use OSV-Scanner for dependency vulnerability checks.
- Use Gitleaks before commit/push.
- Use Knip for JS/TS unused files/dependencies/exports.
- Use Playwright for browser/E2E tests when UI/runtime exists.
- Use Repomix to prepare codebase context for ChatGPT review.
- Use StrykerJS only when the user explicitly asks for mutation testing.

## Git Safety
- Do not push unless explicitly instructed.
- Do not force push unless explicitly instructed.
- Do not commit generated reports, local caches, build outputs, dependency folders, or secrets.
- Check SSH GitHub connection safely before preparing push.
- Do not print private SSH keys or environment secrets.

## Validation Baseline
- Typecheck: `npm run typecheck:all`
- API unit tests: `npm run test:api`
- Web unit tests: `npm run test:web`
- Worker tests: `npm run test --prefix apps/worker`
- Build all: `npm run build:all`
- Lint all: `npm run lint:all`
- E2E: `npm run test:e2e`

## Token Discipline
- Do not paste full logs into chat.
- Use OMNI for long terminal output.
- Save local reports to ignored files.
- Summarize only issue counts, severity, affected files, failed commands, and next recommended patches.
