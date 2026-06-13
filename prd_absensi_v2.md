# PRD Absensi v2 — Rebuild Full Node.js

**Produk:** SchoolHub e-Hadir / Absensi MAN 1 Rokan Hulu  
**Dokumen:** PRD + Pemetaan Sistem + Arsitektur Rebuild  
**Target implementasi baru:** Full Node.js/TypeScript, prompt-ready untuk Google AI Studio  
**Tanggal pemetaan:** 2026-05-09  
**Status:** Draft lengkap berdasarkan repository lokal dan VPS aktif  

> Catatan keamanan: dokumen ini sengaja tidak memuat nilai secret seperti password, JWT secret, worker token, reader secret, isi `.env`, private key SSH, atau isi backup database. Semua rahasia tetap harus berada di secret store/server environment.

---

## 1. Ringkasan Eksekutif

Absensi v2 adalah sistem absensi digital sekolah yang menggabungkan beberapa lapisan bukti kehadiran:

1. **Gerbang** — siswa/guru/staf melakukan scan masuk/keluar.
2. **Mushola** — siswa melakukan scan Dhuha, Dzuhur, dan Ashar sesuai kebijakan.
3. **Kelas** — guru membuka sesi, mencatat presensi siswa awal pembelajaran, lalu menutup sesi.
4. **Rekonsiliasi otomatis** — sistem membandingkan bukti gerbang/mushola/kelas dan membuat flag anomali.
5. **Audit trail** — semua perubahan penting disimpan dengan jejak aktor, alasan, dan hash-chain tamper-evident.

Sistem existing sudah berjalan di VPS menggunakan NestJS, React, Prisma, PostgreSQL, Redis, worker Node.js, nginx, Docker Compose, serta Android QR reader Kotlin. Versi baru yang diminta akan dibuat ulang dengan pendekatan **full Node.js/TypeScript** agar lebih mudah dibangun ulang melalui Google AI Studio, lebih modular, dan lebih mudah dirawat.

Target rebuild bukan sekadar menyalin source lama, tetapi membuat implementasi baru yang mempertahankan logika bisnis penting, memperbaiki struktur, dan mengurangi kompleksitas modul besar.

---

## 2. Hasil Pemetaan Repository Lokal

### 2.1 Struktur root terverifikasi

```text
.
├── apps/
│   ├── api/              # Backend NestJS + TypeScript
│   ├── web/              # Frontend React + Vite + Tailwind
│   ├── worker/           # Worker Node.js reconciliation
│   └── android-reader/   # APK Android QR reader Kotlin/Compose
├── prisma/               # Prisma schema, migrations, seed
├── ops/
│   ├── nginx/            # Reverse proxy config
│   └── systemd/          # Unit/timer systemd
├── scripts/              # Deploy, backup, smoke, perf, validation
├── docs/                 # Runbook, audit, QR, SOP, UAT docs
├── tools/apk-builder/    # Python/PySide6 helper builder APK
├── design/               # Prototype/desain lama
├── Laporan/              # Laporan naratif proyek
├── Logo/                 # Logo sekolah
├── backend/              # Placeholder lama
├── web/                  # Placeholder lama
├── docker-compose.production.yml
├── package.json
├── README.md
└── prd-ehadir-v2_2.md
```

### 2.2 Stack existing lokal

| Area | Stack existing | Bukti file |
|---|---|---|
| Backend API | NestJS 11, TypeScript, Prisma, Redis, JWT | `apps/api/package.json`, `apps/api/src` |
| Frontend Web | React 18, Vite 6, Tailwind, Vitest, Playwright | `apps/web/package.json`, `apps/web/src` |
| Worker | Node.js + Axios | `apps/worker/package.json`, `apps/worker/src/index.js` |
| Database | PostgreSQL + Prisma | `prisma/schema.prisma`, migrations |
| Cache/queue lightweight | Redis | `apps/api/src/modules/redis`, compose |
| Android reader | Kotlin, Jetpack Compose, CameraX, MLKit, OkHttp | `apps/android-reader` |
| Infra | Docker Compose, nginx, systemd | `docker-compose.production.yml`, `ops/` |
| Testing | Jest, Vitest, Playwright, shell smoke, perf smoke | `*.spec.ts`, `*.test.tsx`, `scripts/uat_smoke.sh` |

### 2.3 Runtime lokal terverifikasi

- Node.js lokal: `v24.15.0`
- npm lokal: `11.12.1`
- Java/JDK lokal: tidak tersedia saat pemetaan.
- Repo lokal tidak memiliki metadata `.git`.
- Tidak ditemukan `.nvmrc`, `.node-version`, atau version pin runtime.

### 2.4 Package dan scripts

#### Root `package.json`

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run build:all
npm run lint:all
npm run typecheck:all
npm run security:audit
npm run uat:smoke
npm run test:backend-contract
npm run test:perf-smoke
npm run test:api
npm run test:web
npm run test:e2e
npm run validate:final
```

#### API

```bash
npm run start:dev --prefix apps/api
npm run build --prefix apps/api
npm run start --prefix apps/api
npm run lint --prefix apps/api
npm run typecheck --prefix apps/api
npm run test --prefix apps/api
```

#### Web

```bash
npm run dev --prefix apps/web
npm run build --prefix apps/web
npm run preview --prefix apps/web
npm run lint --prefix apps/web
npm run typecheck --prefix apps/web
npm run test --prefix apps/web
npm run test:e2e --prefix apps/web
```

#### Worker

```bash
npm run start --prefix apps/worker
npm run lint --prefix apps/worker
```

### 2.5 Test surface existing

| Area | Jumlah terdeteksi | Catatan |
|---|---:|---|
| API unit/spec | 11 | Jest + ts-jest |
| Web unit test | 2 | Vitest + Testing Library |
| Web E2E | 1 | Playwright |
| Android unit test | 6 | JUnit/Kotlin |
| Python tool test | 1 | pytest/manual runner |

### 2.6 File besar/risiko maintainability

| File | Risiko |
|---|---|
| `apps/web/src/styles.css` | CSS sangat besar, perlu modularisasi design system |
| `apps/api/src/modules/reporting/reporting.service.ts` | Service laporan besar, perlu dipisah per report/use-case |
| `apps/api/src/modules/attendance-class/attendance-class.service.ts` | Banyak aturan kelas, eligibility, teacher check-in/out dalam 1 service |
| `apps/api/src/modules/attendance-gate/attendance-gate.service.ts` | Banyak aturan gate/mushola/QR/override dalam 1 service |
| `apps/api/src/modules/reconciliation/reconciliation.service.ts` | Rule engine masih berbentuk procedural service besar |
| `apps/web/src/app/pages/admin/AdminPages.jsx` | Banyak halaman admin digabung 1 file |
| `apps/web/src/app/SchoolHubApp.tsx` | Shell routing, auth, sidebar, layout, role access dalam 1 file |

---

## 3. Hasil Pemetaan VPS / Production Existing

### 3.1 Lokasi deployment

Production/beta existing berada di:

```text
/opt/schoolhub
```

Akses SSH yang tercatat di dokumentasi lama:

```text
user: schoolhub
port: 9103
host: 157.15.40.21
```

Akses saat pemetaan berhasil menggunakan SSH key lokal, user `schoolhub`, dengan group `sudo` dan `docker`.

### 3.2 Container aktif

| Container | Status saat pemetaan |
|---|---|
| `schoolhub-postgres` | healthy |
| `schoolhub-redis` | healthy |
| `schoolhub-api-1` | healthy |
| `schoolhub-worker` | healthy |
| `schoolhub-web` | running |
| `schoolhub-nginx` | running, publish port 80 |

### 3.3 Health production saat pemetaan

```text
/health/live  -> status ok
/health/ready -> status ready
```

Worker health file menunjukkan job berikut sukses:

- `auto-missed`
- `reconciliation`

### 3.4 Service systemd terkait

| Unit | Status | Fungsi |
|---|---|---|
| `schoolhub-cloudflared-trial.service` | active running | Cloudflare Quick Tunnel sementara |
| `schoolhub-db-backup.timer` | active waiting | Backup DB berkala |
| `schoolhub-health-alert.timer` | active waiting | Health alert berkala |
| `schoolhub-prod.service` | inactive/dead | Unit compose manual/oneshot |
| `schoolhub-db-backup.service` | inactive/dead | Job backup oneshot |
| `schoolhub-health-alert.service` | inactive/dead | Job health alert oneshot |

### 3.5 Environment keys production

`.env` production ada di `/opt/schoolhub/.env`, permission `600`. Key yang ada mencakup:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `SESSION_TTL_MS`
- `REFRESH_TTL_MS`
- `WORKER_TOKEN`
- `READER_SECRET_ENCRYPTION_KEY`
- `READER_SIGNATURE_SKEW_MS`
- `READER_NONCE_TTL_MS`
- `LOGIN_MAX_FAILED_ATTEMPTS`
- `LOGIN_WINDOW_MS`
- `LOGIN_LOCK_MS`
- `CORS_ORIGIN`
- `PUBLIC_APP_ORIGIN`
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`
- `DEFAULT_USER_PASSWORD`
- `DEVELOPER_USERNAME`, `DEVELOPER_PASSWORD`
- `ANDROID_READER_*`

