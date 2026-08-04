# Project Handoff — Active State

## Authority

File ini adalah **satu-satunya status operasional aktif** untuk melanjutkan pekerjaan SIAB2.

- Source dan Git `main` tetap menjadi kebenaran utama implementasi.
- `.pi/EVIDENCE.md` adalah arsip historis; jangan mengambil status aktif langsung dari entri lama tanpa verifikasi ulang.
- `.pi/memory/MEMORY.md` hanya memuat arsitektur stabil dan menunjuk kembali ke file ini untuk status aktif.
- Codebase Memory adalah graf source, bukan penyimpanan keputusan, TODO, atau status produksi.

## Current Local Checkpoint

- Repository: `Absensi` / SIAB2 SchoolHub e-Hadir.
- Branch: `main`.
- Work (2026-08-04):
  - Freeze XI+XII (kartu belum siap) — production applied earlier (no hard-delete).
  - Soft-gate open session (terlambat ditandai, tidak dikunci).
  - KKA stale cleanup (Salmi keep).
  - Ops amnesty MISSED → CLOSED + EXCUSED_ABSENCE (`scripts/amnesty_missed_sessions.ts`).
- Production data already: XI/XII enrollment active 293→0; X remains ~194; TA/WS XI/XII active→0; KKA active = Salmi only.
- Soft-gate + amnesty deploy/apply **in progress** this session (see post-deploy section after completion).
- Working tree may still have unrelated untracked artifacts. Do not wipe.

## Current Source Contracts

- API NestJS berada di `apps/api`; prefix global `/api/v1`.
- Web React/Vite berada di `apps/web`.
- Worker BullMQ berada di `apps/worker`.
- Android QR reader berada di `apps/android-reader` dan memakai endpoint signed `POST /api/v1/attendance/qr-reader-scan`.
- Prisma schema dan migration history berada di `prisma`.
- Shared roles/capabilities/error codes berasal dari `packages/shared`.
- Source generator kartu production adalah `DataSekolah/generator-tanda-pengenal/`; build disinkronkan ke `apps/web/public/id-card-generator/`.
- Target Android production yang saat ini dipetakan source adalah `READER_IDENTITY_01`, `READER_GATE_PRAYER_01`, dan `READER_GATE_PRAYER_02`, masing-masing dengan `GATE_IN`, `GATE_OUT`, `MUSHOLA`, dan `CHECK_ONLY`.
- `READER_IDENTITY_01` **bukan test-only pada source saat ini**: targeted API test membuktikan `GATE_IN` menghasilkan `GateLog` live. Klaim test-only pada handoff lama sudah dibatalkan.
- NKD adalah identifier siswa empat digit yang unique, immutable, dan non-reusable melalui `StudentNkdRegistry`.
- Soft-gate: `openSession` tidak Forbidden saat missing gate IN; audit `teacher.session.checkin.missing_gate`; status HADIR/TELAT tetap.

## VPS Access

- SSH alias lokal: `siab2` dari `~/.ssh/config`.
- Host: `103.93.133.212`, user `schoolhub`, port `22`.
- App directory: `/opt/schoolhub/current`.
- Production env: `/opt/schoolhub/.env`; jangan baca atau cetak isinya.
- Domain: `https://absensi.man1rokanhulu.cloud`.
- Runbook aktif: `docs/deployment/vps-production-runbook.md`.
- Endpoint lama `157.15.40.21:9103` bersifat arsip/stale dan tidak boleh dipakai.
- Compose project production: `current`.

## Historical Work

Riwayat Wave A–C, migration 0041–0045, APK attestation, NKD/student import, kartu, audit chain, deployment Juli 2026, dan perbaikan production tetap tersedia di `.pi/EVIDENCE.md`. Detail tersebut tidak diduplikasi di sini untuk mencegah status bercabang.

## Items Requiring Fresh Verification

1. SHA/image yang benar-benar aktif di production setelah deploy soft-gate.
2. Amnesti MISSED Jul–Aug counts (remaining MISSED in range = 0).
3. Status OPEN stale ditutup; sesi X besok SCHEDULED.
4. Soft-gate smoke: open tanpa gate IN.
5. Freeze XI/XII postcondition still holds.
6. Versi APK reader + canary fisik (out of this change).

## Resume Rules

1. Mulai dengan `git status --short --branch` dan `git rev-parse HEAD`.
2. Baca root `AGENTS.md`, file ini, lalu child `AGENTS.md` yang relevan.
3. Gunakan `.pi/EVIDENCE.md` hanya untuk konteks historis dan audit trail.
4. Jangan membuka `.env`, private key, credential, QR plaintext, kartu privat, archive privat, keystore, atau data personal.
5. Jangan mengubah production, menjalankan migration/deploy, menghapus APK/artifact, commit, atau push tanpa persetujuan eksplisit (user 2026-08-04 meminta commit+deploy+amnesty).
6. Pertahankan Compose project production bernama `current`.
7. Jika handoff bertentangan dengan source atau Git terbaru, source/Git menang dan handoff harus diperbarui.

## User Preferences

- Respons ringkas dalam bahasa Indonesia dengan bukti yang spesifik.
- SIAB1 dan proyek lain di luar scope.
- Jangan commit atau push kecuali diminta secara eksplisit (diminta 2026-08-04).
