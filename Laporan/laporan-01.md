# Laporan 01 — Arsitektur Sistem e-Hadir MAN 1 Rokan Hulu

**Tanggal dokumen:** 2026-05-02  
**Nama sistem:** SchoolHub e-Hadir MAN 1 Rokan Hulu  
**Tujuan dokumen:** Menjelaskan arsitektur, alur kerja, logika bisnis, konfigurasi, komponen teknis, dan cara sistem bekerja dari ujung ke ujung agar mudah dianalisis, diaudit, dan dikembangkan lagi.

> Catatan keamanan: dokumen ini sengaja **tidak menulis password, JWT secret, worker token, atau kredensial server**. Nilai rahasia harus tetap berada di file `.env` VPS dan tidak boleh disalin ke dokumen publik.

---

## 1. Ringkasan Kondisi Sistem

Sistem e-Hadir adalah aplikasi absensi sekolah berbasis web untuk mencatat kehadiran siswa dan guru melalui alur:

1. Scan masuk gerbang.
2. Scan kegiatan mushola: Dhuha, Dzuhur, Ashar.
3. Guru membuka sesi kelas/check-in mengajar.
4. Guru mengisi presensi siswa.
5. Guru menutup sesi/check-out mengajar.
6. Siswa scan keluar gerbang.
7. Sistem melakukan rekonsiliasi untuk mencari anomali.
8. Admin/TU, Operator, Guru Piket, dan Developer memantau, menindaklanjuti, dan mengaudit data.

Status terakhir sistem:

- Aplikasi web dan API berjalan di VPS.
- Stack produksi memakai Docker Compose.
- Database utama PostgreSQL.
- Redis dipakai untuk pendukung limiter/login/session-job cache sederhana.
- Worker berjalan periodik untuk rekonsiliasi dan auto-missed.
- Nginx menjadi reverse proxy internal.
- Cloudflare Quick Tunnel dipakai sebagai link sementara.

Link beta sementara terakhir yang aktif:

```text
https://geological-villas-sacrifice-enabled.trycloudflare.com
```

> Link Quick Tunnel dapat berubah jika tunnel restart. Untuk produksi tetap disarankan memakai Cloudflare Named Tunnel + domain resmi.

---

## 2. Gambaran Arsitektur Besar

```text
User Browser
   │
   │ HTTPS sementara via Cloudflare Quick Tunnel
   ▼
Cloudflare Quick Tunnel
   │
   │ forward ke VPS port 80
   ▼
VPS 157.15.40.21
   │
   ▼
Nginx Reverse Proxy :80
   ├── /api/*        → NestJS API container :3000
   ├── /health/*     → NestJS health endpoint
   └── /*            → React Web container :80

NestJS API
   ├── Prisma ORM
   │     └── PostgreSQL 16
   ├── Redis 7
   ├── JWT Auth
   ├── Role Guard
   ├── Audit Log
   └── Business Modules

Worker Container
   ├── POST internal /sessions/mark-missed
   └── POST internal /reconciliation/run
```

Arsitektur runtime singkat:

```text
Cloudflare Tunnel / URL beta
        ↓
Nginx reverse proxy
        ↓
React Web + NestJS API
        ↓
PostgreSQL + Redis + Worker
```

---

## 3. Stack Teknologi

| Layer | Teknologi | Keterangan |
|---|---|---|
| Frontend | React 18.3.1 | UI web utama |
| Frontend Build | Vite 6.4.2 | Build dan dev server frontend |
| Frontend Routing | React Router DOM 6.30.3 | Navigasi role-based |
| UI Icons | lucide-react | Ikon UI |
| Animasi | framer-motion | Animasi UI |
| Styling | CSS custom + PostCSS/Tailwind dependency | Glassmorphism, layout dashboard, responsive/fixed desktop |
| API Backend | NestJS 11.1.x | REST API utama |
| ORM | Prisma 5.22.0 | Database access layer |
| Database | PostgreSQL 16 Alpine | Penyimpanan data utama |
| Cache/limiter | Redis 7 Alpine | Login limiter dan pendukung runtime |
| Auth | JWT + Passport JWT | Token-based authentication |
| Password Hash | bcryptjs | Hash password user |
| Import file | exceljs | Import XLSX/CSV untuk master data |
| Worker | Node.js + axios | Job periodik internal |
| Reverse Proxy | Nginx 1.27 Alpine | Routing web/API, rate limit, security header |
| Container | Docker Compose | Deployment produksi |
| Tunnel sementara | Cloudflare Quick Tunnel | Publikasi sementara tanpa domain tetap |
| Testing API | Jest | Unit/integration backend |
| Testing Web | Vitest + Testing Library | Unit test frontend |
| E2E | Playwright | Browser flow testing |
| Audit dependency | npm audit | Security audit dependency |

---

## 4. Struktur Aplikasi

```text
.
├── apps
│   ├── api              # Backend NestJS
│   ├── web              # Frontend React/Vite
│   └── worker           # Worker periodik Node.js
├── prisma
│   ├── schema.prisma    # Schema database Prisma
│   ├── migrations       # Riwayat migrasi database
│   └── seed.ts          # Seed data awal/demo/operasional minimal
├── ops
│   ├── nginx            # Konfigurasi reverse proxy/web server
│   └── systemd          # Service/timer production helper
├── scripts              # Deploy, backup, restore, smoke test, health alert
├── docs                 # SOP dan dokumentasi operasional
├── docker-compose.production.yml
└── laporan-01.md        # Dokumen ini
```

---

## 5. Komponen Produksi Docker Compose

File utama:

```text
docker-compose.production.yml
```

Service produksi:

| Service | Container | Fungsi |
|---|---|---|
| `postgres` | `schoolhub-postgres` | Database PostgreSQL utama |
| `redis` | `schoolhub-redis` | Redis append-only untuk limiter/cache |
| `api` | `schoolhub-api-1` | NestJS REST API |
| `worker` | `schoolhub-worker` | Job periodik rekonsiliasi dan sesi missed |
| `web` | `schoolhub-web` | React app hasil build, diserve Nginx container web |
| `reverse-proxy` | `schoolhub-nginx` | Nginx publik port 80, reverse proxy ke web/API |

Volume persistent:

```text
postgres_data → /var/lib/postgresql/data
redis_data    → /data
```

Logging Docker:

```text
driver: json-file
max-size: 10m
max-file: 5
```

Port publik VPS:

```text
80 → reverse-proxy nginx
```

Port internal:

```text
api:3000
web:80
postgres:5432
redis:6379
```

---

## 6. Konfigurasi Environment Produksi

Template konfigurasi ada di:

```text
.env.production.example
```

Variabel penting:

