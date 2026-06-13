# Web Gap Completion — SchoolHub e-Hadir

Tanggal: 2026-04-25

Scope: penyelesaian web/backend yang bisa dilakukan sekarang. Domain permanen, hardware RFID fisik, simulasi hardware, dan APK sengaja tidak masuk scope.

## Fitur/Hardening yang Ditambahkan

### Keamanan Login dan Token
- JWT strategy sekarang mengecek ulang user ke database pada setiap request.
- User yang sudah nonaktif ditolak walau masih memegang token lama.
- Login memiliki pembatas percobaan gagal per username/IP berbasis memori proses.
- Login berhasil, gagal, dan terkunci dicatat ke audit tanpa menyimpan password.

### Sesi Otomatis MISSED
- Worker sekarang menjalankan dua job berkala:
  - auto-missed session lifecycle;
  - rekonsiliasi pending.
- Endpoint internal baru:
  - `POST /api/v1/internal/sessions/mark-missed`
- Sesi `SCHEDULED` yang melewati `autoMissedGraceMinutes` berubah menjadi `MISSED`.
- Teacher presence dibuat sebagai `ALPA_MENGAJAR`, kecuali ada izin guru yang disetujui maka menjadi `EXCUSED_ABSENCE`.
- Notifikasi internal dan audit dibuat untuk sesi terlewat.

### Role Menu dan Dashboard Khusus
- Admin/TU tetap melihat menu operasional lengkap.
- Operator IT mendapat menu khusus teknis:
  - Dasbor Teknis;
  - Kartu dan Alat Pembaca;
  - Pantauan Langsung;
  - Audit;
  - Notifikasi;
  - Panduan Operator.
- Guru Piket mendapat menu khusus:
  - Dasbor Piket;
  - Buku Piket;
  - Sesi Hari Ini;
  - Anomali Terbuka;
  - Riwayat Absen;
  - Pantauan Langsung;
  - Notifikasi;
  - Panduan Piket.

### Pengajuan Izin/Sakit/Dinas Luar Guru
- Model dan endpoint `teacher-leaves` ditambahkan.
- Guru dapat mengajukan `IZIN`, `SAKIT`, atau `DINAS_LUAR`.
- Admin/TU dapat menyetujui/menolak.
- Jika disetujui, sesi guru hari itu ditandai `EXCUSED_ABSENCE` dan dapat diarahkan ke guru pengganti bila diberikan.
- Pengajuan dan review masuk audit + notifikasi.

### Akademik dan Jadwal
- Entitas baru:
  - Tahun Ajaran;
  - Semester;
  - Ruang;
  - Jadwal Mingguan.
- Endpoint CRUD dasar ditambahkan untuk tahun ajaran, semester, dan ruang.
- Jadwal mingguan dapat dibuat dan digunakan untuk generate sesi pada tanggal terpilih.
- Template import CSV akademik/pengguna dapat diunduh.

### Anomali dan Rekonsiliasi
- Flag anomali diperluas dengan:
  - status review;
  - prioritas;
  - penanggung jawab;
  - catatan tindak lanjut;
  - deadline.
- Endpoint workflow ditambahkan:
  - `PATCH /api/v1/reconciliation/flags/:id/workflow`
- Resolve tetap wajib alasan dan masuk audit.

### Notifikasi Internal
- Model dan endpoint notifikasi ditambahkan:
  - `GET /api/v1/notifications`
  - `PATCH /api/v1/notifications/:id/read`
- UI notifikasi tersedia di menu role terkait.
- Event penting seperti sesi missed dan pengajuan guru membuat notifikasi.

### Laporan Print-Friendly
- Halaman laporan memiliki tombol `Cetak`.
- Ditambahkan kop MAN 1 Rokan Hulu, periode laporan, dan blok tanda tangan saat print browser.
- CSS `@media print` ditambahkan.

### Siswa
- Dashboard siswa diperkuat dengan:
  - filter rentang hari;
  - filter status;
  - ringkasan hari ini;
  - penjelasan data belum final jika guru belum menutup sesi.

### Panduan Beta di UI
- Halaman panduan per role ditambahkan untuk Admin/TU, Operator IT, Guru Mapel, Guru Piket, dan Siswa.

## File Penting

- `prisma/schema.prisma`
- `prisma/migrations/0006_web_operational_completion/migration.sql`
- `apps/api/src/modules/auth/*`
- `apps/api/src/modules/reconciliation/*`
- `apps/api/src/modules/teacher-leave/*`
- `apps/api/src/modules/notifications/*`
- `apps/api/src/modules/academic/*`
- `apps/api/src/modules/scheduling/*`
- `apps/worker/src/index.js`
- `apps/web/src/app/SchoolHubApp.tsx`
- `apps/web/src/app/pages/admin/AdminPages.jsx`
- `apps/web/src/app/pages/guru/GuruPages.jsx`
- `apps/web/src/app/pages/siswa/MyAttendancePage.jsx`
- `apps/web/src/styles.css`

## Validasi Lokal

- `npm run lint:all` — PASS
- `npm run typecheck:all` — PASS
- `npm run build:all` — PASS
- `npm run test --prefix apps/api` — PASS, 4 suites / 17 tests
- `npm run test --prefix apps/web` — PASS
- `npm run test:e2e --prefix apps/web` — PASS, 4 tests
- `npm audit --audit-level=high` — PASS
- `npx prisma validate --schema prisma/schema.prisma` — PASS

## Validasi Remote

- Deploy VPS selesai; container sehat.
- `scripts/uat_smoke.sh` remote: PASS 27/27.
- Backend contract remote: PASS.
- Role menu browser remote: PASS untuk Admin/TU, Operator IT, Guru Piket, Guru Mapel, Siswa.
- Endpoint baru remote: PASS untuk notifications, teacher-leaves, academic years/semesters/rooms, weekly schedules, template import.
- Worker remote menjalankan `auto-missed` dan `reconciliation` berkala dengan status OK.

## Catatan Risiko Tersisa

- Rate limit login saat ini berbasis memori proses. Untuk multi-instance besar, pindahkan ke Redis.
- PDF native belum ditambahkan; saat ini memakai print browser agar ringan tanpa package baru.
- Workflow anomali sudah diperluas, tetapi UI tindak lanjut masih versi ringkas.
- Tahun ajaran/semester/ruang sudah tersedia, tetapi migrasi data historis lama masih memakai `yearLabel` kelas agar tidak breaking.
