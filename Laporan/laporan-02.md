# Laporan 02 — Analisis Total Terbaru SchoolHub e-Hadir MAN 1 Rokan Hulu

**Tanggal dokumen:** 2026-05-02  
**Nama sistem:** SchoolHub e-Hadir MAN 1 Rokan Hulu  
**Status dokumen:** Versi update dari `Laporan/laporan-01.md`, diperluas untuk analisis total teknis, keamanan, operasional, UI/UX, deployment, dan kesiapan beta/produksi.  
**Target pembaca:** Kepala madrasah/tim manajemen, Admin/TU, Operator IT, Guru Piket, Developer, auditor internal, dan tim pengembang lanjutan.

> **Catatan keamanan penting:** dokumen ini sengaja **tidak** mencantumkan password, JWT secret, worker token, reader secret, private key, isi `.env`, atau kredensial VPS. Semua nilai rahasia harus tetap berada di secret store/file `.env` produksi dan tidak boleh disalin ke dokumen analisis.

---

## 0. Ringkasan Eksekutif

SchoolHub e-Hadir adalah sistem absensi digital MAN 1 Rokan Hulu dengan konsep **bukti berlapis**:

```text
Identitas user
→ Scan gerbang
→ Scan mushola Dhuha/Dzuhur/Ashar
→ Sesi kelas oleh guru
→ Presensi siswa di kelas
→ Scan keluar/pulang
→ Rekonsiliasi otomatis
→ Audit dan laporan
```

Dibanding laporan 01, kondisi terbaru sudah lebih matang karena sistem telah menerima tambahan hardening besar:

1. **Session lebih aman**: login memakai cookie HttpOnly, refresh-token rotation, session revocation, dan session versioning.
2. **Reader resmi lebih aman**: endpoint scan resmi memakai HMAC signature, body hash, timestamp skew, dan nonce anti-replay.
3. **Anti-curang gerbang lebih kuat**: scan duplikat, OUT tanpa IN, IN berulang, dan OUT terlalu cepat ditolak/diflag.
4. **Mushola lebih ketat**: scan Dhuha/Dzuhur/Ashar resmi hanya dari reader aktif bertanda tangan.
5. **Override manual dikontrol**: scope enum, expiry wajib, status approval/revoke, reason minimal berkualitas, dan audit.
6. **Presensi kelas lebih aman**: siswa di luar roster ditolak, eligibility dicek server-side, koreksi dicatat sebagai event immutable.
7. **Audit lebih audit-ready**: audit runtime memakai hash-chain tamper-evident dan tersedia endpoint verifikasi chain.
8. **Reporting lebih akuntabel**: export laporan diaudit dan diberi checksum header.
9. **Nginx lebih aman**: CSP aktif, endpoint internal diblokir dari publik, rate limit login/API/scan dipisah.
10. **UI/UX terbaru sudah dibenahi**: halaman guru presensi, admin master-data, dan admin devices sudah responsive/card-like tanpa horizontal scrollbar.

Status runtime terakhir yang diverifikasi:

```text
URL beta aktif : https://serious-hardware-stock-arrived.trycloudflare.com
VPS target     : 157.15.40.21
Deploy path    : /opt/schoolhub
Runtime        : Docker Compose production
Smoke test     : PASS 31 / FAIL 0 / SKIP 0
```

Backup produksi terbaru yang dibuat sebelum deploy terakhir:

```text
/home/schoolhub/backups/database/schoolhub-20260502-183214.sql.gz
```

Status container terakhir yang dicek:

| Container | Service | Status ringkas |
|---|---|---|
| `schoolhub-api-1` | `api` | Up, healthy |
| `schoolhub-nginx` | `reverse-proxy` | Up |
| `schoolhub-postgres` | `postgres` | Up, healthy |
| `schoolhub-redis` | `redis` | Up, healthy |
| `schoolhub-web` | `web` | Up |
| `schoolhub-worker` | `worker` | Up |

Kesimpulan cepat:

```text
Sistem sudah layak untuk beta terbatas yang terkontrol.
Untuk produksi luas, prioritas berikutnya adalah domain permanen, data real, SOP final, restore drill, dan UAT lapangan dengan user nyata.
```

---

## 1. Perbedaan Utama Laporan 02 dari Laporan 01

| Area | Laporan 01 | Laporan 02 / Kondisi terbaru |
|---|---|---|
| URL beta | URL Quick Tunnel lama | URL aktif terbaru `serious-hardware-stock-arrived.trycloudflare.com` |
| Migration terakhir | `0011_student_ashar_checkout_policy` | `0012_security_anti_cheat_hardening` |
| Session | JWT/token login dasar | Cookie HttpOnly, refresh rotation, revocation, sessionVersion |
| Reader scan | Masih ada payload legacy/manual | Endpoint resmi `reader-scan` dengan signed request HMAC |
| Audit | Audit log biasa | Audit hash-chain tamper-evident + verify endpoint |
| Override | Scope string, expiry belum kuat | Scope enum, expiry wajib, status approval/revoke/expired |
| Presensi kelas | Eligibility sudah ada | Ditambah roster strict, correction event, evidence label |
| Reconciliation | Flag dasar | Flag anti-curang tambahan + evidence/recommendation/fingerprint |
| Nginx | Security headers dan rate limit dasar | CSP, scan rate limit, `/api/v1/internal/*` public block |
| UI tables | Beberapa area masih berpotensi sempit/overflow | Master data dan devices memakai card responsive/no horizontal scrollbar |
| Google Fonts | Pernah ada external font issue dengan CSP | External Google Fonts dihapus, CSP tetap ketat |
| Deployment terbaru | Baseline deploy | Deploy terbaru sukses + smoke 31/31 |

---

## 2. Status Kesiapan Sistem Saat Ini

### 2.1 Status Teknis

| Komponen | Status | Catatan |
|---|---:|---|
| Frontend React/Vite | ✅ Jalan | Build produksi berhasil dan served via container `web` |
| Backend NestJS | ✅ Jalan | API healthy dan smoke test lulus |
| PostgreSQL | ✅ Jalan | Persistent volume aktif |
| Redis | ✅ Jalan | Dipakai limiter/nonce/session-adjacent cache |
| Worker | ✅ Jalan | Auto-missed dan rekonsiliasi periodik |
| Reverse proxy Nginx | ✅ Jalan | CSP/rate limit/internal block aktif |
| Docker Compose | ✅ Jalan | Semua service up |
| Cloudflare Quick Tunnel | ✅ Jalan sementara | URL dapat berubah jika tunnel restart |
| Backup DB | ✅ Ada | Backup terbaru tersedia sebelum deploy terakhir |
| Smoke UAT otomatis | ✅ PASS | 31 pass, 0 fail |

### 2.2 Status Keamanan

| Kontrol | Status | Detail |
|---|---:|---|
| Password hashing | ✅ | bcryptjs |
| JWT expiry | ✅ | Diatur melalui env |
| HttpOnly cookie auth | ✅ | Access/refresh cookie diset server |
| Refresh-token rotation | ✅ | AuthSession baru saat refresh, session lama revoked |
| User active check | ✅ | JWT strategy cek user masih aktif |
| Session revocation | ✅ | Logout/logout-all/revoke user session |
| Login rate limit | ✅ | Redis + memory fallback + Nginx login limit |
| CORS whitelist production | ✅ | Berdasarkan `CORS_ORIGIN` / `PUBLIC_APP_ORIGIN` |
| Signed reader request | ✅ | HMAC + bodyHash + timestamp + nonce |
| Nonce anti-replay | ✅ | Redis TTL |
| Audit hash-chain | ✅ | `prevHash`, `entryHash`, `canonicalPayload` |
| Internal endpoint block | ✅ | Nginx return 404 untuk `/api/v1/internal/*` publik |
| CSP | ✅ | Self-only, inline style diizinkan untuk kebutuhan UI |
| High severity npm audit | ✅ | Lulus audit high severity |
| Moderate advisory | ⚠️ | `exceljs -> uuid`, belum diforce karena risiko breaking |

### 2.3 Status UI/UX

| Area UI | Status terbaru |
|---|---|
| `/guru/presensi` | Dropdown sesi dan layout sudah dibenahi |
| Topbar role status | Chip role aktif dipindah agar rapi dan kompatibel E2E |
| CSP/Font | Google Fonts eksternal dihapus agar tidak bentrok CSP |
| `/admin/master-data` | Table responsive/card-like, `data-label` aktif, no horizontal scrollbar |
| `/admin/devices` | Daftar kartu dan alat pembaca responsive/card-like, action button tidak clip |
| Tabel umum | CSS diperkuat untuk wrapping dan card behavior di area sempit |

---

## 3. Tujuan Sistem

Tujuan utama SchoolHub e-Hadir:

1. Mencatat kehadiran siswa dan guru secara digital.
2. Menghubungkan bukti hadir dari beberapa sumber: gerbang, mushola, kelas, dan guru.
3. Mencegah manipulasi absensi melalui kontrol server-side, reader signature, audit, dan rekonsiliasi.
4. Memberikan dashboard operasional untuk Admin/TU, Operator IT, Guru Piket, Guru Mapel, Siswa, dan Developer.
5. Menyediakan data laporan yang dapat dianalisis dan diaudit.
6. Menjadi fondasi integrasi hardware RFID/QR resmi di tahap berikutnya.

Prinsip desain:

```text
Browser tidak dipercaya.
Payload client tidak menjadi sumber kebenaran.
Reader tidak dipercaya sebelum signature valid.
Database menjadi source of truth.
Semua aksi penting harus punya audit trail.
Data historis tidak boleh hilang sembarangan.
Override harus sempit, beralasan, dan bisa ditelusuri.
```

---

## 4. Arsitektur Runtime Produksi

