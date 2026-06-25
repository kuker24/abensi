# Post-deploy Checklist — Absensi VPS

Use this checklist after every production deployment to `https://absensi.man1rokanhulu.cloud`.

## Deployment identity

- [ ] Previous production commit recorded.
- [ ] Target production commit recorded.
- [ ] Final production commit confirmed on VPS.
- [ ] App directory confirmed: `/opt/schoolhub/current`.
- [ ] Active VPS IP confirmed: `103.93.133.212`.

Commands:

```bash
cd /opt/schoolhub/current

git status --short
git branch --show-current || true
git rev-parse HEAD
```

## Container health

```bash
cd /opt/schoolhub/current

docker compose -f docker-compose.production.yml -f docker-compose.vps.yml --env-file /opt/schoolhub/.env ps
```

Expected:

- `api` running/healthy
- `web` running/healthy
- `worker` running/healthy
- `postgres` running/healthy
- `redis` running/healthy
- `reverse-proxy` running/healthy

## Endpoint checks

```bash
curl -sS -o /tmp/root.local.html -w "local_root=%{http_code}\n" http://127.0.0.1:8080/ || true
curl -sS -o /tmp/ready.local.txt -w "local_ready=%{http_code}\n" http://127.0.0.1:8080/health/ready || true
curl -sS -o /tmp/root.public.html -w "public_root=%{http_code}\n" https://absensi.man1rokanhulu.cloud/ || true
curl -sS -o /tmp/ready.public.txt -w "public_ready=%{http_code}\n" https://absensi.man1rokanhulu.cloud/health/ready || true
```

Expected:

- [ ] local `/` = `200`
- [ ] public `/` = `200`
- [ ] local `/health/ready` = `200`
- [ ] public `/health/ready` = `200`

## Smoke test

`public_https_smoke.sh` requires `ADMIN_USERNAME` and `ADMIN_PASSWORD` to be present in production secrets. Do not print values.

Safe redacted presence check:

```bash
grep -E "^(ADMIN_USERNAME|ADMIN_PASSWORD)=" /opt/schoolhub/.env | sed 's/=.*/=<redacted>/'
```

Run smoke with a secret-safe env loading method. Expected result:

- [ ] `public_https_smoke.sh` PASS
- [ ] login succeeds
- [ ] `/auth/me` succeeds
- [ ] CSRF mutation succeeds
- [ ] SSE opens and emits an event
- [ ] root HTML mixed-content check passes
- [ ] internal ports are not publicly reachable

## Log review

Review concise logs only; do not paste full logs into chat or reports.

```bash
cd /opt/schoolhub/current

docker compose -f docker-compose.production.yml -f docker-compose.vps.yml --env-file /opt/schoolhub/.env logs --tail=160 --no-color
```

Summarize:

- [ ] fatal errors count
- [ ] repeated real HTTP 5xx count
- [ ] DB connection errors count
- [ ] auth/smoke-related blocking errors count
- [ ] reverse-proxy upstream errors count
- [ ] backup warnings count

Important: in Nginx access logs, `"GET / HTTP/1.1" 200 502` means HTTP status `200` and response size `502` bytes. It is not an HTTP 502.

## ROOT_502 decision tree

If local or public root `/` returns `502` while `/health/ready` returns `200` and containers are healthy:

1. Restart only `reverse-proxy`.
2. Recheck local/public root and ready endpoints.
3. Rerun `public_https_smoke.sh`.
4. Do not rollback if this resolves the issue.

Command:

```bash
cd /opt/schoolhub/current
docker compose -f docker-compose.production.yml -f docker-compose.vps.yml --env-file /opt/schoolhub/.env restart reverse-proxy
sleep 5
```

Escalate to rollback planning if API, DB, web, worker, or ready checks fail.

## Backup follow-up

Confirm the deployment created/recorded fresh backups:

- [ ] standalone pre-deploy backup path recorded
- [ ] deploy script internal backup path recorded
- [ ] backup file size > 0
- [ ] backup metadata exists

Watch the next scheduled/manual backup because a prior intermittent `bad decrypt` occurred once and did not reproduce during the final successful deployment.

## Final monitoring window

Monitor every 2 minutes for 10–15 minutes:

| Round | local `/` | public `/` | local ready | public ready | Containers | Notes |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |
| 4 |  |  |  |  |  |  |
| 5 |  |  |  |  |  |  |
| 6 |  |  |  |  |  |  |
| 7 |  |  |  |  |  |  |
| 8 |  |  |  |  |  |  |

Deployment can be closed when endpoints are stable, containers are healthy, smoke passes, and logs show no blocking errors.
