# SOP Import Data Sekolah SIAB2

Status: PR-ready, import production hanya setelah preview disetujui dan backup production terverifikasi.

## Tujuan

Import siswa, guru, dan tenaga kependidikan dari CSV/XLSX sekolah ke SIAB2 tanpa memakai password plaintext dari SIAB1. Import membuat akun, mengisi NIS/NIP, membuat kelas dan enrollment siswa, lalu menghasilkan lembar akun login sekali tampil.

## Sumber Data

- `data_user_sekolah_LENGKAP.csv`: referensi SIAB1 lama. Kolom `Password` wajib diabaikan.
- `DATA GURU DAN TENAGA KEPENDIDIKAN MAN 1 ROKAN HULU.xlsx`: sumber guru/pegawai dengan `NIP` dan `TIPE USER`.
- `data kelas XI.xlsx`: sumber kelas siswa; kelas diambil dari nama sheet.
- `DATA KELAS XII.xlsx`: sumber kelas siswa; kelas diambil dari nama sheet.

## Aturan Keamanan

- Password sumber dari file tidak pernah dipakai, disimpan, diaudit, atau dicetak ulang.
- Password awal dibuat server-side dengan format 14 karakter mudah diingat, misalnya `Biru-Padi#4821`.
- Password hanya tampil sekali di hasil commit/import slip.
- Jika password hilang, admin/developer melakukan reset password baru, bukan melihat password lama.
- QR tidak dibuat otomatis saat import. QR dibuat manual setelah data direview.
- Audit import hanya menyimpan metadata jumlah dan distribusi role, bukan password plaintext.

## Mapping Data

- Siswa: `role=SISWA`, identifier utama `nis`, kelas dari nama sheet atau kolom kelas.
- Guru: `role=GURU_MAPEL`, identifier utama `nip`.
- Guru piket/kepala sekolah: dipetakan dari teks jabatan jika jelas.
- Pegawai/security/tenaga kebersihan: sementara dipetakan ke `GURU_MAPEL` dengan warning preview sampai ada role khusus tenaga kependidikan.
- Role sensitif `ADMIN_TU`, `OPERATOR_IT`, dan `DEVELOPER` tidak boleh dibuat dari import sekolah.

## Alur Operator

1. Buka `Master Data -> Import Data Sekolah`.
2. Pilih jenis sumber: file kelas siswa, file guru/tendik, atau CSV SIAB1 lama.
3. Isi tahun ajaran, default `2026/2027`.
4. Upload file CSV/XLSX.
5. Klik `Preview`.
6. Perbaiki file jika ada invalid row.
7. Jika valid, isi alasan dan ketik `IMPORT DATA SEKOLAH`.
8. Klik `Commit Import`.
9. Download/cetak lembar akun yang muncul sekali.
10. Review data user dan kelas.
11. Generate QR manual setelah data benar.
12. Export kartu resmi dari generator `Ambil dari Data Sekolah`.

## Procedure Production

1. Jangan jalankan commit import production tanpa backup encrypted verified.
2. Jalankan preview production terlebih dahulu dan simpan evidence summary.
3. Pastikan jumlah invalid `0` untuk file yang akan dicommit.
4. Commit per kelompok file agar rollback/audit mudah: siswa kelas X, siswa kelas XI, guru/tendik.
5. Setelah commit, cek user count, class count, enrollment count, dan audit safety.
6. Jalankan health check `/`, `/health/live`, `/health/ready`.
7. Jangan auto-generate QR. Generate QR manual setelah review.

## Catatan Dry-run Lokal

Dry-run awal file sekolah menunjukkan:

- CSV SIAB1 lama: 420 baris, semua password sumber diabaikan, tidak siap import resmi karena siswa tidak punya NIS dan guru tidak punya NIP.
- Guru/tendik XLSX: 45 baris, 38 valid, 7 invalid karena duplikat NIP/username; perlu review file sebelum commit.
- File kelas X: 156 baris, 153 valid, 3 invalid karena NIS kosong.
- File kelas XI: 130 baris, 130 valid.