```text
User Browser
   │
   │ HTTPS via Cloudflare Quick Tunnel sementara
   ▼
Cloudflare Quick Tunnel
   │
   │ Forward ke VPS port 80
   ▼
VPS 157.15.40.21
   │
   ▼
Nginx Reverse Proxy :80
   ├── /api/v1/auth/login            → API NestJS :3000 + login rate limit
   ├── /api/v1/attendance/*scan*     → API NestJS :3000 + scan rate limit
   ├── /api/v1/internal/*            → 404 dari publik
   ├── /api/*                        → API NestJS :3000
   ├── /health/live, /health/ready   → API health
   └── /*                            → Web React static app

NestJS API
   ├── Auth + Session
   ├── Role Guard + Access Policy
   ├── Attendance Gate/Mushola/Class
   ├── Reconciliation
   ├── Reporting
   ├── Audit Hash Chain
   ├── Prisma ORM
   ├── Redis client
   └── PostgreSQL

Worker Container
   ├── POST internal /sessions/mark-missed
   └── POST internal /reconciliation/run
```

Trust boundary:

| Boundary | Risiko | Kontrol |
|---|---|---|
| Browser → API | Manipulasi request, XSS token theft | HttpOnly cookie, DTO validation, RBAC, CORS whitelist, CSP |
| Reader → API | Reader palsu/replay | HMAC signature, nonce, timestamp skew, body hash, reader active check |
| API → DB | Bug service menulis data salah | Prisma transaction, validation, audit, relation constraints |
| Worker → API | Endpoint internal disalahgunakan | Worker token + Nginx block dari publik |
| Admin/Operator | Penyalahgunaan privilege | Role guard, step-up opsional, audit hash-chain, protected delete |
| Export laporan | Laporan dimanipulasi/diambil diam-diam | RBAC, audit export, checksum |

---

## 5. Stack Teknologi Terbaru

| Layer | Teknologi | Versi/Status | Fungsi |
|---|---|---:|---|
| Frontend | React | 18.3.1 | UI web role-based |
| Frontend build | Vite | 6.4.2 | Build production/dev server |
| Routing | React Router DOM | 6.30.3 | Navigasi route |
| Icon | lucide-react | 0.508.x | Ikon UI |
| Animasi | framer-motion | 12.x | Animasi/transisi UI |
| Styling | CSS custom | Aktif | Glass UI, responsive layout, card table |
| API | NestJS | 11.1.x | REST API utama |
| ORM | Prisma | 5.22.0 | Database client/migration |
| Database | PostgreSQL | 16 Alpine | Data utama |
| Cache/security state | Redis | 7 Alpine | Login limiter, nonce, fallback cache |
| Auth | Passport JWT + cookie | Aktif | Session dan guard |
| Password hash | bcryptjs | 2.4.3 | Hash password user |
| Excel/CSV | exceljs | 4.4.x | Import/export data |
| Worker | Node.js + axios | Aktif | Job periodik internal |
| Reverse proxy | Nginx | 1.27 Alpine | Routing, header, rate limit |
| Container | Docker Compose | Aktif | Production runtime |
| E2E | Playwright | 1.59.x | Browser regression test |
| API test | Jest | 29.x | Unit/service test |
| Web test | Vitest | 4.x | Unit test frontend |

---

## 6. Struktur Repository

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
├── scripts              # Deploy, backup, restore, smoke, monitor, validation
├── docs                 # SOP, audit keamanan, runbook, UAT, Cloudflare tunnel
├── Laporan
│   ├── laporan-01.md    # Laporan arsitektur awal
│   └── laporan-02.md    # Dokumen ini
├── docker-compose.production.yml
├── .env.production.example
└── package.json
```

Catatan tata kelola:

- Folder lokal saat ini terindikasi bukan repository Git aktif. Untuk produksi jangka panjang, source code sebaiknya masuk Git private agar ada history, branch, review, dan rollback berbasis commit.
- `.env` produksi tidak boleh di-commit dan tidak boleh ikut rsync.

---

## 7. Docker Compose Produksi

File produksi:

```text
docker-compose.production.yml
```

Service:

| Service | Container | Fungsi | Exposure |
|---|---|---|---|
| `postgres` | `schoolhub-postgres` | Database utama | Internal Docker |
| `redis` | `schoolhub-redis` | Redis appendonly | Internal Docker |
| `api` | `schoolhub-api-1` | NestJS API | Internal `3000` |
| `worker` | `schoolhub-worker` | Auto missed + reconciliation | Internal |
| `web` | `schoolhub-web` | Static React via Nginx web | Internal `80` |
| `reverse-proxy` | `schoolhub-nginx` | Public Nginx | Host `80:80` |

Persistent volumes:

```text
postgres_data → PostgreSQL data
redis_data    → Redis AOF/data
```

Logging:

```text
json-file
max-size: 10m
max-file: 5
```

Healthcheck:

| Service | Healthcheck |
|---|---|
| PostgreSQL | `pg_isready` |
| Redis | `redis-cli ping` |
| API | Fetch `/api/v1/health/live` |

---

## 8. Environment Production

Template:

```text
.env.production.example
```

Kategori environment:

### 8.1 Database dan Cache

| Variabel | Fungsi | Catatan |
|---|---|---|
| `POSTGRES_DB` | Nama database | Jangan diubah setelah data berjalan tanpa migrasi/restore plan |
| `POSTGRES_USER` | User database | Rahasia operasional |
| `POSTGRES_PASSWORD` | Password DB | Rahasia |
| `DATABASE_URL` | URL Prisma | Rahasia |
| `REDIS_URL` | URL Redis | Umumnya `redis://redis:6379` internal |

### 8.2 Auth dan Session

| Variabel | Fungsi | Catatan |
|---|---|---|
| `JWT_SECRET` | Secret sign JWT | Wajib panjang/random, production fail-fast jika default/kosong |
| `JWT_EXPIRES_IN` | Expiry access token | Contoh `8h` |
| `SESSION_TTL_MS` | TTL access cookie | Default 8 jam |
| `REFRESH_TTL_MS` | TTL refresh session | Default 7 hari |

### 8.3 Worker dan Reader

| Variabel | Fungsi | Catatan |
|---|---|---|
| `WORKER_TOKEN` | Token internal worker | Wajib rahasia |
| `READER_SECRET_ENCRYPTION_KEY` | Enkripsi secret reader | Wajib rahasia dan stabil |
| `READER_SIGNATURE_SKEW_MS` | Toleransi timestamp reader | Default sekitar 2 menit |
| `READER_NONCE_TTL_MS` | TTL nonce anti-replay | Default sekitar 5 menit |

### 8.4 Web/CORS/Origin

| Variabel | Fungsi | Catatan |
|---|---|---|
| `CORS_ORIGIN` | Origin yang boleh akses API | Wajib disesuaikan domain final |
| `PUBLIC_APP_ORIGIN` | Origin publik aplikasi | Dipakai whitelist/future reference |

### 8.5 Step-up dan Policy

| Variabel | Fungsi | Catatan |
|---|---|---|
| `STEP_UP_FOR_POLICY` | Password ulang untuk ubah policy | Disarankan `true` production |
| `STEP_UP_FOR_READER_ROTATE` | Password ulang untuk rotate reader secret | Disarankan `true` production |
| `MIN_GATE_STAY_MINUTES` | Minimal durasi masuk-keluar normal | Default 10 menit |

Aturan wajib:

```text
Jangan hard-code secret.
Jangan menyalin secret ke laporan/chat.
Jangan deploy .env lokal menimpa .env produksi.
Ganti semua placeholder/default sebelum produksi luas.
```

---

## 9. Nginx Reverse Proxy dan Security Header

File:

```text
ops/nginx/reverse-proxy.conf
```

Fungsi utama:

1. Menerima trafik publik port 80.
2. Meneruskan API ke container `api:3000`.
3. Meneruskan static app ke container `web:80`.
4. Menyediakan shortcut health.
5. Menerapkan gzip.
6. Menerapkan security headers.
7. Menerapkan rate limit.
8. Memblokir endpoint internal dari publik.

Rate limit:

| Area | Limit |
|---|---:|
| Login `/api/v1/auth/login` | 10 request/menit, burst 10 |
| API umum `/api/*` | 20 request/detik, burst 80 |
| Scan `/api/v1/attendance/(reader-scan|qr-scan|gate/tap)` | 5 request/detik, burst 20 |

Security headers aktif:

```text
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(self)
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'
```

Catatan CSP:

- Google Fonts eksternal sudah dihapus dari `apps/web/index.html`.
- `style-src 'unsafe-inline'` masih dipakai karena kebutuhan styling runtime/React UI. Jika ingin lebih ketat, perlu refactor style inline dan/atau nonce/hashing.

Internal endpoint:

```text
location ^~ /api/v1/internal/ { return 404; }
```

Artinya endpoint worker tidak bisa dipanggil dari publik lewat Nginx. Worker tetap bisa memanggil API lewat jaringan Docker internal.

---

## 10. Backend API

Lokasi:

```text
apps/api
```

Framework:

```text
NestJS 11
```

Global prefix:

```text
/api/v1
```

Bootstrap security:

- `ValidationPipe` global.
- `whitelist: true`.
- `transform: true`.
- `forbidNonWhitelisted: true`.
- CORS credential-aware.
- Production CORS memakai whitelist origin dari env.

DTO validation berarti request dengan field asing dapat ditolak sehingga payload liar tidak diam-diam masuk proses bisnis.

---

## 11. Modul Backend

