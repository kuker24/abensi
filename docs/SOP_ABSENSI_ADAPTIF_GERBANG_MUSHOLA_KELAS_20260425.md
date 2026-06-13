# SOP Absensi Adaptif Gerbang, Mushola, Kelas, dan Override Manual

Tanggal: 2026-04-25, diperbarui 2026-04-26
Aplikasi: SchoolHub e-Hadir MAN 1 Rokan Hulu

## 1. Aturan Utama

1. Semua warga sekolah melakukan scan QR/kartu di gerbang saat masuk.
2. Guru dan karyawan/staf melakukan scan QR/kartu di gerbang saat masuk dan keluar.
3. Siswa melakukan scan QR/kartu di mushola untuk Dhuha dan Dzuhur.
4. Siswa yang jadwal belajarnya sampai sore wajib scan Ashar sebelum scan pulang/keluar gerbang.
5. Presensi kelas melalui web tetap wajib diisi guru.
6. Siswa yang belum memenuhi syarat scan wajib dapat dikunci agar tidak bisa ditandai `Hadir` atau `Terlambat` di presensi kelas.
7. Status `Izin`, `Sakit`, dan `Alpa` tetap dapat dicatat sesuai kondisi, dengan catatan/alasan bila diperlukan.

## 2. Kebijakan Bisa Dicustom Admin

Admin/TU atau Operator IT dapat mengubah aturan pada menu **Pengaturan Lokasi & Kebijakan**:

- wajib scan gerbang siswa sebelum presensi kelas,
- wajib scan Dhuha,
- wajib scan Dzuhur,
- wajib scan Ashar untuk siswa yang jadwalnya sampai sore,
- batas jam kelas yang dianggap “sampai sore”,
- jam berlaku Dhuha, Dzuhur, dan Ashar,
- kunci presensi kelas jika syarat belum lengkap,
- guru wajib scan gerbang masuk,
- guru wajib scan gerbang keluar,
- karyawan/TU/operator wajib scan masuk,
- karyawan/TU/operator wajib scan keluar,
- override manual oleh admin/guru piket.

Default kebijakan operasional:

- siswa wajib scan gerbang masuk,
- Dhuha wajib,
- Dzuhur wajib,
- Ashar wajib hanya jika siswa punya jadwal kelas sampai sore,
- batas default “jadwal sampai sore” adalah kelas berakhir pukul 15:00 atau lebih,
- jam Ashar default 15:00–16:30,
- presensi kelas dikunci jika syarat belum lengkap,
- guru dan karyawan wajib scan masuk/keluar,
- override manual aktif dengan alasan.

## 3. Alur Siswa

1. Siswa scan QR/kartu di gerbang saat masuk.
2. Siswa scan QR/kartu di mushola saat Dhuha.
3. Siswa scan QR/kartu di mushola saat Dzuhur jika aturan Dzuhur aktif.
4. Guru membuka sesi kelas dan mengisi presensi siswa di web.
5. Sistem memeriksa kelengkapan scan siswa untuk presensi kelas.
6. Jika belum lengkap, pilihan `Hadir` dan `Terlambat` untuk siswa tersebut dikunci.
7. Jika siswa punya jadwal sampai sore, siswa scan QR/kartu di mushola saat Ashar.
8. Saat siswa scan pulang/keluar gerbang, sistem memeriksa kewajiban Ashar.
9. Jika wajib Ashar tetapi belum scan, scan pulang ditolak dengan pesan: **Siswa ini masih punya jadwal sampai sore. Scan Ashar dulu sebelum pulang.**
10. Guru/petugas tetap dapat menandai `Izin`, `Sakit`, atau `Alpa` sesuai kondisi.

## 4. Alur Guru dan Karyawan

1. Guru/karyawan scan QR/kartu di gerbang saat masuk.
2. Guru membuka sesi kelas sebagai absen masuk/mulai kelas.
3. Guru mengisi presensi siswa awal pembelajaran.
4. Guru menutup sesi sebagai absen keluar/akhiri kelas.
5. Guru/karyawan scan QR/kartu di gerbang saat keluar sekolah.

## 5. Input Manual Admin

Menu **Perangkat → Scan Manual** dapat dipakai saat:

- QR/kartu tidak terbaca,
- alat scanner bermasalah,
- petugas perlu melakukan verifikasi kelas manual,
- siswa/guru/karyawan sudah diverifikasi secara fisik,
- siswa mendapat izin pulang tanpa scan Ashar karena alasan sah.

Jenis pengecualian manual:

- **Syarat presensi kelas** untuk kasus scan gerbang/Dhuha/Dzuhur tidak terbaca.
- **Pulang tanpa scan Ashar** untuk siswa jadwal sore yang boleh pulang karena izin/sakit/kegiatan resmi.
- **Semua syarat hari ini** untuk keadaan khusus yang sudah disetujui petugas.

Setiap input manual wajib memiliki alasan yang jelas dan tercatat di audit.

## 6. Audit dan Anomali

Sistem mencatat audit untuk:

- scan QR gerbang,
- scan QR mushola Dhuha/Dzuhur/Ashar,
- scan manual,
- perubahan aturan absensi,
- siswa diblokir oleh aturan presensi,
- scan pulang siswa ditolak karena belum Ashar,
- override manual.

Anomali yang dapat muncul:

- siswa hadir kelas tetapi belum scan gerbang,
- siswa hadir kelas tetapi belum scan Dhuha,
- siswa hadir kelas tetapi belum scan Dzuhur,
- siswa jadwal sore tetapi belum scan Ashar,
- guru membuka kelas tanpa data gerbang,
- siswa alpa padahal scan gerbang.

## 7. Catatan Operasional

Cloudflare Quick Tunnel masih bersifat sementara untuk beta. Perubahan URL tunnel tidak memengaruhi logika absensi. Untuk alamat tetap diperlukan Named Tunnel/domain Cloudflare.
