# SchoolHub Web Production UI Runbook

## Scope
Runbook untuk UI SchoolHub e-Hadir dark-only, static Vite build, dan deployment ke container `schoolhub-web`.

## Build & Validasi Lokal
```bash
npm run lint --prefix apps/web
npm run typecheck --prefix apps/web
npm run build --prefix apps/web
npm run test --prefix apps/web
```

## Deploy Aman Frontend ke VPS
Gunakan script permanen:
```bash
VPS_HOST='schoolhub@your-vps-host' \
VPS_PORT='your-ssh-port' \
SSH_KEY="$HOME/.ssh/your_deploy_key" \
bash scripts/deploy_web_static_vps.sh
```

Prinsip penting:
- `apps/web/dist` harus sudah dibuat sebelum deploy.
- Folder remote `/tmp/schoolhub-dist` dihapus ulang sebelum upload.
- Isi `/usr/share/nginx/html` di container diganti penuh, bukan `docker cp` additive.
- Semua lazy chunks Vite wajib ikut terkirim; jangan hapus asset hanya berdasarkan referensi `index.html`.

## Smoke Test Produksi
```bash
BASE='https://your-public-app-origin.example'
curl -I "$BASE/"
for f in apps/web/dist/assets/*; do
  curl -sS -o /dev/null -w "$(basename "$f")=%{http_code}\n" "$BASE/assets/$(basename "$f")"
done
```

Login role yang wajib dicek: `admin`, `guru`, `siswa` dengan kredensial beta internal.

## Auth Role-Aware Login & Session Check
- Frontend mengirim `expectedRole` (`admin` / `guru` / `siswa`) ke `POST /api/v1/auth/login`.
- Backend tetap kompatibel dengan client lama karena `expectedRole` opsional.
- Jika kredensial valid tetapi area login tidak cocok, backend mengembalikan `401` dan menulis audit `auth.login.role_mismatch` tanpa menerbitkan sesi baru.
- Frontend juga punya fallback check setelah login response untuk mencegah cookie/session tertinggal bila berhadapan dengan backend lama.
- Saat app dibuka dari storage lama, frontend memvalidasi sesi ke `GET /api/v1/auth/me`; jika token/cookie tidak valid, storage lokal dibersihkan dan user diarahkan ke `/login`.

## Rollback Plan
1. Cari build artifact terakhir yang diketahui sehat (backup `dist` atau release sebelumnya).
2. Jalankan script deploy yang sama dengan `LOCAL_DIST` diarahkan ke artifact rollback:
   ```bash
   LOCAL_DIST=/path/to/previous-dist \
   VPS_HOST='schoolhub@your-vps-host' VPS_PORT='your-ssh-port' \
   SSH_KEY="$HOME/.ssh/your_deploy_key" \
   bash scripts/deploy_web_static_vps.sh
   ```
3. Verifikasi HTTP `200` untuk `/`, main JS/CSS, dan seluruh lazy chunks.
4. Uji login browser untuk Admin/Guru/Siswa dan pastikan tidak blank page.

## Urutan Eksekusi Rekomendasi
1. Stabilkan produksi dan smoke test login.
2. Bersihkan kode theme dark-only.
3. Build lokal dan test.
4. Deploy dengan full replacement script.
5. Verifikasi asset dan browser login.
6. Baru lanjut redesign dashboard/flow/tabel/mobile.
7. Setiap perubahan UI besar: lint → typecheck → build → test → deploy → smoke.

## Catatan Dikenal
CSP production saat ini masih menolak inline anti-FOUC script dan Google Fonts eksternal. Peringatan ini tidak memblokir login/dashboard, tetapi perlu ditangani terpisah lewat kebijakan CSP atau self-host font.
