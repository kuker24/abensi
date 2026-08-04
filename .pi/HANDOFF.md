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
- Production commit (2026-08-04): `e27957e` — soft-gate + ops scripts deployed.
- Soft-gate **LIVE** di API (`teacher.session.checkin.missing_gate` in dist).
- Public HTTPS smoke: PASS (29/29).
- Containers healthy: api/web/worker/postgres/redis/nginx.

## Production data state (2026-08-04)

| Check | Value |
|-------|-------|
| Enrollment aktif X | 194 |
| Enrollment aktif XI/XII | 0 |
| TA/WS aktif XI/XII | 0 |
| Weekly overlap effective-now | 0 |
| MISSED since 2026-07-01 | **0** (amnesty applied: 90 → CLOSED + EXCUSED_ABSENCE; 90 flags RESOLVED) |
| OPEN past days | 0 |
| OPEN today | 3 (X C Fisika, X B Akidah, X D Fisika; roster 32/31/33) |
| SCHEDULED X tomorrow | 39 |
| autoMissedGraceMinutes | **45** (was 30) |
| requireGateTapForOpen / requireTeacherGateIn | true (soft-gate code: warn, not lock) |

Backup predeploy: `/opt/schoolhub/backups/predeploy-20260804-204048/schoolhub-20260804T134048Z.dump.enc` (~70MB).

Amnesty policy: `AMNESTY_MISSED_2026-08` — no fake student HADIR; GateLog staff unchanged.

## Current Source Contracts

- API NestJS di `apps/api`; prefix `/api/v1`.
- Soft-gate: `openSession` tidak Forbidden saat missing gate IN; audit `missing_gate`; HADIR/TELAT tetap.
- Amnesty ops: `scripts/amnesty_missed_sessions.ts` (`npm run ops:amnesty-missed-sessions`).
- Freeze ops: `scripts/freeze_xi_xii_card_not_ready.ts`.
- KKA dedupe: `scripts/dedupe_kka_weekly.ts`.
- Readiness: `scripts/teacher_schedule_readiness.ts`.
- XI/XII tetap beku sampai kartu siap (jangan re-enable tanpa perintah).
- Hanya kelas **X** wajib absensi mapel.

## VPS Access

- SSH: `siab2` → `103.93.133.212`, user `schoolhub`.
- App: `/opt/schoolhub/current`; env `/opt/schoolhub/.env` (jangan print).
- Domain: `https://absensi.man1rokanhulu.cloud`.
- Compose project: **`current`**.
- Runbook: `docs/deployment/vps-production-runbook.md`.

## Resume Rules

1. `git status` + `git rev-parse HEAD`.
2. Baca root `AGENTS.md`, file ini, child `AGENTS.md` relevan.
3. Jangan hard-delete siswa XI/XII; re-enable hanya setelah kartu siap + perintah user.
4. Jangan deploy/mutate production tanpa perintah; backup wajib sebelum mutasi data.
5. Working tree boleh berisi artifact privat untracked — jangan wipe.

## User Preferences

- Respons ringkas Bahasa Indonesia + bukti.
- Scope SIAB2 only.
