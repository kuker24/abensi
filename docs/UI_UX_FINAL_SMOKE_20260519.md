# Produksi Smoke Final — SchoolHub e-Hadir

**Tanggal:** 2026-05-19  
**Steps:** 19-22/24  
**Status:** Selesai — deploy aman + smoke lulus

## Deployment (step 21)

```bash
SSH_KEY="$HOME/.ssh/schoolhub_vps_ed25519" VPS_HOST="schoolhub@157.15.40.21" VPS_PORT="9103" bash scripts/deploy_web_static_vps.sh
```

- Semua 9 asset terbaru terverifikasi hadir di container web.
- Nginx reload berhasil.

## Smoke result (step 22)

| Test | Hasil |
|---|---|
| `/` HTTP 200, no Google Fonts, no inline script | ✅ |
| `/login` HTTP 200, no Google Fonts, no inline script | ✅ |
| Login Admin → dashboard tidak blank | ✅ (3627 chars) |
| `/admin/dashboard` post-login tidak blank | ✅ |
| `/admin/master-data` tidak blank | ✅ |
| `/admin/reports` tidak blank (print logo fixed) | ✅ |
| `/admin/devices` tidak blank | ✅ |
| Role mismatch: siswa as Guru → tetap di `/login` | ✅ |
| Login Guru → dashboard tidak blank | ✅ |
| Login Siswa → dashboard tidak blank | ✅ |

## Validasi lokal (step 20)

- ESLint: lulus
- TypeScript: lulus
- Vitest: 2 files, 6 tests lulus
- Vite build: lulus
