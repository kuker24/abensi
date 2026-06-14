# Operations: backup, restore, observability, performance

## Backup and restore

- Backups are PostgreSQL logical dumps compressed with gzip.
- Set `BACKUP_ENCRYPTION_PASSPHRASE` to produce AES-256-CBC PBKDF2 encrypted files: `schoolhub-YYYYMMDD-HHMMSS.sql.gz.enc`.
- Retention defaults to 14 days via `RETENTION_DAYS`.
- Restore requires `CONFIRM_RESTORE=YES_RESTORE`; existing target DB drops require `CONFIRM_DROP_TARGET=YES_DROP_TARGET`.
- CI/staging restore drill command:

```bash
DATABASE_URL=postgresql://... \
RESTORE_DATABASE_URL=postgresql://... \
BACKUP_ENCRYPTION_PASSPHRASE=... \
npm run ops:backup-restore-drill
```

The drill restores into a fresh schema, then runs `audit:verify-chain` and `verify:post-migration`.

## RPO/RTO

- Target RPO: 24 hours for scheduled backup; 15 minutes if WAL/PITR is enabled by the owner-managed Postgres platform.
- Target RTO: 2 hours for logical restore plus application health verification.

## Rollback policy

- Application image rollback is allowed after health-check failure.
- Database migrations are forward-only. Roll back data by restoring an encrypted backup to a fresh database and re-pointing the application after audit verification.
- Do not drop forensic/audit/archive tables to make old images boot; use compatibility patches instead.

## Observability

The API emits structured JSON request logs with request ID, method, path, status, duration, redacted user agent, and IP. The API exposes process-local Prometheus text metrics at `/metrics` and `/api/v1/metrics`:

- `schoolhub_http_requests_total`
- `schoolhub_http_errors_total`
- `schoolhub_security_rejects_total`
- `schoolhub_process_uptime_seconds`

Worker health is written as JSON to `WORKER_HEALTH_FILE` and includes queue counts, last success/error, processed/failed totals, and stale readiness.

## Performance smoke

Run:

```bash
BASE_URL=https://ehadir.example.sch.id npm run test:perf-smoke
```

Thresholds are intentionally smoke-level and must be tightened with real staging traffic before launch.
