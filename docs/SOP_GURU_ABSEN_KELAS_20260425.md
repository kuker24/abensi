# SOP Guru Absen Masuk/Keluar Kelas dan Presensi Siswa

Tanggal: 2026-04-25

## Aturan Operasional

1. **Guru wajib absen masuk saat mulai kelas.**
   - Di aplikasi tombolnya: `Absen Masuk / Mulai Kelas`.
   - Sistem mencatat waktu `checkInAt`, lokasi jika dikirim, dan petugas yang melakukan aksi.
   - Jika guru masuk melewati toleransi terlambat, status guru menjadi `TELAT`.

2. **Presensi siswa cukup dilakukan sekali di awal pembelajaran oleh guru.**
   - Setelah guru absen masuk, guru membuka panel `Presensi siswa awal pembelajaran`.
   - Default siswa adalah `Alpa`.
   - Guru dapat klik `Tandai semua Hadir`, lalu mengubah pengecualian menjadi `Terlambat`, `Izin`, `Sakit`, atau `Alpa`.
   - Simpan dengan tombol `Simpan Presensi Awal`.

3. **Guru wajib absen keluar saat jam pelajaran selesai.**
   - Di aplikasi tombolnya: `Absen Keluar / Akhiri Kelas`.
   - Sistem mencatat waktu `checkOutAt`, lokasi jika dikirim, dan petugas yang melakukan aksi.
   - Saat keluar, sistem menutup sesi menjadi `CLOSED` dan rekonsiliasi berjalan otomatis.

4. **Jika guru keluar sebelum jam selesai, alasan wajib diisi.**
   - Alasan minimal 10 karakter.
   - Alasan tersimpan di `earlyCheckoutReason` dan masuk audit.
   - Admin/TU atau Guru Piket tetap bisa membantu dalam kondisi darurat, tetapi alasan tetap wajib jika sebelum jam selesai.

5. **Siswa tidak melakukan input presensi sendiri.**
   - Siswa hanya bisa melihat hasil presensi pada dashboard siswa.
   - Koreksi dilakukan oleh guru/admin sesuai prosedur dan wajib alasan.

## Jejak Data yang Disimpan

Pada `TeacherSessionPresence` sistem menyimpan:

- `checkInAt`
- `checkOutAt`
- `checkInLat`
- `checkInLng`
- `checkOutLat`
- `checkOutLng`
- `checkInById`
- `checkOutById`
- `earlyCheckoutReason`

Pada `Session` sistem tetap menyimpan:

- `openedAt`
- `closedAt`
- `status`

## Audit

Event audit penting:

- `teacher.session.checkin`
- `teacher.session.checkout`
- `class.session.opened`
- `class.session.closed`
- `class.attendance.recorded`
- `class.attendance.corrected`

## Dashboard Piket/Admin

Guru Piket dapat melihat:

- guru yang belum absen masuk;
- guru sedang mengajar;
- guru belum absen keluar setelah jam selesai;
- sesi terlewat;
- anomali aktif.

## Laporan Guru

Laporan guru menambahkan ringkasan:

- jumlah sesi;
- jumlah sesi ditutup;
- jumlah check-in;
- jumlah check-out;
- jumlah keluar lebih awal;
- total menit mengajar;
- rata-rata menit mengajar;
- check-in terakhir;
- check-out terakhir.
