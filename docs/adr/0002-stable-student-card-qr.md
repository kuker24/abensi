# ADR 0002: Stable Student Card QR and Digital Madrasah Card Workflow

- Status: Proposed
- Date: 2026-07-02
- Owner: SIAB2 Team

## Context

Kartu siswa SIAB2 dipakai sebagai identitas absensi jangka panjang. Kartu tidak boleh rusak secara operasional hanya karena siswa naik kelas, pindah rombel, atau tahun ajaran berganti. APK absensi tetap menjadi alat scan resmi untuk presensi, sedangkan mode baca identitas hanya boleh melakukan lookup read-only ke server agar data identitas tidak basi.

## Decision

1. QR kartu siswa adalah kredensial opaque `schoolhub:qr:v1:QR_...` yang tidak memuat nama, NISN, kelas, token, atau rahasia lain secara langsung.
2. QR siswa aktif tanpa `expiresAt` dan berlaku sampai siswa tamat, keluar, kartu hilang, atau QR dicabut manual.
3. Tampilan kartu siswa hanya memuat identitas stabil: nama, NISN, role `SISWA`, dan QR. Kelas/rombel tidak dicetak di kartu siswa.
4. Naik kelas hanya mengubah enrollment/rombongan belajar di database. Kartu dan QR tidak diganti.
5. Scan gerbang/mushola hanya resolve QR menjadi user aktif; tidak bergantung pada kelas.
6. Presensi kelas oleh guru menentukan kelas dari sesi/roster di database, bukan dari kartu atau QR.
7. Deaktivasi tamat/keluar/nonaktif mencabut QR aktif dan menonaktifkan kartu agar kartu lama tidak bisa dipakai scan.
8. APK absensi tetap khusus perangkat resmi dengan signature/secret perangkat.
9. Mode `CHECK_ONLY` adalah mode baca identitas online-only, read-only, dan tidak mencatat presensi.
10. Generator kartu standalone disiapkan sebagai modul internal di `/id-card-generator/` dan mengambil data kartu dari endpoint resmi SIAB2 dengan sesi Admin TU/Operator IT.

## Endpoint Ideal

Endpoint resmi untuk alur kartu adalah:

- `POST /api/v1/qr-credentials/bulk-generate` dengan `onlyMissing: true` untuk menyiapkan QR tanpa mengganti QR lama.
- `GET /api/v1/qr-credentials/readiness?classId=...` untuk cek kesiapan cetak tanpa mewajibkan siswa punya kelas.
- `GET /api/v1/qr-credentials/export/cards` untuk export seluruh kartu aktif.
- `GET /api/v1/qr-credentials/export/class/:classId/cards` untuk export kartu berdasarkan kelas aktif saat ini.
- `GET /api/v1/qr-credentials/export/users/:userId/card` untuk cetak ulang satu kartu.
- `POST /api/v1/qr-credentials/users/:userId/rotate` hanya untuk kartu hilang/rusak/dicabut.
- `POST /api/v1/qr-credentials/:id/revoke` untuk pencabutan QR eksplisit.

Payload export kartu siswa harus mengirim `className: null`, `classCode: null`, dan `level: "SISWA"` agar generator tidak menampilkan kelas pada kartu siswa.

## SOP Jangka Panjang

- **Cetak pertama**: Admin TU impor/rapikan data siswa, sistem bulk-generate hanya QR yang belum ada, lalu generator mencetak kartu.
- **Naik kelas**: operator mengubah enrollment/rombel di master data. Tidak cetak ulang kartu dan tidak rotate QR.
- **Kartu hilang/rusak**: admin rotate QR untuk user terkait, cetak ulang satu kartu, QR lama otomatis tidak berlaku.
- **Siswa tamat/keluar/nonaktif**: admin menonaktifkan user. Sistem mencabut QR aktif dan menonaktifkan kartu.
- **Baca identitas**: gunakan mode `CHECK_ONLY` online-only. Jika server tidak bisa dihubungi, identitas tidak ditampilkan agar tidak menampilkan data stale.
- **Audit**: perubahan generate/rotate/revoke/deaktivasi harus tetap tercatat di audit log.

## Consequences

Positif:

- Kartu siswa stabil lintas tahun ajaran dan tidak perlu dicetak ulang saat naik kelas.
- Data kelas selalu mengikuti database terbaru saat presensi kelas.
- Risiko kebocoran identitas dari QR berkurang karena QR opaque.
- Operator punya jalur kerja sederhana dari Master Data ke generator kartu.

Trade-off:

- Mode baca identitas perlu koneksi server.
- Cetak kartu dari generator internal bergantung pada sesi login Admin TU/Operator IT.
- QR siswa tidak otomatis kedaluwarsa, sehingga proses revoke saat tamat/keluar/hilang harus disiplin.

## Alternatives Considered

- **Mencetak kelas di kartu siswa**: ditolak karena kartu harus dicetak ulang saat naik kelas dan rawan stale.
- **Menyimpan nama/NISN/kelas langsung di QR**: ditolak karena QR mudah dibaca pihak luar dan data cepat basi.
- **APK identitas offline membaca data dari QR**: ditolak karena identitas bisa stale dan memperbesar data pribadi di QR.
- **Rotate QR massal tiap tahun ajaran**: ditolak karena biaya operasional tinggi dan tidak perlu untuk identitas siswa stabil.

## Follow-up

- Saat deploy modul generator internal, pastikan `/id-card-generator/` hanya tersedia di domain SIAB2 dan endpoint API tetap dilindungi role/capability.
- Tambahkan smoke test produksi non-mutating untuk membuka generator dari Master Data setelah modul dipasang.
- Latih Admin TU untuk membedakan `onlyMissing` (aman) dan `rotate` (khusus kartu hilang/rusak/dicabut).
