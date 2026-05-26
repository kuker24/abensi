# Security Baseline Audit — SchoolHub e-Hadir MAN 1 Rokan Hulu

**Tanggal:** 2026-05-02  
**Status:** Baseline terkunci sebelum implementasi hardening anti-curang  
**Peran audit:** Principal Security Engineer + Senior NestJS/React/PostgreSQL Architect  
**Tujuan:** Mengunci kondisi keamanan saat ini sebagai acuan patch bertahap secure-by-design, anti-curang, dan audit-ready.

> Dokumen ini tidak memuat password, token, secret `.env`, atau nilai kredensial produksi.

---

## 1. Ringkasan Pemahaman Sistem

SchoolHub e-Hadir adalah sistem absensi sekolah berbasis web dengan alur bukti berlapis:

```text
Login → scan gerbang → scan mushola → sesi kelas → presensi guru/siswa → scan pulang → rekonsiliasi → laporan/audit
```

Stack utama:

- Frontend React/Vite.
- Backend NestJS REST API dengan prefix `/api/v1`.
- PostgreSQL + Prisma.
- Redis untuk limiter/cache.
- Worker periodik untuk auto-missed dan rekonsiliasi.
- Docker Compose production.
- Nginx reverse proxy.
- Cloudflare Quick Tunnel untuk beta sementara.

Trust boundary utama:

```text
Browser/frontend tidak dipercaya
Reader/device tidak dipercaya sebelum signed request valid
Payload request tidak dipercaya
JWT user masih harus dicek aktif/role/ownership di server
Database menjadi source of truth
Audit harus menjadi append-only dan tamper-evident
```

---

## 2. File yang Sudah Diperiksa

Minimal file wajib dari instruksi sudah diperiksa:

| Area | File |
|---|---|
| Arsitektur laporan | `laporan-01.md` |
| Bootstrap API | `apps/api/src/main.ts` |
| Modul API | `apps/api/src/app.module.ts` |
| Auth login | `apps/api/src/modules/auth/auth.service.ts` |
| JWT strategy | `apps/api/src/modules/auth/jwt.strategy.ts` |
| Role guard | `apps/api/src/common/roles.guard.ts` |
| Attendance gate | `apps/api/src/modules/attendance-gate/attendance-gate.controller.ts` |
| Attendance gate DTO | `apps/api/src/modules/attendance-gate/attendance-gate.dto.ts` |
| Attendance gate service | `apps/api/src/modules/attendance-gate/attendance-gate.service.ts` |
| Attendance class | `apps/api/src/modules/attendance-class/attendance-class.controller.ts` |
| Attendance class DTO | `apps/api/src/modules/attendance-class/attendance-class.dto.ts` |
| Attendance class service | `apps/api/src/modules/attendance-class/attendance-class.service.ts` |
| Reconciliation | `apps/api/src/modules/reconciliation/reconciliation.controller.ts` |
| Reconciliation DTO | `apps/api/src/modules/reconciliation/reconciliation.dto.ts` |
| Reconciliation service | `apps/api/src/modules/reconciliation/reconciliation.service.ts` |
| Identity | `apps/api/src/modules/identity/identity.controller.ts` |
| Identity DTO | `apps/api/src/modules/identity/identity.dto.ts` |
| Identity service | `apps/api/src/modules/identity/identity.service.ts` |
| Device reader | `apps/api/src/modules/device-reader/*` |
| Smart card | `apps/api/src/modules/smart-card/*` |
| Audit | `apps/api/src/modules/audit/*` dan `apps/api/src/common/audit-log.ts` |
| Reporting | `apps/api/src/modules/reporting/*` |
| System cleanup | `apps/api/src/modules/system-cleanup/system-cleanup.service.ts` |
| Worker | `apps/worker/src/index.js` |
| Frontend API helper | `apps/web/src/app/api.ts` |
| Frontend shell | `apps/web/src/app/SchoolHubApp.tsx` |
| Admin UI | `apps/web/src/app/pages/admin/AdminPages.jsx` |
| Guru UI | `apps/web/src/app/pages/guru/GuruPages.jsx` |
| Siswa UI | `apps/web/src/app/pages/siswa/MyAttendancePage.jsx` |
| Prisma schema | `prisma/schema.prisma` |
| Nginx | `ops/nginx/reverse-proxy.conf` |
| Docker production | `docker-compose.production.yml` |
| Final validation | `scripts/validate_final.sh` |
| Smoke test | `scripts/uat_smoke.sh` |

---

## 3. Severity Model