Nilai secret tidak dibaca dan tidak dimasukkan ke dokumen ini.

### 3.6 Backup production

Backup database tersedia di:

```text
/home/schoolhub/backups/database/schoolhub-*.sql.gz
```

Script backup:

```text
scripts/backup_database.sh
```

Retention default: 14 hari.

---

## 4. Tujuan Produk Absensi v2

### 4.1 Tujuan utama

1. Menghasilkan sistem absensi sekolah yang **lebih akurat** daripada absensi kelas manual biasa.
2. Menggabungkan bukti fisik gerbang/mushola dengan input guru di kelas.
3. Mendeteksi anomali seperti siswa masuk gerbang tetapi bolos kelas, guru tidak membuka sesi, scan ganda, keluar tanpa masuk, atau belum scan ibadah wajib.
4. Memberi dashboard sederhana untuk Admin/TU, Guru Mapel, Guru Piket, Operator IT, Siswa, dan Developer.
5. Menyediakan laporan siap cetak/unduh untuk kebutuhan sekolah.
6. Menyediakan arsitektur full Node.js/TypeScript yang mudah dibangun ulang via Google AI Studio.

### 4.2 Prinsip rebuild

1. **Full TypeScript** untuk API, web, worker, dan script operasional.
2. **Modular by feature**, bukan satu file besar.
3. **Security by default**, tanpa fallback secret production.
4. **Audit-first**, setiap perubahan sensitif wajib punya alasan dan jejak.
5. **Policy-driven**, aturan absensi bisa dikonfigurasi tanpa ubah kode.
6. **Reader official path**, scan produksi harus lewat reader resmi bersignature.
7. **Simple operator UX**, istilah teknis disembunyikan dari operator/guru.
8. **Migration-friendly**, data existing bisa diekspor/import ke versi baru.

---

## 5. Stakeholder dan Persona

| Persona | Deskripsi | Kebutuhan utama |
|---|---|---|
| Admin/TU | Pengelola data sekolah dan laporan | Kelola akun, kelas, jadwal, laporan, anomali |
| Operator IT | Pengelola perangkat dan sistem | Aktivasi scanner, kartu, QR, health, audit |
| Guru Mapel | Pengajar yang mencatat presensi kelas | Buka sesi, isi presensi, tutup sesi, koreksi |
| Guru Piket | Petugas harian disiplin/monitoring | Pantau masalah, catatan piket, bantu verifikasi |
| Siswa | Pemilik data kehadiran | Melihat riwayat kehadiran dan notifikasi |
| Developer | Pengelola teknis tingkat lanjut | Health detail, cleanup aman, kontrol tutorial |
| Kepala Madrasah/Waka | Pembaca laporan | Rekap terpercaya dan mudah dicetak |
| Petugas Gerbang/Mushola | Operator scanner | Scan cepat, feedback jelas, offline queue |

---

## 6. Role dan Hak Akses

### 6.1 Role sistem

```text
ADMIN_TU
GURU_MAPEL
GURU_PIKET
SISWA
OPERATOR_IT
DEVELOPER
```

### 6.2 Ringkasan akses

| Fitur | Admin/TU | Operator IT | Guru Piket | Guru Mapel | Siswa | Developer |
|---|---:|---:|---:|---:|---:|---:|
| Login/logout | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Dashboard admin | ✓ | - | - | - | - | ✓ |
| Dashboard operator | - | ✓ | - | - | - | ✓ |
| Dashboard piket | - | - | ✓ | - | - | ✓ |
| Kelola akun | ✓ | ✓ | - | - | - | ✓ |
| Hapus permanen user | - | - | - | - | - | ✓ |
| Kelola kelas/mapel/jadwal | ✓ | ✓ | - | - | - | ✓ |
| Isi presensi kelas | opsional | - | opsional | ✓ | - | opsional |
| Koreksi presensi | opsional | - | opsional | ✓ | - | opsional |
| Catatan piket | ✓ | ✓ | ✓ | - | - | ✓ |
| Kelola perangkat/QR/kartu | ✓ | ✓ | - | - | - | ✓ |
| Laporan | ✓ | ✓ | ✓ | terbatas | lihat sendiri | ✓ |
| Audit log | ✓ | ✓ | - | - | - | ✓ |
| System cleanup | - | - | - | - | - | ✓ |

---

## 7. Scope Produk

### 7.1 In-scope MVP rebuild

1. Auth JWT + refresh session + cookie httpOnly.
2. Role-based access control.
3. Master data user, kelas, mapel, tahun ajaran, semester, ruang.
4. Enrollment siswa ke kelas.
5. Jadwal mingguan dan sesi kelas.
6. Absensi gerbang masuk/keluar.
7. Absensi mushola Dhuha/Dzuhur/Ashar.
8. QR credential siswa/guru.
9. Web/PWA scanner resmi full Node.js-compatible.
10. Device reader provisioning + HMAC signed request.
11. Absensi kelas oleh guru.
12. Teacher check-in/check-out per sesi.
13. Eligibility lock: siswa belum memenuhi syarat tidak bisa ditandai Hadir/Telat.
14. Override manual dengan alasan dan scope.
15. Rekonsiliasi otomatis via worker.
16. Flag anomali + workflow tindak lanjut.
17. Laporan dashboard, rekap kelas/siswa/mapel/guru, export CSV/XLSX.
18. Audit log tamper-evident hash chain.
19. Notifikasi sederhana.
20. Catatan piket.
21. Health check dan backup script.

### 7.2 Out-of-scope MVP rebuild

1. Integrasi hardware RFID fisik tingkat rendah selain endpoint reader.
2. Aplikasi mobile native Kotlin/Swift baru.
3. Face recognition/biometric attendance.
4. Multi-school SaaS tenant penuh.
5. Payment/billing.
6. Integrasi Dapodik/EMIS otomatis.
7. Kubernetes.
8. PDF generator kompleks; cukup print web + XLSX/CSV dulu.

### 7.3 Phase lanjutan

| Phase | Fokus |
|---|---|
| Phase 1 | Core absensi, role, QR, kelas, rekonsiliasi, laporan |
| Phase 2 | PWA scanner hardened, offline queue, monitoring operasional |
| Phase 3 | Integrasi hardware RFID/IoT, domain permanen, scale API |
| Phase 4 | Analytics lanjut, multi-tahun, dashboard pimpinan, SLA monitoring |

---

## 8. Pemetaan Fitur Existing

### 8.1 Auth

Fitur existing:

- Login username/password.
- JWT access token.
- Refresh token dengan rotasi session.
- Session disimpan di `AuthSession`.
- Logout current session.
- Logout all sessions.
- Login rate limit memakai Redis dengan fallback memory.
- Audit login success/failed/locked.
- Cookie auth httpOnly disediakan backend.

Requirement v2:

- Tidak boleh ada fallback secret di production.
- Access token pendek, refresh token di cookie httpOnly.
- Refresh token rotation wajib mendeteksi reuse.
- Semua login failure diaudit tanpa membocorkan apakah username ada.

### 8.2 Identity dan master user

Fitur existing:

- CRUD user.
- Aktivasi/nonaktif user.
- Hapus permanen khusus Developer.
- Import user dari JSON/CSV/XLSX.
- `me` dan `update me`.
- Proteksi role Developer.
- Session user dicabut saat user dinonaktifkan.

Requirement v2:

- User tidak dihapus jika punya riwayat kecuali mode developer dan data aman.
- Password minimal 8 karakter.
- Username unique.
- Role tidak boleh dinaikkan ke Developer kecuali aktor Developer.

### 8.3 Academic

Fitur existing:

- Tahun ajaran.
- Semester.
- Ruang.
- Kelas.
- Mapel.
- Enrollment siswa.
- Import akademik.
- Template import CSV.

Requirement v2:

- Kelas dan mapel harus unique berdasarkan kode.
- Enrollment unique per `classId + studentId`.
- Data akademik harus bisa nonaktif/arsip tanpa merusak riwayat lama.

