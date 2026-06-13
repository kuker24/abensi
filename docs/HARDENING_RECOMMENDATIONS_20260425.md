# Hardening Rekomendasi 1/2/3/5 — Execution Ledger

Tanggal: 2026-04-25
URL trial aktif: `https://newsletter-intensity-olympics-lessons.trycloudflare.com`

## Scope yang dieksekusi

User meminta rekomendasi pasca-sprint nomor 1, 2, 3, dan 5:

1. Refactor frontend agar lebih modular.
2. Tambahkan backend test suite resmi.
3. Tambahkan monitoring eksternal dan alerting.
5. Review/perbaiki dependency moderate advisory jika aman.

## 1. Checkpoint sebelum perubahan

File yang disentuh:

Frontend:
- `apps/web/src/App.tsx`
- `apps/web/src/app/SchoolHubApp.jsx`
- `apps/web/src/app/api.ts`
- `apps/web/src/app/confirm.tsx`
- `apps/web/src/app/hooks.ts`
- `apps/web/src/app/types.ts`
- `apps/web/src/app/ui.tsx`
- `apps/web/package.json`
- `apps/web/package-lock.json`

Backend/test:
- `apps/api/package.json`
- `apps/api/package-lock.json`
- `apps/api/tsconfig.json`
- `apps/api/jest.config.cjs`
- `apps/api/src/common/import-file.parser.spec.ts`
- `apps/api/src/modules/picket-book/picket-book.service.spec.ts`
- `apps/api/src/modules/identity/identity.service.spec.ts`
- `apps/api/src/modules/academic/academic.service.spec.ts`

Ops:
- `scripts/ops_health_alert.sh`
- `scripts/validate_final.sh`
- `ops/systemd/schoolhub-health-alert.service`
- `ops/systemd/schoolhub-health-alert.timer`
- `docs/production-runbook.md`

Dependency/security:
- `apps/web/package.json`
- `apps/web/package-lock.json`
- `apps/api/package.json`
- `apps/api/package-lock.json`

## 2. Frontend refactor

Ditambahkan modul frontend typed:

```text
apps/web/src/app/api.ts       # API client, routing helper, date/helper, storage key
apps/web/src/app/confirm.tsx  # riskConfirm + ConfirmDialog
apps/web/src/app/hooks.ts     # useRemote, useForm
apps/web/src/app/types.ts     # Role, User, pagination, domain UI types
apps/web/src/app/ui.tsx       # Btn, Card, Table, StatusPill, Toast, etc.
```

`SchoolHubApp.jsx` kini lebih kecil dan memakai import dari modul shared di atas. Tidak ada `// @ts-nocheck`.

Catatan jujur: implementasi halaman Admin/Guru/Siswa belum dipecah penuh menjadi file per halaman karena perubahan itu lebih berisiko untuk regresi dalam satu siklus deploy cepat. Yang sudah dipisah adalah layer shared yang paling sering dipakai dan paling aman dipisahkan: API, hook, UI primitives, confirm dialog, dan type definitions. Rekomendasi berikutnya adalah melanjutkan ekstraksi halaman satu per satu setelah test coverage backend/frontend ini stabil.

## 3. Backend test suite resmi

Ditambahkan Jest/ts-jest untuk `apps/api`.

Script baru:

```bash
npm run test --prefix apps/api
```

Cakupan test:

### Buku Piket

File: `apps/api/src/modules/picket-book/picket-book.service.spec.ts`

- list dengan filter tanggal/kategori/severity/active.
- create note + audit.
- update note + audit.
- deactivate note + audit.
- not found handling.

### Identity/Master Data User

File: `apps/api/src/modules/identity/identity.service.spec.ts`

- update user + audit.
- deactivate user sebagai safe delete.
- import preview valid.
- import preview invalid.
- import commit menolak row invalid.

### Academic/Master Data Akademik

File: `apps/api/src/modules/academic/academic.service.spec.ts`

- update class + audit.
- update subject + audit.
- import preview valid.
- import commit menolak row invalid.

### Import parser

File: `apps/api/src/common/import-file.parser.spec.ts`

- parse CSV.
- parse XLSX.
- reject format tidak didukung.

Hasil lokal:

```text
Test Suites: 4 passed, 4 total
Tests: 17 passed, 17 total
```

## 4. Monitoring eksternal dan alerting

Ditambahkan:

```text
scripts/ops_health_alert.sh
ops/systemd/schoolhub-health-alert.service
ops/systemd/schoolhub-health-alert.timer
```

Yang dicek:

- `/api/v1/health/ready`
- root HTML
- container Docker Compose
- `schoolhub-db-backup.timer`
- umur backup database terakhir