| Severity | Arti |
|---|---|
| P0 Critical | Dapat memalsukan/merusak bukti absensi, bypass kontrol utama, atau menghilangkan audit penting. Harus dipatch sebelum beta luas/produksi. |
| P1 High | Risiko tinggi terhadap integritas, otorisasi, session, atau laporan final. Harus masuk core hardening. |
| P2 Medium | Hardening defense-in-depth, observability, atau misconfiguration yang belum langsung merusak data. |
| P3 Low | Perbaikan kualitas, UX keamanan, dokumentasi, atau operational guardrail. |

---

## 4. Temuan Baseline Utama

### P0-01 — Endpoint scan masih mempercayai payload client untuk identitas, waktu, tipe reader, dan jenis ibadah

**Evidence:**

- `apps/api/src/modules/attendance-gate/attendance-gate.dto.ts`
  - `QrScanDto` menerima `cardUid`, `userId`, `readerId`, `deviceId`, `readerType`, `direction`, `prayerType`, `scannedAt`, `overrideScope`, `manualReason`.
- `apps/api/src/modules/attendance-gate/attendance-gate.service.ts`
  - `qrScan()` memakai `payload.scannedAt` jika tersedia.
  - `readerType` dapat berasal dari `payload.readerType`.
  - `user` dapat berasal dari `payload.userId` jika tidak ada `cardUid`.
  - `prayerType` dapat berasal langsung dari `payload.prayerType`.
  - `deviceId` dapat berasal dari payload.

**Dampak:**

Petugas yang punya akses endpoint, atau jika akun petugas bocor, dapat membuat bukti scan gerbang/mushola untuk user mana pun, pada waktu yang dipilih, dengan reader type yang dipilih, tanpa signed reader proof.

**Kontrol target:**

- Scan resmi wajib signed reader request.
- Waktu scan wajib server time.
- User scan wajib dari SmartCard/QR token aktif.
- Reader type wajib dari database `DeviceReader`, bukan payload.
- `PrayerType` dihitung server dari policy window.
- Input manual dipisah dari scan reader dan selalu diberi label override/manual.

---

### P0-02 — `gate/tap` membuat GateLog dari `userId/tappedAt` payload tanpa validasi kartu/reader kuat

**Evidence:**

- `apps/api/src/modules/attendance-gate/attendance-gate.controller.ts`
  - `POST /attendance/gate/tap` menerima `TapGateDto`.
- `apps/api/src/modules/attendance-gate/attendance-gate.service.ts`
  - `tap()` langsung `tx.gateLog.create({ userId, direction, deviceId, tappedAt })`.

**Dampak:**

Dapat membuat log gerbang berbasis `userId` bebas dan timestamp client. Ini bertentangan dengan zero trust terhadap `userId` dan `tappedAt`.

**Kontrol target:**

- Depresiasi endpoint ini untuk scan resmi.
- Jika tetap ada, jadikan manual/admin-only dengan reason dan label manual.
- Scan reader wajib endpoint signed khusus.

---

### P0-03 — Tidak ada signed reader request dan anti-replay nonce

**Evidence:**

- `DeviceReader` hanya punya `apiKey`.
- `AttendanceGateService.qrScan()` mencari reader dengan `id` atau `apiKey`, tetapi tidak ada HMAC signature, nonce, body hash, timestamp skew, atau Redis replay protection.
- `DeviceReader.lastSeenAt` dapat update berdasarkan `deviceId`/`apiKey` dari payload setelah scan biasa.

**Dampak:**

Request reader bisa dipalsukan/replay jika API key bocor atau ditebak dari UI/log. Reader identity belum cryptographically bound ke body request.

**Kontrol target:**

- `deviceId`, `timestamp`, `nonce`, `bodyHash`, `signature` wajib.
- HMAC-SHA256 atas `method + path + timestamp + nonce + bodyHash`.
- Nonce disimpan Redis TTL.
- `lastSeenAt` update hanya setelah signature valid.

---

### P0-04 — Gate anti-curang belum lengkap: OUT tanpa IN, IN berulang, OUT berulang, duplicate window

**Evidence:**

- `recordGateScan()` hanya memeriksa Ashar untuk siswa dan policy gate-out guru/staff tertentu.
- Tidak ditemukan validasi:
  - OUT harus punya IN hari itu.
  - IN berulang dalam siklus aktif ditolak/di-flag.
  - OUT berulang tanpa IN baru ditolak/di-flag.
  - duplicate scan window diterapkan di gate log.

**Dampak:**

Bukti gerbang bisa tidak konsisten tetapi tetap masuk laporan sebagai log valid.

**Kontrol target:**

