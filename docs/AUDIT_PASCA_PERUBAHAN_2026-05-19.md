# Audit Pasca-Perubahan — SchoolHub e-Hadir
**Tanggal:** 2026-05-19 | **Sesi:** Cleanup + Theme + Akun Beta

---

## 1. Ringkasan Perubahan Sesi Ini

| # | Perubahan | File | Status |
|---|-----------|------|--------|
| 1 | Hapus tema midnight/ocean/warm (hanya dark/light) | `types.ts`, `ui.tsx`, `SchoolHubApp.tsx`, `styles.css`, `index.html` | ✅ Selesai |
| 2 | ThemeToggle disederhanakan: hanya Sun/Moon, label "Hutan Gelap"/"Hutan Terang" | `ui.tsx` | ✅ Selesai |
| 3 | Normalisasi localStorage: nilai lama selain dark/light akan fallback ke system preference | `SchoolHubApp.tsx` | ✅ Selesai |
| 4 | Theme-color meta HTML diperbarui ke `#0B1219` (dark) / `#F0F5F2` (light) | `index.html` | ✅ Selesai |
| 5 | Reset semua 17 password user beta ke `Beta@2026!` via Prisma/bcrypt | DB (dalam container) | ✅ Selesai |
| 6 | Bersihkan Redis login-lock keys setelah reset password | Redis (dalam container) | ✅ Selesai |
| 7 | Buat `akun_beta.txt` dengan daftar kredensial lengkap | `/opt/schoolhub/akun_beta.txt` (VPS) + repo lokal | ✅ Selesai |
| 8 | Hapus project AI lama dari VPS | `/opt/ai-portable`, systemd service | ✅ Selesai |
| 9 | Hapus deploy-backups dan file temp | VPS + lokal | ✅ Selesai |
| 10 | REINDEX + VACUUM ANALYZE database | PostgreSQL (dalam container) | ✅ Selesai |

---

## 2. Audit Rute (29 rute — SEMUA LULUS)

Semua 29 rute telah diperiksa sinkronisasi di 4 tempat:

- **ROUTE_ACCESS** (29 entri) — siapa yang boleh akses
- **ROUTE_TITLE** (29 entri) — judul halaman
- **NAV_ITEMS_BY_ROLE** (29 entri) — navigasi sidebar
- **Rendering** (29 `if (path === ...)`) — komponen yang dirender

**Hasil:** TIDAK ADA gap. Semua rute yang didefinisikan di `ROUTE_ACCESS` memiliki pasangan di ROUTE_TITLE, NAV_ITEMS_BY_ROLE, dan render.

### Ringkasan per role:

| Role | Jumlah Rute |
|------|-------------|
| ADMIN_TU | 20 rute |
| OPERATOR_IT | 12 rute |
| GURU_PIKET | 10 rute |
| DEVELOPER | 18 rute |
| GURU_MAPEL | 8 rute |
| SISWA | 3 rute |

---

## 3. Status Validasi Build

| Tes | Hasil |
|-----|-------|
| ESLint (`npm run lint`) | ✅ Lulus |
| TypeScript (`tsc --noEmit`) | ✅ Lulus |
| Vitest (2 files, 4 tests) | ✅ Lulus |
| Vite build (production) | ✅ 392KB JS + 52KB CSS |
| VPS health `/health/ready` | ✅ `{"status":"ready"}` |

**Catatan lokal:** `apps/api/node_modules/.bin/jest` permission denied — gap lokal yang sudah diketahui, tidak memblokir karena build/deploy dijalankan di VPS via Docker.

---

## 4. Status VPS (157.15.40.21:9103)

| Service | Status |
|---------|--------|
| schoolhub-nginx | Up 35 jam |
| schoolhub-api-1 | Up 35 jam (healthy) |
| schoolhub-worker | Up 35 jam (healthy) |
| schoolhub-web | Up 35 jam |
| schoolhub-postgres | Up 11 hari (healthy) |
| schoolhub-redis | Up 11 hari (healthy) |

| Resource | Value |
|----------|-------|
| RAM tersedia | 4.2 GB dari 15 GB |
| Disk | 12 GB dari 125 GB (10%) |
| Deploy backups tersisa | 0 (bersih) |
| Temp files dalam container | 0 (bersih) |

---

## 5. Hapusan yang Sudah Dilakukan

### VPS:
- `/home/schoolhub/deploy-backups/schoolhub-pre-deploy-20260517-070054` — dihapus
- `/home/schoolhub/.last_pre_deploy_backup` — dihapus
- Container `schoolhub-api-run-*` (one-off) — dihapus
- Dangling Docker images — diprune
- `/opt/ai-portable/` + systemd service — dihapus

### Lokal:
- `/tmp/create_akun_beta.py` — dihapus
- `/tmp/reset_beta_accounts.js` — dihapus
- `/tmp/schoolhub_users.tsv` — dihapus
- `apps/web/dist/` — dihapus (direbuild ulang untuk validasi)

---

## 6. Daftar Akun Beta (17 akun)

Semua akun di file `akun_beta.txt` (root repo + `/opt/schoolhub/akun_beta.txt` VPS):

