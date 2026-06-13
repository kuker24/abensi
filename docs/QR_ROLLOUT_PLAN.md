# QR Rollout Plan — SchoolHub e-Hadir

## Tahap 1 — Beta 1 kelas

1. Generate QR credential untuk 1 kelas pilot.
2. Provision 1 APK Android mode `GATE_IN/GATE_OUT`.
3. Provision 1 APK Android mode `MUSHOLA/CHECK_ONLY`.
4. Uji scan masuk, Dhuha/Dzuhur/Ashar, kelas, dan pulang.
5. Cek audit, `GateLog`, `PrayerAttendanceLog`, dan `ReconciliationFlag`.

Durasi rekomendasi: 3–5 hari sekolah.

## Tahap 2 — Pilot gerbang

1. Pasang HP reader di gerbang utama.
2. Batasi allowed modes hanya `GATE_IN/GATE_OUT`.
3. Cek duplicate scan window.
4. Cek OUT tanpa IN dan OUT terlalu cepat.
5. Review anomali harian oleh Guru Piket/Admin TU.

## Tahap 3 — Pilot mushola

1. Pasang reader Android di mushola.
2. Allowed modes `MUSHOLA` dan `CHECK_ONLY`.
3. Server menentukan prayer type dari waktu server.
4. Validasi Ashar sebelum pulang untuk jadwal sore.

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