| Modul | Fungsi utama |
|---|---|
| `PrismaModule` | Prisma client dan koneksi DB |
| `RedisModule` | Redis helper untuk limiter/nonce/cache |
| `AuthModule` | Login, refresh, logout, logout-all, JWT strategy |
| `HealthModule` | Health live/ready/detail |
| `IdentityModule` | User, role, import, aktivasi/nonaktif, delete aman |
| `AcademicModule` | Tahun ajaran, semester, room, kelas, mapel, enrollment |
| `SchedulingModule` | Jadwal mingguan dan session harian |
| `AttendanceGateModule` | Gate/mushola/manual override/signed reader scan |
| `AttendanceClassModule` | Open/close session, roster, presensi, koreksi |
| `ReconciliationModule` | Deteksi anomali dan workflow resolve/escalate |
| `AccessGeofenceModule` | Geofence guru dan policy buka sesi |
| `DeviceReaderModule` | Reader official, rotate key/secret, status |
| `SmartCardModule` | Smart card UID user |
| `PicketBookModule` | Buku piket |
| `NotificationsModule` | Notifikasi user/role |
| `TeacherLeaveModule` | Izin/sakit/dinas luar guru |
| `TutorialsModule` | Tutorial onboarding per role |
| `SystemCleanupModule` | Clean data developer-only preview-first |
| `ReportingModule` | Dashboard, live monitor, rekap, export |
| `AuditModule` | Audit list dan verify hash-chain |
| `SecurityModule` | Signature reader, audit chain, step-up, access policy |

---

## 12. Endpoint API Utama Terbaru

Semua endpoint di bawah prefix:

```text
/api/v1
```

### 12.1 Auth

| Method | Endpoint | Fungsi |
|---|---|---|
| `POST` | `/auth/login` | Login, set access/refresh HttpOnly cookie, return user |
| `POST` | `/auth/refresh` | Rotate refresh token dan set cookie baru |
| `POST` | `/auth/logout` | Revoke session aktif dan clear cookie |
| `POST` | `/auth/logout-all` | Revoke semua session user |

### 12.2 Health

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/health/live` | API hidup |
| `GET` | `/health/ready` | API siap menerima trafik |
| `GET` | `/health/detail` | Detail health untuk observasi |

### 12.3 Identity/User

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/identity/users` | List user paginated |
| `POST` | `/identity/users` | Buat user |
| `PATCH` | `/identity/users/:id` | Update user |
| `DELETE` | `/identity/users/:id` | Nonaktif/soft delete |
| `DELETE` | `/identity/users/:id/permanent` | Hapus permanen aman, developer-only |
| `POST` | `/identity/users/import/preview` | Preview import JSON |
| `POST` | `/identity/users/import/commit` | Commit import JSON |
| `POST` | `/identity/users/import/file/preview` | Preview import file |
| `POST` | `/identity/users/import/file/commit` | Commit import file |
| `GET` | `/identity/me` | Profil sendiri |
| `PATCH` | `/identity/me` | Update profil sendiri |

### 12.4 Academic

| Area | Endpoint ringkas |
|---|---|
| Tahun ajaran | `/academic/years` |
| Semester | `/academic/semesters` |
| Room | `/academic/rooms` |
| Kelas | `/academic/classes` |
| Mapel | `/academic/subjects` |
| Siswa | `/academic/students` |
| Enrollment | `/academic/enrollments` |
| Import | `/academic/import/*` |

### 12.5 Scheduling

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET/POST` | `/schedules/weekly` | Jadwal mingguan |
| `PATCH` | `/schedules/weekly/:id` | Update jadwal mingguan |
| `POST` | `/schedules/weekly/:id/generate` | Generate session dari jadwal |
| `GET/POST` | `/schedules/sessions` | Session harian |
| `PATCH` | `/schedules/sessions/:id` | Update session |

### 12.6 Attendance Gate/Mushola/Override

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/attendance/policy` | Ambil policy absensi |
| `PUT` | `/attendance/policy` | Update policy absensi |
| `GET` | `/attendance/gate/logs` | Riwayat gate log |
| `GET` | `/attendance/prayer/logs` | Riwayat scan mushola |
| `POST` | `/attendance/reader-scan` | Scan resmi signed reader |
| `POST` | `/attendance/qr-scan` | Manual/legacy scan terkontrol |
| `POST` | `/attendance/gate/tap` | Manual tap gate dengan alasan |
| `POST` | `/attendance/overrides` | Buat override |
| `POST` | `/attendance/overrides/:id/approve` | Approve override |
| `POST` | `/attendance/overrides/:id/revoke` | Revoke override |

### 12.7 Attendance Class

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/attendance/class-sessions` | List session guru/admin |
| `POST` | `/attendance/class-sessions/:id/open` | Buka/check-in session |
| `PUT` | `/attendance/class-sessions/:id/attendance` | Simpan presensi kelas |
| `POST` | `/attendance/class-sessions/:id/close` | Tutup/check-out session |
| `GET` | `/attendance/class-sessions/:id/summary` | Summary session |
| `GET` | `/attendance/class-sessions/:id/roster` | Roster + eligibility |
| `PATCH` | `/attendance/class-sessions/:id/attendance/:studentId` | Koreksi presensi |

### 12.8 Reconciliation

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/reconciliation/flags` | List anomali |
| `POST` | `/reconciliation/flags/:id/resolve` | Resolve flag |
| `PATCH` | `/reconciliation/flags/:id/workflow` | Ubah workflow review |
| `POST` | `/reconciliation/flags/:id/escalate` | Eskalasi flag |
| `POST` | `/internal/reconciliation/run` | Worker rekonsiliasi internal |
| `POST` | `/internal/sessions/mark-missed` | Worker auto missed internal |

### 12.9 Reporting

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/reports/dashboard` | Dashboard admin |
| `GET` | `/reports/live-monitor` | Live monitor snapshot |
| `GET` | `/reports/live-monitor/stream` | SSE live monitor |
| `GET` | `/reports/class/:classId/monthly` | Monthly class |
| `GET` | `/reports/trend` | Trend |
| `GET` | `/reports/my-attendance` | Riwayat user sendiri |
| `GET` | `/reports/recap/classes` | Rekap kelas |
| `GET` | `/reports/recap/students` | Rekap siswa |
| `GET` | `/reports/recap/subjects` | Rekap mapel |
| `GET` | `/reports/recap/teachers` | Rekap guru |
| `GET` | `/reports/teacher-monthly` | Laporan bulanan guru |
| `GET` | `/reports/audit-coverage` | Cakupan audit |
| `GET` | `/reports/export` | Export CSV/XLSX + checksum |

### 12.10 Audit

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/audit` | List audit log |
| `GET` | `/audit/verify-chain` | Verifikasi hash-chain audit |

---

## 13. Role dan Hak Akses

Enum role:

```text
ADMIN_TU
GURU_MAPEL
GURU_PIKET
SISWA
OPERATOR_IT
DEVELOPER
```

Role guard:

- Endpoint memberi daftar role yang diizinkan.
- User harus login dan aktif.
- Role `DEVELOPER` menjadi super-admin teknis dan dapat melewati pembatas role guard.
- Untuk ownership yang lebih detail, service memakai `AccessPolicyService`.

Ringkasan role:

| Role | Tugas utama | Catatan risiko |
|---|---|---|
| `ADMIN_TU` | Operasional sekolah, user, master data, laporan, policy | Akses luas, harus dipakai harian bukan Developer |
| `OPERATOR_IT` | Perangkat, teknis harian, monitoring | Jangan diberi hak policy sensitif tanpa SOP |
| `GURU_PIKET` | Buku piket, anomali, bantuan presensi | Override harus beralasan |
| `GURU_MAPEL` | Buka/tutup sesi, presensi kelas | Harus hanya sesi miliknya |
| `SISWA` | Lihat kehadiran pribadi | Read-only |
| `DEVELOPER` | Kontrol teknis, cleanup, emergency | Harus sangat terbatas pemegangnya |

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

## 14. Auth, Session, dan Login Flow

### 14.1 Login Normal

```text
1. User membuka /login.
2. User mengisi username/password.
3. Browser POST /api/v1/auth/login.
4. API normalisasi username.
5. API cek limiter gagal login.
6. API cari user dan cek active.
7. API bandingkan password bcrypt.
8. API membuat AuthSession dan refresh token.
9. API sign access JWT dengan sid + sessionVersion.
10. API set cookie HttpOnly access dan refresh.
11. API mencatat audit auth.login.success.
12. Frontend menyimpan data user non-secret di localStorage.
13. Frontend redirect sesuai role.
```

### 14.2 Refresh Token

```text
1. API call mendapat 401.
2. Frontend POST /auth/refresh dengan credentials include.
3. API mencari refresh token hash di AuthSession.
4. Session lama di-revoke dengan alasan refresh-rotated.
5. API membuat AuthSession baru.
6. Cookie baru dikirim.
7. Request awal dicoba ulang.
```

### 14.3 Logout

```text
1. User klik logout.
2. Frontend POST /auth/logout.
3. API revoke session aktif.
4. API clear cookie.
5. Frontend hapus user cache dan kembali ke /login.
```

### 14.4 Proteksi Login Gagal

Kunci limiter memakai kombinasi:

- username + IP,
- account-only,
- IP-only.

Jika Redis tidak tersedia, ada memory fallback agar login brute force tetap dibatasi.

Audit:

```text
auth.login.success
auth.login.failed
auth.login.locked
auth.session.rotated
auth.logout
auth.sessions.revoked
auth.user_sessions.revoked
```

---

## 15. Signed Reader Scan

Endpoint resmi:

```text
POST /api/v1/attendance/reader-scan
```

Header wajib:

```text
x-reader-device-id
x-reader-timestamp
x-reader-nonce
x-reader-body-hash
x-reader-signature
```

Payload minimal:

```json
{
  "cardUid": "UID-KARTU",
  "direction": "IN"
}
```

Canonical signature payload:

```text
METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_HASH
```

Validasi server:

