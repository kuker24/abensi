# PROMPT UNTUK CLAUDE — Design Frontend SchoolHub e-Hadir

> Copy seluruh isi di bawah ini dan paste ke Claude setelah attach file `prd-ehadir-v2.1.md`.

---

## Peran & Tugas Anda

Anda adalah **Senior Product Designer + Frontend Engineer** dengan kombinasi langka: selera desain setara tim Linear/Vercel/Arc Browser dan kemampuan eksekusi React + Tailwind tingkat production. Tugas Anda: **mendesain dan mengimplementasikan frontend** untuk sistem kehadiran digital **SchoolHub e-Hadir MAN 1 Rokan Hulu**, berdasarkan PRD v2.1 yang saya lampirkan.

Baca seluruh PRD dulu, pahami arsitektur 2-lapis (Gate + Class), engine Rekonsiliasi, dan 3 peran utama (Admin/TU, Guru, Siswa). Desain harus mencerminkan struktur itu.

---

## Benchmark Kualitas

**Referensi yang harus dilampaui 10× lipat**: https://www.bridgemind.ai/

BridgeMind kuat di: dark aesthetic, typography besar, subtle motion, terminal-vibe yang modern.

**Tapi BridgeMind adalah landing page marketing. Kita membuat aplikasi produksi.** Maka "10× lebih baik" berarti:

1. **Density informasi yang terkontrol** — layout padat data tapi tidak sesak; hierarchy visual yang tajam.
2. **Dark DAN light mode** yang keduanya sama-sama berseni (bukan light mode sebagai afterthought).
3. **Micro-interactions yang fungsional** — animasi yang menyampaikan state, bukan dekorasi.
4. **Glassmorphism yang restraint** — frosted surface dipakai strategis, bukan di mana-mana.
5. **Typography pairing yang matang** — display font + body font yang kontras karakter.
6. **Icon system konsisten** — satu family (Lucide/Phosphor), ukuran dan stroke-weight disiplin.
7. **Empty states, error states, loading states** yang didesain — bukan placeholder.
8. **Data visualization yang elegan** — chart tidak default Recharts; harus dipoles.
9. **Responsive behavior yang dipikirkan** — tablet-first karena guru banyak pakai tablet di kelas.
10. **Personality yang unik** — tidak terlihat seperti "admin template generik".

---

## Konteks Produk

- **Pengguna utama**: guru yang buka tablet di kelas untuk absen 30 siswa dalam < 30 detik.
- **Pengguna sekunder**: admin/TU di kantor dengan desktop, memantau live feed & mengelola anomali rekonsiliasi.
- **Pengguna tersier**: siswa yang lihat riwayat di HP.
- **Lingkungan**: madrasah Indonesia, konteks Islami profesional modern (bukan ornamen berat, tapi respectful).
- **Bahasa UI**: Indonesia.

---

## Arahan Design System

### 1. Philosophy
> "Information-dense elegance untuk ruang kerja pendidikan yang serius."

Bukan playful. Bukan corporate-sterile. Ini seharusnya terasa seperti alat kerja yang membuat guru bangga memegangnya.

### 2. Palet Warna

**Primer**: gradient deep purple-indigo seperti disebut PRD, tapi **lebih bernuansa**:
- Gunakan dua atau tiga shade ungu-indigo yang berdekatan (contoh: `#5B21B6` → `#6366F1` → `#8B5CF6`) untuk gradien halus, bukan terlalu kontras.
- Hindari ungu "Barbie" atau "gamer RGB".

**Aksen**:
- **Emerald/teal** untuk status positif (HADIR, Normal, Valid) — warna yang respectful di konteks madrasah.
- **Amber halus** untuk status perhatian (TELAT, Warning).
- **Rose/coral soft** untuk status negatif (ALPA, Rejected) — hindari merah tomat vulgar.

**Netral**:
- Dark mode: near-black (`#0A0A0F` atau `#0D0D14`), bukan pure black. Surface berlapis dengan elevation (`#13131D`, `#1A1A26`).
- Light mode: warm off-white (`#FAFAF7` atau `#F8F8FB`), bukan pure white.

### 3. Typography