Konfigurasi via environment, bukan hardcoded secret:

```bash
ALERT_BASE_URL=
ALERT_WEBHOOK_URL=
ALERT_MIN_BACKUP_AGE_HOURS=26
```

Timer sudah aktif di VPS:

```text
schoolhub-health-alert.timer active
```

Manual run di VPS berhasil:

```json
{
  "status": "ok",
  "pass": 5,
  "fail": 0
}
```

## 5. Dependency moderate advisory review

### Web/PostCSS

Sebelumnya ada advisory moderate `postcss <8.5.10`.

Aksi:

```bash
npm install --prefix apps/web --save-dev postcss@^8.5.10
```

Hasil:

```text
apps/web npm audit --audit-level=moderate: found 0 vulnerabilities
```

### API/exceljs -> uuid

Masih ada advisory moderate:

```text
exceljs >=3.5.0 depends on uuid ^8.3.0
uuid <14.0.0 moderate advisory
```

Review:

- `exceljs` latest saat dicek: `4.4.0`.
- `exceljs@4.4.0` masih memakai `uuid ^8.3.0`.
- `npm audit fix --force` menyarankan downgrade ke `exceljs@3.4.0`, yang merupakan breaking/lebih lama.

Keputusan:

- Tidak downgrade karena berisiko merusak import/export XLSX.
- Risk acceptance sementara untuk advisory moderate transitive ini.
- High severity tetap PASS.

## 6. Validasi lokal

Berhasil:

```bash
npm run lint:all
npm run typecheck:all
npm run build:all
npm run test --prefix apps/api
npm run test --prefix apps/web
npm run test:e2e --prefix apps/web
npm audit --audit-level=high
npm audit --prefix apps/api --audit-level=high
npm audit --prefix apps/web --audit-level=high
npm audit --prefix apps/worker --audit-level=high
```

Ringkasan:

- Lint PASS.
- Typecheck PASS.
- Build API/Web PASS.
- API Jest PASS: 17 tests.
- Web unit PASS: 2 tests.
- Playwright E2E PASS: 3 tests.
- High severity audit PASS.

## 7. Deploy dan validasi remote

Deploy ulang ke VPS berhasil.

Container:

```text
schoolhub-api        healthy
schoolhub-web        running
schoolhub-worker     running
schoolhub-postgres   healthy
schoolhub-redis      healthy
schoolhub-nginx      running
```

Remote backend contract:

```text
picket-crud
user-crud
json-import-preview
file-import-preview
academic-update
audit
```

Remote smoke:

```text
PASS: 27
FAIL: 0
SKIP: 0
```

Browser automation remote PASS untuk:

```text
/admin/picket
/admin/master-data
/admin/devices
/admin/settings
/admin/reports
/admin/audit
/guru/dashboard
/siswa/dashboard
```

## Status akhir jujur

Selesai:

- Frontend shared layer sudah modular.
- Tidak ada `// @ts-nocheck`.
- Backend test suite resmi tersedia dan PASS.
- Monitoring alert timer aktif di VPS.
- PostCSS moderate advisory sudah diperbaiki.
- `exceljs -> uuid` moderate advisory diterima sementara karena belum ada jalur update aman tanpa risiko XLSX.
- Local validation PASS.
- Remote validation PASS.

Belum diselesaikan penuh:

- Pemecahan seluruh halaman Admin/Guru/Siswa ke file per halaman. Ini sengaja tidak dipaksakan dalam satu deploy cepat agar tidak menciptakan regresi besar. Langkah berikutnya yang aman: ekstraksi halaman satu per satu dengan E2E setelah setiap ekstraksi.

## Lanjutan Refactor Halaman — 2026-04-25

Sesuai persetujuan user, sisa rekomendasi refactor dilanjutkan:

- Halaman Admin dipindah dari `SchoolHubApp` ke `apps/web/src/app/pages/admin/AdminPages.jsx`.
- Halaman Guru dipindah ke `apps/web/src/app/pages/guru/GuruPages.jsx`.
- Halaman Siswa/read-only dipindah ke `apps/web/src/app/pages/siswa/MyAttendancePage.jsx`.
- Shell aplikasi dikonversi dari `SchoolHubApp.jsx` menjadi `SchoolHubApp.tsx`.
- Boundary deklarasi komponen halaman ditambahkan melalui `.d.ts` di folder page masing-masing.
- File lama `SchoolHubApp.jsx` dan `SchoolHubApp.d.ts` dihapus.

Validasi lokal setelah refactor lanjutan:

```text
npm run lint:all          PASS
npm run typecheck:all     PASS
npm run build:all         PASS
npm run test --prefix apps/api      PASS, 17 tests
npm run test --prefix apps/web      PASS, 2 tests
npm run test:e2e --prefix apps/web  PASS, 3 tests
```