### 8.4 Scheduling

Fitur existing:

- Jadwal mingguan.
- Generate sesi dari jadwal mingguan.
- Buat sesi manual.
- Update sesi.
- Filter sesi berdasarkan tanggal, guru, kelas.
- Status sesi: `SCHEDULED`, `OPEN`, `CLOSED`, `MISSED`.

Requirement v2:

- Sesi tidak boleh overlap untuk guru/kelas/ruang pada waktu yang sama kecuali ada override admin.
- Worker auto-missed menandai sesi yang tidak dibuka melewati grace period.
- Sesi yang sudah `CLOSED` atau `MISSED` masuk antrean rekonsiliasi.

### 8.5 Attendance Gate

Fitur existing:

- Log gerbang IN/OUT.
- Manual tap oleh petugas dengan alasan.
- Reader signed request untuk RFID/card.
- QR Android signed request.
- Duplicate scan window.
- OUT tanpa IN ditolak kecuali override.
- IN berulang ditolak kecuali override.
- Siswa OUT wajib scan Ashar jika punya jadwal sore dan policy aktif.

Requirement v2:

- Jalur produksi scan tidak boleh menerima `userId` mentah dari client publik.
- Identitas user harus didapat dari QR credential/card yang valid.
- Waktu keputusan harus memakai waktu server.
- Client timestamp hanya metadata.
- Semua scan resmi wajib signature HMAC.

### 8.6 Attendance Mushola

Fitur existing:

- Scan mushola mencatat `PrayerAttendanceLog`.
- Jenis ibadah ditentukan server dari rentang waktu policy.
- Unique per siswa + tanggal + prayerType.
- Duplicate prayer scan ditolak.

Requirement v2:

- Client tidak boleh menentukan prayerType produksi.
- Admin boleh override manual dengan alasan jika perangkat bermasalah.

### 8.7 Attendance Class

Fitur existing:

- Guru melihat sesi hari ini.
- Guru membuka sesi sebagai check-in.
- Guru menyimpan presensi siswa.
- Guru menutup sesi sebagai check-out.
- Early checkout butuh alasan.
- Roster dihitung dari enrollment kelas.
- Eligibility lock berdasarkan gate/mushola/override.
- Koreksi presensi dengan alasan.
- Teacher presence memiliki status `HADIR`, `TELAT`, `EXCUSED_ABSENCE`, `ALPA_MENGAJAR`.

Requirement v2:

- Guru hanya boleh membuka sesi miliknya kecuali admin/piket/developer.
- `HADIR`/`TELAT` siswa bisa dikunci jika syarat policy belum lengkap.
- `IZIN`, `SAKIT`, `ALPA` tetap boleh dicatat sesuai kondisi.
- Koreksi wajib menyimpan before/after immutable.

### 8.8 Reconciliation

Fitur existing:

Worker menjalankan:

- `auto-missed`
- `reconciliation`

Flag yang sudah didukung:

- `BOLOS_KELAS`
- `LUPA_TAP_GERBANG`
- `TIDAK_MENGAJAR`
- `ANOMALI_BUKA_TANPA_GERBANG`
- `BELUM_SCAN_GERBANG`
- `BELUM_SCAN_DHUHA`
- `BELUM_SCAN_DZUHUR`
- `BELUM_SCAN_ASHAR`
- `BELUM_SCAN_KELUAR_GERBANG`
- `ALPA`
- `OUT_TANPA_IN`
- `IN_BERULANG`
- `OUT_BERULANG`
- `SCAN_DUPLIKAT`
- `OUT_TERLALU_CEPAT`
- `GATE_IN_TANPA_PRESENSI`
- `PRESENSI_DI_LUAR_ROSTER`
- `HADIR_VIA_OVERRIDE`
- `KOREKSI_BERULANG`
- `OVERRIDE_BERLEBIHAN`
- `READER_ANOMALY`
- `POLICY_CHANGED_DURING_ATTENDANCE`
- `EXPORT_TIDAK_WAJAR`

Requirement v2:

- Rule reconciliation harus dipisah sebagai rule engine kecil per rule.
- Setiap flag memiliki fingerprint idempotent.
- Flag memiliki status, review status, priority, assignee, due date, evidence, recommendation.
- Resolve/escalate wajib alasan.

### 8.9 Device Reader dan QR Credential

Fitur existing:

- Device reader lama: `/devices/readers`.
- Device reader baru Android: `/device-readers`.
- Provisioning Android: start dan complete.
- Rotate/revoke secret reader.
- Allowed modes: `GATE_IN`, `GATE_OUT`, `MUSHOLA`, `CHECK_ONLY`.
- QR credential format: `schoolhub:qr:v1:QR_...`.
- QR code di DB disimpan hash; plaintext hanya saat generate/export dan bisa dienkripsi.

Requirement v2:

- Untuk full Node.js, reader official sebaiknya berupa **PWA Scanner** atau **Node/Electron kiosk** agar tidak perlu Kotlin.
- Jika PWA, secret device harus disimpan minimal di IndexedDB + WebCrypto, dengan peringatan bahwa keamanan tidak sekuat Android Keystore.
- Untuk produksi tinggi, opsi Android native tetap bisa menjadi extension point.

### 8.10 Reporting

Fitur existing:

- Dashboard hari ini.
- Trend 7 hari.
- Live monitor polling + SSE endpoint.
- My attendance untuk guru/siswa.
- Rekap kelas.
- Rekap siswa.
- Rekap mapel.
- Rekap guru.
- Teacher monthly.
- Audit coverage.
- Export CSV/XLSX dengan checksum.

Requirement v2:

- Export laporan wajib diaudit.
- Export besar harus dipaginasi atau dibuat async job jika data membesar.
- Data laporan harus menampilkan warning jika ada flag OPEN terkait periode.

### 8.11 Audit

Fitur existing:

- AuditEntry berisi actor, role, module, action, resource, reason, requestIp, requestDevice, before, after.
- Hash-chain memakai canonical JSON.
- Endpoint verify chain.

Requirement v2:

- Semua mutasi sensitif memakai helper audit yang sama.
- Audit tidak boleh bisa diubah dari UI.
- Verify chain bisa dijalankan Developer/Admin IT.

### 8.12 Frontend UX existing

Route existing:

```text
/login
/admin/dashboard
/admin/it-dashboard
/admin/picket-dashboard
/admin/sessions
/admin/history
/admin/anomaly
/admin/picket
/admin/master-data
/admin/schedule
/admin/devices
/admin/reports
/admin/live-monitor
/admin/settings
/admin/audit
/admin/teacher-leaves
/admin/notifications
/admin/developer-control
/admin/help
/guru/dashboard
/guru/presensi
/guru/koreksi
/guru/rekap
/guru/izin
/guru/kehadiran-saya
/guru/notifikasi
/guru/panduan
/siswa/dashboard
/siswa/notifikasi
/siswa/panduan
```

Requirement v2:

- Route dipecah menjadi file/page modular.
- Role menu tetap dipertahankan.
- Bahasa UI tetap ramah operator/guru.
- Mobile responsive untuk guru dan scanner.
- Tutorial per role dipertahankan.

---

## 9. Model Data Konseptual v2

### 9.1 Enum inti

```text
Role = ADMIN_TU | GURU_MAPEL | GURU_PIKET | SISWA | OPERATOR_IT | DEVELOPER
SessionStatus = SCHEDULED | OPEN | CLOSED | MISSED
StudentAttendanceStatus = HADIR | TELAT | IZIN | SAKIT | ALPA
TeacherSessionStatus = HADIR | TELAT | EXCUSED_ABSENCE | ALPA_MENGAJAR
CardStatus = ACTIVE | LOST | INACTIVE
GateDirection = IN | OUT
ReaderType = GATE | MUSHOLA | CLASS | MANUAL | QR_ANDROID | PWA_SCANNER
PrayerType = DHUHA | DZUHUR | ASHAR
DeviceReaderStatus = ACTIVE | INACTIVE | REVOKED
QrCredentialStatus = ACTIVE | REVOKED | LOST | EXPIRED
AndroidReaderMode/PwaReaderMode = GATE_IN | GATE_OUT | MUSHOLA | CHECK_ONLY
AttendanceOverrideScope = CLASS_ELIGIBILITY | ASHAR_CHECKOUT | GATE_IN | GATE_OUT | ALL
OverrideApprovalStatus = APPROVED | PENDING_REVIEW | REJECTED | REVOKED | EXPIRED
```

### 9.2 Entitas utama

