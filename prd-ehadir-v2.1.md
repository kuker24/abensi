# PRD — SchoolHub e-Hadir MAN 1 Rokan Hulu
## Versi 2.1 — Final Baseline

---

## 0. Perubahan dari v2.0

| Area | v2.0 | v2.1 | Alasan |
|---|---|---|---|
| Metode kelas | Card primer, QR fallback, Manual rescue | **Manual oleh guru** (satu-satunya metode baseline) | Sesuai realita: guru input di web |
| Peran kartu | Untuk gerbang & kelas | **Hanya untuk gerbang** | KISS — kartu di satu tempat saja |
| Kehadiran guru di kelas | Samar | **Berbasis aksi sesi** (buka/tutup sesi = bukti mengajar) | KISS + tanpa hardware tambahan |
| QR | Di modul inti | **Dipindah ke Extension Points** | Tidak dipakai baseline, bisa ditambah nanti |
| Rekonsiliasi | Tidak ada | **Modul baru (8.5)** | Cross-check 2 lapis = gold untuk disiplin |
| Model kehadiran | 1 lapis | **2 lapis eksplisit** (Gate + Kelas) | Sesuai realita sekolah |

---

## 1. Identitas Dokumen

| Field | Nilai |
|---|---|
| Produk | SchoolHub e-Hadir MAN 1 Rokan Hulu |
| Versi | 2.1 — Final Baseline |
| Status | Siap eksekusi |
| Bahasa | Indonesia |
| Prinsip | **KISS · Clean Code · Encapsulation · Performance by Design** |

---

## 2. Ringkasan Eksekutif

**SchoolHub e-Hadir** adalah sistem kehadiran digital **dua lapis**:

```
┌────────────────────────────────────────────────────────┐
│  LAPIS 1 — KEHADIRAN SEKOLAH (Gerbang)                 │
│  Alat: Reader kartu chip di gerbang                    │
│  Aksi: Tap kartu saat masuk/keluar sekolah             │
│  Subjek: Siswa, Guru, Pegawai                          │
│  Output: Catatan IN/OUT per hari                       │
└────────────────────────────────────────────────────────┘
                          ↓ sinkron
┌────────────────────────────────────────────────────────┐
│  LAPIS 2 — KEHADIRAN KELAS                             │
│  Alat: Web / tablet guru di kelas                      │
│  Aksi Siswa: Diinput manual oleh guru via web          │
│  Aksi Guru: Buka & tutup sesi = bukti hadir mengajar   │
│  Subjek: Siswa (per sesi) + Guru (per sesi ampuan)     │
└────────────────────────────────────────────────────────┘
                          ↓ sinkron
┌────────────────────────────────────────────────────────┐
│  REKONSILIASI (lintas lapis)                           │
│  Cross-check Lapis 1 vs Lapis 2                        │
│  Output: Flag anomali (bolos kelas, lupa tap, dll)     │
└────────────────────────────────────────────────────────┘
```

Tiga janji produk:
1. **Sederhana** — satu alat per lapis, tidak ada jalur bercabang.
2. **Cepat** — tap kartu < 500 ms; input kelas < 1 detik per siswa.
3. **Terbukti** — setiap aksi sensitif terekam audit + rekonsiliasi lintas lapis.

---

## 3. Prinsip Produk (Non-negotiable)

### 3.1 KISS
- **Satu metode per lapis**: Gerbang → kartu. Kelas → manual guru.
- Maksimal 3 klik dari dasbor ke aksi apa pun.
- Fitur yang tidak dipakai 80% pengguna → menu lanjutan.

### 3.2 Clean Code (Product Level)
- **DRY**: aturan bisnis dinyatakan satu kali (Bab 9).
- **Penamaan konsisten**: status, label, istilah terkunci di Kamus (Bab 16).
- Tidak ada fitur yatim — setiap fitur punya KPI dan modul pemilik.

### 3.3 Encapsulation
- Sistem dipecah jadi **8 modul bounded** (Bab 7).
- Komunikasi antar-modul hanya via **event atau kontrak publik**.

### 3.4 Performance by Design
- Target performa ditulis di PRD, bukan ditambal belakangan (Bab 12).
- Operasi read-heavy wajib punya strategi cache.
- Operasi write-heavy wajib idempoten.

---

## 4. Latar Belakang & Tujuan

### 4.1 Masalah yang Diselesaikan
1. Rekap kehadiran lambat dan rawan salah input.
2. Sulit melacak siapa mengubah apa, kapan, kenapa.
3. Kecurangan presensi (titip absen, absen dari luar sekolah).
4. Data gerbang, kelas, dan guru terpisah — tidak bisa lintas-cek.
5. Manajemen tidak punya pandangan real-time.
6. **Anomali disiplin tidak terdeteksi**: siswa bisa masuk sekolah tapi bolos kelas tanpa ketahuan.

### 4.2 Tujuan Utama
1. Memangkas waktu rekap kehadiran dari jam/hari → real-time.
2. Membuat presensi tidak bisa dipalsukan tanpa terdeteksi.
3. **Menyatukan gerbang + kelas** dalam satu model rekonsiliasi.
4. Menyediakan fondasi yang bisa diekspansi ke notifikasi ortu, analitik, mobile tanpa rebuild.

