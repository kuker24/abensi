# Execution Status — SchoolHub e-Hadir Trial

Tanggal eksekusi: 2026-04-24
VPS: `157.15.40.21`
Akses SSH terverifikasi melalui port eksternal `9103`.
URL trial Cloudflare Quick Tunnel aktif: `https://list-highs-affordable-fusion.trycloudflare.com`

> Catatan keamanan: password VPS tidak dicatat di dokumen ini. Setelah akses awal, SSH key lokal sudah dipasang dan user non-root `schoolhub` sudah dibuat untuk operasi aplikasi.

## Status 15 langkah

| # | Status | Hasil |
|---:|:---:|---|
| 1 | ✅ | Baseline repo lokal dicatat di `docs/BASELINE.md`. Awalnya repo lokal hanya berisi PRD/env template; source production kemudian disinkronkan dari `/opt/schoolhub` di VPS. |
| 2 | ✅ | VPS berhasil diakses. OS Ubuntu 22.04.4 LTS, 8 CPU, RAM 15 GiB, rootfs 125 GiB. User `schoolhub` dibuat, SSH key dipasang, akses docker terverifikasi. |
| 3 | ✅ | Cloudflare Free digunakan via Quick Tunnel, bukan proxy langsung ke port custom. Service `schoolhub-cloudflared-trial.service` aktif dan mengarah ke `http://127.0.0.1:80`. |
| 4 | ✅ | Stack production terkonfirmasi: NestJS API, React/Vite web, Prisma/PostgreSQL, Redis, worker reconciliation, nginx reverse proxy, Docker Compose. |
| 5 | ✅ | Struktur project tersedia dan disinkronkan lokal: `apps/api`, `apps/web`, `apps/worker`, `prisma`, `ops`, `scripts`, `docs`. Ditambahkan `.dockerignore` agar build context bersih. |
| 6 | ✅ | Fondasi backend tersedia: health checks, auth JWT, role guard, Prisma, modular API, audit metadata. |
| 7 | ✅ | Schema database tersedia di `prisma/schema.prisma`: user/role, kelas, mapel, sesi, gate log, presensi kelas, audit, geofence, reader, smart card, reconciliation flags. |
| 8 | ✅ | Seed data tersedia di `prisma/seed.ts`: admin awal dari env, guru, siswa, kelas, mapel, sesi, gate log, smart card, policy, sample flags. |
| 9 | ✅ | UI MVP tersedia: login, dashboard admin/guru/siswa, master data, jadwal, presensi kelas, monitor, laporan, audit, anomaly board, smart card, settings. |
| 10 | ✅ | Modul presensi kelas tersedia: buka/tutup sesi, roster, batch save, koreksi, teacher presence, validasi role. Terverifikasi lewat smoke test. |
| 11 | ✅ | Modul presensi gerbang tersedia: endpoint gate logs/tap kartu dan integrasi device reader/smart card. |
| 12 | ✅ | Worker reconciliation aktif sebagai container `schoolhub-worker`, memanggil endpoint internal reconcile berkala. |
| 13 | ✅ | Konfigurasi production tersedia: `.env` VPS, Docker Compose, systemd service, smoke monitor timer, nginx reverse proxy. |
| 14 | ✅ | Deploy trial berhasil dijalankan ulang di VPS via `scripts/deploy_production.sh .env`. Container API/web/worker recreated dan healthy. |
| 15 | ✅ | Validasi lokal dan remote berhasil. Smoke UAT remote PASS 27/27, fail 0. |

## Perubahan tambahan yang dilakukan

1. Source production dari VPS disinkronkan ke repo lokal agar development dapat dilanjutkan dari kode nyata.
2. Dibuat `docs/BASELINE.md`.
3. Dibuat `.dockerignore` untuk mencegah `node_modules`, `dist`, `.env`, dan output runtime ikut ke Docker build context.
4. Mengganti dependency API `xlsx` dengan `exceljs` untuk menghapus vulnerability high severity tanpa menghilangkan fitur export XLSX.
5. Memperbaiki response export file agar memakai `StreamableFile`, sehingga XLSX dikirim sebagai file biner valid, bukan JSON serialisasi Buffer.

## Validasi lokal

Berhasil dijalankan:

```bash
npm run lint:all
npm run typecheck:all
npm run build:all
npm run test --prefix apps/web
npm audit --audit-level=high
npm audit --prefix apps/api --audit-level=high
npm audit --prefix apps/web --audit-level=high
npm audit --prefix apps/worker --audit-level=high
```

Hasil penting:

- Lint: PASS.
- Typecheck: PASS.
- Build API/web: PASS.
- Unit test web: PASS, 1 test file / 1 test PASS.
- High severity audit: PASS. API masih memiliki 2 moderate advisories dari dependency transitive `exceljs -> uuid`, bukan high severity.

## Validasi VPS

Container setelah deploy:

- `schoolhub-api`: healthy.
- `schoolhub-web`: running.
- `schoolhub-worker`: running.
- `schoolhub-postgres`: healthy.
- `schoolhub-redis`: healthy.
- `schoolhub-nginx`: running, port host `80`.

Health check:

```bash
curl http://127.0.0.1/api/v1/health/live
curl http://127.0.0.1/api/v1/health/ready
```

Keduanya PASS.

Smoke UAT via Cloudflare:

```bash
BASE_URL='https://list-highs-affordable-fusion.trycloudflare.com' bash scripts/uat_smoke.sh
```

Hasil: `PASS 27`, `FAIL 0`, `SKIP 0`.

Validasi export XLSX:

- Endpoint `GET /api/v1/reports/export?reportType=recap_classes&format=xlsx` berhasil diakses dengan token admin.
- Response header `Content-Type` benar: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- File hasil dikenali OS sebagai `Microsoft Excel 2007+`.

## Catatan operasional

- Port eksternal `9103` dipakai untuk akses SSH/NAT ke VPS, bukan untuk HTTP aplikasi.
- HTTP aplikasi berjalan di host VPS port `80`, lalu diekspos sementara lewat Cloudflare Quick Tunnel.
- URL `trycloudflare.com` bersifat sementara dan dapat berubah jika service tunnel direstart.
- Disarankan tahap berikutnya: pasang domain Cloudflare tetap dengan named tunnel dan rotasi password root/VPS secara manual oleh pemilik akses.
