# APK Update Center Android HP Scanner

PR #59 menambahkan update center untuk APK Android HP Scanner SIAB2/SCHOOLHUB.

## Komponen

- Backend:
  - Public metadata: `GET /api/v1/mobile/android-reader/version`
  - Public download published APK: `GET /api/v1/mobile/android-reader/releases/:id/download`
  - Public download latest APK: `GET /api/v1/mobile/android-reader/apk/latest`
  - Admin list/upload/update/publish/unpublish: `/api/v1/admin/android-apk-releases`
- Admin web:
  - `/admin/android-apk-update`
  - Tab baru di `/admin/devices` → **APK Update Center**
- Android:
  - Check update via endpoint version yang sama.
  - Download APK dari host server yang sama.
  - Verifikasi ukuran dan SHA256 sebelum membuka installer Android.
  - Tidak melakukan silent install; operator tetap menekan konfirmasi installer Android.

## Storage produksi

Default container path:

```bash
ANDROID_APK_STORAGE_DIR=/app/uploads/android-apk-releases
ANDROID_APK_MAX_BYTES=157286400
```

`docker-compose.production.yml` memasang named volume `android_apk_releases` ke API container agar APK tetap ada saat API recreate.

## Migrasi

Migration additive:

```bash
prisma/migrations/0038_android_apk_update_center/migration.sql
```

Tabel baru `AndroidApkRelease` menyimpan metadata APK, publish status, hash SHA256, size, dan audit actor. Migration tidak mengubah data presensi, reader secret, Redis, atau antrean offline Android.

## Deploy aman

1. Pastikan CI PR pass.
2. Backup database production.
3. Pull commit PR #59 di VPS.
4. Build API + web.
5. Jalankan migration service:
   ```bash
   docker compose -f docker-compose.production.yml -f docker-compose.vps.yml --env-file /opt/schoolhub/.env run --rm migrate
   ```
6. Recreate targeted services saja: `api`, `web`, `reverse-proxy`.
7. Smoke:
   - `/api/v1/health/live` 200
   - `/api/v1/health/ready` 200
   - `GET /api/v1/mobile/android-reader/version` 200
   - Admin `/admin/android-apk-update` render
   - Log API tidak ada Prisma unknown field / 500 loop

## Manual QA wajib sebelum rollout APK publik

1. Upload APK lewat Admin → APK Update Center.
2. Publish hanya untuk canary test.
3. Install APK pada **1 HP test** terlebih dahulu.
4. Verifikasi:
   - HP lama melihat banner update.
   - Download selesai dan SHA256 valid.
   - Installer Android terbuka; tidak silent install.
   - Setelah install, `VERSION_CODE` naik dan banner hilang.
   - Aktivasi reader, secret, scan mode, heartbeat PR #58, dan offline queue tetap berjalan.
   - Offline queue pending increment/flush tetap tampil di Admin Devices.
5. Jangan sebar APK ke HP production sebelum langkah di atas pass.

## Catatan keamanan

- Jangan upload keystore/signing key.
- Jangan print reader secret/JWT/cookie/raw QR saat QA.
- UI/backend tidak mengembalikan `apkPath` private container path.
- Android release build hanya menerima HTTPS same-host download URL.
