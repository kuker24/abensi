# ADR 0001: Local Quality Gates for Senior AI Engineering Workflow

- Status: Accepted
- Date: 2026-06-21
- Owner: Project maintainers

## Context

The repository is an existing production-oriented monorepo with API, web, worker, Prisma, Android reader, deployment, and operations assets. Changes should be safe to review and should not depend on cloud login or API keys. Local checks need to catch type errors, unit regressions, browser regressions, dependency risk, static security issues, and accidental secret exposure before commit/push.

## Decision

Adopt local quality gates that can be run without pushing to GitHub:

- lightweight pre-commit hook: staged Gitleaks scan, TypeScript typecheck, web unit tests, worker unit tests;
- senior/manual gate: `scripts/ai-senior-checks.sh` for typecheck, unit tests, coverage readiness, build, lint, Gitleaks, OSV-Scanner, Semgrep, Knip, and Repomix;
- quality/reporting gate: `scripts/ai-quality-checks.sh` for security/dependency/codebase scans and review bundle generation;
- StrykerJS remains manual-only and must not run unless explicitly requested.

Local scan reports and generated outputs remain gitignored. Knip exceptions for intentionally public/shared export surfaces are kept narrow in `knip.json` using file-specific `ignoreIssues` entries.

## Consequences

Positive:
- Safer commits with lightweight automated checks.
- Clear manual path for deeper validation before release or push.
- Secret and local report files are less likely to be committed accidentally.

Negative:
- Some scans can report existing findings that need triage.
- OSV-Scanner requires network access to the OSV service and may fail offline or on timeout.
- Coverage reports add local output that must remain ignored and unstaged.

## Alternatives Considered

- Put all scans in pre-commit: rejected because Semgrep, OSV, Playwright, Repomix, and full API tests are too heavy for every commit.
- Rely only on CI/GitHub checks: rejected because local-first validation is required before commit/push.
- Run StrykerJS automatically: rejected because mutation testing is intentionally manual-only.

## Follow-up

- Keep `.env.production.test` ignored; use tracked `.env.production.test.example` only as a non-secret CI/local fixture.
- Revisit coverage thresholds after the team agrees on an incremental baseline.
- Revisit Knip `ignoreIssues` entries during larger module/public API refactors.
