# SOP Operator — Lembar Akun Login

Status: PR100C MVP, internal operator only.

## Tujuan

Lembar Akun Login dipakai untuk membagikan username dan password awal kepada pengguna yang sudah ada di database SIAB2.

## Aturan Aman

- Hanya Admin TU/Developer yang boleh generate lembar akun.
- Password awal hanya tampil sekali di layar hasil generate.
- Cetak atau simpan PDF dari dialog print browser, lalu klik **Hapus dari layar**.
- Jangan unggah PDF/hasil print ke kanal publik.
- Jangan menaruh password di QR kartu tanda pengenal.
- Jangan memasukkan password ke file CSV kartu.
- Jika slip hilang atau bocor, Admin TU harus generate ulang password untuk akun tersebut.

## Alur Singkat

1. Buka **Data Sekolah → Akun & Data Sekolah → Lembar Akun Login**.
2. Filter/pilih pengguna aktif target.
3. Isi alasan minimal 10 karakter.
4. Biarkan opsi cabut sesi aktif menyala kecuali ada alasan operasional untuk mematikannya.
5. Klik **Generate Lembar Akun** dan konfirmasi risiko.
6. Klik **Cetak / Simpan PDF**.
7. Klik **Hapus dari layar** setelah selesai.

## Catatan Password

- First-login password change belum diwajibkan pada MVP ini.
- Slip memuat anjuran: pengguna disarankan mengganti password setelah login.
- Server hanya menyimpan hash password, bukan plaintext password.
