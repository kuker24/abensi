# SchoolHub e-Hadir VPS Production Deployment Runbook

Target: Biznet Gio NEO Lite VPS, Ubuntu Server 24.04 LTS 64-bit, single-node Docker Compose, ~300 school users.

## 1. Owner-controlled prerequisites

Prepare these outside Git and never commit them:

- Production domain, e.g. `ehadir.example.sch.id`.
- DNS A record to the VPS IPv4 address; optional AAAA record only if IPv6 is configured.
- Production `.env` with `chmod 600`.
- Strong `ADMIN_PASSWORD` for first bootstrap.
- `BACKUP_ENCRYPTION_PASSPHRASE`.
- Off-VPS backup destination/hook.
- At least one qualified technical reviewer for PR #2.

Cloudflare note: for first certificate issuance, use DNS-only mode or ensure Caddy can complete HTTP-01/ALPN validation. If Cloudflare proxy is enabled later, keep TLS mode strict/full and re-run HTTPS smoke.

## 2. Bootstrap a fresh Ubuntu 24.04 VPS

```bash
sudo DEPLOY_USER=schoolhub bash scripts/bootstrap_ubuntu_24_04.sh
```

The bootstrap script is safe to rerun. It installs security packages, Docker Engine from Docker's official repository, UFW/fail2ban, 2 GB swap when needed, log rotation, Docker log limits, and `/opt/schoolhub/{backups,deployments,logs}` with restrictive permissions.

It does **not** embed credentials and does **not** disable SSH password login until an authorized SSH public key is present and tested.

## 3. Clone and checkout PR branch

```bash
sudo -iu schoolhub
cd /opt/schoolhub
git clone https://github.com/kuker24/abensi.git current
cd current
git fetch --all --prune
git checkout fix/full-production-readiness
git pull --ff-only
```

## 4. Create production env file

```bash
cp .env.production.example /opt/schoolhub/.env
chmod 600 /opt/schoolhub/.env
nano /opt/schoolhub/.env
```

Required production values include:

- `NODE_ENV=production`
- `PUBLIC_APP_ORIGIN=https://your-domain`
- `CORS_ORIGIN=https://your-domain`
- strong `JWT_SECRET`, `WORKER_TOKEN`, `READER_SECRET_ENCRYPTION_KEY`
- optional strong `READER_API_KEY_HASH_SECRET` for reader API-key/provisioning-token HMAC lookup hashes; if omitted, `READER_SECRET_ENCRYPTION_KEY` is used. Rotate only with a controlled reader credential migration plan.
- `ADMIN_BOOTSTRAP_ENABLED=true` for first bootstrap
- `DEVELOPER_BOOTSTRAP_ENABLED=false` unless explicitly required operationally
- `BACKUP_ENCRYPTION_PASSPHRASE`

Do not run the general development seed in production.

## 5. HTTPS topology with host Caddy

Supported topology:

```text
Internet :80/:443 -> host Caddy -> 127.0.0.1:8080 -> Docker Nginx reverse proxy -> web/API
```

Install Caddy on the host, copy `ops/caddy/Caddyfile.schoolhub.example` to `/etc/caddy/Caddyfile`, replace the domain/email, then:

```bash
sudo systemctl reload caddy
```

Deploy Docker with the VPS override so the internal reverse proxy is **not** publicly exposed:

```bash
USE_VPS_TOPOLOGY=true bash scripts/deploy_production.sh /opt/schoolhub/.env
```

The override binds `127.0.0.1:8080:8080`. PostgreSQL and Redis have no public Compose ports.

## 6. First deployment

```bash
cd /opt/schoolhub/current
chmod 600 /opt/schoolhub/.env
USE_VPS_TOPOLOGY=true bash scripts/deploy_production.sh /opt/schoolhub/.env
```

The deploy script validates tools, Docker/Compose versions, env permissions, Compose config, production env values, existing DB state, mandatory encrypted backup before migrating existing data, migration service, health checks, audit-chain verification, post-migration verification, admin bootstrap, optional developer bootstrap, public HTTPS smoke, and writes evidence JSON under `artifacts/deployments/`.

## 7. Upgrade deployment

```bash
cd /opt/schoolhub/current
git fetch --all --prune
git checkout fix/full-production-readiness
git pull --ff-only
USE_VPS_TOPOLOGY=true bash scripts/deploy_production.sh /opt/schoolhub/.env
```

If the database already contains production data, deployment aborts unless encrypted backup succeeds.

## 8. Admin bootstrap

The deploy script runs:

```bash
docker compose -f docker-compose.production.yml --env-file /opt/schoolhub/.env run --rm --no-deps api node dist/scripts/ensure-admin.js
```