### 4.3 KPI Terukur

| KPI | Target | Cara Ukur |
|---|---|---|
| Tap kartu → catatan tersimpan | p95 ≤ 500 ms | Event log |
| Input presensi kelas per siswa | ≤ 1 detik tap | UI timing |
| Cakupan sesi ter-absen | ≥ 98% sesi `CLOSED` terisi | Rasio |
| Koreksi tanpa alasan | **0%** (dilarang sistem) | Query audit |
| Presensi di luar radius diterima | **0%** | Log `geofence_rejected` |
| Duplikasi catatan per siswa/sesi | **0** | Constraint unik |
| **Anomali rekonsiliasi terdeteksi** | **100%** terflag | Rekonsiliasi harian |
| Latency live monitor | p95 ≤ 2 detik | Selisih timestamp |
| Laporan bulanan | p95 ≤ 5 detik | Server timing |

---

## 5. Stakeholder & Peran

### 5.1 Stakeholder
Kepala Madrasah · Wakil Kurikulum · Tata Usaha · Guru Mapel · Guru Piket · Siswa · Operator IT Sekolah

### 5.2 Matriks Peran

| Peran | Baca | Tulis Sendiri | Input Kelas | Koreksi | Konfig | Audit |
|---|---|---|---|---|---|---|
| **ADMIN** | Semua | Ya | Ya | Ya | Ya | Ya |
| **TU** | Semua | Ya | Ya | Ya | Terbatas | Ya |
| **GURU_MAPEL** | Kelas ampuan | Ya | Sesi ampuan | Sesi ampuan | — | Aksinya sendiri |
| **GURU_PIKET** | Semua kelas | Ya | Sesi piket | — | — | Aksinya sendiri |
| **SISWA** | Data sendiri | — | — | — | — | — |

**Aturan kunci**: Pengguna hanya memproses aksi untuk orang lain jika peran + cakupan objek mengizinkan. Tidak ada pengecualian.

**Catatan siswa**: Siswa **tidak pernah** input presensinya sendiri. Presensi siswa selalu hasil (a) tap kartu gerbang oleh siswa + (b) input manual oleh guru di kelas.

---

## 6. Ruang Lingkup & Roadmap

### 6.1 In-Scope — Fase 1 (Baseline MVP)
Identitas & peran · Data master akademik · Jadwal & sesi · **Tap kartu gerbang** · **Input presensi kelas oleh guru** · **Rekonsiliasi lintas lapis** · Kehadiran guru via aksi sesi · Koreksi beralasan · Audit · Laporan rekap & ekspor · Geofence · Live monitor scan · Pengaturan operasional

### 6.2 Out-of-Scope Fase 1 (Extension Points Disiapkan)

| Fitur masa depan | Siap ditambah via |
|---|---|
| Notifikasi WhatsApp/SMS ke ortu | Event `attendance.recorded`, `reconciliation.anomaly` |
| QR presensi (untuk event khusus / UAS) | Attendance strategy pattern |
| Aplikasi mobile siswa/ortu/guru | API read-only kontrak stabil per modul |
| Biometrik (sidik jari/wajah) di gerbang | Device adapter pluggable |
| Integrasi Dapodik/EMIS | Kontrak ekspor Academic module |
| Dashboard analitik & prediksi bolos | Konsumsi event ke BI read-model |
| Reader kartu di tiap kelas | Device module tinggal tambah lokasi |

### 6.3 Roadmap 4 Fase

| Fase | Nama | Target | Isi |
|---|---|---|---|
| 1 | **Baseline** | 0–3 bln | Semua In-Scope 6.1 |
| 2 | **Engagement** | 4–6 bln | Notifikasi ortu, mobile, papan disiplin |
| 3 | **Intelligence** | 7–9 bln | Analitik kehadiran, prediksi dropout, BI |
| 4 | **Integration** | 10–12 bln | Dapodik, biometrik, multi-kampus |

---

## 7. Arsitektur Modular

```
┌─────────────────────────────────────────────────────────┐
│                    SchoolHub e-Hadir                    │
├─────────────┬──────────────┬────────────────────────────┤
│  IDENTITY   │  ACADEMIC    │  SCHEDULING                │
│  auth,      │  tahun,      │  jadwal → sesi             │
│  peran,     │  kelas,      │  lifecycle                 │
│  profil     │  mapel,      │                            │
│             │  siswa       │                            │
├─────────────┴──────────────┴────────────────────────────┤
│                    ATTENDANCE (inti)                    │
│   Gate (Lapis 1) · Class (Lapis 2) · Rekonsiliasi       │
├─────────────────────────────────────────────────────────┤
│  ACCESS       │  DEVICE         │  REPORTING           │
│  geofence,    │  smart card,    │  rekap, ekspor,      │
│  kebijakan    │  reader,        │  live monitor,       │
│  akses        │  API key        │  read-only           │
├─────────────────────────────────────────────────────────┤
│                     AUDIT (lintas)                      │
│   Merekam aksi sensitif dari semua modul lain          │
└─────────────────────────────────────────────────────────┘
```

### 7.1 Tanggung Jawab Modul

