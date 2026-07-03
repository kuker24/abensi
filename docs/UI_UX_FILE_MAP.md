# Pemetaan UI/UX SchoolHub e-Hadir

Dokumen ini memetakan bagian UI/UX, route, dan file yang perlu disentuh jika ingin memperbarui desain web SchoolHub e-Hadir.

## 1. Arsitektur UI Utama

| Area | Path/File | Fungsi UI | Catatan redesign |
|---|---|---|---|
| Entry React | `apps/web/src/main.tsx` | Mount aplikasi React | Jarang disentuh kecuali provider global/theme baru |
| Root App | `apps/web/src/App.tsx` | Wrapper awal aplikasi | Jarang disentuh |
| Shell, login, sidebar, topbar, routing | `apps/web/src/app/SchoolHubApp.tsx` | Login screen, layout utama, navigasi role, route access, topbar, sidebar | File paling penting untuk redesign struktur aplikasi |
| UI primitives | `apps/web/src/app/ui.tsx` | Button, Card, Field, Table, Toast, Modal state, Chart kecil, Empty/Loading state | Perbarui di sini untuk konsistensi seluruh aplikasi |
| Global CSS/design token | `apps/web/src/styles.css` | Theme, warna, radius, spacing, layout, card, table, login, responsive | Sumber utama visual design web |
| Confirm dialog | `apps/web/src/app/confirm.tsx` | Modal konfirmasi aksi berisiko | Perlu styling modal/CTA jika redesign flow penting |
| Tutorial overlay | `apps/web/src/app/tutorial.tsx` | Onboarding/panduan overlay | Perlu redesign jika ingin user onboarding premium |
| API helper UI state | `apps/web/src/app/api.ts` | Fetch, auth storage, helper label | Bukan visual, tapi memengaruhi state/loading/session |
| Shared types | `apps/web/src/app/types.ts` | Type UI/API | Sentuh jika refactor komponen typed |

## 2. Design System & CSS Global

| Bagian CSS | Path | Peran |
|---|---|---|
| Design tokens warna/font/radius | `apps/web/src/styles.css` bagian `:root`, `[data-theme="dark"]`, `[data-theme="light"]`, `[data-theme="midnight"]`, `[data-theme="ocean"]`, `[data-theme="warm"]` | Palet warna, typography, status color, shadow, gradient |
| App shell | `apps/web/src/styles.css` bagian `.app`, `.side`, `.topbar`, `.main`, `.content` | Layout dashboard/sidebar/topbar |
| Navigasi | `apps/web/src/styles.css` bagian `.brand`, `.nav-section`, `.nav-item`, `.side-foot`, `.side-user` | Sidebar dan state aktif menu |
| Login | `apps/web/src/styles.css` bagian `.login`, `.login-left`, `.login-right`, `.login-card`, `.login-hero` | Halaman login |
| Button/Input/Card/Table | `apps/web/src/styles.css` bagian `.btn`, `.input`, `.card`, `.table-wrap`, `.data-table`, `.pill`, `.ava` | Komponen reusable utama |
| Dashboard/stat/chart | `apps/web/src/styles.css` bagian `.stat`, `.chart-*`, `.stacked-*`, `.trend-*`, `.donut-*`, `.hbar-*` | Grafik ringan dan kartu ringkasan |
| Guru presensi kelas | `apps/web/src/styles.css` bagian `.roster`, `.statuspick`, `.dock` | UX input presensi guru |
| Live feed/anomaly | `apps/web/src/styles.css` bagian `.feed`, `.anom-card`, `.anom-diag` | Monitoring dan kartu masalah |
| Responsive/mobile | `apps/web/src/styles.css` bagian `@media (max-width: 980px)`, `@media (max-width: 900px)` | Sidebar mobile, grid mobile, tabel mobile |

## 3. Route & File Halaman Web Utama

### 3.1 Shell dan Route Map

Semua route utama didefinisikan di:

- `apps/web/src/app/SchoolHubApp.tsx`
  - `ROUTE_TITLE`
  - `NAV_ITEMS_BY_ROLE`
  - `ROUTE_ACCESS`
  - render switch di function `App()`

Jika ingin mengganti struktur menu, nama menu, urutan menu, atau akses role, mulai dari file ini.

### 3.2 Halaman Admin / Operator / Piket / Developer

File utama:

- `apps/web/src/app/pages/admin/AdminPages.jsx`