- Server state machine harian: `NONE → IN → OUT`.
- Duplicate window by user/direction/device/time.
- Override gate-in/out harus sempit dan audit.
- Mismatch tetap masuk rekonsiliasi.

---

### P0-05 — Presensi kelas dapat menerima `studentId` arbitrary dan belum memvalidasi enrollment aktif dengan ketat

**Evidence:**

- `AttendanceClassService.recordAttendance()` menerima `payload.items[].studentId`.
- Service menghitung eligibility berdasarkan daftar studentId dari payload, lalu upsert `StudentAttendance` untuk `sessionId_studentId`.
- Tidak terlihat validasi eksplisit bahwa setiap `studentId` adalah siswa aktif dan terdaftar di kelas sesi pada tanggal sesi.

**Dampak:**

Guru/admin/piket dengan akses sesi dapat memasukkan presensi siswa yang bukan roster kelas tersebut.

**Kontrol target:**

- Semua `studentId` harus subset roster/enrollment aktif sesi.
- Reject unknown/out-of-class student.
- Audit `attendance.class.rejected_out_of_roster`.

---

### P0-06 — Override manual belum timebox, scope string bebas, dan belum step-up/dual approval

**Evidence:**

- `CreateAttendanceOverrideDto.scope?: string`.
- `AttendanceOverride.scope` bertipe `String`.
- `expiresAt` ada di schema tetapi `createOverride()` tidak mengisinya dan validasi pemakaian override tidak memeriksa expiry.
- Reason hanya `MinLength(10)`.
- Override `ALL` dapat dibuat jika scope dikirim tanpa step-up/dual approval.

**Dampak:**

Override bisa terlalu luas, lintas konteks, dan tidak kedaluwarsa. Ini titik rawan kolusi/penyalahgunaan.

**Kontrol target:**

- Scope enum sempit.
- Expiry wajib.
- Reason validator kualitas.
- Step-up auth untuk override sensitif.
- Override `ALL`/massal masuk review/dual approval.
- Rekonsiliasi tetap flag `hadir via override`.

---

### P1-01 — Token disimpan di `localStorage`

**Evidence:**

- `apps/web/src/app/api.ts`
  - `TOKEN_KEY = 'schoolhub_access_token'`.
  - `apiFetch()` membaca token dari `localStorage` dan mengirim Bearer.
- `apps/web/src/app/SchoolHubApp.tsx`
  - login menyimpan `response.accessToken` ke `localStorage`.

**Dampak:**

Jika terjadi XSS, token dapat dicuri dan digunakan sampai expired.

**Kontrol target:**

- HttpOnly Secure SameSite cookie.
- Session DB/Redis, refresh rotation, revoke session.
- `localStorage` hanya cache UI non-authoritative.

---

### P1-02 — JWT secret dan worker token punya fallback dev yang berbahaya jika env salah

**Evidence:**

- `apps/api/src/modules/auth/jwt.strategy.ts`
  - `secretOrKey: process.env.JWT_SECRET ?? 'dev-only-secret'`.
- `apps/api/src/modules/auth/auth.module.ts`
  - `secret: process.env.JWT_SECRET ?? 'dev-only-secret'`.
- `apps/api/src/modules/reconciliation/reconciliation.controller.ts`
  - `process.env.WORKER_TOKEN ?? 'worker-dev-token'`.
- `apps/worker/src/index.js`
  - `process.env.WORKER_TOKEN || 'worker-dev-token'`.

**Dampak:**

Jika production env salah/kosong, sistem memakai secret publik default.

**Kontrol target:**

- Production fail-fast jika secret/token kosong atau default.
- Worker endpoint ditambah HMAC/timestamp/nonce atau minimal network-block di Nginx.

---

### P1-03 — CORS production masih terbuka

**Evidence:**

- `apps/api/src/main.ts`
  - `app.enableCors();` tanpa origin whitelist.

**Dampak:**

Browser dari origin tidak resmi dapat memanggil API jika token/cookie tersedia.

**Kontrol target:**

- `CORS_ORIGIN` whitelist saat `NODE_ENV=production`.
- Deny by default.

---

### P1-04 — Audit belum tamper-evident dan masih plain append biasa

**Evidence:**

- `prisma/schema.prisma` `AuditEntry` belum punya `prevHash`, `entryHash`, `canonicalPayload`.
- Banyak service membuat audit langsung via `prisma.auditEntry.create()` atau `createMany()`.
- `writeAudit()` saat ini hanya wrapper create biasa.

**Dampak:**

Perubahan/hapus langsung di DB tidak mudah terdeteksi oleh aplikasi.

**Kontrol target:**

