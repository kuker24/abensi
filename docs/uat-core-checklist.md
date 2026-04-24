# UAT Core Checklist - SchoolHub e-Hadir

Tanggal acuan: `2026-04-24`  
Environment online: gunakan URL tunnel aktif terbaru (`*.trycloudflare.com`).

## Aturan Lulus
- Lulus jika **tidak ada bug blocking** pada alur kritikal.
- Bug `major/minor` boleh dicatat untuk batch perbaikan berikutnya.

## 1. Smoke Otomatis (Baseline)
- Jalankan `scripts/uat_smoke.sh` ke environment online.
- Validasi minimum:
  - `health/live` dan `health/ready`
  - login admin, guru, siswa
  - API inti admin (dashboard, live monitor, users, anomaly resolve)
  - API inti guru (sessions, open/save/close, correction)
  - API inti siswa (my-attendance)

## 2. UAT Manual - Admin/TU
- Login admin berhasil.
- Dasbor memuat stat card, tren, mini live monitor.
- Papan anomali:
  - filter status/tipe bekerja
  - `Resolve` menyimpan alasan dan status berubah.
- Riwayat absen:
  - sesi tampil
  - sheet koreksi bisa submit dengan alasan >= 10 char.
- Master data:
  - tambah user
  - tambah kelas/mapel
  - daftar tabel tampil dan bisa dicari.
- Smart card:
  - tambah kartu
  - daftar reader tampil
  - aksi update status/lepas/rotate berjalan.
- Jadwal:
  - tambah sesi
  - sesi tampil pada tanggal terkait.
- Audit:
  - log tampil
  - pencarian/sort/pagination tabel berjalan.

## 3. UAT Manual - Guru
- Login guru berhasil.
- Dasbor guru memuat sesi hari ini.
- Input presensi:
  - pilih sesi
  - buka sesi (geofence valid)
  - simpan batch presensi
  - tutup sesi
  - modal konfirmasi muncul.
- Koreksi guru:
  - pilih sesi+siswa
  - simpan koreksi dengan alasan >= 10 char.
- Kehadiran saya:
  - tab sesi dan tap gerbang tampil.

## 4. UAT Manual - Siswa
- Login siswa berhasil.
- Dasbor siswa menampilkan:
  - statistik kehadiran
  - tab riwayat kelas
  - tab riwayat tap gerbang.

## 5. Defect Triage
- Klasifikasi:
  - `BLOCKING`: menghentikan operasional absensi harian.
  - `MAJOR`: fungsi ada tapi bermasalah signifikan.
  - `MINOR`: cosmetic/UX kecil.
- Jika ada `BLOCKING`:
  - stop sign-off
  - patch
  - re-test smoke + area terdampak.
