# SOP Hapus Akun dan Clean Data Sistem

Tanggal: 2026-04-26

## Prinsip Utama

Data e-Hadir adalah bukti operasional sekolah. Karena itu data penting tidak boleh dihapus sembarangan.

Data yang dilindungi:

- Catatan audit resmi.
- Presensi siswa.
- Absen guru di sesi kelas.
- Riwayat scan gerbang.
- Riwayat scan mushola.
- Override presensi.
- Sesi dan jadwal kelas.
- Papan anomali.
- Buku piket.

## Perbedaan Nonaktifkan dan Hapus Permanen

### Nonaktifkan Akun

Gunakan untuk akun yang pernah dipakai atau punya riwayat.

Dampak:

- Akun tidak bisa dipakai login.
- Riwayat tetap aman.
- Data presensi, audit, kartu, sesi, dan laporan tidak rusak.
- Akun bisa diaktifkan lagi.

Admin/TU dan Developer boleh melakukan ini.

### Hapus Permanen

Gunakan hanya untuk akun test/kosong yang benar-benar aman dihapus.

Dampak:

- Akun hilang dari database.
- Tidak bisa dibatalkan kecuali restore backup.
- Backend akan menolak jika akun punya riwayat penting.

Hanya Developer yang boleh melakukan ini.

## Cara Hapus Permanen Akun

1. Login sebagai Developer.
2. Buka **Pengguna & Akademik**.
3. Buka tab **Pengguna**.
4. Klik **Hapus Permanen** pada akun target.
5. Ketik nama akun sebagai konfirmasi.
6. Isi alasan minimal 10 karakter.
7. Jika akun punya riwayat, sistem akan menolak dan menyarankan nonaktifkan saja.

## Clean Data Sistem

Clean Data hanya tersedia untuk Developer di **Pusat Kontrol Developer** tab **Clean Data**.

Alur wajib:

1. Pilih kategori data yang ingin dibersihkan.
2. Klik **Preview Clean Data**.
3. Periksa jumlah dan contoh data.
4. Isi alasan audit.
5. Klik **Jalankan Clean Data**.
6. Konfirmasi tindakan.

## Kategori Clean Data yang Aman

Tahap pertama sistem hanya membersihkan data yang aman:

- Akun test/contract nonaktif tanpa histori penting.
- Kartu nonaktif milik akun nonaktif.
- Notifikasi lama yang sudah dibaca.
- Status tutorial milik akun nonaktif.

## Audit

Aksi berikut dicatat:

- `identity.user.permanently_deleted`
- `identity.user.permanent_delete_blocked`
- `system_cleanup.previewed`
- `system_cleanup.executed`

## Rekomendasi Operasional

- Untuk pengguna sungguhan, pilih **Nonaktifkan**.
- Untuk akun test kosong, Developer boleh pakai **Hapus Permanen**.
- Jalankan **Preview Clean Data** sebelum clean.
- Buat backup database sebelum clean besar.
- Jangan membersihkan data presensi/audit kecuali ada kebijakan arsip resmi dari sekolah.