- Hash chain audit.
- Audit append-only di aplikasi.
- Endpoint verify chain.
- Critical alert jika chain rusak.

---

### P1-05 — Device reader key berpotensi terekspos lewat list/create/rotate response

**Evidence:**

- `DeviceReaderService.listReaders()` mengembalikan hasil `findMany()` penuh, termasuk `apiKey`.
- `createReader()` dan `rotateApiKey()` mengembalikan object reader penuh.

**Dampak:**

API key reader dapat terlihat di UI/API response oleh role admin/operator. Untuk model signed reader, secret harus one-time provisioning dan tidak tampil lagi.

**Kontrol target:**

- List hanya tampil `hasSecret`, `keyVersion`, `lastRotatedAt`, bukan secret.
- Create/rotate return secret hanya sekali.
- Rotate wajib step-up dan audit.

---

### P1-06 — Reconciliation belum mencakup mismatch anti-curang utama

**Evidence:**

- `ReconciliationService.reconcileSession()` sudah mendeteksi beberapa kasus: bolos, lupa tap, belum Dhuha/Dzuhur/Ashar, tidak mengajar, buka tanpa gerbang.
- Belum terlihat deteksi:
  - OUT tanpa IN.
  - IN berulang mencurigakan.
  - OUT terlalu cepat.
  - Gate IN tanpa presensi kelas jika tidak ada attendance row.
  - Override berlebihan.
  - Koreksi berulang.
  - Reader burst/offline.
  - Policy berubah saat jam absensi.
  - Export laporan tidak wajar.

**Dampak:**

Sebagian abuse tidak dicegah dan belum terangkat menjadi flag.

**Kontrol target:**

- Perluas flag/evidence/recommendation.
- Flag jangan menghapus data; status OPEN memengaruhi label laporan final.

---

### P1-07 — Koreksi presensi belum menyimpan before/after lengkap dan event koreksi immutable

**Evidence:**

- `AttendanceClassService.correctAttendance()` melakukan upsert/update `StudentAttendance`.
- Audit after berisi status/note/reason, tetapi before tidak disimpan.
- Belum ada tabel correction event immutable.

**Dampak:**

Riwayat perubahan presensi sulit dibuktikan lengkap jika audit belum hash-chain.

**Kontrol target:**

- Tabel `AttendanceCorrectionEvent`.
- Audit before/after.
- Koreksi setelah closed hanya endpoint resmi + reason + policy.

---

### P1-08 — `summary()` sesi belum cek ownership untuk guru

**Evidence:**

- `AttendanceClassController.summary()` menerima `sessionId` dan tidak mengirim actor.
- `AttendanceClassService.summary()` tidak memeriksa actor/session ownership.
- Endpoint role mengizinkan `GURU_MAPEL`.

**Dampak:**

Guru dapat membaca summary sesi lain jika mengetahui `sessionId`.

**Kontrol target:**

- Semua endpoint ID panggil `AccessPolicyService`.
- Guru hanya sesi miliknya.

---

### P1-09 — Reporting/export belum audit/checksum/warning anomali

**Evidence:**

- `ReportingController.exportReport()` tidak mengirim actor ke service.
- `ReportingService.exportReport()` menghasilkan file tanpa audit, checksum, metadata jumlah override/anomali.

**Dampak:**

Export sensitif tidak meninggalkan jejak audit cukup dan laporan final belum transparan terhadap override/anomali.

**Kontrol target:**

- Audit export.
- Metadata file/checksum.
- Warning jika ada anomaly OPEN.
- Label normal/via override/corrected/missing evidence.

---

### P2-01 — Health detail publik terlalu informatif

**Evidence:**

- `HealthController.detail()` publik.
- `HealthService.detail()` mengembalikan node version, memory, dependency latency.

**Dampak:**

Tidak membocorkan secret, tetapi memberi fingerprint runtime.

**Kontrol target:**

- `/health/detail` hanya role admin/operator/developer atau internal.
- Public cukup `live/ready` minimal.

---

### P2-02 — Nginx belum punya CSP dan rate limit scan khusus

**Evidence:**

- `ops/nginx/reverse-proxy.conf` sudah punya security headers dasar dan rate limit login/API umum.
- Belum ada `Content-Security-Policy`.
- Belum ada rate limit khusus `/api/v1/attendance/*scan*`.
- `/api/v1/internal/*` masih lewat `location /api/`; proteksi hanya token aplikasi.

**Kontrol target:**

- CSP aman untuk React build.
- Scan limit terpisah.
- Block public `/api/v1/internal/*` di Nginx; worker pakai Docker internal network.

---

### P2-03 — Frontend login berisi preset/demo credential