| Entity | Fungsi |
|---|---|
| `User` | Semua aktor: admin, guru, siswa, operator, developer |
| `AuthSession` | Refresh token/session rotation |
| `SchoolClass` | Kelas sekolah |
| `Subject` | Mata pelajaran |
| `AcademicYear` | Tahun ajaran |
| `Semester` | Semester |
| `Room` | Ruang kelas |
| `ClassEnrollment` | Relasi siswa-kelas |
| `WeeklySchedule` | Jadwal berulang mingguan |
| `Session` | Sesi pelajaran aktual |
| `StudentAttendance` | Presensi siswa per sesi |
| `TeacherSessionPresence` | Check-in/out guru per sesi |
| `GateLog` | Scan gerbang IN/OUT |
| `PrayerAttendanceLog` | Scan mushola Dhuha/Dzuhur/Ashar |
| `AttendancePolicy` | Aturan absensi dinamis |
| `GeofencePolicy` | Aturan lokasi sekolah |
| `AttendanceOverride` | Verifikasi manual/timeboxed |
| `AttendanceCorrectionEvent` | Riwayat koreksi immutable |
| `ReconciliationFlag` | Anomali hasil rekonsiliasi |
| `ReconciliationEscalation` | Eskalasi flag |
| `DeviceReader` | Perangkat scanner resmi |
| `SmartCard` | Kartu RFID/smart card |
| `QrCredential` | Credential QR opaque |
| `AuditEntry` | Audit trail tamper-evident |
| `AuditChainState` | State hash-chain audit |
| `Notification` | Notifikasi user/role |
| `PicketNote` | Buku/catatan piket |
| `TeacherLeave` | Izin/sakit/dinas luar guru |
| `UserTutorialState` | Tutorial onboarding per user |
| `Mobile/PwaReaderVersion` | Versi reader/scanner |

### 9.3 Relasi penting

```text
User(SISWA) 1..n ClassEnrollment n..1 SchoolClass
SchoolClass 1..n Session
Subject 1..n Session
User(GURU_MAPEL) 1..n Session
Session 1..n StudentAttendance
Session 1..n TeacherSessionPresence
User 1..n GateLog
User(SISWA) 1..n PrayerAttendanceLog
Session/User 1..n ReconciliationFlag
User 1..n QrCredential
DeviceReader menerima signed scan untuk GateLog/PrayerAttendanceLog
AuditEntry mencatat semua mutasi sensitif
```

### 9.4 Index wajib

Minimal index v2:

- `User(role, active)`
- `Session(status, startsAt)`
- `Session(classId, startsAt)`
- `Session(teacherId, startsAt)`
- `StudentAttendance(sessionId, studentId)` unique
- `GateLog(userId, direction, tappedAt)`
- `PrayerAttendanceLog(studentId, prayerType, attendanceDate)` unique
- `ReconciliationFlag(status, priority, type, createdAt)`
- `AuditEntry(module, createdAt)`
- `AuditEntry(actorId, createdAt)`
- `Notification(userId, readAt, createdAt)`
- `QrCredential(codeHash)` unique
- `DeviceReader(deviceId, status)`

---

## 10. Arsitektur Existing

### 10.1 Diagram deployment existing

```text
User browser / Android reader
        |
        v
Cloudflare Quick Tunnel / domain sementara
        |
        v
Nginx reverse proxy :80
   |                 |
   v                 v
React static web     NestJS API :3000
                     |
        +------------+------------+
        |                         |
        v                         v
 PostgreSQL 16                Redis 7
        ^                         ^
        |                         |
        +----------- Worker Node.js
                    auto-missed + reconciliation
```

### 10.2 Jalur scan QR official existing

```text
QR credential siswa/guru
  -> Android APK resmi
  -> canonical JSON body
  -> HMAC signed request
  -> POST /api/v1/attendance/qr-reader-scan
  -> server validasi DeviceReader + nonce + timestamp + body hash + signature
  -> validasi QR credential aktif
  -> jalankan AttendancePolicy
  -> buat GateLog / PrayerAttendanceLog / check-only response
  -> audit + flag security bila perlu
```

### 10.3 Jalur presensi kelas existing

```text
Guru login
  -> pilih sesi
  -> POST /attendance/class-sessions/:id/open
  -> sistem validasi role, owner sesi, geofence/policy
  -> TeacherSessionPresence checkIn
  -> GET roster + eligibility
  -> guru isi status siswa
  -> PUT /attendance/class-sessions/:id/attendance
  -> StudentAttendance upsert
  -> POST /attendance/class-sessions/:id/close
  -> TeacherSessionPresence checkOut
  -> Session CLOSED
  -> worker reconciliation membuat flags
```

---

## 11. Arsitektur Rebuild Full Node.js v2

### 11.1 Keputusan arsitektur rekomendasi

Gunakan monorepo TypeScript berbasis Node.js:

```text
apps/
  api/              # Node.js API: NestJS atau Fastify TypeScript
  web/              # React/Next.js frontend dashboard
  scanner-pwa/      # PWA scanner web berbasis camera browser
  worker/           # Node.js worker BullMQ/cron loop
packages/
  db/               # Prisma schema/client
  shared/           # shared types, zod schemas, constants
  security/         # canonical json, HMAC, audit hash, QR utilities
  ui/               # design system React reusable
  config/           # env validation
prisma/
  schema.prisma
  migrations/
scripts/
  deploy, backup, seed, smoke
ops/
  nginx, docker, systemd
```

### 11.2 Pilihan framework

Rekomendasi utama:

| Layer | Rekomendasi | Alasan |
|---|---|---|
| API | NestJS + Fastify adapter atau Fastify modular | Cocok untuk module/guard/DI; existing mirip NestJS |
| Frontend dashboard | Next.js App Router atau React Vite | Next.js memberi route modular; Vite lebih sederhana |
| Scanner | React PWA + browser camera + WebCrypto | Full Node/web, tanpa Kotlin |
| Worker | Node.js TypeScript + BullMQ/Redis atau interval safe runner | Job retry dan observability lebih baik |
| DB | PostgreSQL + Prisma | Existing sudah Prisma, migrasi mudah |
| Cache/queue | Redis | Rate limit, nonce anti-replay, cache, queue |
| Validation | Zod atau class-validator | DTO runtime validation |
| Auth | JWT access + refresh cookie | Existing proven pattern |
| Test | Vitest/Jest + Playwright | Full TS test stack |

### 11.3 Diagram arsitektur target v2

```text
                         +----------------------+
                         | Cloudflare / Domain  |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         | Nginx / Caddy Proxy  |
                         +-----+-----------+----+
                               |           |
                               v           v
                    +-------------+   +----------------+
                    | Web App     |   | Scanner PWA    |
                    | Admin/Guru  |   | Gate/Mushola   |
                    +------+------+   +-------+--------+
                           |                  |
                           +---------+--------+
                                     v
                         +----------------------+
                         | Node.js API          |
                         | Auth/RBAC/Attendance |
                         +----+-----------+-----+
                              |           |
                              v           v
                    +-------------+   +----------------+
                    | PostgreSQL  |   | Redis          |
                    | Prisma      |   | rate/nonce/job |
                    +------+------+   +-------+--------+
                           ^                  ^
                           |                  |
                           +---------+--------+
                                     v
                         +----------------------+
                         | Node.js Worker       |
                         | auto-missed/reconcile|
                         +----------------------+
```

### 11.4 Modul backend target

```text
api/src/modules/
  auth/
  identity/
  academic/
  scheduling/
  attendance-gate/
  attendance-prayer/
  attendance-class/
  attendance-policy/
  device-reader/
  qr-credential/
  reconciliation/
  reporting/
  audit/
  notification/
  picket-note/
  teacher-leave/
  tutorial/
  health/
  system-cleanup/
```

Perbedaan dari existing:

- Pisahkan `attendance-gate` dan `attendance-prayer` agar service tidak terlalu besar.
- Pisahkan `attendance-policy` dari scan service.
- Pisahkan `reconciliation/rules/*` per rule.
- Pisahkan `reporting/reports/*` per report type.
- Pisahkan `device-reader/provisioning`, `device-reader/signature`, dan `device-reader/admin`.

### 11.5 Scanner full Node.js/PWA

Karena user meminta full Node.js, Android Kotlin dapat diganti MVP dengan **Scanner PWA**:

Fitur PWA:

1. Login/provision perangkat menggunakan kode aktivasi dari admin.
2. Simpan `deviceId` dan `readerSecret` lokal.
3. Scan QR dengan kamera browser.
4. Buat canonical JSON body.
5. Signature memakai WebCrypto HMAC-SHA256.
6. Kirim ke `/attendance/qr-reader-scan`.
7. Tampilkan feedback besar: hijau/merah/kuning.
8. Offline queue terenkripsi lokal memakai WebCrypto + IndexedDB.
9. Mode: Gerbang Masuk, Gerbang Keluar, Mushola, Check Only.
10. Halaman status koneksi, antrean, riwayat scan.

