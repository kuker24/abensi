# Rebrand & Dedicated VPS Performance Readiness

Branch: `feat/rebrand-and-dedicated-vps-performance`
Base SHA: `c9a22864cf3b25b8ecf7b65b2a566521152c9a3b`
Scope: PR-only changes; no production deployment, restart, database mutation, Redis mutation, or secret rotation.

## Public identity

Public-facing identity is now centralized as:

- Full: **Sistem Informasi Akademik Berkarakter**
- Compact: **Akademik Berkarakter**
- Institution: **MAN 1 Rokan Hulu**

Technical identifiers such as package names, image names, queue prefixes, API client class names, and legacy QR payload prefixes remain unchanged for compatibility.

## Sanitized VPS profile collected read-only

The following production host facts were collected with read-only commands and sanitized before inclusion:

| Area | Sanitized fact |
| --- | --- |
| CPU | 4 logical CPUs, x86_64, Common KVM processor |
| Memory | 7941 MiB total, about 6904 MiB available during inspection |
| Swap | 2 GiB configured, unused during inspection |
| Disk | Root filesystem about 58 GiB, about 13% used |
| Load | About 0.08 during inspection |
| Shell nofile | `ulimit -n` reported 1024 |
| Existing app caps | API 768 MiB, worker 512 MiB, web/proxy 256 MiB each |
| Existing app usage | Low memory usage at inspection time |
| PostgreSQL profile | Database about 11.8 MB, 15 connections |
| PostgreSQL durability | `fsync` and `full_page_writes` enabled |
| PostgreSQL defaults observed | `max_connections=100`, `shared_buffers=16384`, `work_mem=4096` |
| PostgreSQL extensions | `btree_gist`, `pgcrypto`, `plpgsql` |

No secrets, raw Redis keys, database rows, credential hashes, tokens, cookies, or private key material are included.

## Dedicated VPS resource budget

Default compose resource caps target the observed 4 vCPU / ~8 GiB VPS profile while leaving at least about 1.25 GiB RAM and 1 CPU for the host, Caddy, SSH, Docker, kernel page cache, and backup jobs.

| Service | Memory cap | CPU cap | Notes |
| --- | ---: | ---: | --- |
| postgres | 3072 MiB | 1.00 | Tuned shared buffers, WAL/checkpoint settings; durability flags kept on |
| redis | 640 MiB | 0.25 | AOF everysec, noeviction, maxmemory below container cap |
| api | 1280 MiB | 1.00 | Node heap capped below container memory |
| worker | 640 MiB | 0.40 | Concurrency remains conservative by default |
| web | 256 MiB | 0.15 | Static Nginx frontend |
| reverse-proxy | 256 MiB | 0.20 | Upstream keepalive enabled |
| **steady total** | **6144 MiB** | **3.00** | Host reserve maintained |

The caps are environment-driven through `.env` so the owner can adjust them deliberately without editing compose files.

## Durability and security preserved

- PostgreSQL explicitly keeps `fsync=on`, `full_page_writes=on`, and `synchronous_commit=on`.
- Redis keeps AOF enabled with `appendfsync everysec` and `maxmemory-policy noeviction` to avoid silent queue/cache eviction.
- App services keep `read_only`, `cap_drop: ["ALL"]`, and `no-new-privileges:true`.
- Health checks remain enabled for all steady-state services.
- Worker repeatable schedule controls are unchanged; no Redis mutation is performed by this PR.
- Deployment scripts are not changed to deploy automatically.

## Validation added

- CI deployment-regression now renders VPS compose as YAML and JSON.
- `scripts/validate_compose_resources.mjs` validates resource budget, hardening controls, health checks, and Postgres/Redis durability defaults from resolved compose JSON.
- `scripts/validate_final.sh` runs the same validator whenever Docker is available locally.

## Operator notes

- Production deployment is still manual-only and must pin an exact SHA.
- If production resource overrides are changed, rerun compose validation before deployment.
- If deployment is delayed, repeat the existing read-only readiness checks immediately before any owner-approved deployment.
