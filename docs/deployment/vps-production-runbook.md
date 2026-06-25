# VPS Production Runbook — Absensi

This runbook is the current production deployment reference for the Absensi / SchoolHub e-Hadir VPS.

Last verified deployment:

- Date: 2026-06-25
- Previous commit: `5c68101c6e919296066622d2fe933f837967b422`
- Active production commit: `db00539bfe58a59eefdf2a17003d43fd0e78d39b`
- Result: deployed and verified stable after post-deploy monitoring

## Current VPS facts

Use these facts for current production access and verification:

| Item | Value |
| --- | --- |
| Public domain | `https://absensi.man1rokanhulu.cloud` |
| Active VPS IP | `103.93.133.212` |
| SSH user | `schoolhub` |
| SSH port | `22` |
| App directory | `/opt/schoolhub/current` |
| Production env file | `/opt/schoolhub/.env` |

Archive docs or notes that mention `157.15.40.21:9103` are stale for the current VPS. Do not use that endpoint for production deployment.

Never print or commit `/opt/schoolhub/.env`, private keys, passwords, tokens, cookies, DB credentials, or backup passphrases.

## Required secret presence

Before deployment, verify only variable presence with redacted output. Do not print values.

Required production secret/config variables include:

- `DATABASE_URL` or the project-equivalent DB connection variable used by Docker Compose
- `BACKUP_ENCRYPTION_PASSPHRASE`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `PUBLIC_APP_ORIGIN`

Safe presence check:

```bash
cd /opt/schoolhub/current

test -f /opt/schoolhub/.env && echo ".env exists"
grep -E "^(DATABASE_URL|BACKUP_ENCRYPTION_PASSPHRASE|ADMIN_USERNAME|ADMIN_PASSWORD|PUBLIC_APP_ORIGIN)=" /opt/schoolhub/.env \
  | sed 's/=.*/=<redacted>/'
```

`ADMIN_USERNAME` and `ADMIN_PASSWORD` are required because `scripts/deploy_production.sh` runs `scripts/public_https_smoke.sh` during deployment.

## Pre-deploy checklist

Complete every item before running the deploy script:

- [ ] Local `main` is clean and up to date with `origin/main`.
- [ ] GitHub Actions / main CI is green for the target commit.
- [ ] SSH to the active VPS works.
- [ ] VPS checkout is clean.
- [ ] Current production commit is recorded.
- [ ] Containers are running and healthy.
- [ ] Disk and memory are safe for build + backup.
- [ ] Required secret presence is confirmed with redacted output.
- [ ] Smoke credentials are valid.
- [ ] Fresh encrypted DB backup is created and verified.
- [ ] Rollback target commit is known.

Safe preflight commands:

```bash
cd /opt/schoolhub/current

git status --short
git branch --show-current || true
git rev-parse HEAD

docker compose -f docker-compose.production.yml -f docker-compose.vps.yml --env-file /opt/schoolhub/.env ps

curl -sS -o /tmp/root.local.html -w "local_root=%{http_code}\n" http://127.0.0.1:8080/ || true
curl -sS -o /tmp/ready.local.txt -w "local_ready=%{http_code}\n" http://127.0.0.1:8080/health/ready || true
curl -sS -o /tmp/root.public.html -w "public_root=%{http_code}\n" https://absensi.man1rokanhulu.cloud/ || true
curl -sS -o /tmp/ready.public.txt -w "public_ready=%{http_code}\n" https://absensi.man1rokanhulu.cloud/health/ready || true
```

## Fresh backup gate

Do not deploy without a fresh, verified backup. Use the existing encrypted backup script.

```bash
BACKUP_TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/opt/schoolhub/backups/predeploy-$BACKUP_TS"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

cd /opt/schoolhub/current
git rev-parse HEAD > "$BACKUP_DIR/previous-commit.txt"
git status --short > "$BACKUP_DIR/git-status-before.txt"
docker compose -f docker-compose.production.yml -f docker-compose.vps.yml --env-file /opt/schoolhub/.env ps \
  > "$BACKUP_DIR/docker-compose-ps-before.txt"

BACKUP_DIR="$BACKUP_DIR" bash scripts/backup_production.sh /opt/schoolhub/.env --reason predeploy
```

Verify only metadata/path/size; do not print DB credentials or passphrases.

```bash
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'schoolhub-*.dump.enc' -printf '%p %s bytes\n'
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'schoolhub-*.dump.enc.metadata.json' -printf '%p\n'
```