| Route | Export/Komponen | Fokus UI |
|---|---|---|
| `/admin/dashboard` | `AdminDashboard` | Ringkasan admin/TU, mini list, quick overview |
| `/admin/it-dashboard` | `ItDashboardPage` | Dashboard operator IT |
| `/admin/picket-dashboard` | `PicketDashboardPage` | Dashboard guru piket |
| `/admin/sessions` | `SessionsPage` | Sesi kelas hari ini |
| `/admin/history` | `HistoryPage` | Riwayat scan gerbang/mushola/kelas |
| `/admin/anomaly` | `AnomalyPage`, `ResolveFlagModal` | Masalah/anomali dan modal penyelesaian |
| `/admin/picket` | `PicketBookPage` | Catatan piket |
| `/admin/master-data` | `MasterDataPage`, `UsersPanel`, `StudentsPanel`, `StudentImportPanel`, `EnrollPanel`, `ImportPanel` | Akun, siswa, kelas, import data sekolah |
| `/admin/schedule` | `SchedulePage` | Jadwal kelas |
| `/admin/devices` | `DevicesPage`, `QrCredentialPanel`, `ReadinessStat`, `AndroidReaderPanel`, `MobileVersionPanel`, `CardsPanel`, `ReadersPanel`, `ManualQrScanPanel` | HP scanner, QR kartu, kesiapan cetak kartu |
| `/admin/reports` | `ReportsPage` | Laporan sekolah/export |
| `/admin/live-monitor` | `LiveMonitorPage` | Aktivitas real-time |
| `/admin/settings` | `SettingsPage` | Aturan absensi |
| `/admin/audit` | `AuditPage` | Riwayat perubahan/audit |
| `/admin/teacher-leaves` | `TeacherLeavesPage` | Izin/sakit/dinas guru |
| `/admin/notifications` | `NotificationsPage` | Notifikasi/tugas |
| `/admin/developer-control` | `DeveloperControlPage`, `CleanupPanel` | Kontrol developer dan cleanup |
| `/admin/help` | `HelpPage` | Panduan role admin/operator/piket/developer |

Prioritas redesign admin:

1. `AdminDashboard`, `ItDashboardPage`, `PicketDashboardPage`
2. `MasterDataPage` + `StudentImportPanel`
3. `DevicesPage` + `QrCredentialPanel`
4. `AnomalyPage` + `ResolveFlagModal`
5. `ReportsPage` + `LiveMonitorPage`

### 3.3 Halaman Guru

File utama:

- `apps/web/src/app/pages/guru/GuruPages.jsx`

| Route | Export/Komponen | Fokus UI |
|---|---|---|
| `/guru/dashboard` | `TeacherDashboard` | Ringkasan mengajar guru |
| `/guru/presensi` | `ClassInputPage` | Input presensi kelas, roster, status picker, dock submit |
| `/guru/koreksi` | `CorrectionPage` | Perbaiki/koreksi presensi |
| `/guru/rekap` | `TeacherRecapPage` | Rekap kelas guru |
| `/guru/izin` | `TeacherLeavePage` | Izin/sakit/dinas guru |
| `/guru/kehadiran-saya` | `MyAttendancePage` dari file siswa | Kehadiran pribadi guru |
| `/guru/notifikasi` | `NotificationsPage` dari admin file | Notifikasi guru |
| `/guru/panduan` | `HelpPage` dari admin file | Panduan guru |

Prioritas redesign guru:

1. `ClassInputPage` karena paling sering dipakai harian.
2. `TeacherDashboard` untuk orientasi cepat.
3. `TeacherLeavePage` untuk flow izin guru.

### 3.4 Halaman Siswa

File utama:

- `apps/web/src/app/pages/siswa/MyAttendancePage.jsx`

| Route | Export/Komponen | Fokus UI |
|---|---|---|
| `/siswa/dashboard` | `MyAttendancePage` | Kehadiran pribadi siswa |
| `/siswa/notifikasi` | `NotificationsPage` dari admin file | Notifikasi siswa |
| `/siswa/panduan` | `HelpPage` dari admin file | Panduan siswa |

Prioritas redesign siswa:

1. `MyAttendancePage` supaya siswa cepat memahami status hadir/telat/alpa.
2. Responsive mobile, karena siswa kemungkinan akses dari HP.

## 4. Komponen UI Reusable yang Harus Distandarkan

File:

- `apps/web/src/app/ui.tsx`

