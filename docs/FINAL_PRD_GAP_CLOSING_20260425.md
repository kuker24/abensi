# Final PRD Gap Closing Sprint — SchoolHub e-Hadir

Tanggal: 2026-04-25
URL trial aktif: `https://newsletter-intensity-olympics-lessons.trycloudflare.com`
PRD acuan: `prd-ehadir-v2_2.md`

## 1. Scope yang dibekukan

Sprint ini dibekukan sebagai target **produksi trial operasional terbatas** untuk menutup gap utama PRD v2.2:

1. Buku Piket permanen berbasis database.
2. Master Data CRUD aman untuk user, kelas, mapel, dan enrollment/import.
3. Import data master CSV/XLSX dengan preview sebelum commit.
4. Audit untuk aksi sensitif dan import.
5. Frontend tersambung endpoint produksi, bukan local storage.
6. Confirm dialog reusable untuk aksi berisiko.
7. Penguatan UI perangkat, pengaturan, laporan/export.
8. Test backend kontrak, unit UI, E2E browser.
9. Backup database otomatis + restore runbook.
10. Dokumentasi Cloudflare Named Tunnel/domain tetap.
11. Deploy VPS, smoke test, browser automation, dan status akhir jujur.

## 2. Implementasi backend

### Buku Piket

Ditambahkan:

- Prisma model `PicketNote`.
- Migration `prisma/migrations/0005_picket_book_and_master_ops/migration.sql`.
- Module `apps/api/src/modules/picket-book`.
- Register module di `apps/api/src/app.module.ts`.

Endpoint:

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/api/v1/picket-notes` | List/filter catatan piket |
| `POST` | `/api/v1/picket-notes` | Buat catatan piket |
| `PATCH` | `/api/v1/picket-notes/:id` | Edit catatan piket |
| `DELETE` | `/api/v1/picket-notes/:id` | Soft delete/nonaktif catatan |

RBAC:

- `ADMIN_TU`
- `OPERATOR_IT`
- `GURU_PIKET`

Audit:

- `picket.note.created`
- `picket.note.updated`
- `picket.note.deactivated`

### Master Data CRUD

Endpoint baru/ditingkatkan:

| Method | Path | Fungsi |
|---|---|---|
| `PATCH` | `/api/v1/identity/users/:id` | Edit user/role/card status/password/active |
| `DELETE` | `/api/v1/identity/users/:id` | Nonaktif user |
| `PATCH` | `/api/v1/academic/classes/:id` | Edit kelas |
| `PATCH` | `/api/v1/academic/subjects/:id` | Edit mapel |

Catatan: aksi delete user dibuat sebagai **nonaktif/soft-deactivate**, bukan hard delete, agar histori presensi/audit tidak rusak.

### Import CSV/XLSX

Endpoint JSON rows:

| Method | Path |
|---|---|
| `POST` | `/api/v1/identity/users/import/preview` |
| `POST` | `/api/v1/identity/users/import/commit` |
| `POST` | `/api/v1/academic/import/preview` |
| `POST` | `/api/v1/academic/import/commit` |

Endpoint upload file multipart field `file`:

| Method | Path |
|---|---|
| `POST` | `/api/v1/identity/users/import/file/preview` |
| `POST` | `/api/v1/identity/users/import/file/commit` |
| `POST` | `/api/v1/academic/import/file/preview` |
| `POST` | `/api/v1/academic/import/file/commit` |

Parser file:

- CSV sederhana.
- XLSX via `exceljs`.

Audit import mencatat jumlah total, valid, invalid, created/upserted, aktor, dan hasil commit.

## 3. Implementasi frontend

### Refactor struktur

`apps/web/src/App.tsx` sudah tidak lagi menjadi file monolit utama. Struktur saat ini:

```text
apps/web/src/App.tsx                  # typed wrapper
apps/web/src/app/SchoolHubApp.jsx     # aplikasi UI utama
apps/web/src/app/SchoolHubApp.d.ts    # deklarasi typed boundary
```

`// @ts-nocheck` sudah dihapus dari frontend. Typecheck web PASS.

Catatan jujur: logika UI utama masih banyak berada di `SchoolHubApp.jsx`. Ini sudah memisahkan boundary TypeScript dan menghilangkan `ts-nocheck`, tetapi refactor komponen granular per halaman masih direkomendasikan untuk fase hardening berikutnya.

### Buku Piket UI

Halaman `/admin/picket` sekarang:

- List dari backend `/picket-notes`.
- Filter tanggal/kategori/severity.
- Tambah catatan.
- Edit catatan.
- Nonaktifkan catatan dengan confirm dialog.
- Tidak lagi memakai local storage.

### Master Data UI

Halaman `/admin/master-data` sekarang:

- Tambah/edit/nonaktif user.
- Edit kelas/mapel melalui endpoint update.
- Tab import CSV/XLSX.
- Upload file, preview hasil validasi, lalu commit.

### Perangkat UI

Halaman `/admin/devices` sekarang:

- Tambah kartu.
- Edit kartu.
- Link/unlink kartu ke pengguna.
- Ubah status kartu.
- Rotate API key reader.
- Aktif/nonaktif reader.

### Pengaturan UI

Halaman `/admin/settings` sekarang memakai confirm dialog untuk perubahan policy geofence/presensi yang sensitif.

### Laporan UI

Halaman `/admin/reports` sekarang punya loading state dan error handling untuk export CSV/XLSX.

