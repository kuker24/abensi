# SIAB2 VPS Performance Readiness

This document records the PR-only dedicated VPS performance plan for SIAB2. No production configuration was changed while collecting this evidence.

## Safety scope

- Production deployment: **not performed**.
- Production containers restarted: **no**.
- Production database/Redis writes: **no**.
- Production load test: **low-rate health/static only**, stopped on errors or sharp latency.
- Host-level tuning: **proposal only**, dry-run by default through `scripts/validate_vps_tuning.sh`.

## Sanitized hardware profile

Machine-readable local artifact generated during this work: `artifacts/performance/vps-hardware-profile.json`.

| Item | Sanitized value |
| --- | --- |
| Hardware class | Dedicated VPS |
| Virtualization | KVM |
| CPU model/class | Common KVM processor |
| vCPU/logical CPUs | 4 |
| Physical cores reported | 4 |
| Threads/core | 1 |
| RAM | 8,326,950,912 bytes (~7.76 GiB / 7,941 MiB) |
| Available RAM at inspection | 7,258,517,504 bytes (~6.76 GiB) |
| Swap | 2.0 GiB total, 0 used |
| Storage | ext4 root/app filesystem, block device reports rotational=true |
| Disk capacity/free | ~57.1 GiB capacity, ~49.8 GiB free |
| Inodes | 7,733,248 total, 3% used |
| Docker | Server/client 29.5.3 |
| Docker Compose | 5.1.4 |
| Cgroup | v2 |
| Kernel | Linux 6.8.0-111-generic x86_64 |
| Load average at inspection | 0.12, 0.11, 0.08 |
| Network speed when available | 10,000 Mbps reported on active virtual interfaces |

## Production baseline, read-only/low-rate

Artifacts generated locally during this work:

- `artifacts/performance/production-low-rate-baseline.json`
- `artifacts/performance/production-container-baseline-stats.json`
- `artifacts/performance/production-db-redis-baseline.json`
- `artifacts/performance/production-worker-baseline.json`

Low-rate HTTP baseline used only unauthenticated health/static endpoints (`/health/live`, `/health/ready`, `/`, `/site.webmanifest`, `/favicon.svg`) at concurrency 1, 5, 10, 25, and 50. Total requests: 500. Errors: 0. Max observed p95/p99 across endpoint waves: 222 ms. Max single-endpoint throughput wave: 746.27 rps. This is release evidence only, not a saturation benchmark.

Current service memory immediately around the low-rate baseline:

| Service | Before RAM | After RAM | After CPU sample |
| --- | ---: | ---: | ---: |
| PostgreSQL | ~84.6 MiB | ~82.4 MiB | 1.83% |
| Redis | ~7.7 MiB | ~7.9 MiB | 0.70% |
| API | ~58.7 MiB | ~62.2 MiB | 0.70% |
| Worker | ~66.1 MiB | ~65.7 MiB | 0.71% |
| Web | ~5.0 MiB | ~5.0 MiB | 0.00% |
| Reverse proxy | ~5.3 MiB | ~5.5 MiB | 0.00% |

Database/Redis aggregate baseline:

| Metric | Value |
| --- | ---: |
| PostgreSQL database size | 11,795,479 bytes |
| PostgreSQL active connections | 1 |
| PostgreSQL total connections | 15 |
| Current PostgreSQL max_connections | 100 |
| PostgreSQL cache hit ratio | 0.999508 |
| PostgreSQL deadlocks | 0 |
| PostgreSQL temp bytes | 0 |
| PostgreSQL slow query extension | `pg_stat_statements` not installed |
| Redis used memory | 5,408,032 bytes |
| Redis maxmemory current | 0 (unbounded in current production) |
| Redis policy current | noeviction |
| Redis AOF | enabled, last rewrite ok |
| Redis latency sample | min 0 ms, avg 0.30 ms, max 1 ms |
| Worker auto-missed last duration | 9 ms |
| Worker reconciliation last duration | 7 ms |

## Proposed dedicated-VPS resource allocation

The VPS is dedicated to SIAB2, but safe maximum performance still keeps host reserve. The proposed steady-state container envelope is **6,528 MiB** and **3.50 vCPU**, leaving about **1,413 MiB RAM** and **0.50 vCPU** for Ubuntu, Docker, host Caddy, SSH, filesystem cache, backup, and transient tasks.