| Modul | Tanggung Jawab | Tidak Tahu Tentang |
|---|---|---|
| **Identity** | Siapa kamu & apa hakmu | Jadwal, kelas, kartu |
| **Academic** | Struktur sekolah | Presensi |
| **Scheduling** | Jadwal → siklus sesi | Cara siswa dicatat hadir |
| **Attendance** | Catatan kehadiran 2 lapis + rekonsiliasi | Hardware yang dipakai |
| **Access** | Geofence & kebijakan akses | Jadwal kelas |
| **Device** | Kartu, reader, sinyal scan | Sesi kelas |
| **Reporting** | Agregasi read-only | Menulis data operasional |
| **Audit** | Rekam jejak | Logika bisnis modul sumber |

### 7.2 Aturan Komunikasi Antar-Modul

1. Modul tidak boleh menulis data modul lain. Baca via kontrak publik.
2. Komunikasi real-time via **event**:
   - `session.opened`, `session.closed`, `session.missed`
   - `gate.tapped`, `gate.rejected`
   - `class_attendance.recorded`, `class_attendance.corrected`
   - `reconciliation.anomaly_detected`
   - `card.linked`, `card.status_changed`
3. Reporting **tidak di jalur write kritis** — baca dari read-model.
4. Audit subscribe ke event, tidak dipanggil manual tiap tempat.

---

## 8. Kebutuhan Fungsional per Modul

### 8.1 Modul IDENTITY

**FR-ID-01** Login dengan identitas sekolah + kata sandi.
**FR-ID-02** Validasi akun aktif (suspended/locked ditolak dengan pesan jelas).
**FR-ID-03** Sesi akses aman, logout, kedaluwarsa otomatis.
**FR-ID-04** Lihat & perbarui profil sendiri sesuai hak.
**FR-ID-05** Proteksi brute force (rate limit + kunci sementara).

---

### 8.2 Modul ACADEMIC

**FR-AC-01** CRUD: Tahun Ajaran, Semester, Kelas, Mata Pelajaran, Guru, Siswa, Pegawai.
**FR-AC-02** Pendaftaran Siswa ke Kelas per Tahun Ajaran.
**FR-AC-03** Nama entitas unik per kunci bisnis.
**FR-AC-04** Hapus master ditolak jika masih dipakai proses operasional aktif.
**FR-AC-05** Ekspor master dalam format standar (siap Dapodik).

---

### 8.3 Modul SCHEDULING

**FR-SC-01** CRUD Jadwal Pelajaran (kelas, mapel, guru, hari, jam mulai, jam selesai, ruang).
**FR-SC-02** Publikasi jadwal → otomatis generate Sesi harian per tanggal efektif.
**FR-SC-03** Siklus hidup sesi: `SCHEDULED` → `OPEN` → `CLOSED` (atau → `MISSED` jika tidak dibuka).
**FR-SC-04** Hanya peran berwenang membuka/menutup sesi (guru mapel ampuannya, guru piket untuk pengganti, admin/TU).
**FR-SC-05** Satu jadwal → satu sesi per tanggal (anti-duplikasi).
**FR-SC-06** **Sesi auto-transisi ke `MISSED`** jika tidak dibuka dalam X menit setelah jam mulai (X = konfigurasi, default 15 menit).
**FR-SC-07** Sesi `CLOSED` atau `MISSED` hanya menerima koreksi, tidak input presensi baru.

---

### 8.4 Modul ATTENDANCE (inti)

Modul inti sistem. Dibagi menjadi 3 sub-domain + 1 engine rekonsiliasi.

#### 8.4.1 Gate Attendance (Lapis 1 — Kehadiran Sekolah)

**FR-AT-G-01** Tap kartu di reader gerbang → catat arah IN/OUT.
**FR-AT-G-02** Subjek: siswa, guru, pegawai (semua yang punya kartu ACTIVE).
**FR-AT-G-03** **Unik per (pengguna, tanggal, arah)** — tap berulang tidak duplikasi (idempoten).
**FR-AT-G-04** Validasi saat tap:
   - Kartu `ACTIVE` (bukan LOST/INACTIVE)
   - Kartu tertaut ke pengguna
   - Lokasi reader dalam geofence sekolah
**FR-AT-G-05** Tap valid → event `gate.tapped`. Tap invalid → event `gate.rejected` + alasan.
**FR-AT-G-06** Tampil di Live Monitor ≤ 2 detik.

#### 8.4.2 Student Class Attendance (Lapis 2 — Siswa)

**FR-AT-CS-01** Guru membuka sesi di web → daftar siswa kelas itu muncul.
**FR-AT-CS-02** Guru menandai status tiap siswa: `HADIR` · `TELAT` · `IZIN` · `SAKIT` · `ALPA`.
**FR-AT-CS-03** Default status saat sesi dibuka: `ALPA` (siswa harus aktif ditandai hadir).
**FR-AT-CS-04** **Satu siswa → satu catatan per sesi** (constraint unik).
**FR-AT-CS-05** Hanya siswa yang terdaftar di kelas sesi yang muncul di daftar.
**FR-AT-CS-06** Guru menutup sesi → status siswa terkunci; event `class_attendance.recorded` batch untuk semua siswa di sesi itu.
**FR-AT-CS-07** Input massal didukung (tandai semua hadir, lalu edit yang tidak hadir).

