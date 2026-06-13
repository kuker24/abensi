# PRD — SchoolHub e-Hadir MAN 1 Rokan Hulu
## Versi 2.2 — Final Baseline (Edisi Bahasa Ramah)

> 📌 **Apa bedanya versi ini dengan v2.1?**
> Isi teknis tetap sama persis. Yang ditambah: penjelasan dengan bahasa yang lebih mudah dipahami di setiap menu, istilah, status, dan aturan. Jadi dokumen ini bisa dibaca oleh tim teknis **dan** oleh guru, TU, atau kepala madrasah tanpa perlu kamus IT.

---

## 0. Perubahan dari v2.0 → v2.1 → v2.2

| Area | v2.0 | v2.1 | v2.2 | Alasan |
|---|---|---|---|---|
| Metode kelas | Card primer, QR fallback, Manual rescue | **Manual oleh guru** (satu-satunya) | Sama, dijelaskan ulang dengan bahasa sederhana | Sesuai realita: guru input di web |
| Peran kartu | Untuk gerbang & kelas | **Hanya untuk gerbang** | Sama | KISS — kartu di satu tempat saja |
| Kehadiran guru di kelas | Samar | Berbasis aksi sesi | Sama + analogi "absen otomatis saat buka pelajaran" | KISS + tanpa hardware tambahan |
| QR | Di modul inti | Dipindah ke Extension Points | Sama | Belum dipakai, siap ditambah nanti |
| Rekonsiliasi | Tidak ada | Modul baru (8.5) | Sama + penjelasan "pencocokan dua lapis" | Cross-check = standar emas disiplin |
| Model kehadiran | 1 lapis | 2 lapis eksplisit | Sama + ilustrasi | Sesuai realita sekolah |
| **Bahasa dokumen** | Teknis | Teknis | **Teknis + penjelasan ramah** | Agar bisa dibaca non-IT |

---

## 1. Identitas Dokumen

| Field | Nilai |
|---|---|
| Produk | SchoolHub e-Hadir MAN 1 Rokan Hulu |
| Versi | 2.2 — Final Baseline (Edisi Bahasa Ramah) |
| Status | Siap eksekusi |
| Bahasa | Indonesia (semi formal, ramah pengguna) |
| Prinsip | **KISS · Clean Code · Encapsulation · Performance by Design** |

> 💡 **KISS** = *Keep It Simple, Stupid* → buat sesederhana mungkin.
> **Clean Code** → aturan main ditulis sekali, dipakai di mana-mana (konsisten).
> **Encapsulation** → setiap modul "tahu tugasnya sendiri", tidak ikut campur modul lain.
> **Performance by Design** → cepat itu bukan bonus, tapi syarat wajib sejak awal.

---

## 2. Ringkasan Eksekutif

**SchoolHub e-Hadir** adalah sistem kehadiran digital **dua lapis**.

> 🎯 **Gampangnya begini:**
> Kita punya dua "pos pemeriksaan kehadiran":
> 1. **Di gerbang** → semua orang tap kartu saat masuk/keluar sekolah.
> 2. **Di kelas** → guru mengabsen siswa lewat web saat pelajaran.
>
> Lalu sistem **mencocokkan** keduanya. Kalau si A tap di gerbang tapi tidak ada di kelas pas pelajaran, berarti bolos. Ketahuan otomatis.

```
┌────────────────────────────────────────────────────────┐
│  LAPIS 1 — KEHADIRAN SEKOLAH (Gerbang)                 │
│  Alat: Reader kartu chip di gerbang                    │
│  Aksi: Tap kartu saat masuk/keluar sekolah             │
│  Subjek: Siswa, Guru, Pegawai                          │
│  Output: Catatan IN/OUT per hari                       │
│  ── Arti sederhana: "Sudah sampai sekolah?" ──         │
└────────────────────────────────────────────────────────┘
                          ↓ sinkron
┌────────────────────────────────────────────────────────┐
│  LAPIS 2 — KEHADIRAN KELAS                             │
│  Alat: Web / tablet guru di kelas                      │
│  Aksi Siswa: Diinput manual oleh guru via web          │
│  Aksi Guru: Buka & tutup sesi = bukti hadir mengajar   │
│  Subjek: Siswa (per sesi) + Guru (per sesi ampuan)     │
│  ── Arti sederhana: "Beneran masuk kelas?" ──          │
└────────────────────────────────────────────────────────┘
                          ↓ sinkron
┌────────────────────────────────────────────────────────┐
│  REKONSILIASI (lintas lapis)                           │
│  Cross-check Lapis 1 vs Lapis 2                        │
│  Output: Flag anomali (bolos kelas, lupa tap, dll)     │
│  ── Arti sederhana: "Cocokkan data gerbang & kelas" ── │
└────────────────────────────────────────────────────────┘
```

**Tiga janji produk:**

1. **Sederhana** — satu alat per lapis, tidak ada jalur bercabang.
   *Gampangnya: guru tidak perlu belajar banyak cara absen.*
2. **Cepat** — tap kartu < 500 ms; input kelas < 1 detik per siswa.
   *Gampangnya: antri di gerbang tidak bikin telat masuk.*
3. **Terbukti** — setiap aksi sensitif terekam audit + rekonsiliasi lintas lapis.
   *Gampangnya: kalau ada yang curang atau salah, pasti ketahuan siapa, kapan, dan kenapa.*

---

## 3. Prinsip Produk (Tidak Bisa Ditawar)

### 3.1 KISS — Jaga Kesederhanaan

- **Satu metode per lapis**: Gerbang → kartu. Kelas → manual guru. Titik.
- Maksimal **3 klik** dari dasbor ke aksi apa pun.
- Fitur yang tidak dipakai 80% pengguna → sembunyikan di menu lanjutan.

> 💡 **Kenapa?** Guru tidak punya waktu untuk belajar aplikasi rumit. Semakin sedikit pilihan, semakin cepat kerjanya.

### 3.2 Clean Code — Rapi & Konsisten