1. Header lengkap.
2. `bodyHash` dan `signature` format hex 64.
3. Timestamp valid dan tidak melewati skew.
4. Body hash cocok dengan canonical JSON body.
5. DeviceReader ada dan status `ACTIVE`.
6. Reader punya secret terenkripsi.
7. Nonce belum pernah dipakai.
8. HMAC signature cocok.
9. Nonce disimpan Redis TTL.
10. `lastSeenAt` dan `lastSignedScanAt` reader diperbarui.

Dampak keamanan:

- Request replay ditolak.
- Reader palsu tanpa secret ditolak.
- Payload body tidak bisa diubah tanpa merusak body hash/signature.
- Waktu presensi memakai waktu server, bukan waktu client.

---

## 16. Alur Scan Gerbang Terbaru

### 16.1 Gate IN

```text
1. Kartu discan reader GATE resmi.
2. API validasi signature reader.
3. API mencari SmartCard aktif dan user aktif.
4. API cek duplicate scan window.
5. API cek state harian: tidak boleh IN berulang tanpa OUT.
6. Jika valid, GateLog IN dibuat.
7. Audit attendance.reader.gate.scan.accepted dicatat.
8. Jika ada pelanggaran, request ditolak dan/atau ReconciliationFlag dibuat.
```

### 16.2 Gate OUT

```text
1. User scan keluar.
2. API validasi signature/authorization sesuai jalur.
3. API cek duplicate window.
4. API wajibkan ada IN valid hari itu.
5. Jika OUT terlalu cepat dari IN, sistem membuat flag OUT_TERLALU_CEPAT.
6. Jika user SISWA dan jadwal sore, sistem cek scan Ashar atau override sah.
7. Jika valid, GateLog OUT dibuat.
8. Audit dicatat.
```

### 16.3 Flag gate anti-curang

| Flag | Pemicu | Dampak |
|---|---|---|
| `SCAN_DUPLIKAT` | Scan direction sama dalam window duplikat | Request ditolak dan flag dibuat |
| `IN_BERULANG` | IN lagi padahal belum OUT | Ditolak kecuali override sah |
| `OUT_TANPA_IN` | OUT tanpa IN hari itu | Ditolak kecuali override sah |
| `OUT_TERLALU_CEPAT` | OUT terlalu dekat dari IN | Log dapat masuk tapi flag review dibuat |
| `OUT_BERULANG` | OUT berulang mencurigakan | Flag rekonsiliasi |

---

## 17. Alur Scan Mushola Dhuha/Dzuhur/Ashar

Prayer type:

```text
DHUHA
DZUHUR
ASHAR
```

Window default:

| Ibadah | Mulai | Selesai |
|---|---:|---:|
| Dhuha | 07:00 | 10:30 |
| Dzuhur | 11:45 | 13:30 |
| Ashar | 15:00 | 16:30 |

Ketentuan terbaru:

- Scan mushola resmi harus lewat reader type `MUSHOLA` aktif dan signed.
- Manual/legacy `qr-scan` dengan reader type `MUSHOLA` ditolak.
- `PrayerType` dihitung server dari waktu server dan AttendancePolicy.
- Satu siswa hanya punya satu log per prayer type per tanggal.
- Duplicate prayer scan ditolak.

Alur:

```text
1. Siswa scan kartu di reader MUSHOLA.
2. API validasi HMAC signature.
3. API cek kartu aktif dan user role SISWA.
4. API hitung prayerType dari window waktu policy.
5. API cek belum ada log prayer yang sama hari itu.
6. API membuat PrayerAttendanceLog.
7. Audit attendance.reader.prayer.scan.accepted dicatat.
8. Data dipakai eligibility kelas dan checkout Ashar.
```

---

## 18. AttendancePolicy

Model:

```text
AttendancePolicy
```

Field penting:

| Field | Fungsi | Default/arah |
|---|---|---|
| `requireStudentGateInBeforeClass` | Siswa harus scan gerbang sebelum kelas | true |
| `requireStudentDhuha` | Wajib Dhuha untuk sesi setelah Dhuha | true |
| `requireStudentDzuhur` | Wajib Dzuhur untuk sesi setelah Dzuhur | true |
| `requireStudentAsharForAfternoon` | Siswa jadwal sore wajib Ashar sebelum pulang | true |
| `requireStudentClassEligibility` | Eligibility kelas aktif | true |
| `requireTeacherGateIn` | Guru wajib gate IN | true |
| `requireTeacherGateOut` | Guru wajib gate OUT | true |
| `requireStaffGateIn` | Staff wajib gate IN | true |
| `requireStaffGateOut` | Staff wajib gate OUT | true |
| `allowManualOverride` | Override manual boleh | true |
| `allowStudentAsharCheckoutOverride` | Override checkout Ashar boleh | true |
| `duplicateScanWindowMinutes` | Window anti duplikasi scan | 5 |

Update policy:

```text
PUT /api/v1/attendance/policy
```

Kontrol:

- Role terbatas.
- Jika `STEP_UP_FOR_POLICY=true`, user harus memasukkan password ulang.
- Semua perubahan dicatat audit `attendance.policy.updated` dengan before/after.

---

## 19. Aturan Ashar Sebelum Pulang

Aturan bisnis:

```text
Siswa yang punya jadwal sampai sore wajib scan Ashar sebelum scan OUT/pulang, kecuali ada override sah.
```

Deteksi jadwal sore:

1. Cek `Session` pada tanggal scan dengan `endsAt >= asharRequiredClassEndTime`.
2. Jika tidak ada session, fallback cek `WeeklySchedule` aktif dengan `endTime >= batas Ashar`.
3. Jadwal harus terkait kelas siswa melalui enrollment.

Validasi checkout:

```text
1. Siswa scan OUT.
2. API cek policy requireStudentAsharForAfternoon.
3. API cek siswa punya jadwal sore.
4. API cek PrayerAttendanceLog ASHAR tanggal itu.
5. Jika ada Ashar → boleh pulang.
6. Jika tidak ada Ashar → cek override APPROVED, belum expired, belum revoked, scope ASHAR_CHECKOUT/ALL.
7. Jika override sah → boleh pulang.
8. Jika tidak → 403 dan audit blocked_missing_ashar.
```

Pesan penolakan:

```text
Siswa ini masih punya jadwal sampai sore. Scan Ashar dulu sebelum pulang.
```

---

## 20. Override Manual

Model:

```text
AttendanceOverride
```

Scope enum:

```text
CLASS_ELIGIBILITY
ASHAR_CHECKOUT
GATE_IN
GATE_OUT
ALL
```

Status enum:

```text
APPROVED
PENDING_REVIEW
REJECTED
REVOKED
EXPIRED
```

Kontrol terbaru:

| Kontrol | Detail |
|---|---|
| Reason wajib | Minimal 15 karakter dan dicek kualitasnya |
| Expiry wajib | `expiresAt` harus masa depan |
| Scope sempit | Tidak lagi string bebas |
| Override `ALL` | Dapat masuk `PENDING_REVIEW` jika tanpa step-up |
| Approve/revoke | Endpoint khusus dengan audit |
| Validasi penggunaan | Hanya `APPROVED`, belum expired, tidak revoked |
| Audit | before/after + reason |
| Flag | Membuat/menandai `HADIR_VIA_OVERRIDE` untuk review |

Alur override:

```text
1. Petugas memilih siswa dan scope.
2. Petugas menulis alasan jelas.
3. API cek role/access policy.
4. API cek policy allowManualOverride.
5. API set expiry.
6. API membuat/updates override.
7. Audit dicatat.
8. Flag review dibuat agar override tidak tersembunyi di laporan.
```

Rekomendasi SOP:

- Override hanya untuk kondisi sah: sakit, izin resmi, reader rusak, kegiatan luar, atau koreksi verified.
- Alasan harus menyebut konteks, bukan teks generik.
- Override `ALL` jangan dipakai untuk rutinitas harian.
- Review override harian oleh Admin/TU atau Guru Piket.

---

## 21. Presensi Kelas oleh Guru

Status session:

```text
SCHEDULED → OPEN → CLOSED
SCHEDULED/OPEN → MISSED oleh worker jika terlewat
```

### 21.1 Guru membuka sesi

```text
1. Guru login.
2. Guru memilih sesi.
3. Guru klik buka sesi/check-in.
4. API cek session ada.
5. Jika role GURU_MAPEL, session harus milik guru tersebut.
6. API cek geofence jika aktif.
7. API cek gate IN guru jika policy mewajibkan.
8. API set Session OPEN.
9. API upsert TeacherSessionPresence.
10. API tentukan HADIR/TELAT berdasarkan grace minutes.
11. Audit teacher.session.checkin dan class.session.opened dicatat.
```

### 21.2 Guru mengisi presensi siswa

```text
1. Guru membuka roster.
2. API ambil siswa aktif dari ClassEnrollment kelas session.
3. API cek eligibility: gate IN, Dhuha, Dzuhur, override.
4. UI menampilkan locked/reason jika belum memenuhi syarat.
5. Guru simpan presensi.
6. API menolak studentId di luar roster.
7. API menolak HADIR/TELAT untuk siswa yang locked.
8. API menyimpan allowed item.
9. Audit class.attendance.recorded dicatat.
10. Jika ada reject policy, audit attendance.class.blocked_by_policy dicatat.
```

### 21.3 Guru menutup sesi

```text
1. Guru klik tutup/check-out.
2. API cek session OPEN.
3. Jika tutup sebelum jam selesai, alasan keluar awal wajib.
4. API set Session CLOSED dan reconciledAt null.
5. API update TeacherSessionPresence.checkOutAt.
6. Audit teacher.session.checkout dan class.session.closed dicatat.
```

### 21.4 Koreksi presensi