Catatan keamanan:

- PWA tidak sekuat Android Keystore untuk menyimpan secret.
- Untuk sekolah/beta full Node.js, PWA cukup jika perangkat terkunci dan operator terbatas.
- Untuk produksi jangka panjang, Android native tetap menjadi opsi hardening.

---

## 12. Functional Requirements Detail

### 12.1 Auth & Session

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| AUTH-01 | User bisa login dengan username/password | Response berisi user profile dan access token; cookie refresh terset |
| AUTH-02 | Refresh token rotation | Refresh lama langsung revoked dan tidak bisa dipakai ulang |
| AUTH-03 | Logout current session | Session aktif revoked |
| AUTH-04 | Logout all | Semua session user revoked |
| AUTH-05 | Brute force protection | Setelah threshold gagal, login terkunci sementara |
| AUTH-06 | Audit auth | Success, failed, locked, logout tercatat |

### 12.2 User & Role

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| IDN-01 | Admin membuat user | Username unique, role valid, password hash |
| IDN-02 | Admin update user | Perubahan tercatat audit |
| IDN-03 | Nonaktifkan user | User tidak bisa login, riwayat tetap ada |
| IDN-04 | Developer hapus permanen user test | Ditolak jika user punya riwayat protected |
| IDN-05 | Import user | Preview valid/invalid sebelum commit |
| IDN-06 | User update profil sendiri | Hanya field aman yang bisa diubah |

### 12.3 Akademik

| ID | Requirement |
|---|---|
| ACD-01 | CRUD tahun ajaran |
| ACD-02 | CRUD semester |
| ACD-03 | CRUD ruang |
| ACD-04 | CRUD kelas |
| ACD-05 | CRUD mapel |
| ACD-06 | Daftarkan siswa ke kelas |
| ACD-07 | Import data akademik preview/commit |

### 12.4 Jadwal & Sesi

| ID | Requirement |
|---|---|
| SCH-01 | Admin membuat jadwal mingguan |
| SCH-02 | Admin generate sesi dari jadwal mingguan |
| SCH-03 | Admin membuat sesi manual |
| SCH-04 | Filter sesi tanggal/guru/kelas |
| SCH-05 | Worker menandai sesi `MISSED` jika tidak dibuka |
| SCH-06 | Sesi `CLOSED/MISSED` masuk rekonsiliasi |

### 12.5 QR Credential

| ID | Requirement |
|---|---|
| QR-01 | Generate QR untuk user |
| QR-02 | Rotate QR user dan revoke QR lama |
| QR-03 | Revoke QR karena hilang/expired |
| QR-04 | Bulk generate QR per kelas/semua aktif |
| QR-05 | Export data kartu QR untuk cetak |
| QR-06 | Plain QR tidak tampil di list biasa |
| QR-07 | Server menyimpan `codeHash`, bukan mengandalkan plaintext |

### 12.6 Device Reader / Scanner PWA

| ID | Requirement |
|---|---|
| DEV-01 | Admin membuat kode aktivasi scanner |
| DEV-02 | Scanner complete provisioning memakai token sekali pakai |
| DEV-03 | Reader secret hanya muncul saat provisioning |
| DEV-04 | Device bisa ACTIVE/INACTIVE/REVOKED |
| DEV-05 | Rotate secret device |
| DEV-06 | Allowed modes membatasi fungsi scanner |
| DEV-07 | Scan official wajib HMAC signature |
| DEV-08 | Nonce anti replay di Redis |
| DEV-09 | App/PWA version minimum bisa dipaksa |

### 12.7 Absensi Gerbang

| ID | Requirement |
|---|---|
| GATE-01 | Scan GATE_IN membuat GateLog IN |
| GATE-02 | Scan GATE_OUT membuat GateLog OUT jika valid |
| GATE-03 | OUT tanpa IN ditolak kecuali override |
| GATE-04 | IN berulang ditolak kecuali override |
| GATE-05 | Duplicate scan window ditolak |
| GATE-06 | Siswa jadwal sore wajib Ashar sebelum OUT jika policy aktif |
| GATE-07 | Staff/guru gate in/out bisa diwajibkan via policy |

### 12.8 Absensi Mushola

| ID | Requirement |
|---|---|
| PRY-01 | Scan mode MUSHOLA mencatat prayer attendance |
| PRY-02 | Server menentukan prayerType dari waktu policy |
| PRY-03 | Unique per siswa/tanggal/prayerType |
| PRY-04 | Duplicate ditolak |
| PRY-05 | Kewajiban Dhuha/Dzuhur/Ashar bisa dinyalakan/dimatikan |

### 12.9 Presensi Kelas

| ID | Requirement |
|---|---|
| CLS-01 | Guru melihat sesi miliknya |
| CLS-02 | Guru membuka sesi / check-in |
| CLS-03 | Sistem validasi geofence jika policy aktif |
| CLS-04 | Sistem validasi guru gate-in jika policy aktif |
| CLS-05 | Guru melihat roster siswa |
| CLS-06 | Roster menunjukkan eligibility dan alasan lock |
| CLS-07 | Guru menyimpan batch attendance |
| CLS-08 | `HADIR/TELAT` ditolak untuk siswa locked |
| CLS-09 | Guru menutup sesi / check-out |
| CLS-10 | Early checkout wajib alasan |
| CLS-11 | Koreksi attendance wajib alasan dan audit event |

### 12.10 Override Manual

| ID | Requirement |
|---|---|
| OVR-01 | Admin/piket bisa membuat override dengan scope |
| OVR-02 | Override wajib alasan minimal |
| OVR-03 | Override punya masa berlaku |
| OVR-04 | Scope `ALL` hanya Admin/Developer |
| OVR-05 | Override bisa pending review bila policy step-up aktif |
| OVR-06 | Override bisa approve/revoke oleh Admin/Developer |
| OVR-07 | Penggunaan override membuat flag review |

### 12.11 Rekonsiliasi

| ID | Rule | Hasil |
|---|---|---|
| REC-01 | Siswa gate IN tetapi tidak ada presensi kelas | `GATE_IN_TANPA_PRESENSI` |
| REC-02 | Siswa ALPA tetapi gate IN | `BOLOS_KELAS` |
| REC-03 | Siswa ALPA dan tidak gate IN | `ALPA` |
| REC-04 | Siswa HADIR/TELAT tanpa gate IN | `LUPA_TAP_GERBANG` |
| REC-05 | Siswa hadir tapi belum Dhuha | `BELUM_SCAN_DHUHA` |
| REC-06 | Siswa hadir tapi belum Dzuhur | `BELUM_SCAN_DZUHUR` |
| REC-07 | Siswa jadwal sore belum Ashar | `BELUM_SCAN_ASHAR` |
| REC-08 | Guru tidak mengajar | `TIDAK_MENGAJAR` |
| REC-09 | Guru buka kelas tanpa gate IN | `ANOMALI_BUKA_TANPA_GERBANG` |
| REC-10 | OUT tanpa IN | `OUT_TANPA_IN` |
| REC-11 | IN berulang | `IN_BERULANG` |
| REC-12 | OUT terlalu cepat | `OUT_TERLALU_CEPAT` |

### 12.12 Reporting

| ID | Requirement |
|---|---|
| RPT-01 | Dashboard harian |
| RPT-02 | Trend periode |
| RPT-03 | Live monitor |
| RPT-04 | My attendance guru/siswa |
| RPT-05 | Rekap kelas |
| RPT-06 | Rekap siswa |
| RPT-07 | Rekap mapel |
| RPT-08 | Rekap guru |
| RPT-09 | Teacher monthly |
| RPT-10 | Audit coverage |
| RPT-11 | Export CSV/XLSX |
| RPT-12 | Export audit + checksum |

### 12.13 Audit & Security

| ID | Requirement |
|---|---|
| AUD-01 | Semua mutasi penting masuk audit |
| AUD-02 | Audit memakai canonical JSON hash-chain |
| AUD-03 | Verify audit chain tersedia untuk admin/developer |
| AUD-04 | Audit mencatat actor, role, IP, user-agent, before/after |
| SEC-01 | CORS production strict |
| SEC-02 | CSP dan security headers |
| SEC-03 | Rate limit login/API/scan |
| SEC-04 | Secret env wajib tervalidasi saat boot |
| SEC-05 | Internal endpoint worker tidak publik |

