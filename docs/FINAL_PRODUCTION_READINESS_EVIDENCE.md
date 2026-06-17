# Final Production Readiness Evidence

Date: 2026-06-15

Status at document update: **CI GREEN FOR FINAL VPS DEPLOYMENT READINESS HEAD**

This document records the deployment-readiness implementation for PR #2 on branch `fix/full-production-readiness`. PR #2 must remain open for qualified human technical review and must not be auto-merged.

## Branch / PR

- Repository: `kuker24/abensi`
- Branch: `fix/full-production-readiness`
- PR: #2
- Base branch: `main`
- Starting SHA for this final VPS deployment phase: `b21a9505415df700f8bb2df2ee049d9190fd0384`
- Implementation commit created in this phase: `6119736` (`feat: complete VPS deployment readiness automation`)
- Validated implementation head SHA: `5fdac972016a68f1b9636dd0326c75af203897e5`
- Final passing PR CI run: `27574711451` — <https://github.com/kuker24/abensi/actions/runs/27574711451>
- Matching passing push CI run: `27574708728` — <https://github.com/kuker24/abensi/actions/runs/27574708728>
- Note: if this evidence-only document is committed after the run above, the PR body records the latest exact head/run pair to avoid self-referential evidence drift.

## Implemented final VPS deployment closures

- Rewrote `scripts/uat_smoke.sh` for HttpOnly cookie auth, CSRF retrieval/header use, role-specific cookie jars, invalid credential rejection, logout invalidation, machine-readable JSON output, and no browser bearer-token dependency.
- Updated mutating UAT geolocation payloads to the current `{ latitude, longitude, accuracyMeter, capturedAt, source: "browser_geolocation" }` contract and required explicit `ALLOW_MUTATING_SMOKE=YES` plus coordinate env vars.
- Added `apps/api/src/scripts/ensure-admin.ts` with safe, idempotent production `ADMIN_TU` bootstrap, strong password/placeholder rejection, `mustChangePassword=true`, check-only mode, and audit event emission.
- Hardened `apps/api/src/scripts/ensure-developer.ts`; developer bootstrap now defaults disabled and refuses unsafe promotion/reset behavior unless `DEVELOPER_BOOTSTRAP_ENABLED=true`.
- Rebuilt `scripts/deploy_production.sh` into a fail-closed production workflow with environment/tool validation, compose config, env permission checks, image identity by Git SHA, pre-deploy backup for existing data, migration service, health waits, audit verification, post-migration verification, bootstrap, public HTTPS smoke, logs, rollback command, and evidence JSON.
- Added rollback/status tooling: `scripts/rollback_production.sh` and `scripts/deployment_status.sh`.
- Added Ubuntu 24.04 VPS bootstrap automation: `scripts/bootstrap_ubuntu_24_04.sh`.
- Added host-Caddy HTTPS topology: `docker-compose.vps.yml` and `ops/caddy/Caddyfile.schoolhub.example`.
- Added public HTTPS smoke: `scripts/public_https_smoke.sh`.
- Added encrypted backup/verification/restore tooling: `scripts/backup_production.sh`, `scripts/verify_backup.sh`, `scripts/restore_backup.sh`, and systemd examples under `ops/systemd/`.
- Added deployment evidence schema validation: `scripts/validate_deployment_evidence.mjs`.
- Updated CI with deployment regression coverage, shellcheck, compose VPS validation, dry-run deployment/rollback, UAT legacy-token/geolocation checks, HTTPS fixture using public smoke plus read-only and mutating UAT, and backup verification in the Docker job.
- Added `docs/VPS_PRODUCTION_DEPLOYMENT_RUNBOOK.md` with fresh bootstrap, env setup, first/upgrade deployment, admin bootstrap, HTTPS, UAT, backup, restore, rollback, status, certificate, disk-full, and database recovery commands.

## Local validation completed before push

Passed locally in this environment:

- `npx prisma validate --schema prisma/schema.prisma`
- `npm run typecheck:all`
- `npm run lint:all`
- `npm run test:api`
- `npm run test:web`
- `npm run build:all`
- `npx --yes shellcheck scripts/*.sh`
- `npx --yes js-yaml .github/workflows/ci.yml`
- `npm run security:secrets`
- `node scripts/validate_deployment_evidence.mjs <synthetic-evidence>`
- `bash -n scripts/*.sh`

Local environment limitations:

- Docker is not installed in this agent container, so Compose config, deployment dry-run, rollback dry-run, public TLS fixture, and populated backup/restore drill must be validated by GitHub Actions.
- No production public domain or production credentials are available in this agent environment.

## CI evidence

Final passing CI at validated head `5fdac972016a68f1b9636dd0326c75af203897e5`:

- PR run: `27574711451` — <https://github.com/kuker24/abensi/actions/runs/27574711451> — **PASS**
- Push run: `27574708728` — <https://github.com/kuker24/abensi/actions/runs/27574708728> — **PASS**

Passing PR jobs:

- `validate`
- `security-supply-chain`
- `postgres-integration`
- `docker`
- `deployment-regression`
- `upgrade-migrations`
- `backup-restore-drill`
- `performance-observability`
- `codeql`
- `android`
- `web-quality-gates`
- `full-stack-e2e`
- `tls-fixture`

Reviewer request status:

- GitHub rejected a formal review request to `kuker24` because that account is the PR author and currently the only listed collaborator.
- A PR-level reviewer request/comment must be posted asking the owner to route PR #2 to a qualified technical reviewer before merge/deployment.

## Owner-controlled remaining items

These remain intentionally outside Git and under deployment owner control:

- Production domain.
- DNS propagation and Cloudflare proxy mode.
- Actual production passwords and admin bootstrap password.
- Backup encryption passphrase.
- Off-VPS backup destination/hook.
- Technical reviewer selection.

## Current recommendation

**READY FOR VPS DEPLOYMENT** after the final pushed GitHub Actions workflow remains green at the latest head and the PR-level qualified reviewer request has been posted.
