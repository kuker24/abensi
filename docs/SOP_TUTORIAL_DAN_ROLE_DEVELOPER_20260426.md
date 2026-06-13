# SOP Tutorial Awal dan Role Developer e-Hadir

Tanggal: 2026-04-26

## Tujuan

Fitur ini dibuat agar pengguna baru lebih cepat memahami e-Hadir tanpa mengurangi fungsi utama absensi. Tutorial tampil dengan bahasa Indonesia semi-formal dan bisa diaktifkan ulang oleh akun Developer bila ada pengguna yang membutuhkan arahan lagi.

## Role Developer

Role `DEVELOPER` adalah akun pusat kontrol teknis. Akun ini dipakai untuk:

1. Membuka **Pusat Kontrol Developer**.
2. Mengaktifkan ulang tutorial untuk akun tertentu.
3. Mengaktifkan tutorial untuk semua akun dalam satu peran.
4. Memantau kesehatan sistem dan Catatan Audit.

> Catatan keamanan: akun Developer tidak dipakai untuk pekerjaan harian biasa. Gunakan hanya untuk kontrol sistem, pendampingan pengguna, dan validasi operasional.

## Login Developer

Developer masuk dari layar login yang sama dengan Admin/TU:

1. Buka halaman login.
2. Pilih tab **Admin/TU**.
3. Isi nama akun Developer.
4. Isi kata sandi sesuai konfigurasi server.
5. Klik **Masuk**.

Nama akun default beta mengikuti `DEVELOPER_USERNAME` jika tersedia. Jika belum diatur, seed menggunakan `developer`. Kata sandi mengikuti `DEVELOPER_PASSWORD`; jika tidak ada, mengikuti kata sandi Admin/TU yang dikonfigurasi di environment server. Jangan membagikan kata sandi di dokumen publik.

## Tutorial Awal

Tutorial tampil otomatis ketika:

1. Pengguna pertama kali memakai sistem.
2. Versi tutorial diperbarui.
3. Developer mengaktifkan tutorial ulang untuk akun tersebut.

Pengguna dapat memilih:

- **Lanjut** untuk mengikuti langkah tutorial.
- **Kembali** untuk membaca langkah sebelumnya.
- **Selesai** agar tutorial tidak tampil lagi.
- **Lewati dulu** jika sedang terburu-buru.

Pengguna juga bisa membuka tutorial kapan saja melalui tombol **Lihat tutorial** di bagian atas aplikasi.

## Cara Developer Mengaktifkan Tutorial untuk Akun Tertentu

1. Login sebagai Developer.
2. Buka menu **Pusat Kontrol**.
3. Cari pengguna berdasarkan nama atau nama akun.
4. Tulis alasan audit minimal 10 karakter.
5. Klik **Aktifkan Tutorial Lagi**.
6. Konfirmasi tindakan.
7. Pengguna target akan melihat tutorial saat membuka aplikasi berikutnya.

## Cara Mengaktifkan Tutorial per Peran

1. Login sebagai Developer.
2. Buka **Pusat Kontrol**.
3. Pilih filter peran, misalnya **Guru Mapel**.
4. Pastikan alasan audit jelas.
5. Klik **Aktifkan per peran**.
6. Konfirmasi tindakan.

Gunakan fitur per peran hanya saat pelatihan besar, perubahan alur kerja, atau pendampingan awal beta tester.

## Audit

Aksi berikut dicatat di Catatan Audit:

- Tutorial tampil ke pengguna.
- Tutorial diselesaikan.
- Tutorial dilewati.
- Developer mengaktifkan tutorial untuk satu pengguna.
- Developer mengaktifkan tutorial untuk satu peran.

## Rekomendasi Operasional

1. Berikan akun Developer hanya kepada penanggung jawab teknis.
2. Ubah `DEVELOPER_PASSWORD` di environment VPS sebelum pemakaian luas.
3. Cek Catatan Audit setelah perubahan besar.
4. Gunakan tutorial ulang untuk membantu pengguna, bukan untuk memaksa tanpa alasan.
5. Jika ada pengguna bingung, arahkan ke menu **Panduan** sesuai role.