**Evidence:**

- `apps/web/src/app/SchoolHubApp.tsx` `ROLE_PRESETS` berisi username/password demo.

**Dampak:**

Untuk beta internal membantu UAT, tetapi untuk produksi memperbesar risiko social/credential reuse.

**Kontrol target:**

- Hilangkan preset password di production.
- Gunakan hint non-secret atau env gated dev-only.

---

## 5. Threat Model Anti-Curang per Aktor

### 5.1 Siswa

Potensi abuse:

- Titip kartu ke teman.
- Mencoba pulang tanpa scan Ashar.
- Tidak masuk kelas setelah scan gerbang.
- Mengaku hadir ketika tidak ada bukti gerbang/mushola.

Kontrol saat ini:

- GateLog, PrayerAttendanceLog, StudentAttendance, ReconciliationFlag.
- Ashar sudah dicegah untuk jadwal sore jika tidak ada log/override.

Gap:

- Belum ada anti-passback gerbang lengkap.
- Belum ada deteksi titip kartu berbasis pola reader/time impossible.
- Belum ada label laporan final untuk missing evidence/override.

### 5.2 Guru

Potensi abuse:

- Membuka sesi milik guru lain.
- Membuka sesi dari luar area.
- Mengisi hadir siswa yang belum memenuhi syarat.
- Mengoreksi presensi tanpa jejak kuat.

Kontrol saat ini:

- Guru mapel dicek `session.teacherId === actor.sub` untuk open/close/record/correct/roster.
- Geofence opsional.
- Gate tap requirement opsional.
- `HADIR/TELAT` siswa locked ditolak.

Gap:

- `summary()` belum ownership check.
- Input presensi belum validasi roster strict.
- Koreksi belum before/after event immutable.
- GPS masih dari client dan belum didukung device proof lain.

### 5.3 Guru Piket

Potensi abuse:

- Membuka/menutup sesi sebagai bantuan tanpa alasan.
- Override manual terlalu luas.
- Resolve/escalate flag tanpa review memadai.

Kontrol saat ini:

- Role guard.
- `allowPicketOverride` untuk open session.
- Audit beberapa aksi.

Gap:

- Bantuan guru piket belum selalu wajib reason.
- Override belum expiry/dual approval/step-up.
- Resolve/escalate belum object-level policy detail.

### 5.4 Admin/Operator

Potensi abuse:

- Membuat user/role tidak sesuai.
- Mengubah policy saat jam absensi.
- Rotate/lihat reader key.
- Export data sensitif tanpa jejak kuat.

Kontrol saat ini:

- Role guard admin/operator.
- Developer role dilindungi sebagian.
- Audit user/policy/device/export belum merata.

Gap:

- Step-up auth belum ada.
- Export belum audit/checksum.
- Policy change belum direkonsiliasi sebagai anomali jika mendadak.
- Device key masih terekspos.

### 5.5 Developer

Potensi abuse:

- Super-admin bypass semua role guard.
- Hapus data/cleanup.
- Hapus akun permanen.

Kontrol saat ini:

- Developer-only untuk cleanup/permanent delete.
- Tidak boleh delete diri sendiri.
- Tidak boleh delete last active developer.
- Protected relation checks.

Gap:

- Step-up auth belum ada.
- Audit belum tamper-evident.
- Session revoke belum ada.

### 5.6 Reader/Device

Potensi abuse:

- Request palsu dari device ID/API key.
- Replay request.
- Timestamp dimanipulasi.
- Reader salah tipe dipakai scan mushola/gerbang.

Kontrol saat ini:

- `DeviceReader.status/type` ada di DB.
- QR scan dapat cari reader by id/apiKey.

Gap:

- Tidak ada HMAC signature.
- Tidak ada nonce anti-replay.
- Tidak ada bodyHash.
- `lastSeenAt` dapat update dari payload biasa.

### 5.7 Pihak Luar

Potensi abuse:

- Brute force login.
- Coba akses internal endpoint.
- Coba replay token dari browser.
- Scrape health/detail.

Kontrol saat ini:

- Login limiter Redis/fallback.
- Nginx rate limit login/API.
- JWT.
- Worker token.

Gap:

- CORS terbuka.
- Token localStorage rentan XSS.
- Internal endpoint masih publik via reverse proxy jika token diketahui/default.
- Health detail publik.

### 5.8 Kolusi Antar Aktor

Potensi abuse:

- Siswa titip kartu + petugas override.
- Guru mengisi hadir + admin resolve flag.
- Operator rotate reader key dan membuat scan palsu.
- Banyak override massal dalam satu kelas/hari.