```text
1. Guru/Admin/Piket mengajukan koreksi endpoint resmi.
2. API cek ownership/role dan roster.
3. Alasan koreksi wajib berkualitas.
4. StudentAttendance diupdate/upsert dengan evidenceLabel corrected.
5. correctionCount increment.
6. AttendanceCorrectionEvent dibuat sebagai event immutable.
7. Audit class.attendance.corrected menyimpan before/after.
```

---

## 22. Geofence Guru

Model:

```text
GeofencePolicy
```

Field:

| Field | Fungsi |
|---|---|
| `centerLat` / `centerLng` | Titik pusat sekolah |
| `radiusMeter` | Radius valid |
| `enforceSessionOpen` | Validasi lokasi saat buka sesi |
| `arrivalGraceMinutes` | Batas terlambat |
| `autoMissedGraceMinutes` | Batas worker menandai missed |
| `requireGateTapForOpen` | Guru harus scan gerbang sebelum buka sesi |
| `allowPicketOverride` | Guru piket dapat membantu override |

Perhitungan jarak memakai Haversine.

Catatan produksi:

- Koordinat sekolah harus diset akurat.
- Radius jangan terlalu kecil agar tidak menolak guru karena akurasi GPS.
- Jika dipakai indoor, perlu SOP fallback untuk GPS lemah.

---

## 23. Reconciliation dan Anomali

Model:

```text
ReconciliationFlag
```

Flag type terbaru:

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
OUT_TANPA_IN
IN_BERULANG
OUT_BERULANG
SCAN_DUPLIKAT
OUT_TERLALU_CEPAT
GATE_IN_TANPA_PRESENSI
PRESENSI_DI_LUAR_ROSTER
HADIR_VIA_OVERRIDE
KOREKSI_BERULANG
OVERRIDE_BERLEBIHAN
READER_ANOMALY
POLICY_CHANGED_DURING_ATTENDANCE
EXPORT_TIDAK_WAJAR
```

Field auditability tambahan:

| Field | Fungsi |
|---|---|
| `evidence` | Bukti teknis flag |
| `recommendation` | Saran tindak lanjut |
| `fingerprint` | Dedup flag lintas job |
| `classId` | Relasi kelas jika relevan |
| `reviewStatus` | Workflow review |
| `priority` | Prioritas |
| `assignedToId` | Penanggung jawab |
| `followUpNote` | Catatan tindak lanjut |
| `dueAt` | Tenggat |

Workflow:

```text
OPEN → IN_REVIEW → ESCALATED → RESOLVED
```

Priority:

```text
LOW / NORMAL / HIGH / URGENT
```

Alur worker:

```text
1. Worker tick periodik.
2. Worker POST internal dengan x-worker-token.
3. API cari session yang perlu dicek.
4. API bandingkan Session, StudentAttendance, GateLog, PrayerAttendanceLog, TeacherSessionPresence, AttendancePolicy.
5. API membuat/upsert ReconciliationFlag.
6. Admin/TU/Guru Piket menindaklanjuti.
7. Resolve/escalate/workflow dicatat audit.
```

---

## 24. Worker Periodik

File:

```text
apps/worker/src/index.js
```

Job:

| Job | Endpoint internal | Default interval |
|---|---|---:|
| Auto missed | `/api/v1/internal/sessions/mark-missed` | 15000 ms |
| Reconciliation | `/api/v1/internal/reconciliation/run` | 30000 ms |

Header:

```text
x-worker-token: <WORKER_TOKEN>
```

Proteksi:

- Token internal wajib.
- Endpoint internal diblokir Nginx dari publik.
- Worker jalan dalam Docker network internal.
- Tick berikutnya dilewati jika job sebelumnya masih berjalan.

---

## 25. Database dan Model Data

Database:

```text
PostgreSQL 16
```

ORM:

```text
Prisma Client 5.22.0
```

Schema:

```text
prisma/schema.prisma
```

### 25.1 Enum Penting

| Enum | Nilai/kegunaan |
|---|---|
| `Role` | ADMIN_TU, GURU_MAPEL, GURU_PIKET, SISWA, OPERATOR_IT, DEVELOPER |
| `SessionStatus` | SCHEDULED, OPEN, CLOSED, MISSED |
| `StudentAttendanceStatus` | HADIR, TELAT, IZIN, SAKIT, ALPA |
| `TeacherSessionStatus` | HADIR, TELAT, EXCUSED_ABSENCE, ALPA_MENGAJAR |
| `CardStatus` | ACTIVE, LOST, INACTIVE |
| `GateDirection` | IN, OUT |
| `ReaderType` | GATE, MUSHOLA, CLASS, MANUAL |
| `PrayerType` | DHUHA, DZUHUR, ASHAR |
| `AttendanceOverrideScope` | CLASS_ELIGIBILITY, ASHAR_CHECKOUT, GATE_IN, GATE_OUT, ALL |
| `OverrideApprovalStatus` | APPROVED, PENDING_REVIEW, REJECTED, REVOKED, EXPIRED |
| `ReconciliationFlagType` | Flag dasar + anti-curang lanjutan |

### 25.2 Model Utama

| Model | Fungsi |
|---|---|
| `User` | Semua akun role |
| `AuthSession` | Session revocable dan refresh token hash |
| `SchoolClass` | Data kelas |
| `Subject` | Mata pelajaran |
| `AcademicYear` | Tahun ajaran |
| `Semester` | Semester |
| `Room` | Ruang/lokasi |
| `ClassEnrollment` | Relasi siswa-kelas |
| `WeeklySchedule` | Jadwal mingguan |
| `Session` | Session pembelajaran harian |
| `StudentAttendance` | Presensi siswa per session |
| `AttendanceCorrectionEvent` | Riwayat immutable koreksi presensi |
| `TeacherSessionPresence` | Check-in/out guru |
| `GateLog` | Log gate IN/OUT |
| `PrayerAttendanceLog` | Log Dhuha/Dzuhur/Ashar |
| `AttendanceOverride` | Override manual timeboxed |
| `DeviceReader` | Reader resmi dan secret signed scan |
| `SmartCard` | Kartu UID user |
| `ReconciliationFlag` | Anomali hasil rekonsiliasi/security flag |
| `AuditEntry` | Audit log hash-chain |
| `AuditChainState` | State hash terakhir audit |
| `PicketNote` | Buku piket |
| `TeacherLeave` | Pengajuan izin/sakit/dinas luar guru |
| `Notification` | Notifikasi |
| `UserTutorialState` | Status tutorial onboarding |
| `AttendancePolicy` | Policy absensi adaptif |
| `GeofencePolicy` | Policy lokasi guru |

### 25.3 Data Lineage Absensi

```text
SmartCard.uid
  → ReaderScan signed
  → GateLog / PrayerAttendanceLog
  → Eligibility siswa
  → StudentAttendance
  → ReconciliationFlag jika mismatch
  → Reporting/export
  → AuditEntry hash-chain untuk setiap aksi penting
```

### 25.4 Index Penting

Contoh index penting:

- `User(role, active)`.
- `Session(status, startsAt)`.
- `Session(classId, startsAt)`.
- `Session(teacherId, startsAt)`.
- `StudentAttendance(studentId, status)`.
- `StudentAttendance(evidenceLabel)`.
- `GateLog(userId, direction, tappedAt)`.
- `GateLog(signatureVerified, tappedAt)`.
- `PrayerAttendanceLog(attendanceDate, prayerType)`.
- `PrayerAttendanceLog(signatureVerified, scannedAt)`.
- `AttendanceOverride(studentId, date, scope, status, expiresAt)`.
- `ReconciliationFlag(fingerprint)`.
- `ReconciliationFlag(status, priority, type, createdAt)`.
- `AuditEntry(entryHash)`.
- `AuthSession(userId, revokedAt, expiresAt)`.

---

## 26. Migration Database

Migration yang ada:

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
0012_security_anti_cheat_hardening
```

Migration terbaru `0012_security_anti_cheat_hardening` menambahkan/memperkuat:

1. Flag anti-curang tambahan.
2. `AttendanceOverrideScope` enum.
3. `OverrideApprovalStatus` enum.
4. `User.sessionVersion` dan `passwordChangedAt`.
5. Secret reader terenkripsi dan metadata signed scan.
6. Metadata signature di `GateLog` dan `PrayerAttendanceLog`.
7. Audit hash-chain fields.
8. `AuditChainState`.
9. `AuthSession`.
10. `StudentAttendance.evidenceLabel`, override link, correction count.
11. Override expiry/status/revoke/approve fields.
12. `AttendanceCorrectionEvent`.
13. Evidence/recommendation/fingerprint di `ReconciliationFlag`.

---

## 27. Audit Log Hash-Chain

Model:

```text
AuditEntry
AuditChainState
```

Field penting:

| Field | Fungsi |
|---|---|
| `canonicalPayload` | Payload audit canonical untuk hashing |
| `prevHash` | Hash audit sebelumnya |
| `entryHash` | Hash audit entry saat ini |
| `hashVersion` | Versi format hash |

Konsep:

```text
entryHash = SHA256(prevHash/GENESIS + canonicalJson(canonicalPayload))
```

Endpoint verifikasi:

```text
GET /api/v1/audit/verify-chain
```

Output verifikasi berisi:

- `ok`.
- `checked`.
- `totalScanned`.
- `legacySkipped`.
- `brokenCount`.
- detail broken maksimal 50.
- `lastHash`.

Catatan:

- Audit lama sebelum hash-chain dapat terhitung sebagai legacy skipped.
- Audit baru harus punya hash chain.
- Jika chain broken, perlu investigasi DB/manual tamper.

---

## 28. Reporting dan Export

Fitur laporan:

1. Dashboard admin.
2. Live monitor.
3. Trend presensi.
4. Rekap kelas.
5. Rekap siswa.
6. Rekap mapel.
7. Rekap guru.
8. Laporan bulanan guru.
9. Audit coverage.
10. Export CSV/XLSX.