- **Display/Headings**: satu font geometric dengan karakter (contoh arah: Satoshi, General Sans, Inter Tight, atau Manrope). **Tidak** Inter polos yang generik.
- **Body**: font neutral & readable (Inter OK di sini, atau IBM Plex Sans).
- **Mono**: untuk angka data, ID, timestamp (JetBrains Mono atau Geist Mono).
- **Pasangan kontras**: display punya "suara", body netral. Jangan dua-duanya netral.

### 4. Spacing & Density
- Base unit 4px. Scale: 4, 8, 12, 16, 24, 32, 48, 64.
- **Tablet-first** di layout dasbor guru (breakpoint 768–1024 harus nyaman).
- Desktop bisa lebih padat data (admin/TU).
- Mobile minimalis (siswa).

### 5. Surface & Depth
- **Glassmorphism**: hanya di overlay (modal, popover, floating panel), bukan di semua card.
- **Elevation via border**: border `1px` dengan warna surface + inner shadow halus, lebih premium daripada drop-shadow berat.
- **Gradient borders** untuk element spesial (sesi aktif, flag anomali penting) — halus.

### 6. Iconography
- Satu library: **Lucide React**. Stroke 1.5px. Ukuran 16/20/24.
- Tidak mix emoji + ikon di permukaan yang sama (emoji boleh di empty state illustration).

### 7. Motion
- **Micro-interactions 120–200ms** dengan easing `ease-out` natural.
- **Transitions antar-state** (open/close sesi, save/error) dengan spring halus.
- **Skeleton loading** untuk data — bukan spinner.
- **Stagger animation** untuk list yang muncul (50–80ms delay).
- **Tidak ada** animasi yang menunda kerja > 300ms.

---

## Dark / Light Mode

**Toggle switch wajib**, posisi di header (kanan atas dekat avatar). Animasi switch sendiri harus delightful (sun→moon morph).

**Kedua mode harus diperlakukan sebagai first-class citizen**:
- Light mode **tidak** hanya dark mode yang dibalik. Rethink shadow, border, accent brightness, glass opacity untuk tiap mode.
- Dark mode default (sesuai PRD).
- Preference disimpan lokal, dan respek `prefers-color-scheme` sistem.

Contoh perbedaan treatment:
- **Dark**: glow halus di interactive elements, glass dengan blur tinggi, gradien saturasi sedang.
- **Light**: shadow sangat halus (opacity 3–6%), border tipis yang terlihat, gradien saturasi lebih rendah agar mata nyaman.

---

## Halaman yang Harus Didesain

Urutkan prioritas seperti ini. Kalau Anda hanya punya waktu untuk 3 halaman, utamakan 3 pertama.

### PRIORITAS 1 — Inti Harian

1. **Login Page**
   - Identitas sekolah + kata sandi
   - Visual hero yang tidak generik (hindari "illustrated people pointing at laptop")
   - Toggle theme di sini sudah harus ada
   - Error state untuk login gagal, akun suspended

2. **Dasbor Guru** (tablet-first)
   - Greeting + tanggal + status cuaca hari (optional)
   - Kartu besar "Sesi Selanjutnya" — kelas, mapel, jam mulai, countdown, tombol primary [Buka Sesi]
   - Timeline sesi hari ini (SCHEDULED → OPEN → CLOSED → MISSED)
   - Status kehadiran saya harian (tap gerbang pagi + sesi terbuka)
   - Quick access: koreksi, rekap kelas ampuan

3. **Input Presensi Kelas** ⭐ SCREEN PALING PENTING
   - Header sesi: mapel, kelas, jam, countdown durasi
   - Action bar: [Tandai semua HADIR] · [Tandai semua ALPA] · search siswa
   - List siswa: avatar, nama, NIS, **toggle status dengan 5 state** (HADIR/TELAT/IZIN/SAKIT/ALPA)
   - Desain toggle status yang **cepat dipakai dengan ibu jari di tablet** — ini kuncinya
   - Counter live di bawah: "Hadir: 28 · Telat: 0 · Izin: 1 · Sakit: 0 · Alpa: 1"
   - Tombol besar [Tutup Sesi] di floating bar bawah
   - Confirmation modal sebelum tutup dengan ringkasan