Kontrol saat ini:

- Audit event dasar.
- Rekonsiliasi sebagian.

Gap:

- Belum ada anomaly pattern untuk override berlebih/kolusi.
- Belum ada dual approval.
- Belum ada tamper-evident audit.
- Laporan belum menandai data via override/anomali.

---

## 6. Audit Alur Logika Absensi Baseline

### 6.1 Login

| Aspek | Baseline |
|---|---|
| Sumber data dipercaya | DB `User`, bcrypt hash, Redis limiter |
| Field client | `username`, `password` |
| Field server | JWT payload dari DB user, audit login, limiter state |
| Role boleh | Publik untuk login |
| Ownership | N/A |
| Audit wajib | success, failed, locked, revoked/password-changed/session-revoked target |
| Boleh dikoreksi | Password/role/active via endpoint resmi |
| Tidak boleh diedit | Audit login lama |
| Abuse | brute force, credential stuffing, token theft localStorage |
| Pencegahan saat ini | Redis/in-memory limiter, generic error, user active check |
| Gap | limiter belum IP+account terpisah penuh, token localStorage, session revoke belum ada |
| Test target | failed login lock, inactive denied, revoke session, logout all devices |

### 6.2 Scan gerbang IN

| Aspek | Baseline |
|---|---|
| Sumber data dipercaya | DB user/card jika `cardUid`; payload `userId` masih diterima |
| Field client | `userId`, `cardUid`, `readerId`, `deviceId`, `readerType`, `direction`, `scannedAt` |
| Field server | Seharusnya `tappedAt`, reader type, user from card |
| Role boleh | Saat ini admin/operator/guru piket endpoint JWT |
| Ownership | Card harus tertaut user aktif; belum signed reader proof |
| Audit wajib | scan accepted/rejected/security event |
| Boleh dikoreksi | Tidak mengubah log; koreksi via flag/override |
| Tidak boleh diedit | GateLog valid lama |
| Abuse | scan palsu, IN berulang, timestamp mundur/maju |
| Pencegahan saat ini | Card active jika pakai cardUid; manual role check jika tanpa cardUid |
| Gap | server time belum wajib, duplicate window belum, anti-passback belum |
| Test target | signed reader valid, wrong signature reject, duplicate reject, IN repeat flag |

### 6.3 Scan Dhuha

| Aspek | Baseline |
|---|---|
| Sumber data dipercaya | DB card/user; payload prayerType masih dapat dipercaya |
| Field client | `readerType`, `prayerType`, `scannedAt`, `userId/cardUid` |
| Field server | Seharusnya prayer type dari policy window dan server time |
| Role boleh | Reader resmi MUSHOLA atau manual petugas |
| Ownership | User harus role SISWA |
| Audit wajib | prayer scan accepted/rejected |
| Boleh dikoreksi | Manual override terpisah, jangan overwrite log valid |
| Tidak boleh diedit | Prayer log valid lama |
| Abuse | scan Dhuha di luar waktu, mengganti prayerType |
| Pencegahan saat ini | role siswa dicek, upsert unik per student/prayer/date |
| Gap | upsert mengubah log lama; prayerType client dipercaya |
| Test target | payload prayer ignored, outside window reject/flag, duplicate not overwrite |

### 6.4 Scan Dzuhur

Sama dengan Dhuha, dengan window Dzuhur. Gap utama tetap server-side prayer calculation, duplicate immutability, signed reader.

### 6.5 Guru buka sesi

| Aspek | Baseline |
|---|---|
| Sumber data dipercaya | DB `Session`, `GeofencePolicy`, optional GateLog guru |
| Field client | `sessionId`, `lat`, `lng` |
| Field server | `openedAt`, status guru, checkInAt |
| Role boleh | Admin/TU, Guru Mapel, Guru Piket |
| Ownership | Guru mapel harus session.teacherId; admin/piket belum reason wajib |
| Audit wajib | teacher.session.checkin, class.session.opened, denied geofence/gate |
| Boleh dikoreksi | Buka/tutup via event resmi |
| Tidak boleh diedit | Presence event lama |
| Abuse | guru buka sesi orang lain, GPS spoof, buka jauh sebelum/sesudah jadwal |
| Pencegahan saat ini | ownership guru, geofence optional, gate tap optional |
| Gap | admin/piket assist tanpa reason, time window belum strict, GPS single evidence |
| Test target | guru lain ditolak, out of geofence ditolak, no gate tap ditolak |

### 6.6 Guru input presensi