---

## 13. API Contract High-Level v2

Base path:

```text
/api/v1
```

### 13.1 Auth

```http
POST /auth/login
POST /auth/refresh
POST /auth/logout
POST /auth/logout-all
```

### 13.2 Identity

```http
GET    /identity/users
POST   /identity/users
PATCH  /identity/users/:id
DELETE /identity/users/:id
DELETE /identity/users/:id/permanent
POST   /identity/users/import/preview
POST   /identity/users/import/commit
POST   /identity/users/import/file/preview
POST   /identity/users/import/file/commit
GET    /identity/me
PATCH  /identity/me
```

### 13.3 Academic

```http
GET/POST/PATCH /academic/years
GET/POST/PATCH /academic/semesters
GET/POST/PATCH /academic/rooms
GET/POST/PATCH /academic/classes
GET/POST/PATCH /academic/subjects
GET           /academic/students
POST          /academic/enrollments
GET           /academic/import/template
POST          /academic/import/preview
POST          /academic/import/commit
POST          /academic/import/file/preview
POST          /academic/import/file/commit
```

### 13.4 Scheduling

```http
GET   /schedules/weekly
POST  /schedules/weekly
PATCH /schedules/weekly/:id
POST  /schedules/weekly/:id/generate
GET   /schedules/sessions
POST  /schedules/sessions
PATCH /schedules/sessions/:id
```

### 13.5 Attendance

```http
GET  /attendance/policy
PUT  /attendance/policy
GET  /attendance/gate/logs
GET  /attendance/prayer/logs
POST /attendance/gate/tap                  # manual/admin only
POST /attendance/qr-scan                   # legacy/manual admin path
POST /attendance/reader-scan               # signed hardware/card path
POST /attendance/qr-reader-scan            # signed official QR path
POST /attendance/overrides
POST /attendance/overrides/:id/approve
POST /attendance/overrides/:id/revoke
```

### 13.6 Class Attendance

```http
GET   /attendance/class-sessions
POST  /attendance/class-sessions/:id/open
PUT   /attendance/class-sessions/:id/attendance
POST  /attendance/class-sessions/:id/close
GET   /attendance/class-sessions/:id/summary
GET   /attendance/class-sessions/:id/roster
PATCH /attendance/class-sessions/:id/attendance/:studentId
```

### 13.7 Device Reader

```http
GET   /device-readers
GET   /device-readers/:id/status
POST  /device-readers
POST  /device-readers/provision/start
POST  /device-readers/provision/complete
POST  /device-readers/:id/rotate-secret
POST  /device-readers/:id/revoke
PATCH /device-readers/:id
```

### 13.8 QR Credential

```http
GET  /qr-credentials/users/:userId
POST /qr-credentials/users/:userId/generate
POST /qr-credentials/users/:userId/rotate
POST /qr-credentials/:id/revoke
POST /qr-credentials/bulk-generate
GET  /qr-credentials/export/cards
GET  /qr-credentials/export/class/:classId/cards
```

### 13.9 Reconciliation

```http
GET   /reconciliation/flags
POST  /reconciliation/flags/:id/resolve
PATCH /reconciliation/flags/:id/workflow
POST  /reconciliation/flags/:id/escalate
POST  /internal/reconciliation/run       # worker only
POST  /internal/sessions/mark-missed     # worker only
```

### 13.10 Reporting

```http
GET /reports/dashboard
GET /reports/trend
GET /reports/live-monitor
GET /reports/live-monitor/stream
GET /reports/my-attendance
GET /reports/recap/classes
GET /reports/recap/students
GET /reports/recap/subjects
GET /reports/recap/teachers
GET /reports/teacher-monthly
GET /reports/audit-coverage
GET /reports/export
```

### 13.11 Supporting modules

```http
GET   /audit
GET   /audit/verify-chain
GET   /notifications
PATCH /notifications/:id/read
GET   /picket-notes
POST  /picket-notes
PATCH /picket-notes/:id
DELETE /picket-notes/:id
GET   /teacher-leaves
POST  /teacher-leaves
PATCH /teacher-leaves/:id/review
GET   /tutorials/me
POST  /tutorials/me/complete
POST  /tutorials/me/dismiss
GET   /health/live
GET   /health/ready
GET   /health/detail
GET   /system-cleanup/preview
POST  /system-cleanup/run
```

---

## 14. UI/UX Requirements v2

### 14.1 Prinsip UI

1. Bahasa Indonesia ramah, bukan istilah teknis mentah.
2. Role-based menu; user hanya melihat menu relevan.
3. Guru harus bisa menyelesaikan presensi kelas maksimal 5 langkah.
4. Operator scanner harus melihat feedback besar dan jelas.
5. Admin/TU harus punya dashboard “apa yang perlu dicek hari ini”.
6. Semua aksi berisiko memakai confirmation dialog.
7. Semua alasan wajib diberi counter panjang minimum.
8. Semua tabel punya empty state yang jelas.

### 14.2 Halaman Admin/TU

- Ringkasan Hari Ini
- Cek Sesi Kelas
- Riwayat Scan
- Cek Masalah
- Catatan Piket
- Akun & Data Sekolah
- Jadwal Kelas
- HP Scanner & Kartu
- Laporan Sekolah
- Aktivitas Sekarang
- Aturan Absensi
- Riwayat Perubahan
- Pengajuan Guru
- Notifikasi
- Panduan

### 14.3 Halaman Operator IT

- Cek Sistem
- HP Scanner & Kartu
- Aktivitas Sekarang
- Riwayat Perubahan
- Notifikasi
- Panduan Operator

### 14.4 Halaman Guru Piket

- Tugas Piket Hari Ini
- Catatan Piket
- Cek Sesi Kelas
- Cek Masalah
- Riwayat Scan
- Aktivitas Sekarang
- Notifikasi
- Panduan Piket

### 14.5 Halaman Guru Mapel

- Mulai Mengajar
- Isi Presensi Kelas
- Perbaiki Presensi
- Laporan Kelas Saya
- Izin/Sakit/Dinas
- Kehadiran Saya
- Notifikasi
- Panduan

### 14.6 Halaman Siswa

- Kehadiran Saya
- Notifikasi
- Panduan

### 14.7 Halaman Developer

- Pusat Kontrol Developer
- Health detail
- Kontrol tutorial
- Cleanup data aman
- Audit
- Master data/system pages sesuai kebutuhan

### 14.8 Scanner PWA UX

Halaman scanner:

1. Splash / check provisioning.
2. Setup server URL + kode aktivasi.
3. Home status: koneksi, mode, antrean, riwayat terakhir.
4. Scanner camera full-screen.
5. Feedback:
   - Hijau: scan berhasil.
   - Merah: ditolak server.
   - Kuning: antrean offline.
6. Riwayat 20 scan terakhir, QR dimasking.
7. Pengaturan: bunyi, getar, auto-open scanner, reset perangkat.
8. Bantuan troubleshooting.

---

## 15. Business Rules Detail

### 15.1 Aturan siswa normal

1. Siswa scan masuk gerbang.
2. Siswa scan Dhuha jika policy aktif.
3. Siswa scan Dzuhur jika policy aktif.
4. Guru membuka sesi kelas.
5. Sistem menghitung eligibility siswa.
6. Guru menandai siswa Hadir/Telat/Izin/Sakit/Alpa.
7. Jika siswa jadwal sore, siswa wajib scan Ashar sebelum pulang jika policy aktif.
8. Siswa scan keluar gerbang.
9. Worker melakukan rekonsiliasi.

### 15.2 Aturan guru normal

1. Guru scan masuk gerbang jika policy aktif.
2. Guru membuka sesi sebagai check-in.
3. Guru mengisi presensi siswa.
4. Guru menutup sesi sebagai check-out.
5. Guru scan keluar gerbang jika policy aktif.

### 15.3 Aturan lock presensi kelas

Jika policy `requireStudentClassEligibility = true`, siswa tidak boleh ditandai `HADIR/TELAT` bila salah satu syarat wajib belum lengkap:

- belum scan gerbang masuk;
- belum scan Dhuha;
- belum scan Dzuhur;
- tidak memiliki override aktif.

Status `IZIN`, `SAKIT`, `ALPA` tetap dapat dipilih.

### 15.4 Aturan scan pulang siswa jadwal sore

Jika:

- policy `requireStudentAsharForAfternoon = true`, dan
- siswa punya sesi yang berakhir >= `asharRequiredClassEndTime`, dan
- siswa belum scan Ashar, dan
- tidak ada override `ASHAR_CHECKOUT` / `ALL`,