| Variabel | Fungsi | Catatan |
|---|---|---|
| `NODE_ENV` | Mode runtime | Produksi memakai `production` |
| `POSTGRES_DB` | Nama database | Jangan ubah sembarangan setelah data berjalan |
| `POSTGRES_USER` | User database | Rahasia operasional |
| `POSTGRES_PASSWORD` | Password database | Rahasia, jangan ditulis di dokumen |
| `DATABASE_URL` | URL koneksi Prisma ke PostgreSQL | Rahasia |
| `REDIS_URL` | URL koneksi Redis | Default internal `redis://redis:6379` |
| `JWT_SECRET` | Secret tanda tangan JWT | Wajib panjang dan random |
| `JWT_EXPIRES_IN` | Masa berlaku token JWT | Default contoh `8h` |
| `WORKER_TOKEN` | Token internal worker | Dipakai untuk endpoint internal |
| `ADMIN_USERNAME` | Username admin awal | Default contoh `admin.tu` |
| `ADMIN_PASSWORD` | Password admin awal | Rahasia |
| `ADMIN_FULL_NAME` | Nama admin awal | Non-rahasia |
| `DEVELOPER_USERNAME` | Username developer | Default contoh `developer` |
| `DEVELOPER_PASSWORD` | Password developer | Rahasia |
| `DEVELOPER_FULL_NAME` | Nama developer | Non-rahasia |
| `API_PORT` | Port API internal | Biasanya `3000` |
| `LOGIN_MAX_FAILED_ATTEMPTS` | Batas gagal login | Default 5 |
| `LOGIN_WINDOW_MS` | Window hitung gagal login | Default 600000 ms |
| `LOGIN_LOCK_MS` | Lama lock login | Default 600000 ms |
| `WORKER_INTERVAL_MS` | Interval dasar worker | Default 15000 ms |
| `WORKER_AUTO_MISSED_INTERVAL_MS` | Interval auto missed | Default 15000 ms |
| `WORKER_RECONCILE_INTERVAL_MS` | Interval rekonsiliasi | Default 30000 ms |

Aturan penting:

- `.env` produksi tidak boleh ikut `rsync --delete` dari lokal.
- Nilai password/secret tidak boleh disimpan di dokumentasi publik.
- Perubahan `JWT_SECRET` akan membuat token login lama tidak valid.
- Perubahan `DATABASE_URL` harus sinkron dengan service PostgreSQL.

---

## 7. Konfigurasi Nginx Reverse Proxy

File:

```text
ops/nginx/reverse-proxy.conf
```

Fungsi utama:

1. Menerima request publik port 80.
2. Meneruskan `/api/*` ke container `api:3000`.
3. Meneruskan halaman web/static asset ke container `web:80`.
4. Menyediakan shortcut health:
   - `/health/live`
   - `/health/ready`
5. Mengaktifkan gzip.
6. Mengaktifkan security headers.
7. Mengatur rate limit login dan API.

Security headers:

```text
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(self)
```

Rate limit:

```text
/api/v1/auth/login → 10 request/menit, burst 10
/api/*             → 20 request/detik, burst 80
```

Limit upload:

```text
client_max_body_size 20m
```

Caching:

- Static asset JS/CSS/image: cache 7 hari.
- Root HTML: no-cache.
- API: no-store.

---

## 8. Backend API

Backend berada di:

```text
apps/api
```

Framework:

```text
NestJS
```

Global API prefix:

```text
/api/v1
```

Konfigurasi bootstrap utama:

- CORS aktif.
- ValidationPipe global aktif.
- DTO input divalidasi.
- Properti asing ditolak.

Aturan validasi global:

```text
whitelist: true
transform: true
forbidNonWhitelisted: true
```

Artinya:

- Field yang tidak ada di DTO dibuang/ditolak.
- Type input dapat di-transform sesuai DTO.
- Request dengan field tidak dikenal ditolak agar API lebih aman.

---

## 9. Modul Backend

Modul yang didaftarkan di `AppModule`:

| Modul | Fungsi |
|---|---|
| `PrismaModule` | Koneksi database Prisma |
| `RedisModule` | Koneksi Redis dan helper limiter |
| `AuthModule` | Login JWT |
| `HealthModule` | Health/live/ready/detail |
| `IdentityModule` | User, role, import user, aktivasi/nonaktif, hapus permanen developer-only |
| `AcademicModule` | Tahun ajaran, semester, ruangan, kelas, mapel, enrollment, import akademik |
| `SchedulingModule` | Jadwal mingguan dan sesi kelas |
| `AttendanceGateModule` | Scan gerbang, scan mushola, policy absensi, override |
| `AttendanceClassModule` | Buka/tutup sesi, input presensi kelas, roster, koreksi |
| `ReconciliationModule` | Deteksi anomali, resolve, workflow, escalation, internal worker endpoint |
| `AccessGeofenceModule` | Kebijakan lokasi/geofence guru |
| `DeviceReaderModule` | Reader gerbang/mushola/kelas |
| `SmartCardModule` | Kartu UID/RFID/QR user |
| `PicketBookModule` | Buku piket |
| `NotificationsModule` | Notifikasi user/role |
| `TeacherLeaveModule` | Izin/sakit/dinas luar guru |
| `TutorialsModule` | Tutorial onboarding per role dan kontrol developer |
| `SystemCleanupModule` | Clean data developer-only, preview-first |
| `ReportingModule` | Dashboard, live monitor, rekap, export laporan |
| `AuditModule` | Daftar audit log |

---

## 10. Endpoint API Utama

Semua endpoint berada di bawah prefix:

```text
/api/v1
```

### 10.1 Auth

```text
POST /auth/login
```

Fungsi:

- Menerima username/password.
- Cek rate limit login.
- Validasi user aktif.
- Verifikasi password bcrypt.
- Menghasilkan JWT.
- Mencatat audit login sukses/gagal/locked.

### 10.2 Health

```text
GET /health/live
GET /health/ready
GET /health/detail
```

Fungsi:

- `live`: API hidup.
- `ready`: API siap menerima trafik.
- `detail`: detail kondisi sistem.

### 10.3 Identity/User

