# Audit Cepat Menu & UX Semua Role — 2026-05-03

Tujuan: memastikan menu setiap role lebih mudah dipahami operator/guru/siswa pemula.

## Role dan menu yang dicek

### Admin/TU
- Ringkasan Hari Ini
- Cek Sesi Kelas
- Cek Masalah
- Aktivitas Sekarang
- Riwayat Scan
- Catatan Piket
- Izin Guru
- Akun & Data Sekolah
- Jadwal Kelas
- HP Scanner & Kartu
- Laporan Sekolah
- Tugas / Notifikasi
- Panduan
- Aturan Absensi
- Riwayat Perubahan

### Operator IT
- Cek Sistem
- HP Scanner & Kartu
- Aktivitas Sekarang
- Riwayat Perubahan
- Tugas / Notifikasi
- Panduan Operator

### Developer
- Pusat Kontrol
- Ringkasan Admin
- Cek Sistem
- Aktivitas Sekarang
- Akun & Data Sekolah
- HP Scanner & Kartu
- Aturan Absensi
- Riwayat Perubahan
- Panduan Developer

### Guru Piket
- Tugas Piket Hari Ini
- Catatan Piket
- Cek Sesi Kelas
- Cek Masalah
- Riwayat Scan
- Aktivitas Sekarang
- Tugas / Notifikasi
- Panduan Piket

### Guru Mapel
- Ringkasan Mengajar
- Isi Presensi Kelas
- Perbaiki Presensi
- Laporan Kelas Saya
- Izin / Sakit / Dinas
- Kehadiran Saya
- Tugas / Notifikasi
- Panduan

### Siswa
- Kehadiran Saya
- Tugas / Notifikasi
- Panduan

## Standar bahasa baru

| Istilah lama | Istilah mudah |
|---|---|
| Dashboard | Ringkasan / Mulai Hari Ini |
| Live Monitor | Aktivitas Sekarang |
| Anomali | Masalah yang Perlu Dicek |
| Audit | Riwayat Perubahan |
| Rekap Ampuan | Laporan Kelas Saya |
| Reader | HP Scanner / Alat Pembaca |
| Provisioning | Kode Aktivasi |
| Clean Data | Bersihkan Data Aman |
| Master Data | Akun & Data Sekolah |

## Perubahan UX yang diterapkan

- Sidebar semua role diubah berdasarkan tugas harian.
- Dasbor role diberi kartu “Apa yang harus saya lakukan sekarang?”.
- Halaman Aktivasi HP Scanner sudah memakai wizard 3 langkah.
- Halaman Akun & Data Sekolah diberi preset buat akun siswa/guru/operator.
- Halaman Isi Presensi Kelas diberi langkah kerja guru.
- Halaman Perbaiki Presensi diberi panduan langkah koreksi.
- Halaman Laporan Sekolah diberi langkah pilih laporan → tanggal → lihat → download.
- Halaman Catatan Piket dibuat lebih seperti buku catatan sederhana.
- Halaman Tugas / Notifikasi diberi instruksi singkat.
- Panduan per role dibuat menjadi kartu tugas yang bisa diklik.

## Catatan validasi

Setelah perubahan, jalankan:

```bash
npm run validate:final
```

Lalu deploy web ringan ke VPS dan jalankan smoke test remote.

## Validasi akhir lokal

Hasil setelah implementasi UI role/menu:

```text
npm run validate:final
Final validation completed.
API tests: 56 passed
Web unit tests: 2 passed
Playwright E2E: 12 passed
Audit high severity: passed
```

Catatan audit NPM: advisory `exceljs -> uuid` level moderate masih diterima sementara; audit level high lulus.

## Deploy dan smoke VPS

Deploy dilakukan ke VPS `/opt/schoolhub` dengan Android reader dan APK builder tetap tidak ikut deploy.

Aset web aktif setelah deploy:

```text
assets/index-BGJ72UZM.js
assets/index-Cy3ibO-e.css
```

Remote smoke:

```text
PASS: 31
FAIL: 0
SKIP: 0
```

Audit chain remote:

```text
Audit chain ok: true
brokenCount: 0
```

## Perbaikan hak akses role Developer

Agar menu Developer tidak menampilkan halaman yang berujung 403, backend juga diselaraskan untuk akses baca/operasional Developer pada halaman yang memang tampil di sidebar Developer:

- Ringkasan Admin
- Cek Sistem
- Aktivitas Sekarang
- Akun & Data Sekolah
- HP Scanner & Kartu
- Aturan Absensi
- Riwayat Perubahan
- Notifikasi sistem terkait

Validasi endpoint Developer remote berhasil untuk dashboard, tren, live monitor, flags, audit, users, academic, schedules, geofence, attendance policy, dan notifications.
