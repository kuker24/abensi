# Audit Cakupan UI/UX terhadap PRD e-Hadir v2.2

Tanggal: 2026-04-25
Sumber PRD: `prd-ehadir-v2_2.md`
Target: melengkapi UI agar seluruh menu Fase 1 bisa dikunjungi dan fungsi inti tersambung ke backend.

## Matriks cakupan

| Area PRD v2.2 | Menu/Layar | Endpoint utama | Status sebelum | Target implementasi |
|---|---|---|---|---|
| Identity | Login, profil, pengguna | `/auth/login`, `/identity/me`, `/identity/users` | Login ada, pengguna belum | Login role-aware, tambah pengguna, proteksi role |
| Academic | Kelas, mapel, siswa, enrollment | `/academic/classes`, `/academic/subjects`, `/academic/students`, `/academic/enrollments` | Belum | Master Data fungsional |
| Scheduling | Jadwal & sesi | `/schedules/sessions` | Placeholder | List, filter, tambah sesi, update sesi |
| Attendance Gate | Tap kartu, log gerbang | `/attendance/gate/logs`, `/attendance/gate/tap` | Belum | Riwayat gerbang + simulasi tap admin/piket |
| Attendance Class | Sesi guru, roster, input, koreksi | `/attendance/class-sessions/*` | Desain statis | Buka sesi, roster, batch attendance, tutup sesi, koreksi |
| Reconciliation | Papan anomali | `/reconciliation/flags`, resolve/escalate | Desain statis | Data live, filter, resolve/escalate alasan wajib |
| Access | Geofence/kebijakan | `/access/geofence` | Belum | Form pengaturan policy |
| Device | Smart card & reader | `/devices/cards`, `/devices/readers` | Belum | CRUD dasar, status, rotate key |
| Reporting | Dasbor, rekap, export, live monitor | `/reports/*` | Sebagian statis | Laporan tabel, export CSV/XLSX, dashboard live |
| Audit | Catatan audit | `/audit` | Belum | Table audit dengan filter/pagination |
| Guru | Dasbor, input, koreksi, rekap, hadir saya | Attendance/report endpoints | Sebagian statis | Semua route guru fungsional |
| Siswa | Dashboard read-only | `/reports/my-attendance` | Belum | Riwayat sendiri, tanpa aksi input |

## Prinsip UX yang dijaga

- Tema dark elegan dari `design/` tetap dipakai.
- Navigasi utama 1 klik melalui sidebar.
- Aksi primer memakai tombol aksen.
- Semua layar punya loading, empty/error state, dan tombol retry/refresh.
- Aksi sensitif memakai alasan/konfirmasi jika backend mensyaratkan.
- Route bisa dikunjungi langsung via path karena nginx fallback ke `index.html`.

## Catatan batasan

Backend yang tersedia belum memiliki endpoint khusus Buku Piket. UI menyediakan Buku Piket fungsional lokal untuk catatan hari ini agar menu PRD bisa dikunjungi tanpa error, sembari menunggu endpoint permanen.