| Aspek | Baseline |
|---|---|
| Sumber data dipercaya | DB session/policy/gate/prayer/override; payload studentId/status |
| Field client | `items[].studentId`, `status`, `note` |
| Field server | eligibility, rejected list, audit |
| Role boleh | Admin/TU, Guru Mapel, Guru Piket |
| Ownership | Guru mapel session owner; student roster belum strict |
| Audit wajib | class.attendance.recorded, blocked_by_policy |
| Boleh dikoreksi | Status via endpoint resmi dengan reason |
| Tidak boleh diedit | Event koreksi lama |
| Abuse | memasukkan siswa luar kelas, ubah hadir locked, bulk mark hadir |
| Pencegahan saat ini | locked HADIR/TELAT ditolak berdasarkan gate/Dhuha/Dzuhur |
| Gap | roster/enrollment strict belum; correction before/after belum |
| Test target | out-of-roster reject, locked HADIR reject, after closed no batch update |

### 6.7 Guru tutup sesi

| Aspek | Baseline |
|---|---|
| Sumber data dipercaya | DB session/presence |
| Field client | `sessionId`, `lat`, `lng`, `earlyCheckoutReason` |
| Field server | `closedAt`, status CLOSED, checkOutAt |
| Role boleh | Admin/TU, Guru Mapel, Guru Piket |
| Ownership | Guru mapel owner |
| Audit wajib | teacher.session.checkout, class.session.closed |
| Boleh dikoreksi | Via correction/flag, tidak edit event lama |
| Abuse | tutup sebelum jam selesai tanpa alasan, admin tutup sesi orang |
| Pencegahan saat ini | early reason wajib jika before endsAt |
| Gap | admin/piket reason assist belum wajib; reason quality belum |
| Test target | early without reason reject, guru other session reject |

### 6.8 Scan Ashar

Baseline sama dengan scan mushola, tetapi punya dampak gate OUT. Kontrol Ashar sudah ada untuk jadwal sore, namun harus diperkuat agar scan Ashar hanya dari reader mushola resmi/server time dan tidak bisa dibuat ulang lewat payload bebas.

### 6.9 Scan gerbang OUT

| Aspek | Baseline |
|---|---|
| Sumber data dipercaya | DB session/weekly schedule/prayer/override; payload scan masih bebas |
| Field client | `direction`, `userId/cardUid`, `scannedAt`, `readerType` |
| Field server | Seharusnya server time and anti-passback decision |
| Role boleh | Reader signed atau manual petugas |
| Ownership | Card active user active |
| Audit wajib | OUT accepted/rejected, missing Ashar, no IN |
| Abuse | OUT tanpa IN, OUT sebelum sesi selesai, OUT tanpa Ashar, OUT berulang |
| Pencegahan saat ini | Ashar policy untuk siswa jadwal sore |
| Gap | OUT tanpa IN belum, duplicate/anti-passback belum |
| Test target | no IN reject, no Ashar reject, expired override reject, repeat OUT reject |

### 6.10 Override manual

| Aspek | Baseline |
|---|---|
| Sumber data dipercaya | DB student/policy; reason dari client |
| Field client | `studentId`, `date`, `scope`, `reason` |
| Field server | `createdById`, createdAt; expiry belum diset |
| Role boleh | Admin/TU, Operator, Guru Piket |
| Ownership | Target harus siswa aktif |
| Audit wajib | override requested/approved/used/expired/revoked |
| Abuse | scope ALL, lintas hari, alasan generik, kolusi |
| Pencegahan saat ini | allowManualOverride, reason min length, target SISWA aktif |
| Gap | expiry, enum scope, step-up, approval, reason quality |
| Test target | expired reject, ALL step-up, self-approval reject, usage flagged |

### 6.11 Worker auto-missed

| Aspek | Baseline |
|---|---|
| Sumber data dipercaya | DB session/geofence policy/teacher leave |
| Field client | Worker body kosong; token header |
| Field server | cutoff, missed status, teacher presence |
| Role boleh | Worker internal |
| Audit wajib | session.missed, worker denied |
| Abuse | public caller menjalankan worker jika token bocor/default |
| Pencegahan saat ini | `x-worker-token` |
| Gap | default token, Nginx not block public internal path, no HMAC/nonce |
| Test target | no token reject, wrong token reject, public path blocked in Nginx |

### 6.12 Worker rekonsiliasi

Sama dengan auto-missed; kontrol deteksi perlu diperluas dan worker endpoint diperkuat.

### 6.13 Resolve/escalate anomali