4. **Dasbor Admin/TU**
   - 4 stat cards: Sesi Hari Ini · Cakupan Presensi · Anomali Terdeteksi · Guru Hadir
   - Live Monitor scan (feed real-time, mini)
   - Chart: tren kehadiran 7 hari terakhir
   - Shortcut ke Papan Anomali

5. **Papan Anomali Rekonsiliasi** ⭐ FITUR PEMBEDA
   - Feed card per flag: tipe (`BOLOS_KELAS`, `LUPA_TAP_GERBANG`, `TIDAK_MENGAJAR`, dll) dengan badge warna
   - Detail: siapa, kapan, konteks 2-lapis (Gate: ✅ tap 07:15 | Kelas: ❌ ALPA jam 08:00)
   - Action: [Resolve] membuka form alasan, atau [Eskalasi ke Wali]
   - Filter: tipe flag, tanggal, status (open/resolved)

### PRIORITAS 2 — Manajemen

6. **Live Monitor Scan** (full screen)
   - Stream event tap gerbang + buka/tutup sesi real-time
   - Tiap event: avatar + nama + peran + jam + metode + hasil (valid/rejected) + lokasi
   - Animasi masuk dari atas, fade out ke bawah
   - Filter peran, waktu, status

7. **Riwayat Absen** (admin view)
   - Table padat info dengan filter kuat (kelas, sesi, tanggal, status)
   - Inline edit → modal koreksi (alasan wajib min 10 char)

8. **Manajemen Jadwal & Sesi**
   - Kalender mingguan drag-friendly
   - Detail sesi: jadwal, status, peserta, riwayat event

9. **Manajemen Smart Card**
   - Table kartu: UID, status, pemilik, terakhir tap
   - Action: taut, lepas, ubah status
   - Form registrasi kartu baru

10. **Pengaturan Sistem**
    - Geofence: preview map dengan radius adjustable (pakai Leaflet atau Mapbox)
    - Grace periods (HADIR→TELAT, OPEN→MISSED)
    - Kebijakan akses toggles
    - Setiap perubahan menunjukkan preview dampak + "Simpan" explicit

### PRIORITAS 3 — Pendukung

11. **Laporan Rekap** (kelas/siswa/mapel/guru)
12. **Catatan Audit** (append-only log dengan filter canggih)
13. **Master Data** (pengguna, struktur akademik, pendaftaran)
14. **Dasbor Siswa** (mobile-first, ringkas)
15. **Profil Pengguna** (semua peran)

---

## Komponen Sistem yang Harus Dibangun Dulu

Bangun komponen-komponen ini **sebagai design system reusable**, baru susun jadi halaman:

- `<Button>` — primary, secondary, ghost, destructive, sizes sm/md/lg
- `<Card>` — default, elevated, outlined, glass
- `<Badge>` — untuk semua status (HADIR, TELAT, MISSED, dll) — konsisten warna sesuai kamus status PRD
- `<Input>`, `<Select>`, `<Textarea>` — dengan label, helper, error state
- `<Table>` — dengan sort, pagination, empty state, loading skeleton
- `<Modal>` / `<Sheet>` — dialog dan panel samping
- `<Toast>` — untuk feedback aksi
- `<Avatar>` — dengan fallback initials
- `<Tabs>`, `<Dropdown>`, `<Tooltip>`, `<Popover>`
- `<StatCard>` — untuk dashboard metrics
- `<Timeline>` — untuk audit & riwayat sesi
- `<Sidebar>`, `<TopBar>` — layout utama
- `<ThemeToggle>` — sun/moon animated switch
- `<StatusPill>` — varian khusus untuk status sesi/kartu/anomali
- `<EmptyState>` — template dengan illustration ringan

---

## Standar Interaksi

1. **Setiap klik** punya feedback visual < 100ms.
2. **Setiap aksi ireversibel** (tutup sesi, hapus, resolve flag) punya confirmation.
3. **Setiap form** punya validation inline + error message yang ramah.
4. **Setiap table panjang** punya sticky header + sort + pagination.
5. **Setiap loading** pakai skeleton, bukan spinner, kecuali aksi global.
6. **Setiap success/error** muncul sebagai toast dengan icon + durasi 3-5 detik.
7. **Keyboard navigation** bekerja di semua form dan table (Tab, Enter, Escape).
8. **Focus ring** selalu terlihat, kontras tinggi di kedua mode.

