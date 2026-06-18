# Panduan Cetak Kartu SIAB2

## Target Kartu

- Ukuran: 5,5 × 8,5 cm, portrait/model gantungan ID card.
- Tanpa foto.
- Isi kartu: nama, ID/username, program, kelas/jabatan/level, status, QR code.
- QR produksi wajib berformat resmi `schoolhub:qr:v1:...` dari backend SIAB2.

## Alur Cepat Admin

1. Login ke web SIAB2 sebagai Admin/TU, Operator IT, atau Developer.
2. Buka **Admin → Perangkat Absensi → Cetak Kartu**.
3. Pilih kelas jika ingin cetak per kelas, atau kosongkan untuk semua pengguna aktif.
4. Klik **Cetak Kartu**.
   - Sistem akan membuat QR untuk pengguna yang belum punya QR aktif.
   - Sistem tidak mengganti QR yang sudah aktif.
   - Generator cetak terbuka otomatis.
5. Pastikan indikator **QR Fallback = 0** sebelum cetak produksi.
6. Download PDF dan cetak.

Panduan operator singkat ada di `docs/SOP_OPERATOR_KARTU_SISWA.md`.

## Catatan Keamanan

- File JSON export berisi QR absensi resmi. Simpan dan bagikan hanya ke petugas cetak yang berwenang.
- Jika kartu hilang, cabut/ganti QR dari panel **Kartu QR** agar QR lama tidak bisa dipakai.
- Jangan mencetak kartu jika indikator **QR Fallback** masih lebih dari 0.

## Validasi Sebelum Cetak Massal

- Cek jumlah kartu sesuai target.
- Cek semua kartu memiliki QR resmi.
- Cetak 1 halaman uji coba dulu.
- Scan beberapa kartu memakai aplikasi reader resmi.
- Pastikan nama dan ID terbaca jelas.
