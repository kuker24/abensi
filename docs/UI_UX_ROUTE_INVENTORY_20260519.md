# Inventaris Route/Menu UI/UX SchoolHub e-Hadir

**Tanggal:** 2026-05-19  
**Status step:** 2/24 selesai — inventaris route/menu  
**Sumber utama:** `apps/web/src/app/SchoolHubApp.tsx` (`NAV_ITEMS_BY_ROLE`, `ROUTE_ACCESS`, render mapping)  
**Sumber page:** `apps/web/src/app/pages/admin/AdminPages.jsx`, `apps/web/src/app/pages/guru/GuruPages.jsx`, `apps/web/src/app/pages/siswa/MyAttendancePage.jsx`

## Ringkasan

| Area | Jumlah route terdaftar | Catatan |
|---|---:|---|
| Admin/operator/piket/developer shell | 18 | Semua memakai prefix `/admin/*`, akses dibedakan oleh `ROUTE_ACCESS`. |
| Guru | 8 | Semua memakai prefix `/guru/*`. |
| Siswa | 3 | Semua memakai prefix `/siswa/*`. |
| Total route aplikasi | 29 | Route tidak terdaftar jatuh ke halaman Not Found; route tidak sesuai role jatuh ke Unauthorized. |

## Matrix Role Navigation

| Nav key | Role backend | Default area | Jumlah menu sidebar | Dashboard default |
|---|---|---|---:|---|
| `admin` | `ADMIN_TU` | Admin/TU | 15 | `/admin/dashboard` |
| `operator` | `OPERATOR_IT` | Admin/TU | 6 | `/admin/it-dashboard` |
| `picket` | `GURU_PIKET` | Admin/TU | 8 | `/admin/picket-dashboard` |
| `developer` | `DEVELOPER` | Admin/TU | 9 | `/admin/developer-control` |
| `guru` | `GURU_MAPEL` | Guru | 8 | `/guru/dashboard` |
| `siswa` | `SISWA` | Siswa | 3 | `/siswa/dashboard` |

> Catatan: Login selector memetakan `ADMIN_TU`, `OPERATOR_IT`, `GURU_PIKET`, dan `DEVELOPER` ke area login `admin`; `GURU_MAPEL` ke `guru`; `SISWA` ke `siswa`.

## Route Inventory — Admin/Operator/Piket/Developer