#### 8.4.3 Teacher Class Attendance (Lapis 2 — Guru)

Kehadiran guru di kelas **tidak diinput manual**. Ia **diturunkan** dari aksi sesi.

**FR-AT-CT-01** Saat guru membuka sesi:
   - Validasi geofence: lokasi device guru harus dalam radius sekolah.
   - Catat `TeacherClassPresence` dengan waktu buka, guru, sesi, lokasi.
   - Status sesi → `OPEN`.
**FR-AT-CT-02** Status kehadiran guru otomatis:
   - Buka sesi ≤ jam mulai → `HADIR`
   - Buka sesi > jam mulai + grace period → `TELAT`
   - Sesi → `MISSED` (tidak dibuka) → guru `ALPA_MENGAJAR` untuk sesi itu
**FR-AT-CT-03** Saat guru menutup sesi:
   - Catat waktu tutup.
   - Jika tutup < jam selesai terjadwal − threshold → flag "sesi dipotong"
**FR-AT-CT-04** Guru tidak bisa membuka sesi di luar geofence (mencegah buka jarak jauh).
**FR-AT-CT-05** Guru bisa izin `IZIN` / `SAKIT` / `DINAS_LUAR` di awal hari → sesi-sesi hari itu otomatis dialihkan ke guru piket atau ditandai `EXCUSED_ABSENCE`.

#### 8.4.4 Teacher Daily Attendance (Kehadiran Guru Harian Ringkas)

Kehadiran guru harian **diderivasi dari** Gate Tap + status sesi-sesi hari itu.

**FR-AT-TD-01** Aturan derivasi harian:
   - Tap gerbang ada + ada sesi OPEN hari itu → `HADIR` (status per-sesi mengikuti 8.4.3)
   - Tap gerbang ada + tidak ada sesi karena jadwal kosong → `HADIR`
   - Tap gerbang ada + semua sesi `MISSED` → flag anomali (di sekolah tapi tidak mengajar)
   - Tidak ada tap gerbang + ada izin terdaftar → `IZIN`/`SAKIT`/`DINAS_LUAR`
   - Tidak ada tap gerbang + tidak ada izin → `ALPA`
**FR-AT-TD-02** Satu guru → satu catatan harian (constraint unik).

#### 8.4.5 Rekonsiliasi (Reconciliation Engine)

Inilah yang membuat sistem bernilai tinggi. Engine ini berjalan **otomatis** setiap sesi tutup dan harian end-of-day.

**FR-AT-R-01** Aturan rekonsiliasi siswa per sesi:

| Gate (Lapis 1) | Kelas (Lapis 2) | Hasil | Flag |
|---|---|---|---|
| Tap IN | HADIR/TELAT | ✅ Normal | — |
| Tap IN | ALPA | ⚠️ **BOLOS_KELAS** | Siswa di sekolah tapi bolos |
| Tap IN | IZIN/SAKIT | ✅ Normal (izin saat di sekolah) | — |
| Tidak tap | HADIR/TELAT | ⚠️ **LUPA_TAP_GERBANG** | Kartu rusak? |
| Tidak tap | ALPA | ✅ Konsisten alpa | — |
| Tidak tap | IZIN/SAKIT | ✅ Normal | — |

**FR-AT-R-02** Aturan rekonsiliasi guru per hari:

| Gate | Sesi ampuan | Hasil | Flag |
|---|---|---|---|
| Tap IN | Semua OPEN & CLOSED | ✅ Normal | — |
| Tap IN | Ada `MISSED` | ⚠️ **TIDAK_MENGAJAR** | Di sekolah tapi lewat sesi |
| Tidak tap | Ada OPEN | ⚠️ **ANOMALI_BUKA_TANPA_GERBANG** | Proxy? |
| Tidak tap | Semua MISSED | ⚠️ **ALPA** (tanpa izin) | Perlu konfirmasi |

**FR-AT-R-03** Semua flag menjadi event `reconciliation.anomaly_detected` → masuk dashboard disiplin.
**FR-AT-R-04** Flag tidak otomatis mengubah status — hanya menandai untuk review manusia.
**FR-AT-R-05** Admin/TU bisa resolve flag dengan alasan (tercatat audit).

#### 8.4.6 Koreksi Presensi

**FR-AT-K-01** Peran berwenang bisa mengoreksi status presensi siswa/guru.
**FR-AT-K-02** **Alasan wajib** (minimal 10 karakter, tidak boleh hanya tanda baca/spam).
**FR-AT-K-03** Guru mapel hanya bisa koreksi sesi ampuannya.
**FR-AT-K-04** Sistem menyimpan: sebelum, sesudah, alasan, pelaku, waktu → event `class_attendance.corrected`.
**FR-AT-K-05** Koreksi pada sesi `CLOSED`/`MISSED` → diizinkan (untuk perbaikan pasca-fakta).

---

### 8.5 Modul ACCESS

**FR-AX-01** Geofence: titik koordinat sekolah + radius valid (meter).
**FR-AX-02** Validasi scan kartu & buka sesi terhadap geofence.
**FR-AX-03** Di luar radius → tolak dengan kode alasan jelas.
**FR-AX-04** Konfigurasi titik/radius hanya peran berwenang (masuk audit).
**FR-AX-05** Kebijakan global yang bisa di-toggle:
   - "Wajib tap gerbang masuk sebelum tercatat hadir kelas" (default: OFF, advisory saja via rekonsiliasi).
   - "Wajib tap gerbang keluar sebelum sistem mark OUT" (default: ON).

