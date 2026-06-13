# Clean Total VPS + Redeploy Design — SchoolHub e-Hadir

Tanggal: 2026-04-25
Target VPS: `157.15.40.21`
Scope: hapus stack SchoolHub lama total, lalu deploy ulang memakai UI dari folder `design/` sebagai tampilan utama.

## 1. Batas clean total

Yang dihapus dari VPS:

- Container Docker `schoolhub-*` lama.
- Image Docker aplikasi `schoolhub-api`, `schoolhub-web`, `schoolhub-worker` lama.
- Volume data `schoolhub_postgres_data` dan `schoolhub_redis_data` lama.
- Path aplikasi lama `/opt/schoolhub`.
- Unit systemd lama `schoolhub-prod`, `schoolhub-smoke-monitor`, `schoolhub-cloudflared-trial`.
- Helper tunnel lama `/usr/local/bin/schoolhub-public-url`.

Yang tidak dihapus:

- OS VPS.
- Docker engine dan Docker Compose.
- SSH server.
- User `root` dan `schoolhub`.
- Backup pre-wipe di home user `schoolhub`.

## 2. Backup pre-wipe

Sebelum penghapusan total, dibuat backup minimal di VPS:

```text
/home/schoolhub/prewipe-backups/20260425-012304
```

Isi backup:

- `schoolhub-source.tgz`
- `schoolhub-db.sql`

Secret/env tidak ditampilkan di log/dokumen.

## 3. Hasil wipe

Setelah wipe:

- Tidak ada container `schoolhub-*` tersisa.
- Tidak ada volume `schoolhub_*` lama tersisa.
- `/opt/schoolhub` lama terhapus.
- Service systemd SchoolHub lama terhapus.
- Helper Cloudflare tunnel lama terhapus.

## 4. Implementasi desain baru

UI utama sekarang memakai paket desain dari folder `design/`:

- `design/styles.css` dipakai sebagai basis `apps/web/src/styles.css`.
- Komponen desain dipindah ke `apps/web/src/App.tsx`.
- Source UI lama yang tidak dipakai dibersihkan dari `apps/web/src` agar web app sekarang hanya memuat shell desain baru.
- Layar aktif desain:
  - Login.
  - Dasbor Guru.
  - Input Presensi Kelas.
  - Dasbor Admin/TU.
  - Papan Anomali.
  - Live Monitor.
- Layar di luar prioritas desain memakai placeholder desain, bukan UI lama.

Integrasi backend yang aktif:

- Login memakai endpoint `/api/v1/auth/login`.
- Health readiness dipakai untuk status sistem di ribbon UI.
- Backend/API lama tetap dipakai sebagai data/auth engine, tetapi database sudah fresh dari nol.

## 5. Reset database production

Database production dibuat ulang dari volume kosong:

- Migration Prisma dijalankan saat API container start.
- Seed fresh dijalankan dengan:

```bash
docker compose -f docker-compose.production.yml exec -T api node dist/scripts/seed-full.js
```

Akun demo seeded:

- Admin/TU: `admin.tu`
- Guru: `guru.matematika`
- Siswa: `siswa.citra`

Password demo mengikuti seed/UI default untuk trial sementara.

## 6. Deployment clean

Source baru diupload ke:

```text
/opt/schoolhub
```

File `.env` production dibuat ulang dengan secret baru untuk database, JWT, dan worker token.

Service aktif setelah deploy:

- `schoolhub-postgres` — healthy.
- `schoolhub-redis` — healthy.
- `schoolhub-api` — healthy.
- `schoolhub-web` — running.
- `schoolhub-worker` — running.
- `schoolhub-nginx` — running, host port `80`.

Systemd persistence:

- `schoolhub-prod.service` enabled.
- `schoolhub-cloudflared-trial.service` enabled.

## 7. URL Cloudflare trial baru

URL Quick Tunnel baru:

```text
https://newsletter-intensity-olympics-lessons.trycloudflare.com
```

Catatan: ini URL `trycloudflare.com` sementara dan bisa berubah jika tunnel direstart.

## 8. Validasi

Validasi lokal PASS:

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

Hasil:

- Lint PASS.
- Typecheck PASS.
- Build API/web PASS.
- Test web PASS: 1 file, 1 test.
- High severity audit PASS.
- Catatan: masih ada moderate advisories transitive di API (`exceljs -> uuid`) dan web (`postcss`), tidak memblokir audit high severity.

Validasi remote PASS:

```bash
BASE_URL='https://newsletter-intensity-olympics-lessons.trycloudflare.com' bash scripts/uat_smoke.sh
```

Hasil smoke:

- PASS: 27
- FAIL: 0
- SKIP: 0

## 9. Catatan operasional berikutnya

1. Jika URL harus permanen, ganti Quick Tunnel menjadi Cloudflare Named Tunnel.
2. Jika trial selesai, ganti password demo aplikasi.
3. Jika data real mulai masuk, aktifkan backup database harian otomatis.