maka scan `GATE_OUT` ditolak.

### 15.5 Aturan manual override

Override manual harus:

- punya alasan jelas;
- punya scope valid;
- punya expiry time;
- tercatat audit;
- dapat direview/revoke;
- dapat memunculkan flag `HADIR_VIA_OVERRIDE`.

---

## 16. Non-Functional Requirements

### 16.1 Performance

| Target | Nilai |
|---|---:|
| Login p95 | < 1000 ms |
| Dashboard p95 | < 1500 ms |
| Scan endpoint p95 | < 700 ms |
| Roster kelas 40 siswa | < 1000 ms |
| Export laporan kecil | < 5000 ms |
| Worker tick | Tidak overlap |

### 16.2 Reliability

- API health live/ready.
- Worker health file atau heartbeat table.
- Redis outage tidak boleh mematikan seluruh API, tapi nonce/signature official harus fail closed bila Redis diperlukan untuk anti-replay.
- Database migration harus idempotent via Prisma.
- Backup harian dengan retention.

### 16.3 Security

- Secret wajib dari env dan tervalidasi saat boot.
- JWT secret minimal 32 byte random.
- Worker token wajib kuat di production.
- Reader secret terenkripsi di DB.
- Password hash bcrypt/argon2.
- Rate limit login dan scan.
- CSP, X-Frame-Options, nosniff, Referrer-Policy.
- Internal endpoint tidak diekspos publik.
- Audit hash-chain.
- Jangan simpan QR plaintext kecuali terenkripsi dan hanya untuk export admin.

### 16.4 Privacy

- Siswa hanya bisa melihat data sendiri.
- Guru hanya bisa melihat siswa kelas yang dia ajar.
- Piket/Admin/Operator sesuai kebutuhan operasional.
- Export laporan diaudit.
- Riwayat scanner lokal hanya menampilkan masked QR.

### 16.5 Accessibility

- Kontras cukup.
- Button memiliki label.
- Empty/error/loading state jelas.
- Keyboard navigation untuk dashboard.
- Scanner feedback tidak hanya warna, juga teks dan suara/getar.

---

## 17. Deployment Architecture v2

### 17.1 Docker Compose target

Services minimal:

```text
postgres
redis
api
worker
web
scanner-pwa
reverse-proxy
```

### 17.2 Reverse proxy

Nginx/Caddy routing:

```text
/                         -> web
/scanner                  -> scanner-pwa
/api/v1                   -> api
/health/live              -> api /api/v1/health/live
/health/ready             -> api /api/v1/health/ready
/api/v1/internal/*        -> blocked public / only docker network
```

### 17.3 Env wajib

```env
NODE_ENV=production
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
JWT_EXPIRES_IN=15m
SESSION_TTL_MS=28800000
REFRESH_TTL_MS=604800000
WORKER_TOKEN=
READER_SECRET_ENCRYPTION_KEY=
READER_SIGNATURE_SKEW_MS=120000
READER_NONCE_TTL_MS=300000
CORS_ORIGIN=
PUBLIC_APP_ORIGIN=
LOGIN_MAX_FAILED_ATTEMPTS=5
LOGIN_WINDOW_MS=600000
LOGIN_LOCK_MS=600000
WORKER_AUTO_MISSED_INTERVAL_MS=15000
WORKER_RECONCILE_INTERVAL_MS=30000
```

### 17.4 Backup/restore

- Backup harian PostgreSQL gzip.
- Retention minimal 14 hari.
- Restore production wajib confirmation env.
- Restore test dilakukan berkala ke DB sementara.

### 17.5 Observability

- `/health/live`: proses hidup.
- `/health/ready`: DB dan Redis siap.
- `/health/detail`: latency DB/Redis, memory, uptime, worker heartbeat.
- Smoke monitor 15 menit atau 1 jam.
- Alert webhook opsional.

---

## 18. Testing dan UAT

### 18.1 Automated test wajib

| Level | Tool | Scope |
|---|---|---|
| Unit | Vitest/Jest | policy, parser, signature, services |
| Integration | Supertest/Fastify inject | API module auth/attendance/reporting |
| Contract | Node fetch scripts | endpoint utama |
| E2E | Playwright | login role, guru presensi, admin report |
| Security test | unit/integration | replay nonce, invalid signature, RBAC |
| Performance smoke | custom script | p95 endpoint penting |

### 18.2 UAT Admin/TU

1. Login Admin/TU.
2. Buat user siswa/guru.
3. Buat kelas/mapel.
4. Daftarkan siswa ke kelas.
5. Buat jadwal.
6. Generate sesi.
7. Lihat dashboard.
8. Export laporan.
9. Cek audit.

### 18.3 UAT Guru Mapel

1. Login guru.
2. Buka sesi hari ini.
3. Absen masuk.
4. Isi presensi siswa.
5. Simpan.
6. Absen keluar.
7. Koreksi satu siswa dengan alasan.
8. Lihat rekap.

### 18.4 UAT Scanner

1. Admin buat kode aktivasi scanner.
2. Scanner PWA complete provisioning.
3. Scan QR mode CHECK_ONLY.
4. Scan QR GATE_IN.
5. Scan QR MUSHOLA.
6. Scan QR GATE_OUT.
7. Coba duplicate scan, harus ditolak.
8. Coba replay signature, harus ditolak.
9. Coba device revoked, harus ditolak.

### 18.5 UAT Reconciliation

1. Siswa scan gate IN tapi tidak hadir kelas -> flag.
2. Siswa hadir kelas tanpa gate IN -> flag.
3. Guru tidak buka sesi -> MISSED + flag.
4. Hadir via override -> flag review.
5. Resolve flag wajib alasan.
6. Eskalasi flag wajib alasan.

---

## 19. Migration Plan dari Existing ke v2

### 19.1 Strategi migrasi

Gunakan pendekatan bertahap:

1. Freeze schema v2.
2. Export data existing dari PostgreSQL.
3. Mapping field ke schema v2.
4. Import master data dulu.
5. Import histori attendance.
6. Import audit jika dibutuhkan sebagai legacy audit.
7. Jalankan validation report.
8. UAT paralel.
9. Cutover domain.
10. Keep backup existing minimal 30 hari.

### 19.2 Data yang dimigrasikan

| Data | Migrasi |
|---|---|
| User | Ya |
| Class/Subject/AcademicYear/Semester/Room | Ya |
| Enrollment | Ya |
| WeeklySchedule/Session | Ya |
| StudentAttendance | Ya |
| TeacherSessionPresence | Ya |
| GateLog/PrayerAttendanceLog | Ya |
| ReconciliationFlag | Ya, atau regenerate dari data lama |
| QrCredential | Sebaiknya regenerate untuk keamanan |
| DeviceReader | Sebaiknya provision ulang |
| SmartCard | Ya jika RFID tetap dipakai |
| AuditEntry | Import sebagai legacy atau mulai chain baru |

### 19.3 Keputusan keamanan migrasi

- QR credential lama sebaiknya di-rotate/regenerate.
- Reader secret lama sebaiknya tidak dimigrasikan plaintext; lakukan provisioning ulang.
- JWT/session lama tidak dimigrasikan; semua user login ulang.
- Password bisa dimigrasikan jika hash kompatibel, tetapi opsi lebih aman adalah reset password awal.

---

## 20. Risiko dan Mitigasi

| Risiko | Severity | Mitigasi |
|---|---|---|
| PWA scanner lebih lemah dari Android Keystore | High | Device policy, PIN device, revoke cepat, optional Android native phase lanjut |
| Rebuild mengubah behavior bisnis | High | Buat test fixture dari kasus existing dan UAT paralel |
| Data migration gagal | High | Backup, dry-run, validation report, rollback plan |
| Modul reporting terlalu kompleks | Medium | Pecah per report service |
| Worker membuat flag duplicate | Medium | Fingerprint idempotent + unique constraint |
| Secret env kurang kuat | High | Env validation fail-fast |
| Guru bingung dengan flow baru | Medium | Tutorial per role dan UX step-by-step |
| Internet scanner putus | Medium | Offline queue terenkripsi + sync ulang |
| Cloudflare Quick Tunnel berubah URL | Medium | Pakai named tunnel/domain permanen |

---

## 21. Open Questions

