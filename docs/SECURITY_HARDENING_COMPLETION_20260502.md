# SchoolHub e-Hadir — Ringkasan Hardening Security & Anti-Curang

Tanggal: 2026-05-02
Status: implementasi hardening baseline 20 langkah selesai divalidasi lokal.

## 1. Ringkasan Sistem

SchoolHub e-Hadir adalah sistem absensi adaptif berbasis:

- Frontend React/Vite untuk Admin TU, Operator IT, Guru Piket, Guru Mapel, Siswa, dan Developer.
- Backend NestJS + Prisma.
- PostgreSQL sebagai sumber data utama.
- Redis untuk rate-limit/nonce/session-adjacent cache.
- Worker internal untuk rekonsiliasi dan auto-missed session.
- Nginx reverse proxy untuk hardening header, rate-limit, dan pemblokiran endpoint internal.

Alur absensi utama:

1. Login memakai session cookie HttpOnly dan refresh-token rotation.
2. Reader resmi melakukan scan melalui endpoint signed request.
3. Gate mencatat IN/OUT memakai waktu server.
4. Mushola mencatat Dhuha/Dzuhur/Ashar hanya dari reader aktif bertanda tangan HMAC.
5. Guru membuka/menutup sesi kelas dengan policy dan audit.
6. Presensi kelas memvalidasi roster, gate/prayer eligibility, dan override sah.
7. Rekonsiliasi menandai anomali untuk review petugas.
8. Export laporan menyertakan metadata, checksum, dan warning anomali.

## 2. Threat Model Utama

### Aktor ancaman

- Siswa menitip kartu/QR.
- User browser memanipulasi payload `userId`, `readerType`, `prayerType`, `scannedAt`, `direction`.
- Reader palsu/replay request.
- Petugas membuat override tanpa alasan atau masa berlaku.
- Akun dicuri/session replay.
- Insider mengubah audit/laporan.
- Akses publik ke endpoint worker/internal.

### Kontrol mitigasi

- Endpoint reader resmi terpisah: `POST /api/v1/attendance/reader-scan`.
- HMAC signature reader dengan device id, timestamp, nonce, dan body hash.
- Nonce anti-replay via Redis.
- Waktu presensi selalu dari server.
- Scan mushola manual ditolak; prayer hanya dari reader MUSHOLA aktif bersignature.
- Gate OUT wajib punya IN hari itu, duplicate scan ditolak, OUT terlalu cepat diberi flag.
- Ashar wajib sebelum checkout siswa yang punya jadwal sore, kecuali override sah.
- Override memakai enum scope, status approval/revocation, expiry, dan reason validator.
- Presensi kelas memvalidasi roster dan eligibility server-side.
- Correction event dicatat terpisah dan diaudit.
- Audit log tamper-evident hash-chain + endpoint verifikasi.
- Session revocation/versioning dan refresh-token rotation.
- CORS production lebih ketat, cookie credential-aware.
- Nginx memblokir `/api/v1/internal/`, menambahkan security headers, dan rate-limit scan/login.
- Worker token wajib aman di production.

## 3. Acceptance Criteria yang Terpenuhi

- Payload client tidak lagi menjadi sumber kebenaran untuk waktu scan/prayer type resmi.
- Reader request wajib signed dan punya nonce unik.
- Manual scan dipisahkan dari reader resmi dan wajib reason.
- OUT tanpa IN ditolak kecuali override sah.
- Presensi luar roster kelas ditolak.
- Override expired/revoked/pending tidak berlaku untuk eligibility.
- Audit entry runtime memakai `writeAudit()` hash-chain.
- Export laporan menyimpan audit, checksum, metadata, dan warning anomali.
- Endpoint internal tidak bisa diakses publik tanpa worker token dan diblokir Nginx.
- Test mencakup signed reader salah/replay/time-skew, duplicate, out-without-in, out-of-roster, override expiry, dan audit-chain verification.

## 4. Validasi Lokal

Perintah yang sudah dijalankan:

```bash
npm run prisma:generate
npx prisma validate --schema prisma/schema.prisma
npm run lint:all
npm run typecheck:all
npm run test:api
npm run test:web
npm run build:all
npm run test:e2e --prefix apps/web
npm audit --audit-level=high
npm audit --prefix apps/api --audit-level=high
npm audit --prefix apps/web --audit-level=high
npm audit --prefix apps/worker --audit-level=high
npm run validate:final
```

Hasil ringkas:

- Prisma generate/validate: PASS.
- Lint: PASS.
- Typecheck API/Web: PASS.
- API unit test: 10 suites, 50 tests PASS.
- Web unit test: 1 file, 2 tests PASS.
- Playwright E2E: 12 tests PASS.
- Build API/Web: PASS.
- Audit high severity: PASS.
- Catatan: advisory moderate `exceljs -> uuid` masih ada dan tidak diperbaiki paksa karena opsi otomatis menurunkan `exceljs` ke major lama/breaking.

## 5. Catatan Operasional

- Jangan hard-code secret reader/JWT/worker.
- Pastikan production mengisi `JWT_SECRET`, `WORKER_TOKEN`, `READER_SECRET_ENCRYPTION_KEY`, `CORS_ORIGIN`, dan `PUBLIC_APP_ORIGIN`.
- Secret reader hanya ditampilkan sekali saat create/rotate; simpan di device provisioning vault/SOP.
- Untuk production final, gunakan Named Tunnel/domain tetap, bukan Quick Tunnel sementara.
- Jalankan migrasi Prisma sebelum deploy runtime baru.
- Setelah deploy, jalankan smoke UAT dari VPS dengan URL aktif.