```text
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

Catatan:

- `DELETE /identity/users/:id` digunakan untuk nonaktif/soft-delete.
- `DELETE /identity/users/:id/permanent` hanya untuk role `DEVELOPER`.
- Hapus permanen ditolak jika akun punya data penting seperti presensi, audit, sesi, log gerbang, log mushola, buku piket, dan relasi historis lainnya.

### 10.4 Academic

```text
GET/POST/PATCH /academic/years
GET/POST/PATCH /academic/semesters
GET/POST/PATCH /academic/rooms
GET/POST/PATCH /academic/classes
GET/POST/PATCH /academic/subjects
GET /academic/students
POST /academic/enrollments
GET /academic/import/template
POST /academic/import/preview
POST /academic/import/commit
POST /academic/import/file/preview
POST /academic/import/file/commit
```

Fungsi:

- Master data akademik.
- Import preview-first.
- Relasi siswa ke kelas.

### 10.5 Scheduling

```text
GET    /schedules/weekly
POST   /schedules/weekly
PATCH  /schedules/weekly/:id
POST   /schedules/weekly/:id/generate
GET    /schedules/sessions
POST   /schedules/sessions
PATCH  /schedules/sessions/:id
```

Fungsi:

- Membuat jadwal mingguan.
- Generate sesi harian dari jadwal.
- Mengelola sesi kelas.

### 10.6 Attendance Gerbang/Mushola/Manual

```text
GET  /attendance/policy
PUT  /attendance/policy
GET  /attendance/gate/logs
GET  /attendance/prayer/logs
POST /attendance/gate/tap
POST /attendance/qr-scan
POST /attendance/overrides
```

Fungsi:

- Kebijakan absensi adaptif.
- Scan gerbang `IN`/`OUT`.
- Scan mushola Dhuha/Dzuhur/Ashar.
- Override manual oleh petugas.

### 10.7 Attendance Kelas

```text
GET   /attendance/class-sessions
POST  /attendance/class-sessions/:id/open
PUT   /attendance/class-sessions/:id/attendance
POST  /attendance/class-sessions/:id/close
GET   /attendance/class-sessions/:id/summary
GET   /attendance/class-sessions/:id/roster
PATCH /attendance/class-sessions/:id/attendance/:studentId
```

Fungsi:

- Guru melihat sesi.
- Guru check-in/buka sesi.
- Guru input presensi siswa.
- Guru check-out/tutup sesi.
- Koreksi presensi.

### 10.8 Reconciliation/Anomali

```text
GET   /reconciliation/flags
POST  /reconciliation/flags/:id/resolve
PATCH /reconciliation/flags/:id/workflow
POST  /reconciliation/flags/:id/escalate
POST  /internal/reconciliation/run
POST  /internal/sessions/mark-missed
```

Catatan:

- Endpoint `/internal/*` dipakai worker dengan `WORKER_TOKEN`.
- Endpoint internal tidak untuk browser umum.

### 10.9 Reporting

```text
GET /reports/dashboard
GET /reports/class/:classId/monthly
GET /reports/trend
GET /reports/live-monitor
GET /reports/my-attendance
GET /reports/recap/classes
GET /reports/recap/students
GET /reports/recap/subjects
GET /reports/recap/teachers
GET /reports/teacher-monthly
GET /reports/audit-coverage
GET /reports/export
```

Fungsi:

- Dashboard admin.
- Live monitor.
- Rekap kelas/siswa/mapel/guru.
- Laporan bulanan guru.
- Export CSV/XLSX.

### 10.10 Modul Operasional Lain

```text
GET/PUT    /access/geofence
GET/POST   /devices/readers
POST       /devices/readers/:id/rotate-key
PATCH      /devices/readers/:id/status
GET/POST/PATCH /devices/cards
GET/POST/PATCH/DELETE /picket-notes
GET/PATCH  /notifications
GET/POST/PATCH /teacher-leaves
GET/POST   /tutorials/*
GET/POST   /system-cleanup/*
GET        /audit
```

---

## 11. Role dan Hak Akses

Enum role utama:

```text
ADMIN_TU
GURU_MAPEL
GURU_PIKET
SISWA
OPERATOR_IT
DEVELOPER
```

Logika akses:

- JWT Strategy membaca token Bearer.
- User harus masih aktif di database.
- Role Guard memeriksa role yang dibutuhkan endpoint.
- Role `DEVELOPER` bisa melewati pembatas role guard untuk kebutuhan super-admin teknis.
- UI tetap menyembunyikan menu sesuai role agar operator tidak bingung.

Ringkasan role:

| Role | Fungsi |
|---|---|
| `ADMIN_TU` | Admin operasional sekolah, master data, laporan, policy, user |
| `OPERATOR_IT` | Operator teknis harian, perangkat, data, sebagian dashboard |
| `GURU_MAPEL` | Guru mapel, buka/tutup sesi, input presensi kelas |
| `GURU_PIKET` | Membantu sesi, buku piket, anomali, scan/override tertentu |
| `SISWA` | Melihat data kehadiran pribadi |
| `DEVELOPER` | Kontrol teknis, clean data, tutorial control, hapus permanen aman |

Default route frontend:

| Role | Default halaman |
|---|---|
| `DEVELOPER` | `/admin/developer-control` |
| `OPERATOR_IT` | `/admin/it-dashboard` |
| `GURU_PIKET` | `/admin/picket-dashboard` |
| `GURU_MAPEL` | `/guru/dashboard` |
| `SISWA` | `/siswa/dashboard` |
| `ADMIN_TU` | `/admin/dashboard` |

---

## 12. Alur Login dan Session

Alur login:

```text
1. User membuka halaman login.
2. User memilih jenis masuk: Guru / Admin-TU / Siswa.
3. Browser mengirim POST /api/v1/auth/login.
4. API normalisasi username.
5. API cek lock login dari Redis.
6. API cari user berdasarkan username.
7. API cek user aktif.
8. API bandingkan password dengan bcrypt hash.
9. Jika valid, API membuat JWT.
10. API mencatat audit auth.login.success.
11. Browser menyimpan token di localStorage.
12. Browser menyimpan data user di localStorage.
13. Browser redirect ke dashboard sesuai role.
```

Alur jika gagal:

```text
1. Username tidak ada / user nonaktif / password salah.
2. API mencatat failed attempt.
3. Counter disimpan di Redis.
4. Jika gagal terlalu banyak, login dikunci sementara.
5. API mencatat audit auth.login.failed atau auth.login.locked.
6. Browser menampilkan pesan umum agar tidak membocorkan akun valid/tidak.
```

Penyimpanan frontend:

```text
schoolhub_access_token → JWT
schoolhub_user         → data user aktif
schoolhub_theme        → preferensi tema
```

---

## 13. Alur Scan Gerbang

Reader type:

```text
GATE
MUSHOLA
CLASS
MANUAL
```

Direction gerbang:

```text
IN
OUT
```

Alur scan gerbang masuk:

```text
1. Kartu/QR/user dipindai di reader gerbang.
2. Request masuk ke POST /attendance/qr-scan atau /attendance/gate/tap.
3. API mencari SmartCard berdasarkan UID atau userId manual.
4. API memastikan kartu/user aktif.
5. API membuat GateLog.
6. Jika deviceId tersedia, lastSeenAt reader diperbarui.
7. Jika cardId tersedia, lastTappedAt kartu diperbarui.
8. API mencatat audit gate.tap.recorded atau attendance.gate.scan.recorded.
9. Data muncul di riwayat/log dan live monitor.
```

Alur scan gerbang keluar:

```text
1. User scan keluar dengan direction OUT.
2. API cek role user.
3. Jika user adalah siswa, API menjalankan validasi Ashar jika policy aktif.
4. Jika user guru/staff, API mengikuti policy gate-out guru/staff.
5. Jika valid, API membuat GateLog OUT.
6. Audit dicatat.
```

---

## 14. Alur Scan Mushola Dhuha/Dzuhur/Ashar

Prayer type:

```text
DHUHA
DZUHUR
ASHAR
```

Default window waktu:

| Ibadah | Mulai | Selesai |
|---|---:|---:|
| Dhuha | 07:00 | 10:30 |
| Dzuhur | 11:45 | 13:30 |
| Ashar | 15:00 | 16:30 |

Alur scan mushola:

```text
1. Siswa scan di reader mushola.
2. API memastikan readerType = MUSHOLA.
3. API memastikan user role SISWA.
4. API menentukan prayerType:
   - Jika payload mengirim prayerType, pakai nilai tersebut.
   - Jika tidak, API menentukan berdasarkan jam scan dan AttendancePolicy.
5. API membuat PrayerAttendanceLog.
6. Unik per siswa + jenis ibadah + tanggal.
7. API mencatat audit attendance.prayer.scan.recorded.
8. Data dipakai untuk syarat masuk kelas dan syarat pulang Ashar.
```

Logika fallback deteksi waktu:

```text
Jika jam masuk rentang Ashar → ASHAR
Jika jam masuk rentang Dzuhur → DZUHUR
Jika jam masuk rentang Dhuha → DHUHA
Jika sudah lewat jam mulai Ashar → ASHAR
Jika sebelum Dzuhur → DHUHA
Selain itu → DZUHUR
```

---

## 15. Kebijakan Absensi Adaptif

Model database:

```text
AttendancePolicy
```

Field utama:

| Field | Fungsi | Default |
|---|---|---|
| `requireStudentGateInBeforeClass` | Siswa harus scan gerbang sebelum kelas | true |
| `requireStudentDhuha` | Siswa wajib scan Dhuha untuk sesi setelah jam Dhuha | true |
| `requireStudentDzuhur` | Siswa wajib scan Dzuhur untuk sesi setelah Dzuhur | true |
| `requireStudentAsharForAfternoon` | Siswa jadwal sore wajib scan Ashar sebelum pulang | true |
| `requireStudentClassEligibility` | Syarat masuk kelas aktif | true |
| `requireTeacherGateIn` | Guru wajib scan masuk | true |
| `requireTeacherGateOut` | Guru wajib scan keluar | true |
| `requireStaffGateIn` | Staff wajib scan masuk | true |
| `requireStaffGateOut` | Staff wajib scan keluar | true |
| `allowManualOverride` | Petugas boleh override manual | true |
| `allowStudentAsharCheckoutOverride` | Petugas boleh override pulang tanpa Ashar | true |
| `dhuhaStartTime` | Jam mulai Dhuha | 07:00 |
| `dhuhaEndTime` | Jam akhir Dhuha | 10:30 |
| `dzuhurStartTime` | Jam mulai Dzuhur | 11:45 |
| `dzuhurEndTime` | Jam akhir Dzuhur | 13:30 |
| `asharStartTime` | Jam mulai Ashar | 15:00 |
| `asharEndTime` | Jam akhir Ashar | 16:30 |
| `asharRequiredClassEndTime` | Batas jadwal disebut sore | 15:00 |
| `duplicateScanWindowMinutes` | Jendela anti duplikasi scan | 5 |

Admin/TU mengubah policy melalui:

```text
PUT /api/v1/attendance/policy
```

Setiap perubahan policy dicatat ke audit:

```text
attendance.policy.updated
```

---

## 16. Logika Wajib Scan Ashar Sebelum Pulang

Aturan operasional aktif:

```text
Siswa wajib scan Ashar sebelum scan pulang/keluar gerbang jika jadwal belajar hari itu berakhir pukul 15:00 atau lebih.
```

Alur validasi saat siswa scan keluar:

```text
1. Siswa scan gerbang OUT.
2. API membaca AttendancePolicy.
3. Jika requireStudentAsharForAfternoon = false → boleh lanjut.
4. API cek apakah siswa punya jadwal sore.
5. Jadwal sore dihitung dari Session hari itu:
   - Session.startsAt berada di hari yang sama.
   - Session.endsAt >= batas asharRequiredClassEndTime.
   - Session terkait kelas siswa melalui ClassEnrollment.
6. Jika tidak ada Session, API fallback ke WeeklySchedule:
   - WeeklySchedule aktif.
   - dayOfWeek cocok dengan hari scan.
   - endTime >= batas jadwal sore.
   - tanggal efektif berlaku.
   - kelas memiliki enrollment siswa tersebut.
7. Jika siswa tidak punya jadwal sore → boleh pulang tanpa Ashar.
8. Jika siswa punya jadwal sore, API cek PrayerAttendanceLog ASHAR tanggal itu.
9. Jika sudah scan Ashar → boleh pulang.
10. Jika belum scan Ashar, API cek AttendanceOverride:
    - scope ALL atau ASHAR_CHECKOUT.
11. Jika override sah → boleh pulang.
12. Jika tidak ada Ashar dan tidak ada override → request ditolak 403.
13. API mencatat audit penolakan.
```

Pesan penolakan:

```text
Siswa ini masih punya jadwal sampai sore. Scan Ashar dulu sebelum pulang.
```

Audit penolakan:

```text
attendance.student.checkout.blocked_missing_ashar
```

Override manual yang berlaku:

```text
ASHAR_CHECKOUT
ALL
```

Contoh kondisi override sah:

- Siswa sakit dan pulang lebih awal.
- Siswa izin resmi.
- Kegiatan luar sekolah.
- Reader mushola bermasalah.
- Petugas sudah memverifikasi manual.

---

## 17. Alur Presensi Kelas oleh Guru

Status sesi:

```text
SCHEDULED → OPEN → CLOSED
SCHEDULED/OPEN → MISSED oleh worker jika terlewat sesuai aturan
```

Alur guru membuka sesi:

```text
1. Guru login.
2. Guru membuka dashboard/sesi kelas.
3. Guru klik buka sesi/check-in.
4. API cek sesi ada.
5. Jika role GURU_MAPEL, API memastikan sesi milik guru tersebut.
6. API membaca GeofencePolicy.
7. Jika geofence aktif, koordinat wajib dikirim.
8. API menghitung jarak haversine dari titik sekolah.
9. Jika di luar radius, request ditolak.
10. Jika requireGateTapForOpen aktif, API cek gate IN guru hari itu.
11. API ubah Session.status menjadi OPEN.
12. API upsert TeacherSessionPresence.
13. Status guru ditentukan HADIR/TELAT berdasarkan grace minutes.
14. API mencatat audit teacher.session.checkin dan class.session.opened.
```

Alur guru input presensi siswa:

```text
1. Guru membuka roster sesi.
2. API mengambil daftar siswa aktif dari ClassEnrollment.
3. API menghitung eligibility siswa:
   - Sudah scan gerbang IN jika diwajibkan.
   - Sudah scan Dhuha jika sesi dimulai setelah jam Dhuha.
   - Sudah scan Dzuhur jika sesi dimulai setelah jam Dzuhur.
   - Ada override ALL/CLASS_ELIGIBILITY jika syarat belum lengkap.
4. UI menampilkan siswa yang terkunci/locked jika belum memenuhi syarat.
5. Guru menyimpan presensi.
6. API menolak status HADIR/TELAT untuk siswa yang locked.
7. API tetap boleh menyimpan status IZIN/SAKIT/ALPA sesuai input.
8. API upsert StudentAttendance.
9. API mencatat audit class.attendance.recorded.
10. Jika ada yang ditolak karena policy, audit attendance.class.blocked_by_policy dicatat.
```

Alur guru menutup sesi:

```text
1. Guru klik tutup sesi/check-out.
2. API memastikan sesi OPEN.
3. Jika tutup sebelum jam selesai, alasan keluar awal minimal 10 karakter wajib diisi.
4. API ubah status sesi menjadi CLOSED.
5. API update TeacherSessionPresence.checkOutAt.
6. API mencatat audit teacher.session.checkout dan class.session.closed.
7. Session.reconciledAt diset null agar worker bisa rekonsiliasi ulang.
```

---

## 18. Geofence Guru

Model:

```text
GeofencePolicy
```

Field utama:

| Field | Fungsi |
|---|---|
| `centerLat` | Latitude titik pusat sekolah |
| `centerLng` | Longitude titik pusat sekolah |
| `radiusMeter` | Radius area valid |
| `enforceSessionOpen` | Wajib validasi lokasi saat buka sesi |
| `arrivalGraceMinutes` | Batas terlambat guru |
| `autoMissedGraceMinutes` | Batas worker menandai sesi missed |
| `requireGateTapForOpen` | Guru harus scan gerbang sebelum buka sesi |
| `allowPicketOverride` | Guru piket boleh membantu override |

Perhitungan jarak:

```text
Haversine distance meter
```

---

## 19. Rekonsiliasi dan Anomali

Rekonsiliasi bertugas menemukan data tidak sinkron, misalnya:

- Siswa scan gerbang tapi tidak hadir di kelas.
- Siswa hadir kelas tapi tidak scan gerbang.
- Guru tidak mengajar.
- Sesi dibuka tanpa scan gerbang jika policy mewajibkan.
- Siswa belum scan Dhuha.
- Siswa belum scan Dzuhur.
- Siswa jadwal sore belum scan Ashar.
- Siswa belum scan keluar gerbang.
- Alpa.

Enum anomali:

```text
BOLOS_KELAS
LUPA_TAP_GERBANG
TIDAK_MENGAJAR
ANOMALI_BUKA_TANPA_GERBANG
BELUM_SCAN_GERBANG
BELUM_SCAN_DHUHA
BELUM_SCAN_DZUHUR
BELUM_SCAN_ASHAR
BELUM_SCAN_KELUAR_GERBANG
ALPA
```

Status anomali:

```text
OPEN
RESOLVED
```

Workflow review:

```text
OPEN
IN_REVIEW
ESCALATED
RESOLVED
```

Prioritas:

```text
LOW
NORMAL
HIGH
URGENT
```

Alur worker rekonsiliasi:

```text
1. Worker berjalan berkala.
2. Worker POST ke /api/v1/internal/reconciliation/run dengan x-worker-token.
3. API mengambil sesi yang perlu direkonsiliasi.
4. API membandingkan data Session, StudentAttendance, GateLog, PrayerAttendanceLog, TeacherSessionPresence, AttendancePolicy.
5. API membuat ReconciliationFlag jika ditemukan anomali.
6. Flag unik berdasarkan type + sessionId + userId agar tidak duplikat.
7. Admin/TU/Guru Piket melihat flag di Papan Anomali.
8. Petugas bisa resolve, assign, tambah follow-up, atau escalate.
9. Semua tindakan dicatat ke AuditEntry.
```

---

## 20. Worker Periodik

File:

```text
apps/worker/src/index.js
```

Job worker:

| Job | URL internal | Default interval |
|---|---|---:|
| `auto-missed` | `/api/v1/internal/sessions/mark-missed` | 15000 ms |
| `reconciliation` | `/api/v1/internal/reconciliation/run` | 30000 ms |

Cara worker memanggil API:

```text
Header: x-worker-token: <WORKER_TOKEN>
Timeout: 10000 ms
```

Proteksi:

- Worker memakai token internal.
- Endpoint internal tidak dipakai UI.
- Jika job sebelumnya masih berjalan, tick berikutnya dilewati agar tidak overlap.

---

## 21. Database dan Model Data

Database:

```text
PostgreSQL 16
```

ORM:

```text
Prisma Client 5.22.0
```

Schema utama:

```text
prisma/schema.prisma
```

### 21.1 Enum Database

```text
Role
SessionStatus
StudentAttendanceStatus
TeacherSessionStatus
CardStatus
GateDirection
ReaderType
PrayerType
ReconciliationFlagType
ReconciliationStatus
EscalationStatus
DeviceReaderStatus
TeacherLeaveType
TeacherLeaveStatus
ReconciliationReviewStatus
ReconciliationPriority
NotificationType
```

### 21.2 Model Utama

| Model | Fungsi |
|---|---|
| `User` | Akun semua role: admin, operator, guru, siswa, developer |
| `SchoolClass` | Data kelas |
| `Subject` | Mata pelajaran |
| `AcademicYear` | Tahun ajaran |
| `Semester` | Semester |
| `Room` | Ruang kelas/lokasi |
| `ClassEnrollment` | Relasi siswa ke kelas |
| `Session` | Sesi pembelajaran harian |
| `StudentAttendance` | Presensi siswa per sesi |
| `TeacherSessionPresence` | Check-in/check-out guru per sesi |
| `GateLog` | Log scan masuk/keluar gerbang |
| `PrayerAttendanceLog` | Log scan Dhuha/Dzuhur/Ashar |
| `AttendanceOverride` | Override manual petugas |
| `ReconciliationFlag` | Anomali hasil rekonsiliasi |
| `ReconciliationEscalation` | Eskalasi anomali |
| `AuditEntry` | Audit log seluruh aksi penting |
| `WeeklySchedule` | Jadwal mingguan sumber generate sesi |
| `Notification` | Notifikasi user/role |
| `GeofencePolicy` | Aturan lokasi guru |
| `DeviceReader` | Reader gerbang/mushola/kelas |
| `AttendancePolicy` | Aturan absensi adaptif |
| `PicketNote` | Buku piket |
| `SmartCard` | Kartu UID/RFID/QR user |
| `TeacherLeave` | Izin/sakit/dinas luar guru |
| `UserTutorialState` | Status tutorial/onboarding user |

### 21.3 Relasi Data Penting

```text
User 1..n GateLog
User 1..n StudentAttendance sebagai siswa
User 1..n Session sebagai guru
User 1..n TeacherSessionPresence sebagai guru
User 1..1 SmartCard
User 1..n PrayerAttendanceLog sebagai siswa
User 1..n AttendanceOverride sebagai siswa
SchoolClass 1..n ClassEnrollment
SchoolClass 1..n Session
SchoolClass 1..n WeeklySchedule
Subject 1..n Session
WeeklySchedule 1..n Session
Session 1..n StudentAttendance
Session 1..n ReconciliationFlag
```

### 21.4 Index Penting

Schema sudah memiliki index untuk query yang sering dipakai, misalnya:

- `User(role, active)`
- `Session(status, startsAt)`
- `Session(classId, startsAt)`
- `Session(teacherId, startsAt)`
- `StudentAttendance(studentId, status)`
- `GateLog(userId, tappedAt)`
- `PrayerAttendanceLog(attendanceDate, prayerType)`
- `ReconciliationFlag(status, createdAt)`
- `AuditEntry(actorId, createdAt)`
- `WeeklySchedule(dayOfWeek, active)`

---

## 22. Migration Database

Daftar migration saat dokumen dibuat:

```text
0001_init
0002_smartcard_and_extended_flags
0003_geofence_policy_extended_controls
0004_reporting_audit_escalation
0005_picket_book_and_master_ops
0006_web_operational_completion
0007_stability_performance_indexes
0008_teacher_session_checkin_checkout
0009_adaptive_qr_attendance
0010_developer_tutorial_control
0011_student_ashar_checkout_policy
```

Migration terbaru terkait Ashar:

```text
0011_student_ashar_checkout_policy
```

Isi perubahan utama:

- Tambah `PrayerType.ASHAR`.
- Tambah `ReconciliationFlagType.BELUM_SCAN_ASHAR`.
- Tambah field Ashar di `AttendancePolicy`.

---

## 23. Seed Data

File seed:

```text
prisma/seed.ts
```

Seed membuat/menjamin data awal:

- Admin/TU.
- Developer.
- Contoh guru mapel.
- Contoh guru piket/operator nonaktif.
- Contoh siswa.
- Kelas.
- Mapel.
- Enrollment siswa-kelas.
- Sesi contoh.
- Presensi contoh.
- Gate log contoh.
- Smart card contoh.
- Reader gerbang dan mushola.
- Prayer attendance Dhuha/Dzuhur contoh.
- AttendancePolicy default.
- GeofencePolicy default.
- ReconciliationFlag contoh.
- Audit seed completed.

Catatan:

- Seed dapat memakai env untuk username/nama/password awal.
- Password tidak didokumentasikan di sini.
- Untuk data real sekolah, gunakan import preview/commit agar data bisa dicek dulu.

---

## 24. Frontend Web

Frontend berada di:

```text
apps/web
```

Komponen utama:

| File | Fungsi |
|---|---|
| `src/App.tsx` | Entry app |
| `src/app/SchoolHubApp.tsx` | Shell utama, login, layout, routing role |
| `src/app/api.ts` | Helper API fetch, token, route default |
| `src/app/ui.tsx` | Komponen UI reusable |
| `src/app/pages/admin/AdminPages.jsx` | Halaman admin/operator/developer/guru piket |
| `src/app/pages/guru/GuruPages.jsx` | Halaman guru |
| `src/app/pages/siswa/MyAttendancePage.jsx` | Halaman siswa |
| `src/app/tutorial.tsx` | Tutorial onboarding |
| `src/styles.css` | Styling global |

Build production frontend:

```text
VITE_API_BASE_URL=/api/v1
```

Alur request frontend:

```text
Browser
  → apiFetch('/path')
  → prefix /api/v1
  → Nginx reverse proxy
  → NestJS API
```

Token disisipkan otomatis:

```text
Authorization: Bearer <JWT>
```

Jika API error, helper membaca pesan JSON dan menampilkan error/toast di UI.

---

## 25. Routing UI per Area

Area utama:

```text
/login
/admin/*
/guru/*
/siswa/*
```

Menu Admin/TU/Operator/Guru Piket/Developer meliputi:

- Dashboard admin.
- Dashboard teknis.
- Dashboard piket.
- Live monitor.
- Riwayat absen.
- Papan anomali.
- Buku piket.
- Master data.
- Jadwal & sesi.
- Perangkat.
- Laporan.
- Pengaturan.
- Audit.
- Pengajuan guru.
- Developer Control Center.

Menu guru meliputi:

- Dashboard guru.
- Sesi mengajar.
- Input presensi.
- Rekap/riwayat terkait guru.
- Pengajuan izin/sakit/dinas luar.

Menu siswa meliputi:

- Dashboard siswa.
- Riwayat kehadiran pribadi.

---

## 26. Developer Control Center

Developer Control Center tersedia untuk role:

```text
DEVELOPER
```

Fungsi:

1. Kontrol tutorial/onboarding user.
2. Clean data aman dengan preview-first.
3. Kesehatan sistem.
4. Kontrol teknis sensitif.

Clean data system:

```text
GET  /api/v1/system-cleanup/preview
POST /api/v1/system-cleanup/run
```

Prinsip clean data:

- Preview dulu sebelum run.
- Developer-only.
- Tidak menghapus data presensi/audit/histori penting.
- Hanya membersihkan data aman seperti user test nonaktif yang memenuhi syarat, kartu nonaktif user nonaktif, notifikasi lama terbaca, tutorial state stale.

Data yang dilindungi:

```text
AuditEntry
StudentAttendance
TeacherSessionPresence
GateLog
PrayerAttendanceLog
AttendanceOverride
Session
ReconciliationFlag
PicketNote
```

---

## 27. Hapus Akun dan Keamanan Data Historis

Prinsip:

```text
Nonaktifkan lebih aman daripada hapus permanen.
```

Admin/TU dapat:

- Membuat user.
- Edit user.
- Nonaktifkan user.
- Aktifkan kembali user.

Developer dapat:

- Melakukan hapus permanen user yang aman.
- Tidak boleh hapus diri sendiri.
- Tidak boleh menghapus developer aktif terakhir.
- Tidak boleh menghapus user yang punya riwayat penting.

Jika akun punya riwayat penting, API menolak dengan pesan:

```text
Akun ini punya riwayat penting. Nonaktifkan saja agar data tetap aman.
```

Audit terkait:

```text
identity.user.permanently_deleted
identity.user.permanent_delete_blocked
```

---

## 28. Import Data

Import menggunakan pola:

```text
preview → commit
```

Alur:

```text
1. Admin/TU upload atau kirim data.
2. API parsing CSV/XLSX.
3. API validasi struktur dan duplikasi.
4. API mengembalikan preview hasil validasi.
5. Admin mengecek data.
6. Jika benar, Admin klik commit.
7. API menulis data ke database dalam transaksi.
8. Audit/import result dicatat.
```

Keuntungan:

- Mengurangi risiko data salah langsung masuk database.
- Bisa melihat error format sebelum commit.
- Lebih aman untuk data master sekolah.

---

## 29. Buku Piket

Model:

```text
PicketNote
```

Fungsi:

- Mencatat kejadian harian.
- Kategori dan severity.
- Bisa dinonaktifkan/soft-delete.
- Tercatat pembuat dan pengubah.

Role akses:

```text
ADMIN_TU
OPERATOR_IT
GURU_PIKET
```

---

## 30. Pengajuan Guru

Model:

```text
TeacherLeave
```

Jenis:

```text
IZIN
SAKIT
DINAS_LUAR
```

Status:

```text
PENDING
APPROVED
REJECTED
CANCELLED
```

Alur:

```text
1. Guru membuat pengajuan.
2. Admin/TU atau Operator melihat daftar pengajuan.
3. Admin/TU review dengan catatan.
4. Status berubah disetujui/ditolak.
5. Notifikasi dan audit terkait dicatat.
```

---

## 31. Audit Log

Model:

```text
AuditEntry
```

Audit mencatat:

- Actor/user pelaku.
- Role pelaku.
- Module.
- Action.
- Resource dan resourceId.
- Reason jika ada.
- IP dan device jika tersedia.
- Before/after JSON.
- Waktu kejadian.

Contoh action penting:

```text
auth.login.success
auth.login.failed
auth.login.locked
attendance.policy.updated
gate.tap.recorded
attendance.prayer.scan.recorded
attendance.student.checkout.blocked_missing_ashar
teacher.session.checkin
teacher.session.checkout
class.attendance.recorded
class.attendance.corrected
reconciliation.flag.resolved
identity.user.permanently_deleted
identity.user.permanent_delete_blocked
```

Tujuan audit:

- Jejak perubahan jelas.
- Memudahkan investigasi data salah.
- Mendukung akuntabilitas operator/admin/developer.

---

## 32. Laporan dan Dashboard

Fitur laporan:

- Dashboard ringkasan.
- Trend presensi.
- Live monitor.
- Rekap kelas.
- Rekap siswa.
- Rekap mapel.
- Rekap guru.
- Bulanan guru.
- Audit coverage.
- Export CSV/XLSX.

Frontend chart:

- Menggunakan React/CSS custom.
- Tidak memakai chart library tambahan.

---

## 33. Monitoring dan Health Check

Endpoint health:

```text
/api/v1/health/live
/api/v1/health/ready
/api/v1/health/detail
/health/live
/health/ready
```

Docker healthcheck:

- PostgreSQL: `pg_isready`.
- Redis: `redis-cli ping`.
- API: fetch `/api/v1/health/live`.

Script monitoring:

```text
scripts/ops_health_alert.sh
```

Yang dicek:

- Health ready.
- Health detail.
- Root HTML.
- Status container Docker Compose.
- Timer backup aktif.
- Usia backup terakhir.

Output status disimpan ke:

```text
/opt/schoolhub/output/health-alert/latest-status.json
```

Jika webhook diset, script dapat mengirim alert ketika gagal.

---

## 34. Backup dan Restore

Script backup:

```text
scripts/backup_database.sh
```

Alur backup:

```text
1. Masuk ke ROOT_DIR, default /opt/schoolhub.
2. Membaca .env produksi.
3. Menjalankan pg_dump dari container postgres.
4. Output dikompres gzip.
5. File disimpan ke BACKUP_DIR.
6. Backup lama dihapus sesuai RETENTION_DAYS.
```

Default backup directory:

```text
/home/schoolhub/backups/database
```

Format file:

```text
schoolhub-YYYYMMDD-HHMMSS.sql.gz
```

Script restore:

```text
scripts/restore_database.sh
```

Proteksi restore:

```text
CONFIRM_RESTORE=YES_RESTORE
```

Restore bisa:

- Ke database target non-produksi memakai `TARGET_DB`.
- Ke database produksi jika benar-benar dikonfirmasi.

Saran:

- Uji restore ke database non-produksi secara berkala.
- Jangan restore produksi tanpa backup terbaru.

---

## 35. Deployment Produksi

Path VPS:

```text
/opt/schoolhub
```

User deploy:

```text
schoolhub
```

SSH port eksternal:

```text
9103
```

Flow deploy yang dipakai:

```text
1. Rsync source lokal ke /opt/schoolhub.
2. Exclude .env, node_modules, dist, output, .git.
3. Validasi docker compose config.
4. Validasi nginx config.
5. Jalankan scripts/deploy_production.sh .env.
6. Docker Compose build image api/web/worker.
7. Docker Compose up -d --remove-orphans.
8. Cek docker compose ps.
9. Cek /health/live dan /health/ready.
10. Jalankan ensure-developer agar akun developer tersedia.
```

Command pola deploy:

```bash
rsync -az --delete \
  --exclude '.env' \
  --exclude 'node_modules' \
  --exclude '*/node_modules' \
  --exclude 'dist' \
  --exclude '*/dist' \
  --exclude 'output' \
  --exclude '.git' \
  -e 'ssh -p 9103' \
  ./ schoolhub@157.15.40.21:/opt/schoolhub/