If backup verification fails, stop. Do not deploy.

### Backup incident note

During the 2026-06-25 deployment, an intermittent `bad decrypt` failure occurred in the deploy script backup path but did not reproduce in standalone backup or backup-only diagnostics. The final deployment completed with both a fresh standalone backup and internal deploy backup. Watch the next scheduled/manual backup and investigate immediately if `bad decrypt`, `pg_dump`, `pg_restore`, or OpenSSL errors recur.

## Git target preparation

When production checkout is detached, recover `main` safely:

```bash
cd /opt/schoolhub/current

git status --short
git fetch origin main
git checkout main
git pull --ff-only origin main
git rev-parse HEAD
git status --short
```

Stop if the working tree is dirty, the pull is not fast-forward, or the resulting commit is not the intended target.

## Deployment command

Use only the documented Docker Compose VPS topology deployment command:

```bash
cd /opt/schoolhub/current
USE_VPS_TOPOLOGY=true bash scripts/deploy_production.sh /opt/schoolhub/.env
```

The deploy script is expected to:

- validate the production environment
- create and verify the mandatory encrypted pre-deploy backup
- build API/web/worker images
- run Prisma migrations
- restart application containers
- verify audit/post-migration checks
- bootstrap/verify admin as configured
- run public HTTPS smoke when `PUBLIC_APP_ORIGIN` is configured
- write deployment evidence under `artifacts/deployments/`

Do not bypass backup or smoke tests.

## Post-deploy verification

Run these checks after deployment:

```bash
cd /opt/schoolhub/current

docker compose -f docker-compose.production.yml -f docker-compose.vps.yml --env-file /opt/schoolhub/.env ps

curl -sS -o /tmp/root.local.html -w "local_root=%{http_code}\n" http://127.0.0.1:8080/ || true
curl -sS -o /tmp/ready.local.txt -w "local_ready=%{http_code}\n" http://127.0.0.1:8080/health/ready || true
curl -sS -o /tmp/root.public.html -w "public_root=%{http_code}\n" https://absensi.man1rokanhulu.cloud/ || true
curl -sS -o /tmp/ready.public.txt -w "public_ready=%{http_code}\n" https://absensi.man1rokanhulu.cloud/health/ready || true
```

Run `scripts/public_https_smoke.sh` with a safe env-loading method that does not print credentials. The smoke must pass before the deployment is considered complete.

Expected post-deploy status:

- local `/` = `200`
- public `/` = `200`
- local `/health/ready` = `200`
- public `/health/ready` = `200`
- `public_https_smoke.sh` = PASS
- all containers healthy

## Reverse-proxy ROOT_502 recovery

Known pattern: root `/` returns `502`, but `/health/ready` remains `200` and containers are healthy. This can indicate stale reverse-proxy upstream state after app container recreation.

First response:

```bash
cd /opt/schoolhub/current
docker compose -f docker-compose.production.yml -f docker-compose.vps.yml --env-file /opt/schoolhub/.env restart reverse-proxy
sleep 5
```

Then recheck root/ready endpoints and rerun public HTTPS smoke. Do not restart all services and do not rollback if a reverse-proxy-only restart resolves the issue.

Rollback instead if API, DB, web, worker, or ready checks are unhealthy, or if smoke auth/API checks fail.

## Rollback policy

Rollback application images/checkouts only when required:

- deploy script fails after app rollout
- API/web/worker/DB becomes unhealthy
- `/health/ready` fails after any proxy-only recovery
- smoke auth/API checks fail
- logs show current fatal app errors

Application rollback example:

```bash
cd /opt/schoolhub/current
git checkout <previous-production-commit>
USE_VPS_TOPOLOGY=true bash scripts/deploy_production.sh /opt/schoolhub/.env
```

Do not restore the database unless migration/data corruption occurred and explicit approval exists. Database restore is destructive and must use the restore runbook with a verified backup.

## Post-deploy monitoring

Monitor for 10–15 minutes after deployment:

- root local/public status
- ready local/public status
- container health
- concise logs for fatal errors, repeated real 5xx, DB connection errors, reverse-proxy upstream errors, backup warnings
- one final `public_https_smoke.sh` run

Note: Nginx access logs may contain `"GET / HTTP/1.1" 200 502`, where `200` is the HTTP status and `502` is the response size in bytes. Do not misclassify that as an HTTP 502.