| Component | Current/previous cap | Proposed cap | Rationale |
| --- | ---: | ---: | --- |
| PostgreSQL | static/default 3,072 MiB / 1.0 CPU | 3,072 MiB / 1.0 CPU | Data integrity priority; memory retained for shared buffers/cache without starving host. |
| Redis | static/default 640 MiB / 0.25 CPU | 640 MiB / 0.25 CPU, `maxmemory=512mb`, `noeviction` | Bounds BullMQ memory while preserving queue integrity and AOF. |
| API | 1,280 MiB / 1.0 CPU | 1,536 MiB / 1.35 CPU, Node heap 1,024 MiB | Allows more burst capacity than 1 CPU while leaving native/Prisma/buffer memory below container cap. |
| Worker | 640 MiB / 0.4 CPU | 768 MiB / 0.55 CPU, Node heap 512 MiB | More headroom for reconciliation spikes; `WORKER_CONCURRENCY` remains 1. |
| Web | 256 MiB / 0.15 CPU | 256 MiB / 0.15 CPU | Static Nginx container already low usage; retain. |
| Reverse proxy | 256 MiB / 0.20 CPU | 256 MiB / 0.20 CPU | Keep gzip/headers/rate-limits; retain. |
| Host reserve | not explicit | >=1.25 GiB RAM and ~0.5 vCPU | Required for safe dedicated-host operation. |

## PostgreSQL tuning

Version-controlled settings are in `docker-compose.production.yml` and are environment-overridable:

- `POSTGRES_SHARED_BUFFERS=768MB`
- `POSTGRES_EFFECTIVE_CACHE_SIZE=5GB`
- `POSTGRES_WORK_MEM=8MB`
- `POSTGRES_MAINTENANCE_WORK_MEM=256MB`
- `POSTGRES_MAX_CONNECTIONS=80`
- `POSTGRES_CHECKPOINT_COMPLETION_TARGET=0.9`
- `POSTGRES_MAX_WAL_SIZE=1GB`
- `POSTGRES_MIN_WAL_SIZE=128MB`
- `POSTGRES_WAL_COMPRESSION=on`
- `POSTGRES_RANDOM_PAGE_COST=2.0`
- `POSTGRES_EFFECTIVE_IO_CONCURRENCY=2`

The block device reported `rotational=true`; therefore the defaults intentionally avoid SSD/NVMe-only values. If the VPS provider later confirms SSD/NVMe behavior with evidence, these two values may be reviewed separately.

Durability settings are explicitly retained: `fsync=on`, `full_page_writes=on`, `synchronous_commit=on`. `work_mem` remains bounded so `work_mem * max_connections` does not consume the container cap. The current production connection sample was 15 total connections, so `max_connections=80` leaves headroom without encouraging connection sprawl.

## Redis/BullMQ tuning

- AOF remains enabled with `appendfsync everysec`.
- `REDIS_MAXMEMORY=512mb` stays below `REDIS_MEM_LIMIT=640m`.
- Eviction policy remains `noeviction`; queue data must not be silently evicted.
- Queue names, repeatable schedules, delayed jobs, failed-job diagnostics, and Redis volume names are unchanged.

## API/Node tuning

- API container memory: 1,536 MiB.
- API V8 old-space: 1,024 MiB, leaving memory for Prisma engine, native modules, buffers, and runtime overhead.
- Worker container memory: 768 MiB.
- Worker V8 old-space: 512 MiB.
- Worker concurrency remains `1`; it is not increased solely to consume CPU.

## Reverse proxy/web tuning

The Nginx reverse proxy keeps existing security controls:

- login/API/scanner rate limits preserved;
- HSTS/security headers preserved;
- CSP/frame/referrer/permissions headers preserved;
- request-size limits preserved;
- SSE buffering exception preserved;
- gzip/static immutable caching/HTML no-cache preserved;
- upstream keepalive retained.

## Host tuning proposal

Host tuning was **not applied**. Review-only files:

- `ops/performance/siab2-vps-tuning.conf`
- `scripts/profile_vps_capacity.sh`
- `scripts/validate_vps_tuning.sh`
- `scripts/low_rate_http_benchmark.mjs` (also runs in CI Docker stack as tuned isolated evidence)

Default validation is dry-run/read-only:

```bash
bash scripts/validate_vps_tuning.sh
```

Apply mode requires both an explicit flag and confirmation variable, and should only be used after owner approval:

```bash
CONFIRM_APPLY_SIAB2_VPS_TUNING=YES sudo bash scripts/validate_vps_tuning.sh --apply
```

## Rollback

All Compose capacity changes are environment-variable driven. Roll back by restoring previous values in `/opt/schoolhub/.env` or removing overrides and redeploying the previously approved image/SHA. Data volumes, database names, Redis namespaces, queue names, cookies, JWT issuer/audience, backup paths, and deployment directories are unchanged.

## Validation gates

Required before production deployment of a future release target:

- Compose resource validation passes.
- Deployment regression passes.
- Backup/restore drill passes.
- PostgreSQL integration and audit-chain checks pass.
- Worker Redis/repeat schedule checks pass.
- E2E, visual, accessibility pass.
- Security supply-chain and CodeQL pass.
- Zero open code scanning alerts.
- Read-only production baseline rechecked immediately before deployment approval.