1. Apakah rebuild v2 wajib mengganti Android APK dengan PWA scanner, atau Android native tetap boleh sebagai optional?
2. Apakah sistem dipakai untuk semua hari sekolah atau juga mode khusus ujian?
3. Apakah presensi ujian membutuhkan entitas tambahan seperti `Exam`, `ExamRoom`, `ExamSession`, dan pengawas?
4. Apakah NISN/NIP perlu disimpan atau cukup username dan nama?
5. Apakah laporan harus mengikuti format resmi madrasah tertentu?
6. Apakah domain permanen sudah tersedia?
7. Apakah data existing wajib dimigrasikan penuh atau bisa mulai bersih?
8. Apakah scanner akan dipasang di banyak HP sekaligus?
9. Apakah sistem perlu multi-cabang/multi-tahun ajaran aktif?

---

## 22. Instruksi Build di Google AI Studio

Gunakan bagian ini sebagai prompt utama ketika membangun ulang.

### 22.1 Prompt utama

```text
Bangun aplikasi Absensi v2 full Node.js/TypeScript berdasarkan PRD ini.

Target:
- Monorepo TypeScript.
- Backend Node.js menggunakan NestJS atau Fastify modular.
- Frontend dashboard React/Next.js atau React Vite.
- Scanner PWA React untuk scan QR dari kamera browser.
- Worker Node.js untuk auto-missed dan reconciliation.
- PostgreSQL + Prisma.
- Redis untuk rate limit, cache, nonce anti-replay, dan job/heartbeat.
- Docker Compose production.
- Semua secret dari env tervalidasi, tanpa fallback production.

Jangan menyalin source lama secara literal. Implementasikan ulang dengan struktur modular bersih.

Prioritas implementasi:
1. Setup monorepo dan env validation.
2. Prisma schema dan migration awal.
3. Auth + RBAC + audit helper.
4. Identity dan academic master data.
5. Scheduling dan session.
6. QR credential dan device provisioning.
7. Signed scanner request HMAC + nonce.
8. Gate/prayer attendance.
9. Class attendance + eligibility lock.
10. Worker auto-missed + reconciliation rules.
11. Reporting + export.
12. Web dashboard per role.
13. Scanner PWA.
14. Tests, Docker, smoke scripts.
```

### 22.2 Struktur file yang diminta ke AI Studio

```text
absensi-v2/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/
│   │   │   └── modules/
│   │   └── package.json
│   ├── web/
│   ├── scanner-pwa/
│   └── worker/
├── packages/
│   ├── db/
│   ├── shared/
│   ├── security/
│   ├── config/
│   └── ui/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── ops/
│   └── nginx/
├── scripts/
├── docker-compose.production.yml
├── package.json
└── README.md
```

### 22.3 Aturan coding untuk AI Studio

1. Gunakan TypeScript strict.
2. Jangan pakai `any` kecuali benar-benar perlu.
3. DTO divalidasi runtime dengan Zod/class-validator.
4. Semua mutasi service menerima actor context.
5. Semua mutasi sensitif memanggil audit helper.
6. Semua error user-facing bahasa Indonesia.
7. Jangan expose stack trace di production.
8. Jangan return reader secret kecuali saat provisioning/rotate.
9. Jangan simpan QR plaintext kecuali terenkripsi dan hanya untuk kebutuhan cetak.
10. Buat test untuk signature, nonce replay, eligibility, reconciliation.
11. Pisahkan rule reconciliation per file.
12. Pisahkan report query per file.
13. Gunakan pagination default dan max limit.
14. Gunakan transaksi Prisma untuk mutasi multi-tabel.

### 22.4 Milestone build untuk AI Studio

#### Milestone 1 — Foundation

Deliverable:

- Monorepo jalan.
- Docker Compose dev.
- Prisma schema awal.
- Env validation.
- Health live/ready.

Acceptance:

```bash
npm install
npm run typecheck
npm run test
npm run build
```

#### Milestone 2 — Auth + RBAC + Audit

Deliverable:

- Login/refresh/logout.
- User session DB.
- RolesGuard.
- Audit hash-chain.

Acceptance:

- Login berhasil.
- Login gagal rate limited.
- Audit verify ok.

#### Milestone 3 — Master Data + Scheduling

Deliverable:

- User CRUD.
- Academic CRUD.
- Enrollment.
- Weekly schedule.
- Session CRUD/generate.

Acceptance:

- Admin bisa membuat kelas, guru, siswa, jadwal, sesi.

#### Milestone 4 — QR + Device + Scanner PWA

Deliverable:

- Generate QR.
- Provision scanner.
- Signed request.
- PWA scan CHECK_ONLY dan GATE_IN.

Acceptance:

- Signature valid diterima.
- Signature salah/replay ditolak.

#### Milestone 5 — Attendance Class

Deliverable:

- Guru open session.
- Roster + eligibility.
- Save attendance.
- Close session.
- Correction.

Acceptance:

- Siswa locked tidak bisa Hadir/Telat.
- Koreksi tercatat audit.

#### Milestone 6 — Worker + Reconciliation

Deliverable:

- Auto missed.
- Reconciliation rules.
- Flags workflow.

Acceptance:

- Kasus bolos/lupa tap/tidak mengajar menghasilkan flag.

#### Milestone 7 — Reporting + Ops

Deliverable:

- Dashboard.
- Recap reports.
- Export CSV/XLSX.
- Nginx config.
- Backup script.
- Smoke test.

Acceptance:

- UAT core pass.
- Export memiliki audit/checksum.

---

## 23. Definition of Done v2

Sistem Absensi v2 dianggap selesai MVP jika:

1. Semua role bisa login dan diarahkan ke dashboard masing-masing.
2. Admin bisa membuat master data lengkap.
3. Admin bisa membuat jadwal dan sesi.
4. Scanner PWA bisa diprovision dan scan QR official.
5. GateLog dan PrayerAttendanceLog tercatat dari signed scan.
6. Guru bisa open, isi, close sesi.
7. Eligibility lock berjalan sesuai policy.
8. Worker auto-missed berjalan.
9. Worker reconciliation membuat flag anomali.
10. Admin/piket bisa resolve/escalate flag dengan alasan.
11. Laporan utama bisa dilihat dan diexport.
12. Audit verify chain ok.
13. Smoke test role utama pass.
14. Docker Compose production berjalan.
15. Backup database bisa dibuat dan diverifikasi.

---

## 24. Lampiran — Ringkasan Endpoint Scan Security

### 24.1 QR format

```text
schoolhub:qr:v1:<opaqueCode>
```

Contoh:

```text
schoolhub:qr:v1:QR_7F3K9X2P8LQ0
```

### 24.2 Signed headers

```text
x-reader-device-id
x-reader-timestamp
x-reader-nonce
x-reader-body-hash
x-reader-signature
```

### 24.3 Canonical payload

```text
METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + NONCE + "\n" + BODY_HASH
```

### 24.4 Signature

```text
HMAC-SHA256(readerSecret, canonicalPayload)
```

### 24.5 Server validation order

1. Header lengkap.
2. Timestamp valid dan tidak melewati skew.
3. Body hash cocok.
4. DeviceReader ditemukan.
5. DeviceReader active dan tidak revoked.
6. Mode scan diizinkan.
7. App version supported.
8. Nonce belum pernah dipakai.
9. Signature cocok.
10. QR credential aktif.
11. User aktif.
12. AttendancePolicy terpenuhi.
13. Log disimpan.
14. Audit/flag jika perlu.

---

## 25. Lampiran — Pemetaan Risiko Teknis Existing

| Area | Kondisi existing | Rekomendasi rebuild |
|---|---|---|
| Frontend | Beberapa halaman besar dalam 1 file | Pecah per route/component |
| CSS | `styles.css` sangat besar | Design tokens + komponen reusable |
| Reporting | Service besar | Pisah per report handler |
| Attendance gate | Service memuat banyak policy | Pisah gate/prayer/override/signature |
| Reconciliation | Rule procedural | Rule engine modular |
| Android reader | Kotlin native | Ganti PWA scanner untuk full Node.js MVP |
| Node version | Lokal v24, Docker v20 | Pin `.nvmrc` Node 20/22 LTS |
| CI | Tidak ditemukan workflow | Tambahkan GitHub Actions/CI lokal |
| Seed root | Ada risiko dependency root kurang | Pindah seed ke package db atau tambah dependency root |

---

## 26. Penutup

Absensi v2 harus mempertahankan nilai utama sistem existing: **dua lapis bukti kehadiran, rekonsiliasi otomatis, audit kuat, dan UX ramah sekolah**. Rebuild full Node.js bukan berarti mengurangi kontrol keamanan; justru perlu menjadi kesempatan untuk merapikan modularitas, memisahkan rule engine, memperkuat validation, dan membuat scanner PWA yang tetap signed dan policy-driven.

Dokumen ini dapat langsung digunakan sebagai brief utama untuk Google AI Studio, lalu dipecah menjadi milestone implementasi bertahap.