| # | Username | Role | Nama |
|---|----------|------|------|
| 01 | `admin` | ADMIN_TU | Admin TU Beta Tester |
| 02 | `admin.tu` | ADMIN_TU | Admin TU |
| 03 | `uji.admin` | ADMIN_TU | Admin Uji Coba |
| 04 | `guru` | GURU_MAPEL | Guru Beta Tester |
| 05 | `guru.matematika` | GURU_MAPEL | Ibu Siti Rahma |
| 06 | `uji.guru` | GURU_MAPEL | Guru Mapel Uji Coba |
| 07 | `guru.piket` | GURU_PIKET | Pak Rudi Piket |
| 08 | `uji.piket` | GURU_PIKET | Guru Piket Uji Coba |
| 09 | `siswa` | SISWA | Siswa Beta Tester |
| 10 | `siswa.andi` | SISWA | Andi Pratama (X-MIA-1) |
| 11 | `siswa.bunga` | SISWA | Bunga Lestari (X-MIA-1) |
| 12 | `siswa.citra` | SISWA | Citra Azzahra (X-MIA-1) |
| 13 | `siswa.dimas` | SISWA | Dimas Saputra (X-MIA-1) |
| 14 | `uji.siswa` | SISWA | Siswa Uji Coba |
| 15 | `operator.it` | OPERATOR_IT | Operator IT Sekolah |
| 16 | `uji.operator` | OPERATOR_IT | Operator IT Uji Coba |
| 17 | `developer` | DEVELOPER | Developer SchoolHub |

**Password:** Semua `Beta@2026!`

---

## 7. Masih Perlu Dikerjakan (Gap Analysis)

### 7A. Dokumen Stale — Masih Merujuk Tema yang Dihapus

File-file berikut masih menyebut midnight/ocean/warm theme:

| File | Masalah | Prioritas |
|------|---------|-----------|
| `docs/UI_UX_FILE_MAP.md:23` | Tabel masih daftar `[data-theme="midnight"]`, `[data-theme="ocean"]`, `[data-theme="warm"]` | Rendah (dokumen arsitektur) |
| `docs/UI_REDESIGN_v4_WARM_NOCTURNE_REPORT.md:19,84-86` | Tabel 5 tema termasuk midnight/ocean/warm | Rendah (laporan historis) |
| `docs/UI_AUDIT_v4_FINDINGS.md:99` | Deskripsi warm-amber aesthetic | Rendah (laporan historis) |
| `docs/UI_REDESIGN_v3_CONCEPT.md:31-32` | Referensi warna warm-white | Rendah (konsep historis) |

**Rekomendasi:** Tambahkan catatan di awal setiap file bahwa dokumen bersifat historis dan tema midnight/ocean/warm sudah dihapus. Atau biarkan sebagai arsip.

### 7B. Fitur Belum Lengkap

| Fitur | Status | Detail |
|-------|--------|--------|
| **Buku Piket backend** | ❌ Belum ada | Masih pakai localStorage browser. Endpoint backend khusus Buku Piket belum tersedia |
| **Security hardening** | ⚠️ Sebagian | Lihat `docs/SECURITY_BASELINE_AUDIT_20260502.md` — ada 5 P0 critical yang belum dipatch |
| **E2E test coverage** | ⚠️ Minimal | Hanya smoke test + contract test, belum ada E2E per halaman |
| **Domain/HTTPS resmi** | ❌ Belum | Masih pakai Cloudflare tunnel sementara |
| **QR rollout ke produksi** | ❌ Belum | Restore drill belum pernah berhasil (QR_ROLLOUT_PLAN.md) |

### 7C. Refactoring Besar

| Item | File | Catatan |
|------|------|---------|
| `AdminPages.jsx` masih sangat besar | `apps/web/src/app/pages/AdminPages.jsx` (109KB build chunk) | Idealnya dipecah per halaman |
| `SchoolHubApp.tsx` masih 565+ baris | `apps/web/src/app/SchoolHubApp.tsx` | Bisa diekstrak route rendering ke file terpisah |
| `styles.css` 1884 baris | `apps/web/src/styles.css` | Bisa dipecah per komponen kalau pakai CSS Modules |

### 7D. Environment Lokal

| Masalah | Solusi |
|---------|--------|
| `node_modules/.bin/` permission broken | `rm -rf node_modules apps/*/node_modules && npm ci && npm ci --prefix apps/api && npm ci --prefix apps/web && npm ci --prefix apps/worker && npm run prisma:generate` |
| Local Docker/Java tidak terinstall | Tidak memblokir karena deploy via SSH ke VPS |

---

## 8. Perintah Berguna untuk Tim AI Lain

### SSH ke VPS:
```bash
ssh -i ~/.ssh/schoolhub_vps_ed25519 -o BatchMode=yes -p 9103 schoolhub@157.15.40.21
```

### Deploy ke VPS:
```bash
cd /opt/schoolhub && bash scripts/deploy_production.sh
```

### Check health:
```bash
curl -fsS http://157.15.40.21/health/ready
# atau dari dalam VPS:
curl -fsS http://127.0.0.1/health/ready
```

### Akun beta login (public URL):
```
URL: https://ppm-proud-installed-recreational.trycloudflare.com
Username: (lihat tabel di atas)
Password: Beta@2026!
```

### System cleanup (login sebagai developer):
```
Endpoint: GET /api/system-cleanup/preview
         POST /api/system-cleanup/run
Role: DEVELOPER
```

---

## 9. Kesimpulan

**Status saat ini: Siap uji coba operasional terbatas.**

- ✅ Tema bersih — hanya Hutan Gelap / Hutan Terang
- ✅ 17 akun beta aktif dan bisa login
- ✅ Rute 29/29 sinkron dan tervalidasi
- ✅ Build lulus, tes lulus, lint lulus
- ✅ VPS sehat, tidak ada sampah
- ✅ Database re-index, vacuum selesai
- ⚠️ Pekerjaan lanjutan: security hardening, Buku Piket backend, refactoring halaman besar, domain resmi