---

### 8.6 Modul DEVICE

**FR-DV-01** Daftar UID kartu chip fisik (RFID/NFC).
**FR-DV-02** Tautkan kartu ke pengguna (siswa/guru/pegawai).
**FR-DV-03** Status kartu: `ACTIVE` · `LOST` · `INACTIVE`.
**FR-DV-04** Kartu `LOST`/`INACTIVE` → ditolak untuk tap gerbang.
**FR-DV-05** Satu pengguna → maksimal **1 kartu ACTIVE** pada waktu bersamaan.
**FR-DV-06** Reader gerbang otentik dengan API key (bisa dicabut).
**FR-DV-07** Setiap tap menghasilkan event `card.scanned` → dikonsumsi Attendance.

---

### 8.7 Modul REPORTING

**FR-RP-01** Laporan tersedia:
   - Rekap Kelas (per sesi, per hari, per bulan)
   - Rekap Siswa (riwayat lengkap individu)
   - Rekap Mapel (per guru, per kelas)
   - Rekap Guru (kehadiran + sesi mengajar)
   - Laporan Bulanan Guru
   - Audit Cakupan Sesi
   - **Papan Anomali Rekonsiliasi** (flag yg belum di-resolve)
**FR-RP-02** Ekspor CSV / XLSX.
**FR-RP-03** Live Monitor Scan: stream event tap gerbang dan buka/tutup sesi real-time.
**FR-RP-04** Modul **read-only** — tidak pernah menulis ke data operasional.
**FR-RP-05** Laporan bulanan dari read-model ter-cache (p95 ≤ 5 detik).

---

### 8.8 Modul AUDIT

**FR-AU-01** Merekam otomatis semua event sensitif:
   - buka/tutup sesi · sesi `MISSED`
   - update pengaturan (geofence, kebijakan)
   - koreksi presensi
   - tindakan kartu (daftar, taut, lepas, ubah status)
   - perubahan peran pengguna
   - resolve anomali rekonsiliasi
   - tap gerbang ditolak yang mencurigakan
**FR-AU-02** Data audit minimal: pelaku · peran · aksi · entitas · ID entitas · nilai sebelum · nilai sesudah · alasan (jika ada) · waktu · IP/device (jika relevan).
**FR-AU-03** Audit **append-only** — tidak dapat diubah oleh peran apa pun.
**FR-AU-04** Filter per pelaku, tanggal, modul, aksi.

---

## 9. Aturan Bisnis Global (Single Source of Truth)

| No | Aturan | Penegakan |
|---|---|---|
| RB-01 | Presensi siswa unik per sesi | Constraint DB + validasi app |
| RB-02 | Kehadiran guru harian unik per tanggal | Constraint DB + validasi app |
| RB-03 | Tap gerbang unik per (user, tgl, arah) — idempoten | Constraint + upsert |
| RB-04 | Koreksi tanpa alasan → **ditolak** | Validasi wajib + audit |
| RB-05 | Kartu `LOST` / `INACTIVE` → tidak valid | Cek status saat tap |
| RB-06 | Siswa di kelas sesi harus terdaftar di kelas itu | Validasi saat daftar sesi muncul |
| RB-07 | Scan/buka sesi di luar radius geofence → ditolak | Hitung jarak |
| RB-08 | Akses fitur = fungsi (peran, cakupan objek) | Gate di setiap entry point |
| RB-09 | Audit trail tidak dapat dimodifikasi | Append-only storage |
| RB-10 | Satu pengguna → max 1 kartu ACTIVE | Constraint unik |
| RB-11 | Sesi CLOSED/MISSED hanya terima koreksi, bukan presensi baru | Validasi sesi |
| RB-12 | **Sesi tidak dibuka dalam X menit setelah jam mulai → MISSED** | Scheduler otomatis |
| RB-13 | **Rekonsiliasi dijalankan otomatis tiap sesi tutup & end-of-day** | Scheduler |
| RB-14 | **Flag anomali tidak otomatis ubah status** — hanya review | Logika engine |
| RB-15 | Guru tidak bisa buka sesi dari luar geofence | Validasi saat buka |

---

## 10. Model Data Konseptual (Aggregate Boundary)

```
[IDENTITY]
  └─ User (root)
      ├─ Credentials
      └─ RoleAssignment

[ACADEMIC]
  ├─ AcademicYear (root) → Semester
  ├─ ClassRoom (root) → Enrollment
  ├─ Subject (root)
  ├─ Teacher (root) → ref User
  └─ Student (root) → ref User

[SCHEDULING]
  ├─ Schedule (root) → ref ClassRoom, Subject, Teacher, AcademicYear, Semester
  └─ Session (root) → ref Schedule
      (status: SCHEDULED → OPEN → CLOSED / MISSED)

[ATTENDANCE]
  ├─ GateLog (root) → ref User          [Lapis 1]
  ├─ StudentAttendance (root)            [Lapis 2 — siswa]
  │     → ref Student, Session
  ├─ TeacherClassPresence (root)         [Lapis 2 — guru]
  │     → ref Teacher, Session
  │     (otomatis dari buka/tutup sesi)
  ├─ TeacherDailyAttendance (root)       [Derivasi harian]
  │     → ref Teacher (unik per tanggal)
  ├─ ReconciliationFlag (root)           [Lintas lapis]
  │     → ref StudentAttendance | TeacherDailyAttendance
  └─ Correction (value object)

[ACCESS]
  └─ GeofencePolicy (root, konfigurasi)

[DEVICE]
  ├─ SmartCard (root) → opsional ref User
  └─ ReaderDevice (root, API key)

[AUDIT]
  └─ AuditEntry (root, append-only)
```

