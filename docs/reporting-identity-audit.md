# Audit Identitas pada Laporan SIAB2

## Tujuan

Dokumen ini memetakan risiko akun personel redundan pada preview dan ekspor laporan SIAB2. Audit ini **tidak** menyatakan dua akun sebagai satu orang. Nama, gelar, atau pola username bukan bukti identitas yang cukup.

Riwayat absensi saat ini melekat ke `User.id`. Karena itu:

- dua akun untuk satu orang dapat menghasilkan dua baris atau statistik terpecah;
- menonaktifkan akun lama tidak memindahkan riwayatnya;
- laporan staf yang memfilter `user.active = true` dapat kehilangan scan historis akun lama.

## Format resmi

Semua tipe laporan memakai renderer yang sama di `apps/api/src/modules/reporting/report-document-exporter.ts`.

| Format | Ekstensi | Catatan |
| --- | --- | --- |
| CSV | `.csv` | UTF-8, aman dari formula spreadsheet |
| Excel | `.xlsx` | Bukan `.xls` lama |
| PDF | `.pdf` | Maksimal 1.000 baris |
| Word | `.docx` | Maksimal 1.000 baris |

CSV dan XLSX dapat dipakai untuk data besar. PDF dan DOCX harus ditolak bila melewati batas cetak.

## Matriks laporan

| `reportType` | Periode/filter utama | Kunci identitas utama | Risiko akun redundan |
| --- | --- | --- | --- |
| `my_attendance` | `days` (1–60) | akun login | Rendah; sengaja tetap per akun |
| `operational_activity_snapshot` | `date` | hitungan event/`User.id` | Tinggi untuk statistik personel |
| `recap_classes` | `from`, `to`, kelas/guru | sesi dan `teacherId` | Sedang; jumlah guru unik dapat membengkak |
| `recap_students` | `from`, `to`, kelas/siswa | `studentId` | Tinggi bila siswa punya akun ganda |
| `recap_subjects` | `from`, `to`, mapel/guru | sesi dan `teacherId` | Sedang |
| `recap_teachers` | `from`, `to`, guru | `teacherId` | Tinggi; satu orang dapat menjadi dua baris |
| `teacher_monthly` | `month`, guru | `teacherId` | Tinggi |
| `student_monthly_attendance` | `month`, kelas/siswa | `studentId` | Tinggi bila siswa ganda |
| `staff_monthly_attendance` | `month` | `User.id`, hanya akun aktif | Tinggi; denominator membengkak atau histori hilang |
| `staff_gate_attendance` | `from`, `to` | `User.id + tanggal`, hanya akun aktif | Tinggi |
| `teacher_session_activity` | `from`, `to`, guru | sesi dan `teacherId` | Tinggi |
| `student_prayer_attendance` | `from`, `to`, kelas/siswa | `studentId` | Tinggi bila siswa ganda |
| `student_worship_recap` | `from`, `to`, kelas/siswa | `studentId` | Tinggi bila siswa ganda |
| `prayer_recap` | `from`, `to`, kelas/siswa | alias rekap ibadah | Sama seperti `student_worship_recap` |
| `student_daily_complete_attendance` | harian/rentang, kelas/siswa/status | `studentId + tanggal` | Tinggi bila siswa ganda |
| `missing_arrival_scan` | harian/rentang | `studentId + tanggal` | Tinggi bila siswa ganda |
| `missing_departure_scan` | harian/rentang | `studentId + tanggal` | Tinggi bila siswa ganda |
| `class_present_no_gate_scan` | harian/rentang | `studentId + tanggal` | Tinggi bila siswa ganda |
| `gate_scan_no_class_attendance` | harian/rentang | `studentId + tanggal` | Tinggi bila siswa ganda |
| `audit_coverage` | `from`, `to` | sesi dan `teacherId` | Sedang; nama guru dapat terpecah |

Tidak ditemukan ekspor mingguan. Laporan bulanan memakai `month=YYYY-MM`. Laporan harian memakai `date` atau `from=to`.

## Tampilan non-ekspor yang ikut terdampak

Kebijakan identitas yang sama juga dipakai oleh:

- dashboard operasional;
- tren;
- live monitor/SSE;
- preview rekap kelas, siswa, mapel, guru, staf, dan ibadah.

Audit tidak boleh hanya memeriksa file unduhan. Preview dan file harus memakai definisi data yang sama.

## Temuan kontrak saat ini

1. `recapTeachers` dan `teacherMonthly` mengelompokkan berdasarkan `teacherId`.
2. `teacherSessionActivity` menampilkan `teacherId` sumber pada tiap sesi.
3. `staffGateAttendance` mengelompokkan berdasarkan `userId + tanggal` dan hanya membaca akun aktif.
4. `staffMonthlyAttendance` membentuk daftar personel aktif per `User.id`; akun aktif tanpa scan tetap menjadi baris nol-scan.
5. Menonaktifkan akun lama saja dapat menyembunyikan scan historis pada laporan staf.
6. `User.nip` belum unik di database. Import lama dapat memiliki lebih dari satu akun dengan NIP yang sama.

## Audit read-only

Perintah:

```bash
npm run audit:reporting-identity
```

Syarat:

- jalankan hanya setelah target `DATABASE_URL` disetujui;
- jangan mencetak atau membaca isi `.env`;
- skrip hanya memakai query `findMany` dan relasi `_count`;
- output tidak berisi nama, username, NIP, atau `User.id`;
- exit code `0`: tidak ada kandidat;
- exit code `1`: ada kandidat yang perlu ditinjau;
- exit code `2`: audit terblokir atau gagal.

Klasifikasi:

| Klasifikasi | Arti |
| --- | --- |
| `AMBIGUOUS` | NIP ternormalisasi sama pada lebih dari satu akun. Perlu verifikasi manusia. |
| `CONFLICT` | NIP sama tetapi nama ternormalisasi berbeda. Wajib ditahan. |
| `NAME_ONLY_REVIEW` | Nama mirip/sama tanpa identitas unik. Tidak boleh auto-merge. |
| `CONFIRMED_BY_UNIQUE_ID` | Disiapkan untuk masa depan; belum dipakai karena sistem belum memiliki identitas personel unik yang dijamin. |

## Batas keputusan

Audit ini tidak boleh:

- menghapus atau menonaktifkan akun;
- memindahkan foreign key riwayat;
- menggabungkan berdasarkan nama, gelar, singkatan marga, atau pola username;
- menyatakan tiga pasangan akun operasional yang dilaporkan sudah terkonfirmasi.

Jika audit dan pemeriksaan administratif mengonfirmasi kebutuhan perbaikan, tahap selanjutnya harus memakai relasi akun-ke-identitas kanonis yang additive, dapat dicabut, dan diaudit. Perubahan itu membutuhkan ADR terpisah sebelum implementasi.

## Verifikasi otomatis

Cakupan test memakai data sintetis dan memastikan:

- NIP yang cocok ke beberapa akun ditolak oleh preview import;
- dua `User.id` tetap terlihat sebagai dua baris pada kontrak saat ini;
- filter `active=true` yang dapat menyembunyikan histori terdokumentasi oleh test;
- CSV, XLSX, PDF, dan DOCX memakai judul, kolom, jumlah baris, metadata periode, dan report type yang sama;
- tombol guru dan “Kehadiran Saya” mengirim report type, format, dan periode yang benar.