| Komponen | Dipakai untuk | Arah redesign |
|---|---|---|
| `Btn`, `IconBtn` | Semua tombol | Ukuran 44px touch target, state loading, variant jelas |
| `Card` | Panel konten | Hierarki visual, padding konsisten |
| `PageHead` | Header halaman | Judul, subtitle, actions konsisten |
| `Field`, `TextInput`, `SelectInput` | Form | Label, hint, error, focus ring |
| `DataTable`, `AsyncTable`, `Pagination` | Tabel data | Sticky header, mobile table/card mode, empty/loading state |
| `StatusPill`, `Pill` | Badge status | Warna status konsisten dan accessible |
| `ToastHost` | Notifikasi | Posisi, tone, auto-close, accessibility |
| `EmptyState`, `FriendlyEmptyState`, `LoadingState`, `ErrorState` | State kosong/loading/error | Copywriting ramah operator |
| `ProgressRing`, `StackedBar`, `TrendChart`, `StatusDonut`, `HorizontalBarList` | Chart ringan | Warna, label, responsif |
| `RoleTaskPanel`, `QuickActionCard`, `StepGuide`, `SimpleHelpBox` | Bantuan/aksi cepat | UX pekerjaan harian |

## 5. Assets dan Branding

| Asset/Config | Path | Fungsi |
|---|---|---|
| Logo MAN | `apps/web/public/logoman1.jpeg` | Logo di login/sidebar |
| Favicon | `apps/web/public/favicon.svg` | Browser tab |
| App icon | `apps/web/public/app-icon.svg` | PWA/icon |
| Manifest | `apps/web/public/site.webmanifest` | PWA metadata |
| HTML root | `apps/web/index.html` | Title/meta viewport/preload |
| Tailwind config | `apps/web/tailwind.config.ts` | Jika ingin utility class/design token Tailwind |
| Vite config | `apps/web/vite.config.ts` | Build/base/chunking |

## 6. Generator Kartu ID: UI/UX Terpisah

Generator terpisah di:

- `DataSekolah/generator-tanda-pengenal/`
- Production build disalin ke: `apps/web/public/id-card-generator/`
- URL production langsung: `/id-card-generator/`
- URL production terproteksi dari web utama: `/admin/master-data/id-card-generator/`
- Metadata generator mengikuti root app: `/favicon.svg`, `/app-icon.svg`, `/site.webmanifest`, dan theme color `#16181c`.
- Generator tidak memuat font/CDN eksternal agar sesuai CSP produksi (`style-src 'self' 'unsafe-inline'`) dan menghindari console/failed request noise.
- Layout generator menyediakan tautan `Kembali ke SIAB2` untuk affordance mobile/standalone dari protected static route.

### 6.1 Route Generator

File route:

- `DataSekolah/generator-tanda-pengenal/src/App.jsx`

| Route hash | File/Page | Fungsi |
|---|---|---|
| `#/` | `src/pages/Dashboard.jsx` | Dashboard generator |
| `#/import` | `src/pages/ImportData.jsx` | Import CSV/backend JSON |
| `#/users` | `src/pages/Users.jsx` | Daftar pengguna |
| `#/generate` | `src/pages/GenerateCards.jsx` | Preview kartu |
| `#/export` | `src/pages/Export.jsx` | Export PDF, auto-load dari admin web |

### 6.2 Layout Generator

| Area | Path | Fungsi redesign |
|---|---|---|
| Layout utama | `DataSekolah/generator-tanda-pengenal/src/components/layout/Layout.jsx` | Struktur sidebar/header/main |
| Sidebar | `DataSekolah/generator-tanda-pengenal/src/components/layout/Sidebar.jsx` | Menu generator |
| Header | `DataSekolah/generator-tanda-pengenal/src/components/layout/Header.jsx` | Judul halaman, search, badge total |
| HTML root | `DataSekolah/generator-tanda-pengenal/index.html` dan `apps/web/public/id-card-generator/index.html` | Title, favicon, app icon, manifest, theme-color |
| CSS global | `DataSekolah/generator-tanda-pengenal/src/index.css` | Scrollbar, print style, table, dropzone, ID card style, overlay dark SIAB2 |
| Tailwind config | `DataSekolah/generator-tanda-pengenal/tailwind.config.js` | Palet `primary`, spacing, utility |

### 6.3 Kartu ID & PDF

| Area | Path | Fungsi redesign |
|---|---|---|
| Visual kartu | `DataSekolah/generator-tanda-pengenal/src/components/cards/IDCard.jsx` | Desain kartu 55 × 85 mm, QR, logo, nama, kelas |
| Ukuran/payload kartu | `DataSekolah/generator-tanda-pengenal/src/components/cards/cardConfig.js` | Dimensi kartu dan payload QR fallback |
| PDF A4 | `DataSekolah/generator-tanda-pengenal/src/utils/pdfGenerator.js` | Layout cetak A4 3×3, margin, header, cut guide |
| Parser import | `DataSekolah/generator-tanda-pengenal/src/utils/csvParser.js` | Mapping CSV/backend JSON ke user card |
| Store | `DataSekolah/generator-tanda-pengenal/src/store/useStore.js` | State users/selected/activity |