| Path | Label/title | Component | Source | Allowed roles | Muncul di nav | Risiko UI/UX awal |
|---|---|---|---|---|---|---|
| `/admin/dashboard` | Ringkasan Admin / Ringkasan Hari Ini | `AdminDashboard` | `AdminPages.jsx` | `ADMIN_TU`, `DEVELOPER` | Admin, Developer | Dashboard complex; perlu cek chart/card responsive, loading/error state multi-fetch. |
| `/admin/it-dashboard` | Cek Sistem | `ItDashboardPage` | `AdminPages.jsx` | `OPERATOR_IT`, `DEVELOPER` | Operator, Developer | Ringkasan sistem; perlu cek empty/error dan mobile card. |
| `/admin/picket-dashboard` | Tugas Piket Hari Ini | `PicketDashboardPage` | `AdminPages.jsx` | `GURU_PIKET`, `DEVELOPER` | Piket | Perlu cek data harian dan CTA tugas cepat. |
| `/admin/sessions` | Cek Sesi Kelas | `SessionsPage` | `AdminPages.jsx` | `ADMIN_TU`, `OPERATOR_IT`, `GURU_PIKET`, `DEVELOPER` | Admin, Piket | Tabel + detail cards; perlu cek mobile action dan selected detail state. |
| `/admin/history` | Riwayat Scan | `HistoryPage` | `AdminPages.jsx` | `ADMIN_TU`, `OPERATOR_IT`, `GURU_PIKET`, `DEVELOPER` | Admin, Piket | Dua tabel log; rawan overflow mobile dan pagination hanya gate log. |
| `/admin/anomaly` | Masalah yang Perlu Dicek | `AnomalyPage` | `AdminPages.jsx` | `ADMIN_TU`, `OPERATOR_IT`, `GURU_PIKET`, `DEVELOPER` | Admin, Piket | Modal tindak lanjut kompleks; perlu audit focus trap, loading, disabled state. |
| `/admin/picket` | Catatan Piket | `PicketBookPage` | `AdminPages.jsx` | `ADMIN_TU`, `OPERATOR_IT`, `GURU_PIKET`, `DEVELOPER` | Admin, Piket | Form catatan + tabel; perlu cek submit loading dan mobile. |
| `/admin/master-data` | Akun & Data Sekolah | `MasterDataPage` | `AdminPages.jsx` | `ADMIN_TU`, `OPERATOR_IT`, `DEVELOPER` | Admin, Developer | Halaman paling berat: banyak tab, import, user CRUD; prioritas QA tinggi. |
| `/admin/schedule` | Jadwal Kelas | `SchedulePage` | `AdminPages.jsx` | `ADMIN_TU`, `OPERATOR_IT`, `DEVELOPER` | Admin | Form jadwal dan tabel; rawan field ID membingungkan dan overflow. |
| `/admin/devices` | HP Scanner & Kartu | `DevicesPage` | `AdminPages.jsx` | `ADMIN_TU`, `OPERATOR_IT`, `DEVELOPER` | Admin, Operator, Developer | Banyak tab/aksi: reader, kartu, cetak QR; perlu guard, loading, mobile. |
| `/admin/reports` | Laporan Sekolah | `ReportsPage` | `AdminPages.jsx` | `ADMIN_TU`, `OPERATOR_IT`, `GURU_PIKET`, `DEVELOPER` | Admin | Export/download; perlu feedback saat download gagal/berhasil. |
| `/admin/live-monitor` | Aktivitas Sekarang | `LiveMonitorPage` | `AdminPages.jsx` | `ADMIN_TU`, `OPERATOR_IT`, `GURU_PIKET`, `DEVELOPER` | Admin, Operator, Piket, Developer | Tabel aktivitas real-time; perlu refresh state dan mobile readability. |
| `/admin/settings` | Aturan Absensi | `SettingsPage` | `AdminPages.jsx` | `ADMIN_TU`, `OPERATOR_IT`, `DEVELOPER` | Admin, Developer | Form config; perlu confirm untuk perubahan policy penting. |
| `/admin/audit` | Riwayat Perubahan | `AuditPage` | `AdminPages.jsx` | `ADMIN_TU`, `OPERATOR_IT`, `DEVELOPER` | Admin, Operator, Developer | Tabel audit panjang; perlu wrapping detail dan filter. |
| `/admin/teacher-leaves` | Pengajuan Guru / Izin Guru | `TeacherLeavesPage` | `AdminPages.jsx` | `ADMIN_TU`, `OPERATOR_IT`, `DEVELOPER` | Admin | Tabel persetujuan izin; perlu status/aksi jelas. |
| `/admin/notifications` | Tugas / Notifikasi | `NotificationsPage` | `AdminPages.jsx` | `ADMIN_TU`, `OPERATOR_IT`, `GURU_PIKET`, `DEVELOPER` | Admin, Operator, Piket | Dipakai lintas role admin shell; perlu empty state. |
| `/admin/developer-control` | Pusat Kontrol | `DeveloperControlPage` | `AdminPages.jsx` | `DEVELOPER` | Developer | Aksi berisiko tinggi; harus confirm dan aman di mobile. |
| `/admin/help` | Panduan | `HelpPage` | `AdminPages.jsx` | `ADMIN_TU`, `OPERATOR_IT`, `GURU_PIKET`, `DEVELOPER` | Admin, Operator, Piket, Developer | Konten bantuan; perlu copywriting dan navigasi anchor bila panjang. |

## Route Inventory — Guru