### Kontrak Relasi Kunci
- `User` identitas tunggal; `Teacher`/`Student` proyeksi domain.
- `Session` selalu berasal dari `Schedule`. Tidak ada sesi "mengambang".
- `StudentAttendance` mengikat `(Student, Session)` — tidak ada presensi tanpa sesi.
- `TeacherClassPresence` diturunkan dari aksi buka/tutup sesi, **tidak pernah diinput manual**.
- `ReconciliationFlag` dihasilkan engine, tidak pernah dibuat manual.
- `SmartCard` bisa tanpa pemilik, tapi tidak bisa dipakai tap dalam kondisi itu.

---

## 11. UX & Alur Pengguna

### 11.1 Prinsip Visual
Tema gelap elegan · aksen gradien ungu-biru · efek kaca (glass/blur) halus · layout padat informasi namun terindeks visual · kontras ≥ 4.5:1.

### 11.2 Prinsip Interaksi
1. Navigasi utama selalu 1 klik.
2. Aksi primer menonjol (warna aksen + ukuran).
3. Feedback visual < 100 ms untuk setiap interaksi.
4. Tidak ada animasi yang menunda kerja.

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

### 11.4 Struktur Menu

```
Admin/TU
├── 🏠 Dasbor
├── 📋 Operasional
│    ├── Pemantauan Sesi (live)
│    ├── Riwayat Absen
│    ├── Papan Anomali Rekonsiliasi       ← NEW
│    └── Buku Piket
├── 👥 Master Data
│    ├── Pengguna (guru/siswa/pegawai)
│    ├── Struktur Akademik (tahun/semester/kelas/mapel)
│    └── Pendaftaran Kelas
├── 📅 Jadwal & Sesi
├── 💳 Perangkat
│    ├── Smart Card
│    └── Reader & API Keys
├── 📊 Laporan
│    ├── Rekap (Kelas/Siswa/Mapel/Guru)
│    ├── Laporan Bulanan Guru
│    ├── Audit Cakupan
│    └── Live Monitor
└── ⚙️ Sistem
     ├── Pengaturan (geofence, kebijakan, grace period)
     └── Catatan Audit

Guru
├── 🏠 Dasbor (sesi hari ini)
├── 📝 Input Presensi Kelas               ← Aksi utama
├── ✏️ Koreksi Presensi
├── 📊 Rekap Kelas Ampuan
└── 👤 Kehadiran Saya

Siswa
└── 🏠 Dasbor (riwayat kehadiran sendiri)
```

### 11.5 Aksesibilitas
Fokus keyboard terlihat · target sentuh ≥ 44×44 · ikon-only wajib punya label aksesibel.

---

## 12. Persyaratan Non-Fungsional (Terukur)

### 12.1 Kinerja

| Operasi | Target p95 | Beban puncak |
|---|---|---|
| Tap kartu → catatan tersimpan | ≤ 500 ms | 50 tap/detik serentak (jam masuk/pulang) |
| Validasi geofence | ≤ 50 ms | — |
| Buka dasbor guru | ≤ 1 detik | 100 guru concurrent |
| Buka sesi + tampil daftar siswa | ≤ 1 detik | Kelas ~30 siswa |
| Input presensi (per klik status) | ≤ 100 ms feedback | — |
| Tutup sesi + rekonsiliasi | ≤ 2 detik | — |
| Live feed latency | ≤ 2 detik | 200 event/menit |
| Laporan bulanan | ≤ 5 detik | 1 kelas × 1 bulan |
| Ekspor CSV 1 bulan sekolah | ≤ 10 detik | — |

### 12.2 Strategi Kinerja (Product Level)
1. **Read-model terpisah** untuk laporan → tidak ganggu jalur write.
2. **Event-driven** antar modul → tidak ada sinkron berantai.
3. **Idempoten** di semua endpoint tulis → aman untuk retry.
4. **Cache** master data yang jarang berubah (TTL per jenis).
5. **Batch insert** untuk event log & audit.
6. **Pre-populate** daftar siswa saat buka sesi (tidak query ulang saat input).

### 12.3 Keandalan
- Gangguan jaringan sementara di reader → tap mengantri lokal, retry otomatis.
- Integritas data saat aksi bersamaan → optimistic lock pada sesi.
- Uptime target: **99.5%** selama jam sekolah (06:30–16:00 WIB).

### 12.4 Skalabilitas
- Mendukung 5.000+ siswa tanpa rebuild.
- Reporting horizontal-scalable terpisah.
- Database siap di-partition per tahun ajaran.