Kontrol export terbaru:

- Role terbatas.
- Export dicatat audit.
- Response menambahkan header checksum:

```text
X-SchoolHub-Report-Checksum
```

Tujuan checksum:

- Membantu memastikan file yang diterima sama dengan file yang dibuat server.
- Mendukung audit dokumen laporan.

Catatan observasi:

- Pernah ada indikasi console `403` untuk endpoint `/reports/teacher-monthly` pada kondisi role tertentu. Jika muncul lagi, perlu dicek apakah user yang sedang login memang bukan role yang diizinkan atau ada UI yang memanggil endpoint tanpa hak.

---

## 29. Frontend Web

Lokasi:

```text
apps/web
```

File penting:

| File | Fungsi |
|---|---|
| `src/App.tsx` | Entry React |
| `src/app/SchoolHubApp.tsx` | Shell utama, routing, login, layout |
| `src/app/api.ts` | Helper fetch API, cookies credential include, refresh handling |
| `src/app/ui.tsx` | Komponen UI reusable, DataTable |
| `src/app/pages/admin/AdminPages.jsx` | Halaman admin/operator/developer/guru piket |
| `src/app/pages/guru/GuruPages.jsx` | Halaman guru |
| `src/app/pages/siswa/MyAttendancePage.jsx` | Halaman siswa |
| `src/app/tutorial.tsx` | Tutorial onboarding |
| `src/styles.css` | Styling global dan responsive fixes |

### 29.1 Auth frontend terbaru

- Frontend tidak menyimpan access token baru ke localStorage setelah login.
- Data user non-secret masih disimpan di localStorage untuk UI routing.
- Request fetch memakai `credentials: include` agar cookie HttpOnly terkirim.
- Jika 401, frontend mencoba `/auth/refresh` lalu retry request.

Storage frontend:

| Key | Fungsi | Sensitivitas |
|---|---|---|
| `schoolhub_user` | Cache user UI | Non-secret, tetap jangan dianggap source of truth |
| `schoolhub_theme` | Tema UI | Non-secret |
| `schoolhub_access_token` | Legacy key | Tidak lagi diset saat login terbaru; dihapus saat login/logout/refresh |

### 29.2 Update UI/UX terbaru

Perbaikan yang sudah dilakukan:

1. `/guru/presensi`: dropdown sesi lebih jelas dan tidak sempit.
2. Topbar role active chip dipindah agar tidak mengganggu layout.
3. Google Fonts external link dihapus untuk kompatibilitas CSP.
4. `DataTable` menambahkan `data-label` ke `<td>` agar mobile/card table bisa menampilkan label kolom.
5. `.management-grid` dipakai untuk form + daftar agar tabel tidak dipaksa sempit.
6. `/admin/master-data` responsive card layout aktif.
7. `/admin/devices` Daftar Kartu dan Daftar Alat Pembaca responsive card layout aktif.
8. Tombol aksi table wrap rapi dan tidak terpotong.
9. Desain tidak memakai horizontal scrollbar sebagai solusi utama.

Prinsip UI yang dipakai:

```text
Jika ruang sempit, tabel berubah menjadi card list.
Data tetap terbaca dengan label per cell.
Action button wrap ke baris berikutnya, bukan clip/overflow.
```

---

## 30. Routing UI

Area utama:

```text
/login
/admin/*
/guru/*
/siswa/*
```

Menu admin/operator/piket/developer:

- Dasbor Admin.
- Dasbor Teknis.
- Dasbor Piket.
- Pantauan Langsung.
- Riwayat Absen.
- Papan Anomali.
- Buku Piket.
- Master Data.
- Jadwal & Sesi.
- Perangkat.
- Laporan.
- Pengaturan.
- Audit.
- Pengajuan Guru.
- Developer Control Center.

Menu guru:

- Dashboard guru.
- Sesi mengajar.
- Input presensi.
- Rekap/riwayat guru.
- Pengajuan izin/sakit/dinas luar.

Menu siswa:

- Dashboard siswa.
- Riwayat kehadiran pribadi.

---

## 31. Developer Control Center

Role:

```text
DEVELOPER
```

Fitur:

1. Kontrol tutorial/onboarding user.
2. Clean data preview-first.
3. Kesehatan sistem.
4. Kontrol teknis sensitif.

Endpoint cleanup:

```text
GET  /api/v1/system-cleanup/preview
POST /api/v1/system-cleanup/run
```

Prinsip cleanup:

- Developer-only.
- Preview wajib sebelum run.
- Tidak menghapus data historis penting.
- Hanya membersihkan data aman seperti user test nonaktif yang memenuhi syarat, kartu nonaktif, notifikasi lama terbaca, tutorial state stale.

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

## 32. Hapus Akun dan Integritas Data Historis

Prinsip:

```text
Nonaktifkan akun lebih aman daripada hapus permanen.
```

Admin/TU:

- Buat user.
- Edit user.
- Nonaktifkan user.
- Aktifkan kembali user.

Developer:

- Dapat hapus permanen hanya jika aman.
- Tidak boleh hapus diri sendiri.
- Tidak boleh menghapus developer aktif terakhir.
- Tidak boleh menghapus user yang punya riwayat penting.

Jika user punya data historis, API menolak hapus permanen dengan prinsip menjaga audit dan presensi.

Audit:

```text
identity.user.permanently_deleted
identity.user.permanent_delete_blocked
```

---

## 33. Import Data

Pola:

```text
preview → commit
```

Alur:

```text
1. Admin/TU upload file atau data JSON.
2. API parsing CSV/XLSX.
3. API validasi field, duplikasi, relasi.
4. API mengembalikan preview.
5. Admin mengecek hasil.
6. Jika benar, Admin commit.
7. API tulis DB dalam transaksi.
8. Audit import dicatat.
```

Manfaat:

- Mengurangi risiko data salah langsung masuk.
- Error format terlihat sebelum commit.
- Lebih aman untuk migrasi data real sekolah.

Rekomendasi untuk data real:

1. Import guru terlebih dahulu.
2. Import kelas/mapel/ruangan.
3. Import siswa.
4. Import enrollment siswa-kelas.
5. Import/generate jadwal.
6. Validasi 1 kelas pilot sebelum mass import.

---

## 34. Buku Piket dan Pengajuan Guru

### 34.1 Buku Piket

Model:

```text
PicketNote
```

Fungsi:

- Catatan kejadian harian.
- Kategori dan severity.
- Soft delete/nonaktif.
- Audit pembuat/pengubah.

Role akses:

```text
ADMIN_TU
OPERATOR_IT
GURU_PIKET
```

### 34.2 Pengajuan Guru

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
2. Admin/TU atau Operator review.
3. Status disetujui/ditolak.
4. Catatan review tersimpan.
5. Notifikasi/audit dicatat.
```

---

## 35. Backup, Restore, dan Disaster Recovery

Script backup:

```text
scripts/backup_database.sh
```

Backup directory produksi:

```text
/home/schoolhub/backups/database
```

Format:

```text
schoolhub-YYYYMMDD-HHMMSS.sql.gz
```

Backup terbaru yang tercatat sebelum deploy terakhir:

```text
/home/schoolhub/backups/database/schoolhub-20260502-183214.sql.gz
```

Script restore:

```text
scripts/restore_database.sh
```

Proteksi restore:

```text
CONFIRM_RESTORE=YES_RESTORE
```

Rekomendasi DR:

| Aktivitas | Frekuensi |
|---|---|
| Backup otomatis | Harian minimal |
| Cek usia backup | Harian via monitor |
| Restore drill ke DB non-produksi | Bulanan |
| Simpan backup offsite | Harian/mingguan sesuai kapasitas |
| Dokumentasi recovery time | Sebelum produksi luas |

Catatan:

- Jangan restore produksi tanpa backup terbaru.
- Uji restore ke DB target non-produksi lebih dulu.
- Backup harus dienkripsi jika disimpan di luar VPS.

---

## 36. Monitoring dan Health Check

Endpoint:

```text
/api/v1/health/live
/api/v1/health/ready
/api/v1/health/detail
/health/live
/health/ready
```

Script:

```text
scripts/ops_health_alert.sh
scripts/ops_smoke_monitor.sh
```

Yang perlu dipantau:

1. Health live/ready.
2. Container status.
3. Worker tetap running.
4. Redis/Postgres healthy.
5. Usia backup terakhir.
6. Error rate API.
7. Jumlah login gagal/locked.
8. Jumlah ReconciliationFlag OPEN/URGENT.
9. Audit chain verify result.
10. URL tunnel/domain aktif.

Output health alert:

```text
/opt/schoolhub/output/health-alert/latest-status.json
```

---

## 37. Deployment Produksi

Path VPS:

```text
/opt/schoolhub
```

User deploy:

```text
schoolhub
```

Port SSH:

```text
9103
```

Flow deploy aman:

```text
1. Validasi lokal.
2. Backup database produksi.
3. Rsync source ke /opt/schoolhub dengan exclude .env/node_modules/dist/output/.git.
4. docker compose config check.
5. nginx -t.
6. deploy_production.sh .env.
7. Docker build/up.
8. Health live/ready.
9. ensure-developer.
10. Smoke UAT remote.
11. UI spot check.
```

Exclude rsync wajib:

```text
.env
node_modules
*/node_modules
dist
*/dist
output
.git
```

Deploy terakhir:

- Backup dibuat: `schoolhub-20260502-183214.sql.gz`.
- Docker build/recreate selesai.
- Health live/ready OK.
- Remote smoke PASS 31/31.
- UI `/admin/devices` responsive card fix terdeploy.

---

## 38. Cloudflare Quick Tunnel dan Rencana Domain

Saat ini beta memakai Quick Tunnel:

```text
https://serious-hardware-stock-arrived.trycloudflare.com
```

Kelebihan:

- Cepat untuk beta.
- SSL otomatis.
- Tidak butuh domain saat trial.

Kekurangan:

- URL bisa berubah jika tunnel restart.
- Tidak ideal untuk operasional sekolah.
- Sulit dijadikan alamat permanen.

Rekomendasi produksi:

```text
Cloudflare Named Tunnel + domain/subdomain resmi sekolah
```

Contoh target:

```text
ehadir.man1rokanhulu.sch.id
```

Dokumen panduan:

```text
docs/cloudflare-named-tunnel.md
```

Kebutuhan:

- Akses akun Cloudflare/domain sekolah.
- DNS route ke tunnel.
- Service cloudflared permanen.

---

## 39. Validasi dan Testing

Command final:

```bash
npm run validate:final
```

Isi validasi:

```text
bash -n scripts/uat_smoke.sh
bash -n scripts/deploy_production.sh
npm run prisma:generate
npx prisma validate --schema prisma/schema.prisma
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

