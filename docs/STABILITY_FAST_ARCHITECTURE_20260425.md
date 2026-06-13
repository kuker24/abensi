# Stability & Fast Architecture Completion — SchoolHub e-Hadir

Tanggal: 2026-04-25

Scope: menjalankan 15 langkah stabilitas/performa tanpa bongkar total arsitektur. Domain permanen, hardware RFID fisik, simulasi hardware, dan APK tidak termasuk scope.

## Status 15 Langkah

1. Target arsitektur produksi ringan ditetapkan: Docker Compose + Nginx + React static web + NestJS API + PostgreSQL + Redis + Worker.
2. Rate limit login dipindahkan ke Redis dengan fallback memori lokal.
3. Nginx dituning: gzip, static asset cache, API no-store, security headers, login/API rate limit, timeout aman.
4. API dibuat scale-ready dengan menghapus `container_name` tetap pada service `api`; contoh scale ditulis di runbook.
5. PostgreSQL ditambah index performa lewat migration `0007_stability_performance_indexes`.
6. Redis dipakai untuk login limiter dan cache pendek dashboard/trend report.
7. Worker dirapikan menjadi job terpisah `auto-missed` dan `reconciliation`, masing-masing interval sendiri dan anti-overlap.
8. Observability ringan ditambah lewat `/api/v1/health/detail`, log rotation Docker, dan health alert tambahan.
9. Backup/restore ditingkatkan dengan `restore_database.sh` dan `verify_backup_restore.sh`.
10. Performance smoke test ditambah lewat `scripts/perf_smoke.mjs` dan script `npm run test:perf-smoke`.
11. PDF native tidak ditambah package berat; print browser tetap dipertahankan sebagai pilihan ringan.
12. UI workflow anomali diperkuat: kolom alur/prioritas, modal tindak lanjut, catatan, deadline, dan timeline singkat.
13. Kompatibilitas `yearLabel` dipertahankan; tahun ajaran/semester/ruang tetap tersedia untuk migrasi bertahap.
14. Jalur naik arsitektur ditulis: scale API dulu, lalu database/cache/storage jika traffic membesar.
15. Kubernetes tidak dipakai untuk tahap MAN 1/beta karena belum perlu dan akan menambah kompleksitas.

## File Utama

```text
apps/api/src/modules/redis/*
apps/api/src/modules/auth/auth.service.ts
apps/api/src/modules/health/*
apps/api/src/modules/reporting/reporting.service.ts
apps/api/src/modules/reconciliation/reconciliation.service.ts
apps/worker/src/index.js
apps/web/src/app/pages/admin/AdminPages.jsx
apps/web/src/styles.css
docker-compose.production.yml
ops/nginx/reverse-proxy.conf
prisma/schema.prisma
prisma/migrations/0007_stability_performance_indexes/migration.sql
scripts/deploy_production.sh
scripts/ops_health_alert.sh
scripts/perf_smoke.mjs
scripts/restore_database.sh
scripts/verify_backup_restore.sh
docs/PRODUCTION_LIGHT_ARCHITECTURE_20260425.md
docs/production-runbook.md
```

## Validasi Lokal

- `npx prisma validate --schema prisma/schema.prisma` — PASS
- `bash -n scripts/restore_database.sh scripts/verify_backup_restore.sh scripts/deploy_production.sh scripts/ops_health_alert.sh` — PASS
- `npm run lint:all` — PASS
- `npm run typecheck:all` — PASS
- `npm run build:all` — PASS
- `npm run test --prefix apps/api` — PASS, 4 suites / 17 tests
- `npm run test --prefix apps/web` — PASS
- `npm run test:e2e --prefix apps/web` — PASS, 4 tests
- `npm audit --audit-level=high` — PASS
- `npm audit --prefix apps/api --audit-level=high` — PASS untuk high severity; advisory moderate `exceljs -> uuid` tetap diterima sementara karena force fix men-downgrade `exceljs`.
- `npm audit --prefix apps/web --audit-level=high` — PASS

Catatan lokal: Docker tidak tersedia di mesin lokal, sehingga validasi `docker compose config` dan `nginx -t` dilakukan di VPS.

## Validasi Remote VPS

- Backup pra-deploy dibuat: `/home/schoolhub/backups/database/schoolhub-20260425-083548.sql.gz`.
- `docker compose config` — PASS.
- `nginx -t` dalam network Compose — PASS.
- Deploy selesai; container aktif:
  - `schoolhub-api-1` healthy
  - `schoolhub-web` running
  - `schoolhub-worker` running
  - `schoolhub-postgres` healthy
  - `schoolhub-redis` healthy
  - `schoolhub-nginx` running
- `/api/v1/health/detail` remote — PASS:
  - database ok,
  - redis ok,
  - latency dependency rendah,
  - memory proses terbaca.
- `scripts/uat_smoke.sh` remote — PASS 27/27.
- `npm run test:backend-contract` remote URL — PASS.
- `npm run test:perf-smoke` remote URL — PASS:
  - p95: 480ms,
  - avg: 309ms,
  - max: 480ms,
  - threshold: 1500ms.
- Redis login rate limit remote — PASS: percobaan ke-6 username uji menghasilkan HTTP 429.
- `scripts/ops_health_alert.sh` remote — PASS 6/6.
- `scripts/verify_backup_restore.sh` remote — PASS, backup berhasil direstore ke DB sementara dengan 22 tabel.
- Index penting remote terdeteksi — PASS, 3/3 sample index ada.
- UI workflow anomali remote browser — PASS, kolom alur/prioritas dan modal timeline tampil tanpa horizontal overflow.
- Header Nginx remote — PASS:
  - root: `cache-control: no-cache`, security headers aktif;
  - API: `cache-control: no-store`, security headers aktif;
  - asset JS: `content-encoding: gzip`, cache static aktif.

## Catatan Operasional

- API sekarang bernama `schoolhub-api-1` karena service dibuat scale-ready. Gunakan perintah log berbasis Compose, bukan `docker logs schoolhub-api`:

```bash
docker compose -f docker-compose.production.yml --env-file .env logs -f api
```

- Untuk beta normal, tetap jalankan 1 API.
- Jika latency naik, scale API dapat dicoba:

```bash
docker compose -f docker-compose.production.yml --env-file .env up -d --scale api=2 --no-recreate
```

- Tetap gunakan Quick Tunnel selama beta; domain permanen bukan bagian scope ini.