| Aspek | Baseline |
|---|---|
| Sumber data dipercaya | DB flag |
| Field client | `flagId`, `reason`, workflow fields |
| Field server | resolvedAt, resolvedById, queue close |
| Role boleh | Resolve admin/operator; workflow/escalate admin/operator/piket |
| Ownership | Belum policy layer detail |
| Audit wajib | flag.resolved/workflow/escalated |
| Abuse | resolve flag sendiri/kolusi tanpa bukti |
| Pencegahan saat ini | role guard, reason min length |
| Gap | reason quality, dual approval untuk sensitive, flag evidence/recommendation belum |
| Test target | guru denied, piket resolve denied, audit before/after, chain valid |

### 6.14 Laporan/export

| Aspek | Baseline |
|---|---|
| Sumber data dipercaya | DB sessions/attendance/flags/audit |
| Field client | filters, reportType, format |
| Field server | rows, file name, should include checksum metadata |
| Role boleh | Admin/TU, Operator, Guru Piket |
| Ownership | Belum `canExportReport` policy detail |
| Audit wajib | report.exported with checksum/filter/counts |
| Abuse | export tidak wajar, laporan tanpa anomali/override label |
| Pencegahan saat ini | role guard |
| Gap | audit/checksum/warning/labels belum |
| Test target | export audit, checksum present, open anomaly warning |

---

## 7. Baseline Kontrol yang Sudah Baik

- `ValidationPipe` global dengan whitelist/transform/forbid non-whitelisted.
- Role guard sudah deny jika tidak ada role cocok.
- User nonaktif ditolak saat JWT validate.
- Login error generik.
- Login limiter Redis dengan fallback memory.
- Ashar checkout policy sudah ada untuk siswa jadwal sore.
- Guru mapel ownership sudah ada untuk open/close/record/correct/roster.
- Hapus permanen user Developer-only dan protected relation check.
- Clean data Developer-only dan preview-first.
- Nginx punya rate limit login/API dasar dan security header dasar.
- Docker service internal API hanya `expose`, publik lewat reverse proxy port 80.
- Backup/restore/smoke/final validation tersedia.

---

## 8. Patch Mapping ke Plan 20 Langkah

| Temuan | Plan terkait |
|---|---|
| Client-side trust scan | 2, 3, 7, 9, 10, 11 |
| No signed reader | 2, 3, 7, 8, 17 |
| Override lemah | 2, 3, 7, 13, 14, 15, 17 |
| Gate anti-passback | 2, 10, 11, 14, 17 |
| Kelas BOLA/roster | 3, 9, 12, 17 |
| Audit plain | 2, 3, 4, 10, 17 |
| Auth localStorage/session revoke | 2, 5, 6, 17 |
| Reporting/export | 9, 15, 17 |
| Nginx/internal/CORS | 13, 16, 18 |
| Tests/smoke | 17, 18, 19 |

---

## 9. Baseline Acceptance Criteria untuk Hardening

Sistem baru dianggap memenuhi target setelah:

- [ ] Semua waktu absensi penting memakai server time.
- [ ] Scan resmi hanya via signed reader request.
- [ ] Reader aktif, tipe benar, signature benar, nonce belum pernah dipakai.
- [ ] SmartCard/QR token aktif menjadi sumber user scan; bukan `userId` bebas.
- [ ] Manual override tidak disamakan dengan scan reader.
- [ ] OUT tanpa IN ditolak/di-flag kecuali override sah.
- [ ] Duplicate scan window aktif.
- [ ] Prayer type dihitung server.
- [ ] Override punya enum scope, expiry, reason layak, audit, dan step-up untuk sensitif.
- [ ] Endpoint yang menerima ID memanggil object-level policy.
- [ ] Presensi siswa hanya untuk roster/enrollment valid.
- [ ] Koreksi presensi mencatat before/after dan correction event.
- [ ] Audit hash chain dapat diverifikasi.
- [ ] Internal worker endpoint tidak bisa dipanggil publik sembarangan.
- [ ] Reconciliation mendeteksi mismatch utama.
- [ ] Laporan menampilkan override/anomali/koreksi/missing evidence.
- [ ] Export punya audit dan checksum.
- [ ] Test anti-curang utama lulus.
- [ ] `npm run validate:final` lulus atau kegagalan terdokumentasi.

---

## 10. Keputusan Baseline

- Dokumen ini menjadi acuan kondisi sebelum patch keamanan.
- Temuan P0/P1 harus diprioritaskan sebelum rollout lebih luas dari beta terbatas.
- Implementasi berikutnya dimulai dari migration schema hardening `0012_security_anti_cheat_hardening` agar fondasi database siap untuk audit hash-chain, session revoke, signed reader, override expiry, correction event, dan metadata rekonsiliasi/laporan.
