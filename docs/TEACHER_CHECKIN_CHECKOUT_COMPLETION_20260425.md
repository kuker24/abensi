# Teacher Check-in / Check-out Completion — SchoolHub e-Hadir

Tanggal: 2026-04-25

## Ringkasan Implementasi

Flow kelas sekarang eksplisit:

1. Guru klik `Absen Masuk / Mulai Kelas` saat memulai sesi.
2. Sistem mencatat `checkInAt`, lokasi masuk jika dikirim, dan aktor yang melakukan check-in.
3. Guru mengisi `Presensi siswa awal pembelajaran` satu kali di awal kelas.
4. Guru klik `Simpan Presensi Awal`.
5. Saat selesai, guru klik `Absen Keluar / Akhiri Kelas`.
6. Sistem mencatat `checkOutAt`, lokasi keluar jika dikirim, durasi, dan aktor yang melakukan check-out.
7. Jika keluar sebelum `endsAt`, alasan wajib minimal 10 karakter dan tercatat di audit.
8. Siswa tetap read-only, tidak memiliki tombol input presensi.

## Backend

### Schema/Migration

Migration baru:

```text
prisma/migrations/0008_teacher_session_checkin_checkout/migration.sql
```

Kolom baru di `TeacherSessionPresence`:

- `checkInAt`
- `checkOutAt`
- `checkInLat`
- `checkInLng`
- `checkOutLat`
- `checkOutLng`
- `checkInById`
- `checkOutById`
- `earlyCheckoutReason`

Index baru:

- `TeacherSessionPresence_checkInAt_idx`
- `TeacherSessionPresence_checkOutAt_idx`
- `TeacherSessionPresence_teacherId_checkInAt_idx`

Backfill migration mengisi `checkInAt` dari `Session.openedAt` dan `checkOutAt` dari `Session.closedAt` untuk data lama jika tersedia.

### API Behavior

`POST /api/v1/attendance/class-sessions/:id/open`

- Mengubah sesi menjadi `OPEN`.
- Mengisi `Session.openedAt`.
- Mengisi `TeacherSessionPresence.checkInAt`.
- Status guru menjadi `HADIR` atau `TELAT` sesuai toleransi.
- Audit:
  - `teacher.session.checkin`
  - `class.session.opened`

`POST /api/v1/attendance/class-sessions/:id/close`

Body optional:

```json
{
  "lat": 0.923,
  "lng": 100.31,
  "earlyCheckoutReason": "Alasan jika keluar sebelum jam selesai"
}
```

- Mengubah sesi menjadi `CLOSED`.
- Mengisi `Session.closedAt`.
- Mengisi `TeacherSessionPresence.checkOutAt`.
- Jika `now < endsAt`, `earlyCheckoutReason` wajib.
- Audit:
  - `teacher.session.checkout`
  - `class.session.closed`

### Laporan

Laporan guru sekarang memuat field tambahan:

- `checkInCount`
- `checkOutCount`
- `earlyCheckoutCount`
- `totalTeachingMinutes`
- `averageTeachingMinutes`
- `lastCheckInAt`
- `lastCheckOutAt`

## Frontend

### Halaman Guru Presensi

Tombol/flow diubah menjadi:

- `Absen Masuk / Mulai Kelas`
- `Tandai semua Hadir`
- `Simpan Presensi Awal`
- `Absen Keluar / Akhiri Kelas`

Ditambahkan informasi:

- jam mulai;
- jam selesai;
- waktu absen masuk;
- waktu absen keluar;
- status guru;
- ringkasan Hadir/Telat/Izin/Sakit/Alpa;
- alasan wajib jika keluar sebelum jam selesai.

### Dasbor Guru Piket

Menampilkan:

- `Belum Absen Masuk`
- `Sedang Mengajar`
- `Belum Absen Keluar`
- `Anomali Aktif`

Tabel sesi menampilkan jam masuk dan jam keluar guru.

## Validasi Lokal

- `npx prisma validate --schema prisma/schema.prisma` — PASS
- `bash -n scripts/uat_smoke.sh` — PASS
- `npm run lint --prefix apps/api` — PASS
- `npm run lint --prefix apps/web` — PASS
- `npm run typecheck --prefix apps/api` — PASS
- `npm run typecheck --prefix apps/web` — PASS
- `npm run build:all` — PASS
- `npm run test --prefix apps/api` — PASS, 5 suites / 21 tests
- `npm run test --prefix apps/web` — PASS
- `npm run test:e2e --prefix apps/web` — PASS, 4 tests
- `npm audit --audit-level=high` — PASS
- `npm audit --prefix apps/api --audit-level=high` — PASS untuk high severity; advisory moderate `exceljs -> uuid` tetap diterima sementara.
- `npm audit --prefix apps/web --audit-level=high` — PASS

## Validasi Remote

- Backup pra-deploy dibuat: `/home/schoolhub/backups/database/schoolhub-20260425-091106.sql.gz`.
- Docker Compose config — PASS.
- Nginx config test — PASS.
- Deploy VPS — PASS.
- Container aktif/sehat:
  - `schoolhub-api-1` healthy
  - `schoolhub-web` running
  - `schoolhub-worker` running
  - `schoolhub-postgres` healthy
  - `schoolhub-redis` healthy
  - `schoolhub-nginx` running
- `/api/v1/health/detail` — PASS.
- Remote UAT smoke — PASS 27/27.
- Backend contract remote — PASS.
- Performance smoke remote — PASS, p95 483ms.
- Browser check guru presensi — PASS.
- API report field check — PASS.
- DB column check — PASS, 3/3 kolom sample tersedia.
- Health alert — PASS 6/6.

## Catatan

- Data lama tetap aman karena migration additive dan melakukan backfill dari `openedAt`/`closedAt`.
- Flow siswa tetap read-only.
- Jika sesi ditutup sebelum jam selesai, alasan wajib agar audit tetap jelas.