ssh -p 9103 schoolhub@157.15.40.21 \
  'cd /opt/schoolhub && \
   docker compose -f docker-compose.production.yml --env-file .env config >/tmp/schoolhub-compose-check.yml && \
   docker compose -f docker-compose.production.yml --env-file .env run --rm --no-deps reverse-proxy nginx -t && \
   bash scripts/deploy_production.sh .env'
```

---

## 36. Cloudflare Quick Tunnel

Saat ini publikasi beta memakai:

```text
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:80
```

Helper untuk membaca URL aktif di VPS:

```bash
schoolhub-public-url
```

Kelebihan Quick Tunnel:

- Cepat untuk beta.
- Tidak butuh domain.
- SSL otomatis dari Cloudflare.

Kekurangan:

- URL dapat berubah saat tunnel restart.
- Kurang ideal untuk operasional serius.
- Sulit dibagikan permanen ke banyak user.

Rekomendasi produksi:

```text
Cloudflare Named Tunnel + domain/subdomain resmi sekolah
```

Contoh target:

```text
ehadir.man1rokanhulu.sch.id
```

---

## 37. Validasi dan Testing

Script root:

```text
npm run validate:final
```

Isi validasi final:

```text
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

Smoke test produksi:

```bash
BASE_URL="$(schoolhub-public-url)" bash scripts/uat_smoke.sh
```

