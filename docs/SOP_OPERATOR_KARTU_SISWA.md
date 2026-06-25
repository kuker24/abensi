# SOP Singkat Operator — Akun Siswa & Cetak Kartu SIAB2

## 1. Import Siswa Massal

1. Login sebagai Admin/TU atau Operator IT.
2. Buka **Admin → Data Sekolah → Import Siswa**.
3. Download template jika perlu.
4. Upload file CSV/XLSX.
5. Klik **Periksa File**.
6. Jika error = 0, klik **Simpan & Siapkan QR**.
7. Simpan file **akun-siswa-sementara** yang otomatis terunduh.

Catatan:
- Kolom minimal: **Nama Lengkap** dan **Kelas/Jabatan**.
- Username boleh kosong; sistem membuat otomatis.
- Password boleh kosong; sistem membuat password sementara.
- Password tidak dicetak di kartu.

## 2. Cetak Kartu Per Kelas

1. Buka **Admin → Perangkat Absensi → Cetak Kartu**.
2. Pilih kelas.
3. Pastikan panel **Kesiapan Kartu** aman.
4. Klik **Cetak Kartu [kelas]**.
5. Generator terbuka otomatis.
6. Pastikan **QR Fallback = 0**.
7. Download PDF dan cetak ukuran A4.

## 3. Cetak Semua Kartu

1. Buka **Cetak Kartu**.
2. Kosongkan pilihan kelas.
3. Klik **Cetak Kartu Semua**.
4. Gunakan hanya jika data sudah siap semua.

## 4. Kartu Hilang / Rusak

1. Buka **Cetak Kartu**.
2. Cari siswa/guru di kolom **Cari siswa/guru untuk cetak ulang**.
3. Klik **Kartu Hilang / Ganti QR**.
4. Konfirmasi.
5. Sistem mencabut QR lama dan membuka generator untuk cetak ulang 1 kartu.

## 5. Download Data Kartu

Gunakan **Download Data Kartu** hanya jika petugas ingin menyimpan file JSON resmi untuk dicetak di komputer lain. File ini sensitif karena berisi QR absensi resmi.

## 6. Aturan Aman

- Jangan cetak jika **QR Fallback > 0**.
- Jangan bagikan file JSON QR ke orang yang tidak berwenang.
- Jika kartu hilang, selalu gunakan **Kartu Hilang / Ganti QR** agar QR lama tidak bisa dipakai.
- Untuk siswa baru, gunakan **Import Siswa**, bukan import teknis lanjutan.