Hasil validasi lokal terakhir:

| Validasi | Hasil |
|---|---:|
| Prisma generate | ✅ PASS |
| Prisma validate | ✅ PASS |
| API lint | ✅ PASS |
| Web lint | ✅ PASS |
| API typecheck | ✅ PASS |
| Web typecheck | ✅ PASS |
| API build | ✅ PASS |
| Web build | ✅ PASS |
| API Jest | ✅ 10 suites / 51 tests PASS |
| Web Vitest | ✅ 1 file / 2 tests PASS |
| Playwright E2E | ✅ 12 tests PASS |
| npm audit high | ✅ PASS |
| Moderate advisory | ⚠️ `exceljs -> uuid` masih ada |

Remote UAT smoke terakhir:

```text
PASS: 31
FAIL: 0
SKIP: 0
RESULT: PASS
```

Smoke mencakup:

- Health live/ready.
- Root HTML.
- Internal worker tanpa token ditolak.
- Reader scan tanpa signature ditolak.
- Admin dashboard/list user/live monitor/anomali.
- Guru list/buka/roster/save/tutup/koreksi sesi.
- Scan gerbang siswa anti-duplikat.
- Override syarat kelas.
- Siswa my-attendance.

---

## 40. Threat Model Anti-Curang

### 40.1 Siswa

Potensi abuse:

- Titip kartu ke teman.
- Scan gerbang lalu bolos kelas.
- Scan keluar tanpa masuk.
- Scan keluar terlalu cepat.
- Pulang tanpa Ashar padahal jadwal sore.

Kontrol:

- Signed reader official.
- Gate state machine harian.
- Duplicate scan window.
- Ashar checkout policy.
- Eligibility kelas.
- Rekonsiliasi gate vs kelas.
- Audit dan flag.

### 40.2 Guru

Potensi abuse:

- Buka sesi bukan miliknya.
- Buka sesi dari luar sekolah.
- Menutup sesi terlalu awal tanpa alasan.
- Mengisi siswa bukan roster.
- Mengubah presensi tanpa jejak.

Kontrol:

- Ownership session.
- Geofence policy.
- Gate tap policy guru.
- Early checkout reason.
- Roster validation.
- AttendanceCorrectionEvent.
- Audit hash-chain.

### 40.3 Petugas/Admin/Operator

Potensi abuse:

- Override terlalu luas.
- Mengaktifkan/mengubah user sembarangan.
- Rotasi key reader tanpa SOP.
- Export laporan tanpa jejak.
- Hapus data historis.

Kontrol:

- RBAC.
- AccessPolicyService.
- Step-up opsional.
- Override expiry/status/reason.
- Export checksum/audit.
- Hapus permanen dilindungi.
- Developer-only cleanup.
- Audit chain.

### 40.4 Reader/Device

Potensi abuse:

- Request palsu.
- Replay request lama.
- Body payload diubah.
- Reader nonaktif tetap dipakai.

Kontrol:

- HMAC signature.
- Body hash.
- Timestamp skew.
- Nonce Redis.
- Reader active check.
- lastSignedScanAt.

---

## 41. Risk Register Terbaru

| ID | Risiko | Severity | Status | Rekomendasi |
|---|---|---:|---|---|
| R-01 | Quick Tunnel URL berubah | Medium | Terbuka | Pasang Named Tunnel + domain resmi |
| R-02 | Data real sekolah belum lengkap | High operasional | Terbuka | Import bertahap + validasi kelas pilot |
| R-03 | Restore drill belum dijadikan rutinitas | High DR | Terbuka | Jadwalkan restore test bulanan |
| R-04 | Advisory moderate `exceljs -> uuid` | Medium | Diterima sementara | Pantau update aman, jangan force downgrade breaking |
| R-05 | Belum ada hardware RFID fisik final | Medium | Terbuka | Pilot reader resmi setelah SOP signed scan siap |
| R-06 | Folder lokal bukan Git repo aktif | Medium maintainability | Terbuka | Pindahkan ke Git private dan tag release |
| R-07 | Operator belum UAT lapangan penuh | High operasional | Terbuka | Beta 1 kelas 3–5 hari |
| R-08 | Akun Developer berisiko jika dipakai harian | High | Terbuka SOP | Tetapkan pemegang dan pakai hanya emergency |
| R-09 | CSP masih izinkan inline style | Low/Medium | Accepted | Refactor style inline jika ingin CSP lebih ketat |
| R-10 | Console 403 teacher-monthly pernah teramati | Low/Medium | Perlu reproduksi | Cek role/route jika muncul lagi |

---

## 42. Readiness Matrix

Skala:

```text
0 = belum ada
1 = awal
2 = cukup untuk beta
3 = kuat untuk produksi terbatas
4 = matang produksi luas
```

| Area | Skor | Catatan |
|---|---:|---|
| Arsitektur aplikasi | 3 | Docker/Nest/React/Postgres/Redis/Worker stabil |
| Auth/session | 3 | Cookie/refresh/revoke sudah ada, bisa ditambah MFA/step-up lebih luas |
| Anti-curang absensi | 3 | Signed reader dan gate policy kuat untuk beta |
| Auditability | 3 | Hash-chain ada; perlu SOP verifikasi rutin |
| Reporting | 3 | Export checksum/audit; laporan final perlu diuji dengan data real |
| Backup/restore | 2 | Backup ada; restore drill perlu rutin |
| UI/UX | 3 | Isu tabel utama sudah dibenahi; perlu UAT user nyata |
| Deployment | 3 | Deploy repeatable; perlu Git/tag release |
| Domain/public access | 2 | Quick Tunnel masih sementara |
| Hardware integration | 1 | Fondasi signed reader ada, perangkat fisik belum dipilot penuh |
| SOP operasional | 2 | Dokumen ada; perlu pelatihan dan simulasi |

Kesimpulan readiness:

```text
Beta terbatas: SIAP dengan pendampingan.
Produksi luas: TUNDA sampai domain tetap, data real, restore drill, SOP, dan UAT lapangan selesai.
```

---

## 43. Rekomendasi Prioritas 7 Hari

### Hari 1–2: Stabilitas operasional

1. Pasang domain permanen/Named Tunnel jika akses Cloudflare tersedia.
2. Pastikan backup otomatis dan alert aktif.
3. Jalankan audit verify-chain dan simpan hasil.
4. Buat akun operasional real untuk Admin/TU, Operator, Guru Piket pilot.

### Hari 3–4: Data real dan pilot

1. Import data guru, siswa, kelas, mapel, enrollment, jadwal untuk 1 kelas pilot.
2. Validasi roster dan jadwal sore.
3. Simulasikan scan gerbang, Dhuha, Dzuhur, Ashar, open/close sesi.
4. Validasi laporan dan anomali.

### Hari 5–6: UAT lapangan

1. Guru pilot melakukan presensi kelas nyata.
2. Guru Piket review anomali.
3. Admin/TU export laporan harian.
4. Kumpulkan feedback UI/UX.

### Hari 7: Evaluasi dan go/no-go

1. Review error/flag/audit.
2. Perbaiki SOP.
3. Tentukan perluasan ke kelas berikutnya.
4. Simpan snapshot backup dan laporan UAT.

---

## 44. Rekomendasi Prioritas 30 Hari

1. Migrasi dari Quick Tunnel ke domain tetap.
2. Git private repository + release tagging.
3. Restore drill bulanan terdokumentasi.
4. Dashboard audit chain health.
5. Dashboard open anomalies by priority.
6. Pilot reader RFID fisik minimal 1 gate + 1 mushola.
7. SOP provisioning/rotate reader secret.
8. SOP emergency override.
9. SOP pergantian semester/tahun ajaran.
10. Pelatihan user berdasarkan role.
11. Evaluasi dependency `exceljs/uuid` ketika jalur update aman tersedia.
12. Pertimbangkan MFA/step-up untuk Developer dan policy/reader operations.

---

## 45. Checklist Harian Operasional

### Admin/TU

- [ ] Cek dashboard ringkasan.
- [ ] Cek anomali OPEN/HIGH/URGENT.
- [ ] Review override hari ini.
- [ ] Cek laporan kelas/guru.
- [ ] Pastikan data user/jadwal tidak berubah tanpa alasan.

### Guru Piket

- [ ] Cek siswa terlambat/scan tidak lengkap.
- [ ] Input buku piket jika ada kejadian.
- [ ] Bantu verifikasi manual hanya dengan alasan jelas.
- [ ] Follow-up anomali yang assigned.

### Operator IT

- [ ] Cek health live/ready.
- [ ] Cek container status.
- [ ] Cek backup terbaru.
- [ ] Cek reader lastSeen/lastSignedScan.
- [ ] Cek log error jika ada keluhan.

### Developer

- [ ] Tidak memakai akun Developer untuk kerja harian.
- [ ] Cek audit chain bila ada insiden.
- [ ] Jalankan deploy hanya setelah backup dan validasi.
- [ ] Dokumentasikan perubahan.