Yang dicek smoke test:

- Health live.
- Health ready.
- Root HTML.
- Login admin/guru/siswa.
- Dashboard admin.
- Live monitor.
- List user.
- Anomali.
- Guru list sesi.
- Guru buka sesi.
- Guru load roster.
- Scan gerbang siswa.
- Scan Dhuha.
- Scan Dzuhur.
- Guru simpan presensi.
- Guru tutup sesi.
- Guru koreksi presensi.
- Siswa my-attendance.

Testing tambahan:

- Backend Jest test untuk service/module.
- Frontend Vitest test.
- Playwright E2E flow admin/guru/siswa/developer.
- Audit dependency high severity.

Catatan dependency:

- Advisory moderate dari rantai `exceljs -> uuid` pernah tercatat.
- Tidak di-force fix karena jalur fix aman belum tersedia tanpa risiko breaking.
- High severity audit tetap wajib 0 sebelum rilis.

---

## 38. Alur Data End-to-End Contoh Hari Sekolah

Contoh alur normal siswa jadwal pagi-siang:

```text
1. Siswa datang.
2. Scan gerbang IN.
3. Sistem menyimpan GateLog IN.
4. Siswa scan Dhuha di mushola.
5. Sistem menyimpan PrayerAttendanceLog DHUHA.
6. Guru buka sesi kelas.
7. Sistem validasi geofence/gate guru jika aktif.
8. Guru membuka roster.
9. Sistem cek eligibility siswa.
10. Guru simpan presensi.
11. Sesi ditutup.
12. Worker rekonsiliasi data.
13. Jika tidak ada anomali, tidak ada flag baru.
14. Siswa scan OUT saat pulang.
15. Karena tidak punya jadwal sore, Ashar tidak diwajibkan.
```