Prioritas redesign generator:

1. `Export.jsx` karena flow utama cetak dari admin.
2. `IDCard.jsx` karena output fisik kartu.
3. `ImportData.jsx` untuk pengalaman operator.
4. `Layout.jsx`, `Sidebar.jsx`, `Header.jsx` agar selaras dengan web utama.
5. Setelah perubahan source generator, rebuild/copy static bundle ke `apps/web/public/id-card-generator/`; untuk perubahan metadata bundle saja, pastikan HTML static tetap memakai root asset SIAB2 agar favicon tidak 404 dari protected alias.

## 7. Android Reader UI, Jika Ikut Diperbarui

Ini bukan web, tapi UI scanner Android ada di:

| Area | Path | Fungsi |
|---|---|---|
| Native scanner screen | `apps/android-reader/app/src/main/java/id/sch/man1rokanhulu/absensi/MainActivity.kt` | Tampilan dan interaksi scanner Android |
| QR parser | `apps/android-reader/app/src/main/java/id/sch/man1rokanhulu/absensi/security/QrParser.kt` | Parsing QR |
| API client | `apps/android-reader/app/src/main/java/id/sch/man1rokanhulu/absensi/network/SchoolHubApiClient.kt` | Request scan ke API |
| Offline queue | `apps/android-reader/app/src/main/java/id/sch/man1rokanhulu/absensi/data/OfflineQueueRepository.kt` | Queue offline |

## 8. Urutan Update UI/UX yang Direkomendasikan

1. **Tetapkan design token baru** di `apps/web/src/styles.css`.
2. **Rapikan reusable component** di `apps/web/src/app/ui.tsx`.
3. **Redesign shell utama** di `apps/web/src/app/SchoolHubApp.tsx`:
   - login
   - sidebar
   - topbar
   - mobile drawer
   - route title/menu naming
4. **Redesign halaman prioritas admin** di `apps/web/src/app/pages/admin/AdminPages.jsx`.
5. **Redesign halaman guru harian** di `apps/web/src/app/pages/guru/GuruPages.jsx`.
6. **Redesign halaman siswa mobile** di `apps/web/src/app/pages/siswa/MyAttendancePage.jsx`.
7. **Samakan generator kartu** di `DataSekolah/generator-tanda-pengenal/src/components/layout/*` dan pages.
8. **Validasi responsive** dengan Playwright/screenshot.
9. **Build + lint + test**:
   - `npm run build --prefix apps/web`
   - `npm run lint --prefix apps/web`
   - `npm run test --prefix apps/web`
   - `cd DataSekolah/generator-tanda-pengenal && npm run build && npm run lint`

## 9. File yang Paling Sering Diubah Saat Redesign

Prioritas utama:

```text
apps/web/src/styles.css
apps/web/src/app/ui.tsx
apps/web/src/app/SchoolHubApp.tsx
apps/web/src/app/pages/admin/AdminPages.jsx
apps/web/src/app/pages/guru/GuruPages.jsx
apps/web/src/app/pages/siswa/MyAttendancePage.jsx
```

Prioritas generator kartu:

```text
DataSekolah/generator-tanda-pengenal/src/index.css
DataSekolah/generator-tanda-pengenal/src/components/layout/Layout.jsx
DataSekolah/generator-tanda-pengenal/src/components/layout/Sidebar.jsx
DataSekolah/generator-tanda-pengenal/src/components/layout/Header.jsx
DataSekolah/generator-tanda-pengenal/src/pages/Dashboard.jsx
DataSekolah/generator-tanda-pengenal/src/pages/ImportData.jsx
DataSekolah/generator-tanda-pengenal/src/pages/Users.jsx
DataSekolah/generator-tanda-pengenal/src/pages/GenerateCards.jsx
DataSekolah/generator-tanda-pengenal/src/pages/Export.jsx
DataSekolah/generator-tanda-pengenal/src/components/cards/IDCard.jsx
```

## 10. Catatan Penting Sebelum Redesign Besar

- `AdminPages.jsx` masih sangat besar. Idealnya dipecah sebelum redesign besar agar aman.
- `SchoolHubApp.tsx` juga memegang terlalu banyak tanggung jawab: route, layout, login, sidebar, topbar.
- Jangan ubah payload QR/kredensial saat hanya redesign visual.
- Setelah generator diubah, build ulang generator dan salin hasil ke `apps/web/public/id-card-generator/` sebelum deploy web.