| Path | Label/title | Component | Source | Allowed roles | Muncul di nav | Risiko UI/UX awal |
|---|---|---|---|---|---|---|
| `/guru/dashboard` | Ringkasan Mengajar | `TeacherDashboard` | `GuruPages.jsx` | `GURU_MAPEL` | Guru | Dashboard ringkas; perlu cek data kosong dan CTA ke presensi. |
| `/guru/presensi` | Isi Presensi Kelas | `ClassInputPage` | `GuruPages.jsx` | `GURU_MAPEL` | Guru | Flow inti; sudah ditingkatkan, tetap prioritas QA mobile dan double-submit. |
| `/guru/koreksi` | Perbaiki Presensi | `CorrectionPage` | `GuruPages.jsx` | `GURU_MAPEL` | Guru | Form koreksi; perlu guard alasan/validasi dan feedback. |
| `/guru/rekap` | Laporan Kelas Saya | `TeacherRecapPage` | `GuruPages.jsx` | `GURU_MAPEL` | Guru | Tabel rekap; perlu filter dan mobile readability. |
| `/guru/izin` | Izin / Sakit / Dinas | `TeacherLeavePage` | `GuruPages.jsx` | `GURU_MAPEL` | Guru | Form izin; perlu loading, validation, status tracking. |
| `/guru/kehadiran-saya` | Kehadiran Saya | `MyAttendancePage` | `MyAttendancePage.jsx` | `GURU_MAPEL` | Guru | Komponen siswa dipakai untuk guru; perlu cek copy supaya tidak terlalu siswa-sentris. |
| `/guru/notifikasi` | Tugas / Notifikasi | `NotificationsPage` | `AdminPages.jsx` | `GURU_MAPEL` | Guru | Dipakai dari admin pages; perlu cek role-specific copy. |
| `/guru/panduan` | Panduan | `HelpPage` | `AdminPages.jsx` | `GURU_MAPEL` | Guru | Perlu pastikan konten bantuan guru relevan. |

## Route Inventory — Siswa

| Path | Label/title | Component | Source | Allowed roles | Muncul di nav | Risiko UI/UX awal |
|---|---|---|---|---|---|---|
| `/siswa/dashboard` | Kehadiran Saya | `MyAttendancePage` dengan prop `student` | `MyAttendancePage.jsx` | `SISWA` | Siswa | Halaman utama siswa; perlu cek mobile, empty state, dan istilah mudah. |
| `/siswa/notifikasi` | Tugas / Notifikasi | `NotificationsPage` | `AdminPages.jsx` | `SISWA` | Siswa | Component lintas role; perlu cek copy dan empty state untuk siswa. |
| `/siswa/panduan` | Panduan | `HelpPage` | `AdminPages.jsx` | `SISWA` | Siswa | Perlu pastikan panduan siswa singkat dan mobile-first. |

## Cross-Check Route vs Render Mapping

| Check | Hasil |
|---|---|
| Semua route di `ROUTE_ACCESS` punya render branch di `App()` | ✅ Ya, 29 route memiliki branch render. |
| Semua path di `NAV_ITEMS_BY_ROLE` terdaftar di `ROUTE_ACCESS` | ✅ Ya. |
| Ada route terdaftar tetapi tidak muncul di nav role pemilik utama | ⚠️ Ya: `/admin/developer-control` hanya nav Developer; `/admin/it-dashboard` hanya Operator/Developer; `/admin/picket-dashboard` hanya Piket. Ini sesuai desain role dashboard. |
| Component lazy chunks | ✅ Admin/Guru/Siswa pages dipisah; deploy wajib full replacement asset. |

## Prioritas QA berdasarkan risiko

1. **P0/P1 kandidat tertinggi**
   - `/guru/presensi` — flow absensi inti.
   - `/admin/master-data` — CRUD/import/user management paling kompleks.
   - `/admin/devices` — reader/kartu/QR, aksi operasional penting.
   - `/admin/anomaly` — resolve/escalate masalah, modal kompleks.
   - `/admin/sessions` — monitoring sesi dan detail.

2. **P1/P2 kandidat**
   - `/admin/history`, `/admin/audit`, `/admin/live-monitor` — tabel panjang.
   - `/admin/reports` — download/export feedback.
   - `/admin/schedule` — form jadwal dan tabel.
   - `/guru/koreksi`, `/guru/izin`, `/guru/rekap` — form dan tabel guru.

3. **P2/P3 kandidat**
   - Help/notifications/dashboard minor polish dan copywriting.

## Next Immediate Action

Lanjut ke step 3: **Full visual QA desktop**.

Scope step 3:

- Login desktop.
- Semua route utama minimal satu kali render dengan user role yang sesuai.
- Catat defect nyata: blank, overflow, console error, broken state, contrast, table/form/modal issue.
- Simpan screenshot desktop dark-only di `apps/web/qa-screenshots/final-uiux-desktop/`.