Contoh alur siswa jadwal sore:

```text
1. Siswa datang scan IN.
2. Siswa scan Dhuha.
3. Siswa mengikuti kelas pagi.
4. Siswa scan Dzuhur.
5. Siswa mengikuti kelas siang/sore.
6. Jadwal hari itu endsAt >= 15:00.
7. Siswa mencoba scan OUT sebelum Ashar.
8. API cek policy Ashar aktif.
9. API cek siswa punya jadwal sore.
10. API cek belum ada PrayerAttendanceLog ASHAR.
11. API cek belum ada override ASHAR_CHECKOUT/ALL.
12. API menolak scan OUT dengan pesan wajib scan Ashar.
13. Audit penolakan dicatat.
14. Siswa scan Ashar.
15. PrayerAttendanceLog ASHAR dibuat.
16. Siswa scan OUT lagi.
17. API menerima scan OUT.
```

Contoh alur override Ashar:

```text
1. Siswa jadwal sore harus pulang cepat karena izin/sakit.
2. Petugas membuka Scan Manual.
3. Petugas memilih scope ASHAR_CHECKOUT.
4. Petugas menulis alasan minimal 10 karakter.
5. API membuat AttendanceOverride.
6. Audit override dicatat.
7. Siswa scan OUT.
8. API menerima karena override sah.
```

