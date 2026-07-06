# QR Rollout Plan — SchoolHub e-Hadir

## Tahap 1 — Beta 1 kelas

1. Generate QR credential untuk 1 kelas pilot.
2. Provision maksimal 4 HP reader produksi: 2 `CHECK_ONLY` untuk verifikasi/koneksi dan 2 `GERBANG` + `MUSHOLA` untuk controlled UAT.
3. Uji kedua HP sama-sama di Mode Gerbang untuk datang/pulang.
4. Uji kedua HP sama-sama di Mode Mushola untuk Dhuha/Dzuhur/Ashar.
5. Cek audit, `GateLog`, `PrayerAttendanceLog`, dan `ReconciliationFlag`.

Durasi rekomendasi: 3–5 hari sekolah.

## Tahap 2 — Pilot gerbang

1. Pakai salah satu atau kedua HP Scanner di Mode Gerbang.
2. Cek duplicate scan window.
3. Cek pulang tanpa datang dan pulang terlalu cepat.
4. Review anomali harian oleh Guru Piket/Admin TU.

## Tahap 3 — Pilot mushola

1. Pakai salah satu atau kedua HP Scanner di Mode Mushola.
2. Server menentukan prayer type dari waktu server.
3. Validasi Ashar sebelum pulang untuk jadwal sore.

## Tahap 4 — Produksi bertahap

1. Generate QR credential per kelas secara bertahap.
2. Cetak kartu QR per kelas.
3. Training admin/operator/guru piket.
4. Aktifkan policy `preferOfficialQrReader`.
5. Jika sudah stabil, nonaktifkan legacy QR scan manual dengan `legacyQrScanEnabled=false`.

## Go/No-Go

Go jika:

- Smoke API PASS.
- Audit chain verify OK.
- DeviceReader Android lastSignedScanAt aktif.
- Tidak ada spike anomali tanpa sebab.
- Backup harian berjalan.
- SOP override disetujui.

No-go jika:

- Banyak QR salah cetak.
- Reader sering offline tanpa pending sync jelas.
- Domain/HTTPS belum stabil.
- Restore drill belum pernah berhasil.