Catatan: file halaman masih `.jsx` agar ekstraksi halaman dapat dilakukan aman tanpa rewrite besar di satu langkah. Shell utama sudah `.tsx`; tahap berikutnya bila diperlukan adalah konversi page module satu per satu ke `.tsx`.

### Validasi remote setelah refactor halaman

Refactor lanjutan sudah dideploy ulang ke VPS. Hasil:

- Container API healthy.
- Web running.
- Remote smoke PASS 27/27.
- Browser automation remote PASS untuk Admin, Guru, dan Siswa.

Struktur frontend akhir tahap ini:

```text
apps/web/src/app/SchoolHubApp.tsx
apps/web/src/app/pages/admin/AdminPages.jsx
apps/web/src/app/pages/admin/AdminPages.d.ts
apps/web/src/app/pages/guru/GuruPages.jsx
apps/web/src/app/pages/guru/GuruPages.d.ts
apps/web/src/app/pages/siswa/MyAttendancePage.jsx
apps/web/src/app/pages/siswa/MyAttendancePage.d.ts
```

## Update Logo Brand — 2026-04-25

Logo teks `e·H` pada login dan sidebar sudah diganti dengan logo MAN 1 dari aset:

```text
Logo/logoman1.jpeg -> apps/web/public/logoman1.jpeg
```

Perubahan UI:
- Login header memakai `<img class="brand-logo" src="/logoman1.jpeg" ...>`.
- Sidebar brand memakai logo yang sama.
- CSS `.brand-mark` disesuaikan agar cocok untuk gambar logo.

Validasi:
- Web lint/typecheck/build/unit/E2E lokal PASS.
- Deploy VPS berhasil.
- `/logoman1.jpeg` remote HTTP 200.
- Browser automation remote memastikan logo login dan sidebar termuat dengan natural size `887x901`.
- Remote smoke PASS 27/27.

## Update Bahasa UI dan Pencarian Topbar — 2026-04-25

Permintaan lanjutan user untuk membuat UI lebih mudah dipahami petugas sekolah sudah dieksekusi.

Perubahan utama:

- Badge shortcut visual `⌘K` di topbar dihapus karena shortcut tersebut belum menjadi fitur nyata.
- Kotak `Cari menu, siswa, atau sesi…` kini menjadi input yang berfungsi untuk mencari menu sesuai peran login.
- Hasil pencarian tampil sebagai dropdown; klik hasil atau tekan Enter akan membuka menu pertama yang cocok.
- Teks tidak akurat `Target PRD ≥ 98%` diganti menjadi `Presensi yang sudah tercatat`.
- `StatusPill` kini memakai kamus label Bahasa Indonesia untuk status teknis seperti `OPEN`, `CLOSED`, `SCHEDULED`, `MISSED`, `ACTIVE`, `LOST`, `INACTIVE`, `RESOLVED`, `IN`, `OUT`, status presensi, jenis anomali, dan peran pengguna.
- Banyak label UI teknis/Inggris diganti ke Bahasa Indonesia yang lebih jelas, misalnya:
  - `Live Monitor` → `Pantauan Langsung`
  - `Master Data` → `Data Induk`
  - `Smart Card & Reader` → `Kartu dan Alat Pembaca`
  - `Preview/Commit/Import` → `Periksa/Simpan impor/Impor`
  - `Read-only` → `Lihat saja`
  - `403 Forbidden` → `Akses ditolak`
  - `Target PRD` di dashboard dihapus dari tampilan user.

Validasi lokal terbaru:

```text
npm run lint --prefix apps/web                 PASS
npm run typecheck --prefix apps/web            PASS
npm run build --prefix apps/web                PASS
npm run test --prefix apps/web                 PASS, 2 tests
npm run test:e2e --prefix apps/web             PASS, 4 tests
npm run lint:all                               PASS
npm run typecheck:all                          PASS
npm run build:all                              PASS
npm audit --audit-level=high --prefix apps/web PASS
```

Validasi remote setelah deploy:

```text
/api/v1/health/ready       PASS
scripts/uat_smoke.sh       PASS, 27/27
REMOTE_BROWSER_UI_CHECK    PASS
```

Browser check remote memastikan:

- `⌘K` tidak muncul lagi.
- `Target PRD` tidak muncul lagi.
- teks `Presensi yang sudah tercatat` tampil di dasbor admin.
- pencarian topbar dengan kata `piket` menampilkan `Buku Piket`.
- menekan Enter dari pencarian membuka `/admin/picket`.
- tidak ada console error/page error pada alur yang diuji.