---

## 39. Keamanan Sistem

Kontrol yang sudah ada:

- Password di-hash dengan bcrypt.
- JWT memiliki expiry.
- User nonaktif tidak bisa login.
- Login gagal dibatasi Redis/in-memory fallback.
- Nginx rate limit login dan API.
- DTO validation ketat.
- Role-based access control.
- Developer-only untuk aksi berisiko tinggi.
- Hapus permanen dilindungi relasi historis.
- Clean data preview-first.
- Audit log untuk aksi penting.
- Security header di Nginx.
- Container healthcheck.
- Backup database terjadwal.

Hal yang perlu dijaga:

- Secret `.env` jangan dibagikan.
- JWT_SECRET harus random panjang.
- WORKER_TOKEN harus random panjang.
- Password admin/developer harus diganti dari default.
- Akses SSH harus dibatasi.
- Domain permanen sebaiknya memakai HTTPS resmi.
- Backup perlu diuji restore.

---

## 40. Batasan Saat Ini

Batasan yang masih ada:

1. Link publik masih Quick Tunnel sehingga dapat berubah.
2. Hardware RFID fisik belum menjadi bagian deployment ini.
3. APK/mobile native belum dibuat.
4. Domain permanen belum dipasang.
5. Beberapa data real sekolah perlu diimpor dan diverifikasi bertahap.
6. Advisory moderate `exceljs -> uuid` perlu dipantau sampai ada jalur update aman.