- **DRY** (*Don't Repeat Yourself*): aturan bisnis ditulis **sekali saja** (Bab 9).
- **Penamaan konsisten**: istilah, label, dan status terkunci di Kamus (Bab 16).
- Tidak ada fitur yatim — setiap fitur punya tujuan terukur (KPI) dan pemiliknya.

> 💡 **Kenapa?** Biar istilah "ALPA" artinya selalu sama di mana pun di sistem. Tidak bingung.

### 3.3 Encapsulation — Modul Tahu Tugasnya Sendiri

- Sistem dipecah jadi **8 modul mandiri** (Bab 7).
- Antar modul hanya bicara lewat **event atau kontrak resmi**.

> 💡 **Kenapa?** Kalau suatu hari kita mau ganti cara absen gerbang (misal pakai wajah), modul lain tidak ikut rusak.

### 3.4 Performance by Design — Cepat Sejak Awal

- Target kecepatan ditulis di PRD, bukan ditambal belakangan (Bab 12).
- Operasi yang sering dibaca → wajib pakai cache.
- Operasi yang sering ditulis → wajib aman diulang (idempoten).

> 💡 **Kenapa?** Lambat 2 detik × 1.000 siswa = 33 menit hilang per hari. Kecepatan itu fondasi, bukan hiasan.

---

## 4. Latar Belakang & Tujuan

### 4.1 Masalah yang Diselesaikan

1. Rekap kehadiran **lambat** dan rawan salah input manual.
2. Sulit melacak siapa mengubah apa, kapan, dan kenapa.
3. Kecurangan presensi (titip absen, absen dari luar sekolah).
4. Data gerbang, kelas, dan guru **terpisah** — tidak bisa saling cek.
5. Manajemen tidak punya gambaran real-time tentang kondisi sekolah.
6. **Anomali disiplin tidak terdeteksi**: siswa bisa masuk sekolah tapi bolos kelas tanpa ketahuan.

> 💡 **Cerita lapangan:**
> "Si Budi tap kartu jam 07:00, tapi pas Matematika jam 08:00 dia hilang. Manual tidak kelihatan. Dengan sistem ini, otomatis muncul flag 'BOLOS_KELAS' di dasbor TU."

### 4.2 Tujuan Utama

1. Memangkas waktu rekap kehadiran dari berjam-jam → real-time.
2. Membuat presensi **tidak bisa dipalsukan** tanpa terdeteksi.
3. **Menyatukan gerbang + kelas** dalam satu model pencocokan.
4. Menyediakan fondasi yang bisa diperluas ke notifikasi orang tua, analitik, dan aplikasi mobile **tanpa perlu membangun ulang**.

### 4.3 KPI Terukur (Indikator Keberhasilan)

| KPI | Target | Cara Ukur | Arti Sederhana |
|---|---|---|---|
| Tap kartu → catatan tersimpan | p95 ≤ 500 ms | Event log | Tap tidak bikin antri |
| Input presensi kelas per siswa | ≤ 1 detik tap | UI timing | Guru tidak nunggu |
| Cakupan sesi ter-absen | ≥ 98% sesi `CLOSED` terisi | Rasio | Hampir semua pelajaran terabsen |
| Koreksi tanpa alasan | **0%** (dilarang sistem) | Query audit | Semua perubahan ada alasannya |
| Presensi di luar radius diterima | **0%** | Log `geofence_rejected` | Tidak bisa absen dari rumah |
| Duplikasi catatan per siswa/sesi | **0** | Constraint unik | Tidak ada absen dobel |
| **Anomali rekonsiliasi terdeteksi** | **100%** terflag | Rekonsiliasi harian | Semua kejanggalan muncul |
| Latency live monitor | p95 ≤ 2 detik | Selisih timestamp | Dasbor hampir real-time |
| Laporan bulanan | p95 ≤ 5 detik | Server timing | Laporan jadi hampir instan |

> 📖 **Istilah:**
> - **p95** = "95% dari semua kejadian". Misal "p95 ≤ 500 ms" artinya 95 dari 100 tap kartu harus selesai di bawah setengah detik.
> - **Flag** = penanda / tanda seru. Sistem cuma menandai, manusia yang memutuskan.

---

## 5. Stakeholder & Peran

### 5.1 Siapa Saja yang Terlibat

Kepala Madrasah · Wakil Kurikulum · Tata Usaha · Guru Mapel · Guru Piket · Siswa · Operator IT Sekolah

### 5.2 Matriks Peran (Siapa Boleh Ngapain)

| Peran | Baca | Tulis Sendiri | Input Kelas | Koreksi | Konfig | Audit |
|---|---|---|---|---|---|---|
| **ADMIN** | Semua | Ya | Ya | Ya | Ya | Ya |
| **TU** | Semua | Ya | Ya | Ya | Terbatas | Ya |
| **GURU_MAPEL** | Kelas ampuan | Ya | Sesi ampuan | Sesi ampuan | — | Aksinya sendiri |
| **GURU_PIKET** | Semua kelas | Ya | Sesi piket | — | — | Aksinya sendiri |
| **SISWA** | Data sendiri | — | — | — | — | — |

> 📖 **Arti kolom:**
> - **Baca** = boleh lihat data apa.
> - **Tulis Sendiri** = boleh update profil/data diri.
> - **Input Kelas** = boleh absen siswa.
> - **Koreksi** = boleh perbaiki data absen yang salah.
> - **Konfig** = boleh ubah pengaturan sistem.
> - **Audit** = boleh lihat catatan jejak aksi.

**Aturan kunci**: Pengguna hanya boleh memproses aksi untuk orang lain kalau **peran + cakupan objek** mengizinkan. Tidak ada pengecualian.

> 💡 **Contoh konkret:**
> Bu Ani (Guru Matematika X-1) **tidak bisa** absen siswa kelas Fisika XI-2 — karena itu bukan sesi ampuannya. Ini dijaga sistem, bukan sopan santun.

**Catatan khusus siswa**: Siswa **tidak pernah** input presensinya sendiri. Presensi siswa selalu hasil dari:
(a) tap kartu gerbang oleh siswa itu sendiri + (b) input manual oleh guru di kelas.

> 💡 **Kenapa begitu?** Biar tidak ada "titip absen lewat aplikasi". Kalau siswa bisa absen sendiri, sama saja dengan absen kertas.

---

## 6. Ruang Lingkup & Roadmap

### 6.1 In-Scope — Fase 1 (Baseline MVP)

Yang dikerjakan **sekarang**:

Identitas & peran · Data master akademik · Jadwal & sesi · **Tap kartu gerbang** · **Input presensi kelas oleh guru** · **Rekonsiliasi lintas lapis** · Kehadiran guru via aksi sesi · Koreksi beralasan · Audit · Laporan rekap & ekspor · Geofence · Live monitor scan · Pengaturan operasional

> 💡 **MVP** (*Minimum Viable Product*) = "versi paling ramping yang sudah berguna". Bukan versi final, tapi sudah bisa dipakai harian.

### 6.2 Out-of-Scope Fase 1 (Disiapkan Tempatnya untuk Nanti)

| Fitur masa depan | Nanti disambung lewat |
|---|---|
| Notifikasi WhatsApp/SMS ke orang tua | Event `attendance.recorded`, `reconciliation.anomaly` |
| QR presensi (untuk event khusus / UAS) | Attendance strategy pattern |
| Aplikasi mobile siswa/ortu/guru | API read-only dengan kontrak stabil per modul |
| Biometrik (sidik jari/wajah) di gerbang | Device adapter pluggable |
| Integrasi Dapodik/EMIS | Kontrak ekspor Academic module |
| Dashboard analitik & prediksi bolos | Konsumsi event ke BI read-model |
| Reader kartu di tiap kelas | Device module — tinggal tambah lokasi |

> 💡 **Arti tabel ini:** fitur-fitur di atas **belum dibuat sekarang**, tapi sistem sudah menyiapkan "colokan"-nya. Jadi nanti tinggal pasang, tidak perlu bongkar.

### 6.3 Roadmap 4 Fase

| Fase | Nama | Target | Isi Besarnya |
|---|---|---|---|
| 1 | **Baseline** (Fondasi) | 0–3 bulan | Semua In-Scope 6.1 |
| 2 | **Engagement** (Keterlibatan) | 4–6 bulan | Notifikasi ortu, mobile, papan disiplin |
| 3 | **Intelligence** (Analitik) | 7–9 bulan | Analitik kehadiran, prediksi dropout, BI |
| 4 | **Integration** (Integrasi) | 10–12 bulan | Dapodik, biometrik, multi-kampus |

---

## 7. Arsitektur Modular

> 💡 **Ibarat bangunan:** sistem dibagi menjadi "ruangan-ruangan" (modul). Tiap ruangan punya fungsi spesifik. Kalau mau renovasi satu ruangan, ruangan lain tidak ikut dibongkar.

```
┌─────────────────────────────────────────────────────────┐
│                    SchoolHub e-Hadir                    │
├─────────────┬──────────────┬────────────────────────────┤
│  IDENTITY   │  ACADEMIC    │  SCHEDULING                │
│  (Siapa?)   │  (Struktur)  │  (Kapan?)                  │
│  auth,      │  tahun,      │  jadwal → sesi             │
│  peran,     │  kelas,      │  lifecycle                 │
│  profil     │  mapel,      │                            │
│             │  siswa       │                            │
├─────────────┴──────────────┴────────────────────────────┤
│                    ATTENDANCE (inti)                    │
│         (Jantung sistem — catat kehadiran)              │
│   Gate (Lapis 1) · Class (Lapis 2) · Rekonsiliasi       │
├─────────────────────────────────────────────────────────┤
│  ACCESS       │  DEVICE         │  REPORTING           │
│  (Boleh?)     │  (Alatnya)      │  (Laporan)           │
│  geofence,    │  smart card,    │  rekap, ekspor,      │
│  kebijakan    │  reader,        │  live monitor,       │
│  akses        │  API key        │  read-only           │
├─────────────────────────────────────────────────────────┤
│                     AUDIT (lintas)                      │
│         (Buku harian: siapa berbuat apa & kapan)        │
│     Merekam aksi sensitif dari semua modul lain        │
└─────────────────────────────────────────────────────────┘
```

### 7.1 Tanggung Jawab Modul

| Modul | Tanggung Jawab | Tidak Tahu Tentang | Bahasa Ramah |
|---|---|---|---|
| **Identity** | Siapa kamu & apa hakmu | Jadwal, kelas, kartu | Pintu masuk & ID card |
| **Academic** | Struktur sekolah | Presensi | Daftar siswa, guru, kelas, mapel |
| **Scheduling** | Jadwal → siklus sesi | Cara siswa dicatat hadir | Kapan pelajaran mulai/selesai |
| **Attendance** | Catatan kehadiran 2 lapis + rekonsiliasi | Hardware yang dipakai | Buku absen digital |
| **Access** | Geofence & kebijakan akses | Jadwal kelas | Satpam digital: boleh masuk atau tidak |
| **Device** | Kartu, reader, sinyal scan | Sesi kelas | Urusan kartu & mesin pembaca |
| **Reporting** | Agregasi read-only | Menulis data operasional | Pembuat laporan |
| **Audit** | Rekam jejak | Logika bisnis modul sumber | CCTV sistem — merekam semua |

### 7.2 Aturan Komunikasi Antar-Modul

1. Modul tidak boleh **menulis** data modul lain. Baca saja, lewat kontrak publik.
2. Komunikasi real-time via **event** (kabar-kabari):
   - `session.opened`, `session.closed`, `session.missed` → sesi dibuka / ditutup / terlewat
   - `gate.tapped`, `gate.rejected` → tap diterima / ditolak
   - `class_attendance.recorded`, `class_attendance.corrected` → absen tercatat / dikoreksi
   - `reconciliation.anomaly_detected` → ada kejanggalan ketahuan
   - `card.linked`, `card.status_changed` → kartu ditautkan / statusnya berubah
3. Reporting **tidak di jalur utama** — laporan baca dari data yang sudah disiapkan (read-model), supaya tidak memperlambat input.
4. Audit **nguping** semua event. Tidak perlu dipanggil manual di mana-mana.

> 💡 **Ibarat WhatsApp grup:** tiap modul punya statusnya sendiri, tapi saling kabarin lewat "pesan" (event). Audit seperti admin grup yang menyimpan semua chat.

---

## 8. Kebutuhan Fungsional per Modul

> 📖 **Arti kode FR:** FR = *Functional Requirement* (kebutuhan fungsional). Kode seperti `FR-ID-01` berarti "kebutuhan nomor 01 modul Identity". Ini cuma nomor rujukan biar mudah dicari saat rapat.

### 8.1 Modul IDENTITY — Pintu Masuk & Hak Akses

> 💡 **Apa yang diatur di sini?** Siapa yang boleh login, pakai peran apa, dan apa yang boleh dia lakukan.

- **FR-ID-01** Login dengan identitas sekolah + kata sandi.
- **FR-ID-02** Validasi akun aktif (akun suspended/locked ditolak dengan pesan jelas).
- **FR-ID-03** Sesi akses aman, logout, dan kedaluwarsa otomatis setelah tidak aktif.
- **FR-ID-04** Lihat & perbarui profil sendiri sesuai hak.
- **FR-ID-05** Proteksi brute force (batasi percobaan login + kunci sementara kalau salah berkali-kali).

---

### 8.2 Modul ACADEMIC — Struktur Sekolah

> 💡 **Apa yang diatur di sini?** Semua data induk sekolah: tahun ajaran, kelas, mata pelajaran, guru, siswa, pegawai.

- **FR-AC-01** CRUD (Tambah/Ubah/Hapus/Lihat): Tahun Ajaran, Semester, Kelas, Mata Pelajaran, Guru, Siswa, Pegawai.
- **FR-AC-02** Pendaftaran Siswa ke Kelas per Tahun Ajaran.
- **FR-AC-03** Nama entitas unik per kunci bisnis (tidak boleh dua kelas "X-IPA-1" di tahun yang sama).
- **FR-AC-04** Hapus master data ditolak kalau masih dipakai proses operasional aktif.
- **FR-AC-05** Ekspor master data dalam format standar (siap untuk Dapodik).

---

### 8.3 Modul SCHEDULING — Jadwal & Sesi Pelajaran

> 💡 **Apa yang diatur di sini?** Membuat jadwal pelajaran, dan tiap hari jadwal itu berubah menjadi "sesi" nyata yang bisa dibuka/ditutup guru.

- **FR-SC-01** CRUD Jadwal Pelajaran (kelas, mapel, guru, hari, jam mulai, jam selesai, ruang).
- **FR-SC-02** Publikasi jadwal → otomatis generate Sesi harian sesuai tanggal efektif.
- **FR-SC-03** Siklus hidup sesi: `SCHEDULED` → `OPEN` → `CLOSED` (atau → `MISSED` kalau tidak dibuka).
- **FR-SC-04** Hanya peran berwenang yang boleh membuka/menutup sesi (guru mapel untuk sesinya, guru piket untuk pengganti, admin/TU untuk keadaan khusus).
- **FR-SC-05** Satu jadwal → satu sesi per tanggal (anti-duplikasi).
- **FR-SC-06** **Sesi auto-transisi ke `MISSED`** kalau tidak dibuka dalam X menit setelah jam mulai (X = konfigurasi, default 15 menit).
- **FR-SC-07** Sesi `CLOSED` atau `MISSED` hanya terima koreksi, tidak terima input presensi baru.

> 💡 **Analogi:** Jadwal = jadwal pelajaran di papan kelas. Sesi = pertemuan nyata di hari tertentu. Kalau guru tidak pernah buka sesinya dalam 15 menit pertama, sistem anggap "terlewat" (MISSED).

---

### 8.4 Modul ATTENDANCE — Jantung Sistem Kehadiran

Modul inti sistem. Dibagi menjadi **3 sub-domain + 1 engine rekonsiliasi**.

#### 8.4.1 Gate Attendance (Lapis 1 — Kehadiran Sekolah)

> 💡 **Apa yang terjadi?** Orang tap kartu di gerbang → sistem catat "sudah masuk sekolah" atau "sudah pulang".

- **FR-AT-G-01** Tap kartu di reader gerbang → catat arah IN/OUT.
- **FR-AT-G-02** Subjek: siswa, guru, pegawai (siapa saja yang punya kartu `ACTIVE`).
- **FR-AT-G-03** **Unik per (pengguna, tanggal, arah)** — tap berulang tidak bikin duplikasi (idempoten).
- **FR-AT-G-04** Validasi saat tap:
  - Kartu berstatus `ACTIVE` (bukan LOST/INACTIVE)
  - Kartu tertaut ke pengguna
  - Lokasi reader masih di dalam geofence sekolah
- **FR-AT-G-05** Tap valid → kirim event `gate.tapped`. Tap invalid → event `gate.rejected` + alasan.
- **FR-AT-G-06** Muncul di Live Monitor ≤ 2 detik.

> 💡 **Ilustrasi:** Budi tap kartu jam 07:03 pagi. Sistem catat "Budi, IN, 07:03, gerbang utama". Kalau Budi iseng tap lagi jam 07:04, sistem **tidak** nambah catatan baru — tetap satu IN hari itu.

#### 8.4.2 Student Class Attendance (Lapis 2 — Siswa)

> 💡 **Apa yang terjadi?** Guru buka web di kelas → daftar siswa muncul → guru tandai siapa hadir/izin/sakit/alpa.

- **FR-AT-CS-01** Guru membuka sesi di web → daftar siswa kelas itu muncul.
- **FR-AT-CS-02** Guru menandai status tiap siswa: `HADIR` · `TELAT` · `IZIN` · `SAKIT` · `ALPA`.
- **FR-AT-CS-03** Default saat sesi dibuka: **semua siswa `ALPA`** (harus aktif ditandai hadir).
- **FR-AT-CS-04** **Satu siswa → satu catatan per sesi** (constraint unik).
- **FR-AT-CS-05** Hanya siswa yang **terdaftar** di kelas sesi itu yang muncul di daftar.
- **FR-AT-CS-06** Guru menutup sesi → status terkunci; kirim event `class_attendance.recorded` untuk semua siswa di sesi itu.
- **FR-AT-CS-07** Input massal didukung (tandai semua hadir sekaligus, lalu edit yang tidak hadir).

> 💡 **Kenapa default ALPA?** Supaya guru **tidak bisa "lupa" tandai sesuatu**. Kalau default HADIR, dan siswa bolos, sistem bisa bohong. Dengan default ALPA, guru harus aktif konfirmasi.

#### 8.4.3 Teacher Class Attendance (Lapis 2 — Guru)

Kehadiran guru di kelas **tidak diinput manual**. Ia **diturunkan otomatis** dari aksi membuka & menutup sesi.

> 💡 **Gampangnya:** Guru buka sesi = guru sudah datang mengajar. Guru tutup sesi = guru sudah selesai mengajar. Tidak perlu absen terpisah.

- **FR-AT-CT-01** Saat guru membuka sesi:
  - Validasi geofence: lokasi perangkat guru harus ada di radius sekolah.
  - Catat `TeacherClassPresence` dengan waktu buka, guru, sesi, dan lokasi.
  - Status sesi menjadi `OPEN`.
- **FR-AT-CT-02** Status kehadiran guru otomatis:
  - Buka sesi ≤ jam mulai → `HADIR`
  - Buka sesi > jam mulai + grace period → `TELAT`
  - Sesi menjadi `MISSED` (tidak dibuka) → guru dicatat `ALPA_MENGAJAR` untuk sesi itu
- **FR-AT-CT-03** Saat guru menutup sesi:
  - Catat waktu tutup.
  - Kalau tutup < jam selesai terjadwal − threshold → flag "sesi dipotong".
- **FR-AT-CT-04** Guru **tidak bisa** membuka sesi di luar geofence (mencegah buka jarak jauh dari rumah/luar sekolah).
- **FR-AT-CT-05** Guru bisa setor izin `IZIN` / `SAKIT` / `DINAS_LUAR` di awal hari → sesi-sesi hari itu otomatis dialihkan ke guru piket atau ditandai `EXCUSED_ABSENCE`.

#### 8.4.4 Teacher Daily Attendance (Ringkasan Harian Guru)

Kehadiran guru harian **diturunkan** dari Gate Tap + status sesi-sesinya hari itu.

- **FR-AT-TD-01** Aturan derivasi harian:
  - Tap gerbang **ada** + ada sesi OPEN hari itu → `HADIR` (status per-sesi mengikuti 8.4.3)
  - Tap gerbang **ada** + tidak ada sesi karena jadwal kosong → `HADIR`
  - Tap gerbang **ada** + semua sesi `MISSED` → **flag anomali** (di sekolah tapi tidak mengajar)
  - Tidak ada tap gerbang + ada izin terdaftar → `IZIN` / `SAKIT` / `DINAS_LUAR`
  - Tidak ada tap gerbang + tidak ada izin → `ALPA`
- **FR-AT-TD-02** Satu guru → satu catatan harian (constraint unik).

#### 8.4.5 Rekonsiliasi (Reconciliation Engine) ⭐

> 💡 **Fitur paling berharga:** Ini yang membedakan sistem ini dari absen digital biasa. Engine otomatis **mencocokkan** data gerbang (Lapis 1) dengan data kelas (Lapis 2), lalu menandai kejanggalannya.

- **FR-AT-R-01** Aturan rekonsiliasi siswa per sesi:

| Gate (Lapis 1) | Kelas (Lapis 2) | Hasil | Flag |
|---|---|---|---|
| Tap IN | HADIR / TELAT | ✅ Normal | — |
| Tap IN | ALPA | ⚠️ **BOLOS_KELAS** | Siswa di sekolah tapi bolos |
| Tap IN | IZIN / SAKIT | ✅ Normal (izin saat di sekolah) | — |
| Tidak tap | HADIR / TELAT | ⚠️ **LUPA_TAP_GERBANG** | Kartu rusak? Lupa? |
| Tidak tap | ALPA | ✅ Konsisten alpa | — |
| Tidak tap | IZIN / SAKIT | ✅ Normal | — |

- **FR-AT-R-02** Aturan rekonsiliasi guru per hari:

| Gate | Sesi ampuan | Hasil | Flag |
|---|---|---|---|
| Tap IN | Semua OPEN & CLOSED | ✅ Normal | — |
| Tap IN | Ada `MISSED` | ⚠️ **TIDAK_MENGAJAR** | Di sekolah tapi lewat sesi |
| Tidak tap | Ada OPEN | ⚠️ **ANOMALI_BUKA_TANPA_GERBANG** | Proxy? Akun dipakai orang lain? |
| Tidak tap | Semua MISSED | ⚠️ **ALPA** (tanpa izin) | Perlu konfirmasi |

- **FR-AT-R-03** Semua flag menjadi event `reconciliation.anomaly_detected` → masuk dashboard disiplin.
- **FR-AT-R-04** **Flag tidak otomatis mengubah status** — hanya menandai untuk review manusia.
- **FR-AT-R-05** Admin/TU bisa menyelesaikan (resolve) flag dengan alasan (tercatat di audit).

> ⚠️ **Prinsip emas rekonsiliasi:** Sistem **menandai**, manusia **memutuskan**. Tidak ada siswa dihukum otomatis — selalu ada wali kelas yang verifikasi dulu.

#### 8.4.6 Koreksi Presensi

- **FR-AT-K-01** Peran berwenang bisa mengoreksi status presensi siswa/guru.
- **FR-AT-K-02** **Alasan wajib** (minimal 10 karakter, tidak boleh spam/tanda baca doang).
- **FR-AT-K-03** Guru mapel hanya bisa koreksi sesi ampuannya.
- **FR-AT-K-04** Sistem menyimpan: nilai sebelum, sesudah, alasan, pelaku, waktu → event `class_attendance.corrected`.
- **FR-AT-K-05** Koreksi pada sesi `CLOSED`/`MISSED` diizinkan (untuk perbaikan pasca-fakta, misal surat sakit terlambat).

---

### 8.5 Modul ACCESS — Satpam Digital

> 💡 **Apa yang diatur di sini?** Menentukan apakah suatu aksi (scan, buka sesi) dilakukan dari lokasi yang sah.

- **FR-AX-01** Geofence: titik koordinat sekolah + radius valid dalam meter.
- **FR-AX-02** Validasi scan kartu & buka sesi terhadap geofence.
- **FR-AX-03** Di luar radius → tolak dengan kode alasan yang jelas.
- **FR-AX-04** Konfigurasi titik/radius hanya boleh dilakukan peran berwenang (tercatat di audit).
- **FR-AX-05** Kebijakan global yang bisa di-on/off:
  - "Wajib tap gerbang masuk sebelum tercatat hadir kelas" (default: OFF, hanya jadi peringatan via rekonsiliasi).
  - "Wajib tap gerbang keluar sebelum sistem tandai OUT" (default: ON).

---

### 8.6 Modul DEVICE — Urusan Kartu & Mesin Pembaca

- **FR-DV-01** Daftar UID kartu chip fisik (RFID/NFC).
- **FR-DV-02** Tautkan kartu ke pengguna (siswa/guru/pegawai).
- **FR-DV-03** Status kartu: `ACTIVE` · `LOST` · `INACTIVE`.
- **FR-DV-04** Kartu `LOST`/`INACTIVE` → ditolak saat tap di gerbang.
- **FR-DV-05** Satu pengguna → maksimal **1 kartu ACTIVE** dalam satu waktu.
- **FR-DV-06** Reader gerbang otentikasi dengan API key (bisa dicabut kalau hilang/bocor).
- **FR-DV-07** Setiap tap menghasilkan event `card.scanned` → dikonsumsi modul Attendance.

---

### 8.7 Modul REPORTING — Laporan & Monitor

> 💡 **Apa yang disediakan di sini?** Semua laporan dan dashboard, tapi hanya **baca** — modul ini tidak pernah mengubah data.

- **FR-RP-01** Laporan yang tersedia:
  - **Rekap Kelas** — per sesi, per hari, per bulan
  - **Rekap Siswa** — riwayat lengkap individu
  - **Rekap Mapel** — per guru, per kelas
  - **Rekap Guru** — kehadiran + sesi mengajar
  - **Laporan Bulanan Guru**
  - **Audit Cakupan Sesi** — berapa sesi yang terisi vs kosong
  - **Papan Anomali Rekonsiliasi** — flag yang belum diselesaikan
- **FR-RP-02** Ekspor CSV / XLSX.
- **FR-RP-03** Live Monitor Scan: aliran event tap gerbang dan buka/tutup sesi secara real-time.
- **FR-RP-04** Modul ini **read-only** — tidak pernah menulis ke data operasional.
- **FR-RP-05** Laporan bulanan dari read-model ter-cache (p95 ≤ 5 detik).

---

### 8.8 Modul AUDIT — Buku Harian Sistem

> 💡 **Apa yang diatur di sini?** Sistem otomatis mencatat siapa melakukan apa, kapan, kenapa. Seperti CCTV, tapi untuk data.

- **FR-AU-01** Otomatis merekam semua event sensitif:
  - buka/tutup sesi · sesi `MISSED`
  - update pengaturan (geofence, kebijakan)
  - koreksi presensi
  - tindakan kartu (daftar, taut, lepas, ubah status)
  - perubahan peran pengguna
  - penyelesaian anomali rekonsiliasi
  - tap gerbang ditolak yang mencurigakan
- **FR-AU-02** Data audit minimal berisi: pelaku · peran · aksi · entitas · ID entitas · nilai sebelum · nilai sesudah · alasan (kalau ada) · waktu · IP/device (kalau relevan).
- **FR-AU-03** Audit **append-only** — tidak dapat diubah oleh peran apa pun, termasuk admin.
- **FR-AU-04** Filter per pelaku, tanggal, modul, dan aksi.

---

## 9. Aturan Bisnis Global (Satu Sumber Kebenaran)

> 💡 **Kenapa ini penting?** Semua aturan penting ditulis di satu tempat. Kalau ada pertanyaan "boleh tidak ya?" — jawabannya di sini. Tidak ada aturan tersebar di kepala masing-masing orang.

| No | Aturan | Cara Menegakkan | Arti Sederhana |
|---|---|---|---|
| RB-01 | Presensi siswa unik per sesi | Constraint DB + validasi app | Tidak ada siswa diabsen 2x di sesi yang sama |
| RB-02 | Kehadiran guru harian unik per tanggal | Constraint DB + validasi app | Satu guru, satu catatan per hari |
| RB-03 | Tap gerbang unik per (user, tgl, arah) — idempoten | Constraint + upsert | Tap berulang tidak bikin duplikasi |
| RB-04 | Koreksi tanpa alasan → **ditolak** | Validasi wajib + audit | Semua perubahan harus ada penjelasannya |
| RB-05 | Kartu `LOST` / `INACTIVE` → tidak valid | Cek status saat tap | Kartu hilang langsung tidak berfungsi |
| RB-06 | Siswa di sesi kelas harus terdaftar di kelas itu | Validasi saat daftar dimuat | Tidak bisa absen di kelas yang bukan kelasnya |
| RB-07 | Scan/buka sesi di luar radius geofence → ditolak | Hitung jarak | Tidak bisa absen dari rumah |
| RB-08 | Akses fitur = fungsi (peran, cakupan objek) | Gate di setiap entry point | Guru mapel tidak bisa buka sesi guru lain |
| RB-09 | Audit trail tidak dapat dimodifikasi | Append-only storage | Catatan jejak kebal edit |
| RB-10 | Satu pengguna → maksimal 1 kartu ACTIVE | Constraint unik | Tidak ada orang dengan 2 kartu aktif |
| RB-11 | Sesi CLOSED/MISSED hanya terima koreksi | Validasi sesi | Tidak bisa absen baru di sesi yang sudah selesai |
| RB-12 | **Sesi tidak dibuka dalam X menit → MISSED** | Scheduler otomatis | Sistem otomatis tandai sesi terlewat |
| RB-13 | **Rekonsiliasi otomatis tiap sesi tutup & end-of-day** | Scheduler | Kejanggalan langsung ketahuan |
| RB-14 | **Flag anomali tidak otomatis ubah status** | Logika engine | Sistem menandai, manusia memutuskan |
| RB-15 | Guru tidak bisa buka sesi dari luar geofence | Validasi saat buka | Harus benar-benar di sekolah |

---

## 10. Model Data Konseptual (Batas Aggregate)

> 💡 **Bahasa sederhana:** Ini peta "benda-benda" di sistem. Tiap kotak adalah satu jenis data. Anak panah menunjukkan hubungannya.

```
[IDENTITY] — Siapa saja yang pakai sistem
  └─ User (root)
      ├─ Credentials        (kata sandi, token)
      └─ RoleAssignment     (peran apa di mana)

[ACADEMIC] — Struktur sekolah
  ├─ AcademicYear (root) → Semester
  ├─ ClassRoom (root) → Enrollment   (daftar murid kelas)
  ├─ Subject (root)                   (mata pelajaran)
  ├─ Teacher (root) → ref User
  └─ Student (root) → ref User

[SCHEDULING] — Jadwal & sesi
  ├─ Schedule (root) → ref ClassRoom, Subject, Teacher, AcademicYear, Semester
  └─ Session (root) → ref Schedule
      (status: SCHEDULED → OPEN → CLOSED / MISSED)

[ATTENDANCE] — Catatan kehadiran
  ├─ GateLog (root) → ref User                    [Lapis 1]
  ├─ StudentAttendance (root)                     [Lapis 2 — siswa]
  │     → ref Student, Session
  ├─ TeacherClassPresence (root)                  [Lapis 2 — guru]
  │     → ref Teacher, Session
  │     (otomatis dari buka/tutup sesi)
  ├─ TeacherDailyAttendance (root)                [Derivasi harian]
  │     → ref Teacher (unik per tanggal)
  ├─ ReconciliationFlag (root)                    [Lintas lapis]
  │     → ref StudentAttendance | TeacherDailyAttendance
  └─ Correction (value object)                    (koreksi absen)

[ACCESS] — Kebijakan akses
  └─ GeofencePolicy (root, konfigurasi)

[DEVICE] — Kartu & reader
  ├─ SmartCard (root) → opsional ref User
  └─ ReaderDevice (root, API key)

[AUDIT] — Buku harian sistem
  └─ AuditEntry (root, append-only)
```

### Kontrak Relasi Kunci

- `User` adalah identitas tunggal; `Teacher`/`Student` itu "topengnya" di dunia akademik.
- `Session` selalu berasal dari `Schedule`. **Tidak ada sesi mengambang** tanpa jadwal.
- `StudentAttendance` mengikat `(Student, Session)` — tidak ada presensi tanpa sesi.
- `TeacherClassPresence` diturunkan dari aksi buka/tutup sesi, **tidak pernah diinput manual**.
- `ReconciliationFlag` hanya dihasilkan engine, **tidak pernah dibuat manual**.
- `SmartCard` bisa ada tanpa pemilik (stok kartu), tapi tidak bisa dipakai tap dalam kondisi itu.

---

## 11. UX & Alur Pengguna

### 11.1 Prinsip Visual

Tema gelap elegan · aksen gradien ungu-biru · efek kaca (glass/blur) halus · layout padat informasi tapi tetap terindeks visual · kontras minimal 4.5:1.

> 💡 **Kenapa tema gelap?** Ruang guru dan ruang kontrol sering kali cahayanya rendah. Tema gelap lebih nyaman di mata saat dipakai lama.

### 11.2 Prinsip Interaksi

1. Navigasi utama selalu **1 klik**.
2. Aksi primer menonjol (warna aksen + ukuran lebih besar).
3. Feedback visual < 100 ms untuk setiap interaksi.
4. Tidak ada animasi yang menunda kerja.

> 💡 **Artinya:** Kalau guru klik "Buka Sesi", tombolnya harus langsung merespon. Tidak boleh ada loading berputar 3 detik.

### 11.3 Alur Utama Guru — Input Presensi Kelas (aksi paling sering)

```
1. Guru tap kartu di gerbang (pagi)                  ← Lapis 1
2. Guru masuk web / tablet di kelas
3. Dasbor guru → kartu "Sesi Aktif Hari Ini"
4. Klik sesi yang dimulai → tombol [Buka Sesi]
5. Sistem validasi geofence → sesi OPEN             ← Lapis 2 (guru ter-catat)
6. Daftar siswa muncul (default semua ALPA)
7. Guru tap "HADIR SEMUA" → lalu edit yg izin/sakit/tidak hadir
8. Klik [Tutup Sesi]                                 ← Sesi CLOSED
9. Sistem jalankan rekonsiliasi otomatis
```

**Target**: Langkah 4–8 selesai dalam **< 30 detik untuk kelas 30 siswa**.

> 💡 **Gampangnya:** Buka → tandai → tutup. Selesai dalam setengah menit. Guru fokus mengajar, bukan mengisi form.

### 11.4 Struktur Menu (dengan Penjelasan Ramah)

#### 🛠️ Menu Admin / TU

```
🏠 Dasbor
    └── Halaman ringkas: "Hari ini apa saja yang perlu perhatian?"

📋 Operasional — urusan harian yang berjalan
    ├── Pemantauan Sesi (live)
    │       "Sesi mana yang sedang OPEN, siapa gurunya, sudah berapa siswa tertandai"
    ├── Riwayat Absen
    │       "Cari absen siapa saja, tanggal berapa, kelas mana"
    ├── Papan Anomali Rekonsiliasi                ← NEW
    │       "Daftar kejanggalan yang perlu ditindaklanjuti (bolos, lupa tap, dll)"
    └── Buku Piket
            "Catatan guru piket: siapa bertugas, kejadian apa saja hari ini"

👥 Master Data — data induk sekolah
    ├── Pengguna (guru/siswa/pegawai)
    │       "Tambah/ubah/nonaktifkan akun pengguna"
    ├── Struktur Akademik (tahun/semester/kelas/mapel)
    │       "Atur daftar tahun ajaran, kelas, dan mata pelajaran"
    └── Pendaftaran Kelas
            "Daftarkan siswa ke kelasnya per tahun ajaran"

📅 Jadwal & Sesi
    └── "Atur jadwal pelajaran mingguan; sistem otomatis buat sesi harian"

💳 Perangkat — urusan kartu & mesin
    ├── Smart Card
    │       "Daftar kartu fisik, tautkan ke pengguna, atur status (ACTIVE/LOST)"
    └── Reader & API Keys
            "Kelola mesin pembaca kartu di gerbang + kunci API-nya"

📊 Laporan — semua laporan cetak & ekspor
    ├── Rekap (Kelas/Siswa/Mapel/Guru)
    │       "Ringkasan kehadiran menurut berbagai sudut pandang"
    ├── Laporan Bulanan Guru
    │       "Rekap bulanan siap tanda tangan"
    ├── Audit Cakupan
    │       "Berapa persen sesi yang terisi absennya"
    └── Live Monitor
            "Layar pantau real-time: siapa sedang tap gerbang, sesi mana sedang dibuka"

⚙️ Sistem — pengaturan & riwayat
    ├── Pengaturan (geofence, kebijakan, grace period)
    │       "Atur radius sekolah, toleransi terlambat, aturan global"
    └── Catatan Audit
            "Buku harian sistem: siapa mengubah apa, kapan, kenapa"
```

#### 👨‍🏫 Menu Guru

```
🏠 Dasbor (sesi hari ini)
    └── "Lihat sesi apa saja yang Anda ampu hari ini, mana yang sudah/belum dibuka"

📝 Input Presensi Kelas                         ← Aksi utama
    └── "Buka sesi → tandai siswa hadir/izin/sakit/alpa → tutup sesi"

✏️ Koreksi Presensi
    └── "Perbaiki absen yang salah (wajib isi alasan)"

📊 Rekap Kelas Ampuan
    └── "Lihat rekap kehadiran siswa di kelas yang Anda ampu"

👤 Kehadiran Saya
    └── "Rekap kehadiran pribadi: sesi mana yang sudah Anda buka/tutup"
```

#### 🎓 Menu Siswa

```
🏠 Dasbor (riwayat kehadiran sendiri)
    └── "Lihat catatan kehadiran sendiri; tidak bisa mengubah apa pun"
```

### 11.5 Aksesibilitas

- Fokus keyboard terlihat jelas.
- Target sentuh minimal 44×44 piksel (nyaman di tablet).
- Ikon tanpa teks wajib punya label aksesibel (untuk screen reader).

---

## 12. Persyaratan Non-Fungsional (Terukur)

### 12.1 Kinerja — Target Kecepatan

| Operasi | Target p95 | Beban puncak | Arti Sederhana |
|---|---|---|---|
| Tap kartu → catatan tersimpan | ≤ 500 ms | 50 tap/detik serentak | Tidak antri di gerbang |
| Validasi geofence | ≤ 50 ms | — | Cek lokasi instan |
| Buka dasbor guru | ≤ 1 detik | 100 guru concurrent | Masuk web cepat |
| Buka sesi + tampil daftar siswa | ≤ 1 detik | Kelas ~30 siswa | Klik → langsung siap input |
| Input presensi (per klik status) | ≤ 100 ms feedback | — | Klik tidak nunggu |
| Tutup sesi + rekonsiliasi | ≤ 2 detik | — | Selesai mengajar, selesai absen |
| Live feed latency | ≤ 2 detik | 200 event/menit | Dasbor hampir real-time |
| Laporan bulanan | ≤ 5 detik | 1 kelas × 1 bulan | Cetak laporan cepat |
| Ekspor CSV 1 bulan sekolah | ≤ 10 detik | — | Download data besar masih wajar |

### 12.2 Strategi Kinerja (Level Produk)

1. **Read-model terpisah** untuk laporan → tidak ganggu jalur write.
2. **Event-driven** antar modul → tidak ada rantai tunggu.
3. **Idempoten** di semua endpoint tulis → aman diulang.
4. **Cache** master data yang jarang berubah (TTL per jenis).
5. **Batch insert** untuk event log & audit.
6. **Pre-populate** daftar siswa saat buka sesi (tidak query ulang saat input).

> 💡 **Gampangnya:** data laporan disiapkan terpisah, jadi saat ada rapat mendadak laporannya sudah siap dalam hitungan detik.

### 12.3 Keandalan

- Gangguan jaringan sementara di reader → tap mengantri di lokal, retry otomatis saat jaringan kembali.
- Integritas data saat aksi bersamaan → optimistic lock pada sesi.
- Target uptime: **99.5%** selama jam sekolah (06:30–16:00 WIB).

### 12.4 Skalabilitas

- Mendukung 5.000+ siswa tanpa rebuild.
- Reporting bisa di-scale horizontal terpisah.
- Database siap di-partition per tahun ajaran.

### 12.5 Keamanan

- Password: kompleksitas minimum + rotasi berkala.
- Sesi login ber-TTL, bisa dicabut admin kalau ada masalah.
- RBAC (kontrol peran) di setiap entry point sensitif.
- Audit **append-only** — tidak bisa dihapus.
- Data siswa/guru = data sensitif (retensi & akses terkontrol).
- Tidak ada kredensial hardcoded di produksi.

---

## 13. Skenario Utama

### 13.1 Happy Path A — Siswa Normal

> 💡 **Skenario "semua berjalan mulus" untuk siswa.**

1. **Pagi**: siswa tap kartu di gerbang → `GateLog` IN tercatat.
2. **Jam 08:00**: guru buka sesi Matematika di kelas X-1 via web.
3. Guru tandai siswa: 28 `HADIR`, 1 `IZIN` (surat izin sakit), 1 `ALPA`.
4. **Jam 08:45**: guru tutup sesi.
5. **Rekonsiliasi otomatis berjalan**:
   - 28 siswa `HADIR` + tap gerbang → ✅ normal
   - 1 siswa `ALPA` + tap gerbang → ⚠️ flag **`BOLOS_KELAS`**
   - 1 siswa `IZIN` + tidak tap gerbang → ✅ normal
6. Event `class_attendance.recorded` × 30 + `reconciliation.anomaly_detected` × 1.
7. Dasbor TU menampilkan flag bolos → wali kelas menindaklanjuti.

### 13.2 Happy Path B — Guru Normal

1. Pagi: guru tap kartu di gerbang → `GateLog` IN.
2. Jam 08:00: guru buka sesi → geofence valid → `TeacherClassPresence` `HADIR`.
3. Jam 08:45: guru tutup sesi → status `CLOSED`.
4. Berlanjut ke sesi-sesi lain hari itu.
5. Akhir hari: `TeacherDailyAttendance` disimpulkan `HADIR`, semua sesi OPEN/CLOSED.

### 13.3 Skenario C — Guru Tidak Membuka Sesi

1. Guru tap gerbang pagi (sudah di sekolah).
2. Jam 08:00 sesi terjadwal tapi guru tidak membukanya.
3. Jam 08:15 (grace period habis) → sistem auto-transisi sesi → `MISSED`.
4. Akhir hari rekonsiliasi → flag **`TIDAK_MENGAJAR`** untuk guru itu.
5. Admin/TU review → bisa resolve (misal guru izin mendadak, lupa input) atau diteruskan ke urusan disiplin.

### 13.4 Skenario D — Koreksi Presensi

1. Wali kelas sadar ada salah input 2 hari lalu (siswa dicatat `ALPA` padahal bawa surat sakit yang telat diserahkan).
2. Buka **Riwayat Absen** → pilih catatan → ubah ke `SAKIT` → isi alasan "Surat sakit diserahkan 2 hari terlambat".
3. Sistem simpan: before/after + pelaku + waktu → event `class_attendance.corrected`.
4. Flag rekonsiliasi otomatis diperbarui kalau relevan.

### 13.5 Negative Cases (Skenario Gagal)

> 💡 **Apa yang terjadi kalau ada yang coba curang atau error terjadi?**

| Kasus | Respon Sistem |
|---|---|
| Kartu LOST/INACTIVE di-tap | Tolak + catat log + bunyi reader "invalid" |
| Tap di reader di luar geofence | Tolak dengan pesan "Reader di luar area" |
| Guru coba buka sesi dari rumah | Tolak "Di luar area sekolah" |
| Guru coba buka sesi yang bukan ampuannya | Tolak "Bukan sesi Anda" |
| Dua orang tap kartu yang sama dalam < 3 detik | Idempoten, tidak duplikasi |
| Koreksi tanpa alasan / alasan < 10 karakter | Tolak |
| Siswa bukan anggota kelas muncul di daftar | Tidak mungkin (hanya enrolled yang dimuat) |
| Jaringan putus saat tap di gerbang | Reader antre lokal, retry otomatis |
| Jaringan putus saat input kelas | Web offline-first: simpan lokal, sinkron saat online |

---

## 14. Kriteria Penerimaan (UAT — User Acceptance Test)

> 💡 **UAT** = ujian akhir sebelum sistem dipakai resmi. Semua checklist di bawah harus dicentang hijau.

### 14.1 Admin / TU

- [ ] Kelola semua master data tanpa error.
- [ ] Konfigurasi geofence + kebijakan + grace period berfungsi.
- [ ] Lihat semua laporan + ekspor semua format.
- [ ] Kelola smart card + reader + API key.
- [ ] Resolve flag rekonsiliasi dengan alasan.
- [ ] Lihat audit log lengkap dengan filter.

### 14.2 Guru Mapel

- [ ] Hanya sesi ampuannya yang muncul di dasbor.
- [ ] Buka sesi hanya dari area sekolah (geofence).
- [ ] Input presensi 30 siswa < 30 detik.
- [ ] Tutup sesi → rekonsiliasi otomatis berjalan.
- [ ] Koreksi sesi ampuannya (alasan wajib).
- [ ] Lihat kehadiran pribadi harian.

### 14.3 Guru Piket

- [ ] Lihat semua sesi hari berjalan.
- [ ] Gantikan buka sesi kalau guru mapel tidak hadir (diotorisasi).
- [ ] Catat anomali gerbang manual kalau perlu.

### 14.4 Siswa

- [ ] Tap kartu di gerbang → catatan masuk.
- [ ] Lihat riwayat kehadiran sendiri.
- [ ] Tidak bisa akses fungsi admin/guru (403 Forbidden).

### 14.5 Engine Rekonsiliasi

- [ ] Setiap kombinasi di tabel FR-AT-R-01 & R-02 terdeteksi dengan benar.
- [ ] Flag muncul di Papan Anomali dalam ≤ 2 detik setelah tutup sesi.
- [ ] Resolve flag tersimpan + tercatat di audit.

### 14.6 Smart Card

- [ ] Tap valid → catatan + Live Monitor ≤ 2 detik.
- [ ] Tap invalid → alasan jelas + log.

---

## 15. Rencana Eksekusi

### 15.1 Urutan Build (Sadar Dependensi)

> 💡 **Kenapa urut begini?** Tidak mungkin bikin modul ATTENDANCE tanpa ada ACADEMIC dan SCHEDULING dulu. Jadi urutan ini mengikuti ketergantungan logis.

```
1. IDENTITY ──┐
2. ACADEMIC ──┼──→ 3. SCHEDULING ──→ 4. CLASS ATTENDANCE (input guru)
                                           │
5. DEVICE (Card) ──┐                       │
6. ACCESS (Geofence) ─┴──→ 7. GATE ATTENDANCE
                                           │
                                           ↓
                                  8. RECONCILIATION ENGINE
                                           │
                                  9. REPORTING & LIVE MONITOR

10. AUDIT (aktif sejak awal, subscribe event semua modul)
```

### 15.2 Definition of Done Fase 1 (Kapan Fase 1 Dinyatakan Selesai?)

1. Semua FR di Bab 8 berfungsi sesuai RB Bab 9.
2. Semua KPI Bab 4.3 tercapai pada beban uji.
3. Semua skenario Bab 13 & UAT Bab 14 lulus.
4. Target performa Bab 12 tercapai pada p95.
5. Audit aktif untuk seluruh aksi sensitif.
6. Rekonsiliasi berjalan otomatis + flag valid.
7. **Tidak ada fitur Fase 2–4 yang bocor ke Fase 1.**

---

## 16. Kamus Status & Glosarium

> 💡 **Kenapa ada kamus?** Supaya semua orang memakai kata yang sama dengan arti yang sama. "ALPA" artinya harus selalu sama di mana pun di sistem.

### 16.1 Status Sesi

| Status | Arti |
|---|---|
| `SCHEDULED` | Terjadwal, belum dibuka guru |
| `OPEN` | Sedang berlangsung — sudah dibuka guru |
| `CLOSED` | Sudah ditutup normal oleh guru |
| `MISSED` | Terlewat — tidak dibuka dalam grace period |

### 16.2 Status Kehadiran Siswa (per sesi)

| Status | Arti |
|---|---|
| `HADIR` | Hadir tepat waktu |
| `TELAT` | Hadir tapi terlambat dari toleransi |
| `IZIN` | Tidak hadir dengan izin resmi |
| `SAKIT` | Tidak hadir karena sakit (ada surat) |
| `ALPA` | Tidak hadir tanpa keterangan |

### 16.3 Status Kehadiran Guru — Per Sesi Ampuan

| Status | Arti |
|---|---|
| `HADIR` | Buka sesi tepat waktu |
| `TELAT` | Buka sesi setelah grace period |
| `EXCUSED_ABSENCE` | Tidak mengajar dengan izin sah |
| `ALPA_MENGAJAR` | Tidak mengajar tanpa keterangan |

### 16.4 Status Kehadiran Guru — Harian (Derivasi)

`HADIR` · `TELAT` · `IZIN` · `SAKIT` · `DINAS_LUAR` · `ALPA`

### 16.5 Status Kartu

| Status | Arti |
|---|---|
| `ACTIVE` | Aktif, bisa dipakai |
| `LOST` | Hilang, diblokir |
| `INACTIVE` | Dinonaktifkan (misal siswa sudah lulus) |

### 16.6 Arah Gerbang

| Arah | Arti |
|---|---|
| `IN` | Masuk sekolah |
| `OUT` | Keluar sekolah |

### 16.7 Metode Presensi (Baseline)

- **Gerbang**: `CARD` (satu-satunya metode)
- **Kelas**: `MANUAL` oleh guru (satu-satunya metode)
- `QR`, `BIOMETRIC`, `FACE` — tersedia sebagai Extension Points, **bukan baseline**.

### 16.8 Flag Rekonsiliasi

| Flag | Arti Bahasa Sederhana |
|---|---|
| `BOLOS_KELAS` | Siswa tap gerbang tapi tidak ada di kelas |
| `LUPA_TAP_GERBANG` | Siswa hadir di kelas tapi tidak ada catatan tap (kartu rusak / lupa?) |
| `TIDAK_MENGAJAR` | Guru ada di sekolah tapi sesinya MISSED |
| `ANOMALI_BUKA_TANPA_GERBANG` | Sesi dibuka tapi gurunya tidak ada catatan tap gerbang (mencurigakan) |
| `ALPA` | Guru tidak tap gerbang dan semua sesi MISSED tanpa izin |

### 16.9 Istilah Kunci

| Istilah | Arti |
|---|---|
| **Sesi** | Pertemuan harian hasil dari jadwal; satu konteks untuk presensi kelas |
| **Lapis 1 (Gate)** | Kehadiran di area sekolah, via tap kartu |
| **Lapis 2 (Kelas)** | Kehadiran di kelas — siswa via input guru, guru via aksi sesi |
| **Rekonsiliasi** | Cross-check lintas lapis; hasilkan flag anomali |
| **Geofence** | Area lingkaran valid (titik + radius) tempat aksi diizinkan |
| **Grace period** | Toleransi menit sebelum status berubah (HADIR→TELAT, OPEN→MISSED) |
| **Idempoten** | Operasi aman diulang; hasilnya tetap sama |
| **Event** | Notifikasi internal antar-modul, bisa dikonsumsi bebas tanpa saling bergantung |

---

## 17. Extension Points (Titik Pengembangan Masa Depan)

> 💡 **Apa ini?** Tempat-tempat di mana sistem **siap diperluas** tanpa perlu dibangun ulang. Ini jaminan bahwa investasi di Fase 1 tidak akan sia-sia saat mau tumbuh ke Fase 2–4.

| Extension Point | Lokasi | Nilai masa depan |
|---|---|---|
| Event `class_attendance.recorded` | Attendance | Notifikasi WhatsApp ke ortu, push notif, webhook |
| Event `reconciliation.anomaly_detected` | Attendance | Peringatan disiplin otomatis ke wali kelas & ortu |
| Event `gate.tapped` | Attendance | Integrasi CCTV, palang otomatis, pemberitahuan "anak sudah di sekolah" |
| Strategi metode presensi | Attendance (pattern) | Tambah `QR`, `BIOMETRIC`, `FACE` tanpa rebuild |
| Adapter reader device | Device | Reader tipe baru (USB, serial, network, dsb.) |
| Kontrak ekspor master | Academic | Sinkron dua arah dengan Dapodik/EMIS |
| Read-model reporting | Reporting | BI tools (Metabase, Superset, Power BI) |
| API publik read-only | Semua modul | Aplikasi mobile siswa/ortu/guru |
| Plugin notifikasi | Lintas modul via event | Email, WhatsApp, Telegram, SMS, push |
| Modul Analitik Disiplin | Modul baru, konsumsi event | Deteksi pola bolos, prediksi dropout, skor disiplin |
| Reader kartu per kelas | Device | Tinggal tambah lokasi kalau suatu hari ingin "dual tap" |

---

## 18. Catatan Penutup

Dokumen ini adalah **kontrak perilaku produk** dengan disiplin KISS, Clean Code, Encapsulation, dan Performance by Design.

### ⚖️ Tiga Prinsip yang Harus Dijaga Selama Pengembangan

1. **Dua lapis kehadiran tidak boleh dicampur.**
   > Gate = kartu. Kelas = manual guru. Titik.

2. **Rekonsiliasi hanya menandai, tidak mengubah.**
   > Sistem menandai, manusia memutuskan.

3. **Fitur baru masuk via Extension Point, bukan merombak modul inti.**
   > Kalau ada fitur yang "memaksa" ubah modul inti, itu tanda perlu revisi PRD, bukan tambal sulam.

### 🧭 Pertanyaan Uji Diri Saat Ada Fitur Baru Diusulkan

> "Fitur X ini masuk ke modul mana?"

Jawabannya **harus** bisa ditemukan di salah satu dari:
- 8 modul di Bab 7, atau
- Extension Point di Bab 17.

Kalau tidak bisa dicocokkan ke dua tempat itu — berarti itu pertanda **modul baru** atau **revisi PRD berikutnya**, bukan penambalan cepat.

---

**— SELESAI —**

> 📌 **Untuk pembaca non-teknis:** kalau ada istilah yang masih bikin bingung, cek Bab 16 (Kamus). Kalau masih ragu, tanyakan ke tim teknis — dokumen ini dirancang supaya bisa jadi jembatan antara sekolah dan tim developer.
