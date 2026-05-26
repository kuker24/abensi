# UAT Core Report - SchoolHub e-Hadir

Tanggal: `2026-04-24`  
Environment: URL quick tunnel aktif saat run (lihat helper `schoolhub-public-url` di VPS)  
Checklist acuan: [uat-core-checklist.md](/home/fahmi/Downloads/LAB%20GITHUB/LAB%20BETA/SchoolHub/docs/uat-core-checklist.md)

## Ringkasan
- Status UAT inti saat ini: **LULUS (tanpa bug blocking)**.
- Metode:
  - Smoke otomatis via script `scripts/uat_smoke.sh`.
  - Checklist manual sudah disiapkan untuk verifikasi operator sekolah.

## Hasil Smoke Otomatis
Perintah:

```bash
BASE_URL="$(schoolhub-public-url)" bash scripts/uat_smoke.sh
```

Hasil akhir:
- PASS: `27`
- FAIL: `0`
- SKIP: `0`

Skenario kritikal yang lolos:
- Health endpoint live/ready.
- Root web online dapat diakses.
- Login role admin, guru, siswa.
- Admin flow: dashboard, live monitor, users pagination, resolve anomaly.
- Guru flow: list session, open session, save attendance batch, close session, correction.
- Siswa flow: my-attendance.

## Defect Triage
- `BLOCKING`: `0`
- `MAJOR`: `0` (belum ditemukan dari smoke otomatis)
- `MINOR`: `0` (belum ditemukan dari smoke otomatis)

## Catatan Penting
- Akses publik saat ini menggunakan URL tunnel Cloudflare.
- IP langsung `http://157.15.40.21` masih melayani aplikasi Apache lain, bukan SchoolHub.
- Manual visual/UX acceptance tetap perlu dilakukan oleh PIC sekolah di perangkat nyata (tablet guru + HP siswa), mengacu checklist.
