# Baseline Repository — SchoolHub e-Hadir

Tanggal: 2026-04-24
Direktori kerja: `/home/fahmi/Downloads/LAB GITHUB/LAB BETA/Absensi`

## Ringkasan baseline awal

Saat pertama diperiksa, repository lokal hanya berisi dokumen PRD dan file environment template; belum ada source code aplikasi di working tree lokal.

File awal yang terverifikasi:

| Path | Status awal | Catatan |
|---|---:|---|
| `EHADIR.md` | Ada | PRD utama, 1030 baris, versi 2.2 final baseline. |
| `.env.production.example` | Ada | Template konfigurasi production untuk PostgreSQL, Redis, JWT, admin awal. |
| `.env` | Ada | File konfigurasi lokal/rahasia. Nilai tidak dicatat. |
| `.gitignore` | Ada | Mengabaikan `.env*`, `node_modules`, `dist`, log, data PostgreSQL/Redis. |
| `.last_deploy_artifact_path` | Ada | Menunjuk ke `deploy_artifacts/schoolhub-trial-20260423172643`; direktori artifact tidak ditemukan lokal. |
| `.codex` | Ada | Terdeteksi sebagai file non-teks/gambar oleh harness. |

## Environment lokal yang terverifikasi

- Node.js: `v25.9.0`.
- npm: `11.12.1`.
- Docker/Docker Compose tidak terdeteksi dari output baseline lokal.

## Update setelah akses VPS

Setelah akses VPS berhasil, ditemukan bahwa `/opt/schoolhub` di VPS sudah berisi source production dan container aktif. Source tersebut disinkronkan ke repository lokal agar development lokal sesuai dengan deployment nyata.

Source yang kini tersedia lokal:

| Area | Path |
|---|---|
| API backend | `apps/api` |
| Frontend web | `apps/web` |
| Worker reconciliation | `apps/worker` |
| Prisma schema/seed | `prisma/schema.prisma`, `prisma/seed.ts` |
| Production compose | `docker-compose.production.yml` |
| Nginx/systemd ops | `ops/nginx`, `ops/systemd` |
| Deploy/UAT scripts | `scripts/deploy_production.sh`, `scripts/uat_smoke.sh` |
| Runbook/UAT docs | `docs/*.md` |

## Stack terverifikasi

- Backend: NestJS + TypeScript.
- Frontend: React + Vite + Tailwind.
- ORM/database: Prisma + PostgreSQL.
- Cache/support service: Redis.
- Worker: Node.js polling worker untuk reconciliation.
- Reverse proxy: nginx.
- Deployment: Docker Compose production + systemd.
- Temporary public access: Cloudflare Quick Tunnel.

## Risiko awal dan status mitigasi

| Severity | Risiko | Status |
|---|---|---|
| High | Source code tidak tersedia lokal saat baseline awal | Dimigitasi: source production VPS sudah disinkronkan ke lokal. |
| High | Kredensial VPS pernah dibagikan di chat | Sebagian dimitigasi: user non-root `schoolhub` + SSH key dibuat. Rotasi password root tetap direkomendasikan oleh pemilik VPS. |
| High | `.env` berisi rahasia | Dimigitasi operasional: `.env` tetap di-ignore dan tidak dicatat nilainya. |
| Medium | Port `9103` ternyata dipakai untuk akses SSH eksternal/NAT | Dimigitasi: aplikasi HTTP berjalan di port host `80` dan dipublish via Cloudflare Tunnel. |
| Medium | Build context Docker bisa membawa artifact lokal | Dimigitasi: `.dockerignore` ditambahkan. |
| Medium | Dependency `xlsx` memiliki vulnerability high severity | Dimigitasi: diganti ke `exceljs`; audit high severity PASS. |

## Baseline eksekusi setelah sinkronisasi

Perintah utama:

```bash
npm ci
npm ci --prefix apps/api
npm ci --prefix apps/web
npm ci --prefix apps/worker
npm run lint:all
npm run typecheck:all
npm run build:all
npm run test --prefix apps/web
```

Deploy VPS:

```bash
rsync -az --delete --exclude '.env' --exclude 'node_modules' --exclude '*/node_modules' --exclude 'dist' --exclude '*/dist' --exclude 'output' --exclude '.git' -e 'ssh -p 9103' ./ schoolhub@157.15.40.21:/opt/schoolhub/
ssh -p 9103 schoolhub@157.15.40.21 'cd /opt/schoolhub && bash scripts/deploy_production.sh .env'
```

Status eksekusi lengkap tersedia di `docs/EXECUTION_STATUS.md`.