---

## 46. Skenario End-to-End

### 46.1 Siswa normal pagi-siang

```text
1. Siswa scan IN gerbang.
2. GateLog IN tercatat.
3. Siswa scan Dhuha.
4. PrayerAttendanceLog DHUHA tercatat.
5. Guru buka sesi.
6. API validasi guru dan session.
7. Guru ambil roster.
8. API cek eligibility.
9. Guru simpan presensi.
10. Guru tutup sesi.
11. Worker rekonsiliasi.
12. Siswa scan OUT.
13. Karena tidak ada jadwal sore, Ashar tidak diwajibkan.
```

### 46.2 Siswa jadwal sore wajib Ashar

```text
1. Siswa scan IN gerbang.
2. Siswa scan Dhuha/Dzuhur sesuai waktu.
3. Siswa ikut kelas sampai sore.
4. Siswa mencoba OUT sebelum Ashar.
5. API cek jadwal sore.
6. API tidak menemukan scan Ashar.
7. API cek override dan tidak ada.
8. API tolak OUT dengan 403.
9. Audit blocked_missing_ashar dicatat.
10. Siswa scan Ashar.
11. Siswa scan OUT ulang.
12. API menerima OUT.
```

### 46.3 Reader replay attack

```text
1. Penyerang mengirim ulang request reader lama.
2. Header nonce sama.
3. Redis menemukan nonce sudah pernah dipakai.
4. API menolak dengan Unauthorized.
5. Tidak ada GateLog/PrayerLog valid yang dibuat.
```

### 46.4 Guru koreksi presensi

```text
1. Guru menemukan status siswa perlu dikoreksi.
2. Guru mengisi alasan koreksi.
3. API cek session dan roster.
4. API update StudentAttendance.
5. API membuat AttendanceCorrectionEvent.
6. Audit before/after tercatat.
7. Laporan menandai evidence corrected.
```

---

## 47. File Kunci untuk Audit Lanjutan

| Area | File |
|---|---|
| Docker produksi | `docker-compose.production.yml` |
| Nginx reverse proxy | `ops/nginx/reverse-proxy.conf` |
| API bootstrap | `apps/api/src/main.ts` |
| API module list | `apps/api/src/app.module.ts` |
| Auth controller | `apps/api/src/modules/auth/auth.controller.ts` |
| Auth service | `apps/api/src/modules/auth/auth.service.ts` |
| JWT strategy | `apps/api/src/modules/auth/jwt.strategy.ts` |
| Role guard | `apps/api/src/common/roles.guard.ts` |
| Access policy | `apps/api/src/modules/security/access-policy.service.ts` |
| Device signature | `apps/api/src/modules/security/device-signature.service.ts` |
| Audit chain | `apps/api/src/modules/security/audit-chain.service.ts` |
| Step-up auth | `apps/api/src/modules/security/step-up-auth.service.ts` |
| Attendance gate | `apps/api/src/modules/attendance-gate/attendance-gate.service.ts` |
| Attendance class | `apps/api/src/modules/attendance-class/attendance-class.service.ts` |
| Reconciliation | `apps/api/src/modules/reconciliation/reconciliation.service.ts` |
| Reporting | `apps/api/src/modules/reporting/reporting.service.ts` |
| Device reader | `apps/api/src/modules/device-reader/device-reader.service.ts` |
| Identity | `apps/api/src/modules/identity/identity.service.ts` |
| System cleanup | `apps/api/src/modules/system-cleanup/system-cleanup.service.ts` |
| Prisma schema | `prisma/schema.prisma` |
| Latest migration | `prisma/migrations/0012_security_anti_cheat_hardening/migration.sql` |
| Seed | `prisma/seed.ts` |
| Worker | `apps/worker/src/index.js` |
| Frontend shell | `apps/web/src/app/SchoolHubApp.tsx` |
| Frontend API helper | `apps/web/src/app/api.ts` |
| DataTable/UI | `apps/web/src/app/ui.tsx` |
| Admin UI | `apps/web/src/app/pages/admin/AdminPages.jsx` |
| Guru UI | `apps/web/src/app/pages/guru/GuruPages.jsx` |
| Siswa UI | `apps/web/src/app/pages/siswa/MyAttendancePage.jsx` |
| Global CSS | `apps/web/src/styles.css` |
| Deploy script | `scripts/deploy_production.sh` |
| Backup script | `scripts/backup_database.sh` |
| Restore script | `scripts/restore_database.sh` |
| Smoke test | `scripts/uat_smoke.sh` |
| Final validation | `scripts/validate_final.sh` |
| Cloudflare guide | `docs/cloudflare-named-tunnel.md` |
| Security baseline | `docs/SECURITY_BASELINE_AUDIT_20260502.md` |
| Security completion | `docs/SECURITY_HARDENING_COMPLETION_20260502.md` |

---

## 48. Acceptance Criteria untuk Produksi Luas

Sebelum produksi luas seluruh sekolah, checklist ini sebaiknya terpenuhi:

### Teknis

- [ ] Domain permanen aktif.
- [ ] HTTPS/domain final masuk `CORS_ORIGIN` dan `PUBLIC_APP_ORIGIN`.
- [ ] Backup otomatis aktif.
- [ ] Restore drill berhasil ke non-produksi.
- [ ] Audit chain verify OK.
- [ ] Smoke test PASS setelah deploy.
- [ ] Semua high severity audit PASS.
- [ ] Git private repo dan release tag tersedia.

### Data

- [ ] User real guru/admin/operator/siswa valid.
- [ ] Kelas/mapel/ruangan valid.
- [ ] Enrollment siswa-kelas valid.
- [ ] Jadwal mingguan valid, terutama jadwal sore/Ashar.
- [ ] Kartu UID tertaut benar.
- [ ] Reader fisik/provisioning tervalidasi.

### SOP

- [ ] SOP login dan role.
- [ ] SOP scan gerbang/mushola.
- [ ] SOP presensi kelas guru.
- [ ] SOP override manual.
- [ ] SOP anomali dan eskalasi.
- [ ] SOP backup/restore.
- [ ] SOP incident response.

### UAT

- [ ] Pilot 1 kelas 3–5 hari.
- [ ] Minimal 1 Admin/TU, 1 Operator, 1 Guru Piket, beberapa Guru Mapel memakai sistem.
- [ ] Export laporan diverifikasi manual.
- [ ] Feedback UI/UX ditutup atau diterima sebagai known issue.

---

## 49. Known Limitations

1. URL publik masih Quick Tunnel, bukan domain permanen.
2. Hardware RFID fisik belum menjadi bagian validasi penuh.
3. APK/mobile native belum dibuat.
4. Data real sekolah perlu import dan verifikasi bertahap.
5. Advisory moderate `exceljs -> uuid` masih dipantau.
6. Restore drill rutin belum menjadi bukti operasional berulang.
7. Git/release management perlu distandardisasi.
8. UAT lapangan dengan guru/siswa nyata masih tahap berikutnya.
9. CSP masih mengizinkan inline style untuk kebutuhan UI.
10. Jika `teacher-monthly` 403 muncul lagi, perlu analisis role/route spesifik.

---

## 50. Kesimpulan Akhir

SchoolHub e-Hadir MAN 1 Rokan Hulu saat ini sudah berkembang dari sistem absensi web menjadi sistem absensi **secure-by-design**, **anti-curang**, dan **audit-ready** untuk beta terbatas.

Peningkatan paling penting sejak laporan 01:

```text
Session cookie HttpOnly + refresh rotation
Signed reader HMAC + anti-replay nonce
Anti-passback gate logic
Mushola signed-only
Override timeboxed dan reviewable
Roster strict dan correction event
Audit hash-chain
Nginx CSP + internal block + scan limit
UI tabel/card responsive tanpa horizontal scrollbar
```

Status terakhir:

```text
Local validation: PASS
Remote deployment: PASS
Remote smoke: 31 PASS / 0 FAIL
Runtime containers: UP
Latest backup: tersedia
```

Rekomendasi keputusan:

```text
Lanjutkan ke beta terbatas terkontrol.
Jangan langsung produksi luas sebelum domain tetap, data real, SOP, restore drill, dan UAT lapangan selesai.
```

Jika seluruh acceptance criteria produksi luas terpenuhi, sistem dapat diperluas secara bertahap ke seluruh kelas dan kemudian diintegrasikan dengan hardware RFID fisik permanen.

---

## 51. Update Arsitektur QR Android Reader Resmi

Perombakan terbaru mengunci jalur absensi QR produksi ke APK Android resmi **Absensi MAN 1 Rokan Hulu**.

```text
QR Credential siswa/guru
→ APK Android official reader
→ CameraX/ML Kit scan QR
→ Canonical JSON + body hash + HMAC SHA-256
→ POST /api/v1/attendance/qr-reader-scan
→ Validasi DeviceReader QR_ANDROID + nonce + signature + QR credential
→ AttendancePolicy server-side
→ GateLog/PrayerAttendanceLog atau reject
→ Audit hash-chain + reconciliation flag jika perlu
```

Keputusan penting:

- Endpoint official baru: `/api/v1/attendance/qr-reader-scan`.
- Endpoint legacy/manual `/api/v1/attendance/qr-scan` tetap ada namun dapat dimatikan via `AttendancePolicy.legacyQrScanEnabled`.
- QR tidak berisi data sensitif; format: `schoolhub:qr:v1:<opaqueCode>`.
- Server menyimpan hash QR credential, bukan menjadikan browser/APK sebagai source of truth.
- Perangkat APK diprovision lewat admin panel, secret disimpan di Android Keystore/encrypted storage setelah instalasi.
- Python GUI builder hanya membangun APK/branding dan tidak menyimpan reader secret production.