Manual check-only mode:

```bash
docker compose -f docker-compose.production.yml --env-file /opt/schoolhub/.env run --rm --no-deps api node dist/scripts/ensure-admin.js --check-only
```

The bootstrap creates only one `ADMIN_TU`, sets `mustChangePassword=true`, does not create demo data, and refuses weak/placeholder passwords or role promotion.

Developer bootstrap remains disabled by default. Enable only with `DEVELOPER_BOOTSTRAP_ENABLED=true` and a strong `DEVELOPER_PASSWORD` if operationally required.

## 9. UAT smoke

Read-only cookie/CSRF smoke:

```bash
BASE_URL=https://your-domain \
ADMIN_USERNAME=admin.tu ADMIN_PASSWORD='...' \
GURU_USERNAME='...' GURU_PASSWORD='...' \
SISWA_USERNAME='...' SISWA_PASSWORD='...' \
bash scripts/uat_smoke.sh
```

Mutating disposable smoke requires explicit opt-in and real school coordinates:

```bash
ALLOW_MUTATING_SMOKE=YES \
UAT_LATITUDE='actual-latitude' \
UAT_LONGITUDE='actual-longitude' \
UAT_ACCURACY_METER=25 \
BASE_URL=https://your-domain \
ADMIN_USERNAME=... ADMIN_PASSWORD=... GURU_PASSWORD=... SISWA_PASSWORD=... \
bash scripts/uat_smoke.sh
```

## 10. Public HTTPS smoke

```bash
PUBLIC_APP_ORIGIN=https://your-domain \
ADMIN_USERNAME=admin.tu ADMIN_PASSWORD='...' \
bash scripts/public_https_smoke.sh
```

This validates redirect, trusted certificate, HSTS/security headers, Secure/HttpOnly cookies, `/auth/me`, CSRF rejection/success, SSE, mixed content, internal ports, and logout.

## 11. Backups

Manual encrypted backup:

```bash
BACKUP_DIR=/opt/schoolhub/backups bash scripts/backup_production.sh /opt/schoolhub/.env --reason manual
```

Install scheduled backup:

```bash
sudo cp ops/systemd/schoolhub-backup.service /etc/systemd/system/
sudo cp ops/systemd/schoolhub-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now schoolhub-backup.timer
```

Recommended: daily encrypted backup, weekly retained backup, monthly restore drill, and off-VPS copy using `BACKUP_UPLOAD_HOOK`.

## 12. Restore verification and restore

Verify backup without overwriting production:

```bash
bash scripts/verify_backup.sh --env-file /opt/schoolhub/.env --backup /opt/schoolhub/backups/schoolhub-YYYY.dump.enc
```

Restore to non-production database:

```bash
bash scripts/restore_backup.sh --env-file /opt/schoolhub/.env --backup /path/backup.dump.enc --target-database schoolhub_restore_drill
```

Production restore requires explicit confirmation:

```bash
bash scripts/restore_backup.sh --env-file /opt/schoolhub/.env --backup /path/backup.dump.enc --restore-production
```

## 13. Rollback

Application rollback only:

```bash
bash scripts/rollback_production.sh --env-file /opt/schoolhub/.env --target-sha PREVIOUS_DEPLOYED_SHA
```

Rollback never blindly reverses migrations or restores the database. Database restore requires `--restore-database --backup FILE` and explicit confirmation.

## 14. Status check

```bash
USE_VPS_TOPOLOGY=true bash scripts/deployment_status.sh --env-file /opt/schoolhub/.env
```

Status includes Git SHA, containers, images, health, migrations, audit chain, backup age, disk/memory, certificate expiration, queue/Redis state, and latest deployment evidence.

## 15. Certificate troubleshooting

- Confirm DNS A/AAAA records point to the VPS.
- Confirm ports 80/443 are open in UFW and provider firewall.
- Check Caddy logs: `journalctl -u caddy -n 200 --no-pager`.
- Temporarily disable Cloudflare proxy for issuance if needed.
- Re-run `scripts/public_https_smoke.sh` after renewal.

## 16. Disk-full recovery

1. Stop write traffic if the database volume is at risk.
2. Inspect: `df -h`, `docker system df`, backup directory age.
3. Remove only safe old Docker layers/artifacts after a fresh backup exists.
4. Do not delete current database volumes or latest verified backups.
5. Re-run deployment status and backup verification.

## 17. Database recovery

1. Stop app write traffic: `docker compose ... stop reverse-proxy worker api`.
2. Verify the selected backup with `scripts/verify_backup.sh`.
3. Restore to a temporary database first.
4. Verify migrations and audit chain.
5. Only then perform explicit production restore if approved.