---

## 41. Rekomendasi Lanjutan

Prioritas teknis:

1. Pasang domain permanen dengan Cloudflare Named Tunnel.
2. Pastikan backup timer aktif dan restore test rutin.
3. Import data real bertahap: guru, kelas, mapel, siswa, jadwal, enrollment.
4. Beta test 1 kelas selama 3–5 hari.
5. Perbaiki SOP berdasarkan feedback operator/guru.
6. Tambahkan dashboard status tunnel/domain.
7. Siapkan integrasi RFID fisik setelah alur manual stabil.
8. Buat checklist harian Admin/TU dan Guru Piket.
9. Lakukan review keamanan berkala untuk secrets, role, audit, dan backup.

Prioritas operasional:

1. Tetapkan siapa pemegang akun Developer.
2. Admin/TU tidak memakai akun Developer untuk kerja harian.
3. Semua override wajib alasan jelas.
4. Guru dilatih alur buka/tutup sesi.
5. Guru Piket dilatih buku piket dan anomali.
6. Siswa diberi arahan scan gerbang/mushola/pulang.
7. Jadwal sore harus akurat agar aturan Ashar tidak salah menahan siswa.

---

## 42. Ringkasan Cara Sistem Berpikir

Secara sederhana, sistem bekerja dengan prinsip:

```text
Identitas user jelas
→ Aksi user dicatat
→ Syarat absensi dicek oleh policy
→ Data presensi disimpan
→ Worker mencari data yang tidak sinkron
→ Admin/petugas menindaklanjuti anomali
→ Semua perubahan penting masuk audit
→ Backup dan monitoring menjaga operasional
```

Logika utama absensi adaptif:

```text
Gerbang membuktikan siswa/guru datang.
Mushola membuktikan siswa menjalankan scan ibadah wajib sesuai waktu.
Kelas membuktikan siswa benar-benar ikut pembelajaran.
Ashar membatasi siswa jadwal sore agar tidak pulang sebelum kewajiban selesai.
Override hanya untuk kondisi sah dan wajib punya alasan.
Rekonsiliasi mencari mismatch antar bukti tersebut.
Audit menjaga semua keputusan bisa ditelusuri.
```

---

## 43. File Kunci untuk Analisis Lanjutan

| Area | File |
|---|---|
| Docker produksi | `docker-compose.production.yml` |
| Nginx reverse proxy | `ops/nginx/reverse-proxy.conf` |
| API bootstrap | `apps/api/src/main.ts` |
| API module list | `apps/api/src/app.module.ts` |
| Auth login | `apps/api/src/modules/auth/auth.service.ts` |
| JWT strategy | `apps/api/src/modules/auth/jwt.strategy.ts` |
| Role guard | `apps/api/src/common/roles.guard.ts` |
| Attendance gerbang/mushola | `apps/api/src/modules/attendance-gate/attendance-gate.service.ts` |
| Attendance kelas | `apps/api/src/modules/attendance-class/attendance-class.service.ts` |
| Reconciliation | `apps/api/src/modules/reconciliation/reconciliation.service.ts` |
| Identity/user | `apps/api/src/modules/identity/identity.service.ts` |
| System cleanup | `apps/api/src/modules/system-cleanup/system-cleanup.service.ts` |
| Prisma schema | `prisma/schema.prisma` |
| Seed | `prisma/seed.ts` |
| Worker | `apps/worker/src/index.js` |
| Frontend shell | `apps/web/src/app/SchoolHubApp.tsx` |
| Frontend API helper | `apps/web/src/app/api.ts` |
| Admin UI | `apps/web/src/app/pages/admin/AdminPages.jsx` |
| Guru UI | `apps/web/src/app/pages/guru/GuruPages.jsx` |
| Siswa UI | `apps/web/src/app/pages/siswa/MyAttendancePage.jsx` |
| Deploy script | `scripts/deploy_production.sh` |
| Backup script | `scripts/backup_database.sh` |
| Restore script | `scripts/restore_database.sh` |
| Smoke test | `scripts/uat_smoke.sh` |
| Final validation | `scripts/validate_final.sh` |
| Health alert | `scripts/ops_health_alert.sh` |

---

## 44. Kesimpulan

Sistem e-Hadir MAN 1 Rokan Hulu sudah memiliki pondasi produksi/beta yang cukup lengkap:

- Frontend role-based.
- Backend modular.
- Database relational dengan audit dan rekonsiliasi.
- Absensi adaptif gerbang/mushola/kelas.
- Aturan Ashar untuk siswa jadwal sore.
- Manual override terkontrol.
- Developer control center.
- Backup, restore, health check, smoke test, dan deployment Docker Compose.

Kondisi yang paling perlu diselesaikan sebelum operasional luas adalah:

```text
Domain permanen + data real + beta test terbatas + SOP petugas
```

Setelah itu, sistem bisa diperluas ke hardware RFID fisik dan operasional seluruh sekolah secara bertahap.