### 12.5 Keamanan
- Password: kompleksitas minimum + rotasi berkala.
- Sesi ber-TTL, bisa dicabut admin.
- RBAC di setiap entry point sensitif.
- Audit append-only.
- Data siswa/guru = data sensitif (retensi & akses terkontrol).
- Tidak ada kredensial hardcoded di produksi.

---

## 13. Skenario Utama

### 13.1 Happy Path A — Siswa Normal

1. Pagi: siswa tap kartu di gerbang → `GateLog` IN tercatat.
2. Jam 08:00: guru buka sesi Matematika di kelas X-1 via web.
3. Guru tandai siswa: 28 HADIR, 1 IZIN (surat izin sakit), 1 ALPA.
4. Jam 08:45: guru tutup sesi.
5. **Rekonsiliasi otomatis**:
   - 28 siswa HADIR + tap gerbang → normal
   - 1 siswa ALPA + tap gerbang → flag `BOLOS_KELAS`
   - 1 siswa IZIN + tidak tap gerbang → normal
6. Event `class_attendance.recorded` × 30 + `reconciliation.anomaly_detected` × 1.
7. Dasbor TU menampilkan flag bolos → wali kelas ditindaklanjuti.

### 13.2 Happy Path B — Guru Normal

1. Pagi: guru tap kartu di gerbang → `GateLog` IN.
2. Jam 08:00: guru buka sesi → geofence valid → `TeacherClassPresence` HADIR.
3. Jam 08:45: guru tutup sesi → `CLOSED`.
4. Berlanjut ke sesi-sesi lain hari itu.
5. End-of-day: `TeacherDailyAttendance` disimpulkan = HADIR, semua sesi OPEN/CLOSED.

### 13.3 Skenario C — Guru Tidak Membuka Sesi

1. Guru tap gerbang pagi.
2. Jam 08:00 sesi terjadwal tapi guru tidak membuka.
3. Jam 08:15 (grace habis) → sistem auto-transisi sesi → `MISSED`.
4. End-of-day rekonsiliasi → flag `TIDAK_MENGAJAR` untuk guru itu.
5. Admin/TU review → bisa resolve (misal guru izin mendadak, lupa input) atau ke disiplin.

### 13.4 Skenario D — Koreksi Presensi

1. Wali kelas sadar ada salah input 2 hari lalu (siswa dicatat ALPA padahal bawa surat sakit telat).
2. Buka Riwayat Absen → pilih catatan → ubah ke SAKIT → isi alasan "Surat sakit diserahkan 2 hari terlambat".
3. Sistem simpan before/after + pelaku + waktu → event `class_attendance.corrected`.
4. Flag rekonsiliasi otomatis diperbarui jika relevan.

### 13.5 Negative Cases

| Kasus | Respon |
|---|---|
| Kartu LOST/INACTIVE di-tap | Tolak + log + bunyi reader "invalid" |
| Tap di reader di luar geofence | Tolak "Reader di luar area" |
| Guru coba buka sesi dari rumah | Tolak "Di luar area sekolah" |
| Guru coba buka sesi yang bukan ampuannya | Tolak "Bukan sesi Anda" |
| Dua orang tap kartu yang sama <3 detik | Idempoten, tidak duplikasi |
| Koreksi tanpa alasan / alasan < 10 karakter | Tolak |
| Siswa bukan anggota kelas muncul di daftar | Tidak mungkin (hanya enrolled yang dimuat) |
| Jaringan putus saat tap | Reader queue lokal, retry |
| Jaringan putus saat input kelas | Web offline-first: simpan lokal, sinkron saat online |

---

## 14. Kriteria Penerimaan (UAT)

### 14.1 Admin/TU
- [ ] Kelola semua master data tanpa error.
- [ ] Konfigurasi geofence + kebijakan + grace period.
- [ ] Lihat semua laporan + ekspor semua format.
- [ ] Kelola smart card + reader + API key.
- [ ] Resolve flag rekonsiliasi dengan alasan.
- [ ] Lihat audit log lengkap dengan filter.

### 14.2 Guru Mapel
- [ ] Lihat hanya sesi ampuannya di dasbor.
- [ ] Buka sesi hanya dari area sekolah (geofence).
- [ ] Input presensi 30 siswa < 30 detik.
- [ ] Tutup sesi → rekonsiliasi otomatis berjalan.
- [ ] Koreksi sesi ampuannya (alasan wajib).
- [ ] Lihat kehadiran pribadi harian.

### 14.3 Guru Piket
- [ ] Lihat semua sesi hari berjalan.
- [ ] Gantikan buka sesi jika guru mapel tidak hadir (diotorisasi).
- [ ] Catat anomali gerbang manual jika perlu.

### 14.4 Siswa
- [ ] Tap kartu di gerbang → catatan masuk.
- [ ] Lihat riwayat kehadiran sendiri.
- [ ] Tidak bisa akses fungsi admin/guru (403).

### 14.5 Engine Rekonsiliasi
- [ ] Setiap kombinasi di tabel FR-AT-R-01 & R-02 terdeteksi benar.
- [ ] Flag muncul di Papan Anomali dalam ≤ 2 detik setelah tutup sesi.
- [ ] Resolve flag tersimpan + tercatat audit.