### Confirm dialog reusable

Ditambahkan reusable confirm dialog untuk aksi berisiko, termasuk:

- Nonaktif user.
- Commit import.
- Nonaktif catatan piket.
- Tutup sesi presensi.
- Simpan policy geofence.

## 4. Test dan validasi

### Lokal

PASS:

```bash
npm run lint:all
npm run typecheck:all
npm run build:all
npm run test --prefix apps/web
npm run test:e2e --prefix apps/web
npm audit --audit-level=high
npm audit --prefix apps/api --audit-level=high
npm audit --prefix apps/web --audit-level=high
npm audit --prefix apps/worker --audit-level=high
```

Hasil lokal:

- Lint PASS.
- Typecheck PASS.
- Build API/Web PASS.
- Unit test web PASS: 1 file / 2 test.
- Playwright E2E PASS: 3 test.
- High severity audit PASS.

Catatan security audit:

- Masih ada advisory moderate transitive pada `exceljs -> uuid` dan `postcss`.
- Tidak ada high severity.

### Backend contract test

Ditambahkan:

```text
scripts/backend_contract_tests.mjs
npm run test:backend-contract
```

Cakupan:

- Buku Piket create/update/deactivate.
- User create/update/deactivate.
- Import JSON preview.
- Import file CSV preview.
- Update kelas.
- Update mapel.
- Audit picket.

Remote contract test PASS.

### Remote smoke VPS

Smoke test remote via Cloudflare URL:

```text
PASS: 27
FAIL: 0
SKIP: 0
```

### Browser automation remote

PASS untuk:

```text
/admin/picket
/admin/master-data
/admin/devices
/admin/settings
/admin/audit
/guru/dashboard
/siswa/dashboard
```

## 5. Backup dan restore

Ditambahkan:

```text
scripts/backup_database.sh
ops/systemd/schoolhub-db-backup.service
ops/systemd/schoolhub-db-backup.timer
```

Timer VPS aktif:

```text
schoolhub-db-backup.timer active
```

Backup manual sudah berhasil dibuat:

```text
/home/schoolhub/backups/database/schoolhub-20260425-021406.sql.gz
```

Panduan restore ada di:

```text
docs/production-runbook.md
```

## 6. Cloudflare Named Tunnel

Dokumentasi disiapkan di:

```text
docs/cloudflare-named-tunnel.md
```

Status: belum dieksekusi karena membutuhkan akses akun/domain Cloudflare sekolah.

## 7. Deploy VPS

Deploy berhasil ke VPS `/opt/schoolhub`.

Container:

```text
schoolhub-api        healthy
schoolhub-web        running
schoolhub-worker     running
schoolhub-postgres   healthy
schoolhub-redis      healthy
schoolhub-nginx      running
```

## 8. Status akhir jujur

### Sudah siap untuk trial operasional terbatas

- Login/RBAC.
- Dashboard Admin/Guru/Siswa.
- Presensi kelas guru.
- Rekonsiliasi/anomali.
- Buku Piket backend permanen.
- Master Data CRUD dasar yang aman.
- Import CSV/XLSX dengan preview/commit.
- Laporan/export dengan loading/error handling.
- Audit aksi sensitif.
- Backup database otomatis.
- Runbook restore.
- Remote smoke dan browser automation PASS.

### Masih direkomendasikan sebelum go-live besar seluruh sekolah

1. Pecah `SchoolHubApp.jsx` menjadi modul halaman/komponen kecil agar maintainability lebih baik.
2. Tambahkan backend unit test dengan test runner resmi seperti Jest/Supertest.
3. Tambahkan monitoring eksternal dan alerting uptime.
4. Eksekusi Cloudflare Named Tunnel dengan domain resmi sekolah.
5. Review moderate advisory transitive saat ada update dependency aman.

## Kesimpulan

Sprint berhasil menutup gap produksi paling penting. Status sistem sekarang: **siap trial operasional terbatas**. Untuk go-live penuh seluruh sekolah, lanjutkan hardening maintainability, monitoring, dan domain resmi.

## Hardening Rekomendasi 1/2/3/5 — Update 2026-04-25

Tambahan setelah sprint final:

- Frontend shared layer dipisah ke modul typed: `api.ts`, `hooks.ts`, `ui.tsx`, `confirm.tsx`, `types.ts`.
- Backend test suite resmi Jest/ts-jest ditambahkan untuk Buku Piket, Identity import/user ops, Academic import/update, dan parser CSV/XLSX.
- `npm run test --prefix apps/api` PASS: 4 suites / 17 tests.
- Monitoring health alert ditambahkan: `scripts/ops_health_alert.sh` + `schoolhub-health-alert.timer`.
- Timer health alert aktif di VPS dan status manual `ok`.
- PostCSS moderate advisory diperbaiki dengan update ke versi aman.
- Advisory moderate `exceljs -> uuid` diterima sementara karena latest `exceljs@4.4.0` masih memakai `uuid ^8.3.0`, sedangkan `npm audit fix --force` menyarankan downgrade breaking.
- Validasi lokal dan remote ulang PASS.

Catatan jujur: pemecahan seluruh halaman Admin/Guru/Siswa menjadi file per halaman belum dipaksakan penuh dalam siklus ini untuk menghindari regresi besar. Layer shared yang paling sering berubah sudah modular; ekstraksi halaman sebaiknya dilanjutkan bertahap dengan E2E per halaman.