---

## Requirement Teknis

- **Stack**: React + TypeScript + Tailwind CSS + Lucide icons.
- **State**: gunakan Zustand atau useState + useReducer untuk mock data.
- **Routing**: React Router untuk multi-page demo.
- **Theme**: CSS variables (`--color-bg`, `--color-surface`, dst) yang di-swap di root berdasarkan class `dark`/`light`.
- **Mock data**: buat realistis (nama Indonesia, kelas `X-MIA-1`, mapel `Matematika Wajib`, dll). **Tidak** "Lorem ipsum".
- **File structure**: modular, satu komponen per file, grouped by feature.
- **Responsive**: mobile (siswa), tablet (guru — target utama), desktop (admin).

Deliverable akhir bisa berupa satu project lengkap atau sekumpulan artifact per halaman. Prioritaskan halaman Prioritas 1 terlebih dulu.

---

## Quality Bar — Apa Artinya "10× Lebih Baik"

Setelah output Anda selesai, Anda harus bisa jawab **YA** untuk semua ini:

- [ ] Apakah layar ini terasa dibuat oleh tim produk serius (Linear, Arc, Raycast), bukan admin template?
- [ ] Apakah dark dan light mode sama-sama indah, bukan salah satu cuma "ada"?
- [ ] Apakah setiap warna punya peran fungsional, bukan dekoratif?
- [ ] Apakah typography hierarchy langsung terbaca tanpa berpikir?
- [ ] Apakah komponen terlihat konsisten antar-halaman?
- [ ] Apakah data density tinggi tapi tetap enak dibaca?
- [ ] Apakah animasi terasa seperti bagian dari produk, bukan tempelan?
- [ ] Apakah empty state dan error state terasa dipikirkan?
- [ ] Apakah ada detail yang membuat pengguna tersenyum saat pertama kali buka?

---

## Anti-pattern (Wajib Dihindari)

- ❌ **Shadcn default out-of-the-box** tanpa custom styling. Harus di-rework jadi punya karakter sendiri.
- ❌ **Bootstrap-era admin aesthetics**: sidebar biru, breadcrumb di mana-mana, tab atas bawah.
- ❌ **Gradient ungu-pink cyberpunk**. Kita sekolah, bukan NFT launchpad.
- ❌ **Emoji berlebihan** di UI profesional. Icon system saja.
- ❌ **Border radius inkonsisten** (sebagian rounded-sm, sebagian rounded-3xl).
- ❌ **Text dalam tombol yang campur UPPERCASE dan Title Case**. Pilih satu.
- ❌ **Warna status yang hanya red/yellow/green tanpa nuansa**.
- ❌ **Tabel dengan lebih dari 8 kolom** tanpa column toggle.
- ❌ **Modal yang full screen padahal cuma konfirmasi singkat**.
- ❌ **Lorem ipsum** — pakai nama dan konten Indonesia yang realistis.
- ❌ **Ornamen Islami cliché** (bulan sabit, kaligrafi dekoratif) yang memaksa. Respect via tone dan palette, bukan ornamen.

---

## Mulai Eksekusi

Mulai dengan:
1. **Tentukan design tokens** (warna, typography, spacing) sebagai file `tokens.ts` atau CSS variables.
2. **Bangun 3 komponen dasar** dulu: `Button`, `Card`, `Badge`, dalam kedua mode. Tunjukkan preview.
3. **Lanjut ke Login + Dasbor Guru + Input Presensi Kelas** (Prioritas 1 teratas).
4. Setelah itu baru halaman lain.

Jika ada ambiguitas, buat keputusan desain dengan alasan yang jelas dan sebutkan alasan Anda. Jangan tanya setiap detail kecil — perlihatkan selera Anda sebagai designer.

Tunjukkan outputnya sebagai artifact React yang bisa langsung dilihat previewnya.

**Go.**