### 14.6 Smart Card
- [ ] Tap valid → catatan + Live Monitor ≤ 2 detik.
- [ ] Tap invalid → alasan jelas + log.

---

## 15. Rencana Eksekusi

### 15.1 Urutan Build (Dependency-aware)

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

### 15.2 Definition of Done Fase 1
1. Semua FR Bab 8 berfungsi sesuai RB Bab 9.
2. Semua KPI Bab 4.3 tercapai pada beban uji.
3. Semua skenario Bab 13 & UAT Bab 14 lulus.
4. Target performa Bab 12 tercapai p95.
5. Audit aktif untuk seluruh aksi sensitif.
6. Rekonsiliasi berjalan otomatis + flag valid.
7. Tidak ada fitur Fase 2-4 yang bocor ke Fase 1.

---

## 16. Kamus Status & Glosarium

### 16.1 Status Sesi
`SCHEDULED` · `OPEN` · `CLOSED` · `MISSED`

### 16.2 Status Kehadiran Siswa (per sesi)
`HADIR` · `TELAT` · `IZIN` · `SAKIT` · `ALPA`

### 16.3 Status Kehadiran Guru — Per Sesi Ampuan
`HADIR` · `TELAT` · `EXCUSED_ABSENCE` · `ALPA_MENGAJAR`

### 16.4 Status Kehadiran Guru — Harian (derivasi)
`HADIR` · `TELAT` · `IZIN` · `SAKIT` · `DINAS_LUAR` · `ALPA`

### 16.5 Status Kartu
`ACTIVE` · `LOST` · `INACTIVE`

### 16.6 Arah Gerbang
`IN` · `OUT`

### 16.7 Metode Presensi (Baseline)
- **Gerbang**: `CARD` (satu-satunya)
- **Kelas**: `MANUAL` oleh guru (satu-satunya)
- `QR`, `BIOMETRIC`, `FACE` — tersedia sebagai Extension Points, bukan baseline.

### 16.8 Flag Rekonsiliasi
`BOLOS_KELAS` · `LUPA_TAP_GERBANG` · `TIDAK_MENGAJAR` · `ANOMALI_BUKA_TANPA_GERBANG` · `ALPA`

### 16.9 Istilah Kunci
- **Sesi** — instansiasi harian dari jadwal; konteks tunggal untuk presensi kelas.
- **Lapis 1 (Gate)** — kehadiran di area sekolah, via tap kartu.
- **Lapis 2 (Kelas)** — kehadiran di kelas, via input manual guru (siswa) atau aksi sesi (guru).
- **Rekonsiliasi** — cross-check lintas lapis, menghasilkan flag anomali.
- **Geofence** — area lingkaran valid (titik + radius) tempat aksi diizinkan.
- **Grace period** — toleransi menit sebelum status berubah (HADIR→TELAT, OPEN→MISSED).
- **Idempoten** — operasi aman diulang; hasil tetap sama.
- **Event** — notifikasi internal antar-modul, dikonsumsi bebas tanpa coupling.

---

## 17. Extension Points (Pengembangan Signifikan)

Titik-titik tempat sistem **siap diperluas** tanpa rebuild. Jaminan sistem bisa tumbuh.

| Extension Point | Lokasi | Nilai masa depan |
|---|---|---|
| Event `class_attendance.recorded` | Attendance | WhatsApp ke ortu, push notif, webhook |
| Event `reconciliation.anomaly_detected` | Attendance | Peringatan disiplin otomatis ke wali kelas & ortu |
| Event `gate.tapped` | Attendance | Integrasi CCTV, palang otomatis, pemberitahuan "anak sudah di sekolah" |
| Strategi metode presensi | Attendance (pattern) | Tambah `QR`, `BIOMETRIC`, `FACE` tanpa rebuild |
| Adapter reader device | Device | Reader tipe baru (USB, serial, network, dll) |
| Kontrak ekspor master | Academic | Sinkron dua arah Dapodik/EMIS |
| Read-model reporting | Reporting | BI tools (Metabase, Superset, Power BI) |
| API publik read-only | Semua modul | Mobile app siswa/ortu/guru |
| Plugin notifikasi | Lintas modul via event | Email, WhatsApp, Telegram, SMS, push |
| Modul Analitik Disiplin | Baru, konsumsi event | Deteksi pola bolos, prediksi dropout, skor disiplin |
| Reader kartu per kelas | Device | Tinggal tambah lokasi jika suatu saat ingin "dual tap" |

---

## 18. Catatan Penutup

Dokumen ini adalah **kontrak perilaku produk** dengan disiplin KISS, Clean Code, Encapsulation, dan Performance by Design.

**Tiga prinsip yang harus dijaga** saat mengembangkan:
1. **Dua lapis kehadiran tidak boleh dicampur.** Gate = kartu. Kelas = manual guru. Titik.
2. **Rekonsiliasi hanya menandai, tidak mengubah.** Manusia yang memutuskan.
3. **Fitur baru masuk via Extension Point, bukan merombak modul inti.**

Jika ada pertanyaan "fitur X masuk ke mana?" — jawabannya harus selalu bisa ditemukan di salah satu 8 modul Bab 7 atau Extension Point Bab 17. Jika tidak, itu pertanda modul baru atau revisi PRD berikutnya.
