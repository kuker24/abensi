# SIAB2 Reader — Android QR Reader

Aplikasi resmi sekolah berbasis Kotlin/Jetpack Compose untuk Sistem Informasi Akademik Berkarakter.
Dipakai operator sekolah untuk scan QR siswa/guru dengan 2 HP scanner fisik yang fleksibel: tiap HP dapat memilih **Mode Gerbang** atau **Mode Mushola** saat dipakai.

## Fitur Operator

- **Material 3 theme** dengan warna brand sekolah (teal-700) dan mode gelap otomatis.
- **Splash awal** memeriksa apakah HP sudah aktif sebelum membuka layar utama.
- **Aktivasi HP Scanner** dengan langkah bernomor: Alamat Server → Nama HP → Kode Aktivasi.
- **Tes Sambungan** sebelum simpan, dengan pesan kesalahan manusiawi.
- **Kode Aktivasi Rahasia** disembunyikan saat diketik/tempel, dengan tombol lihat/sembunyikan.
- **Layar Utama** menampilkan: status koneksi aktual, jumlah antrean kirim, lokasi, scan terakhir, versi aplikasi, dan pilihan **Scan Gerbang** / **Scan Mushola**.
- **Mode Scan** kamera besar dengan overlay bingkai bidik, status di atas, feedback besar di bawah, serta tombol **Ubah Mode** untuk kembali memilih mode.
- **Izin kamera aman**: jika izin kamera ditolak, aplikasi menampilkan panduan dan tombol buka pengaturan HP.
- **Tombol cepat**: Scan Gerbang, Scan Mushola, Jeda, Lampu, Kirim Ulang Antrean, dan Ubah Mode.
- **Riwayat Scan** menampilkan 20 scan terakhir tanpa membocorkan kode QR penuh atau secret.
- **Pengaturan**: toggle bunyi, getaran, layar tetap menyala, langsung buka scanner. Kosongkan/kirim ulang antrean. Tes sambungan ulang. Reset aktivasi dengan dialog konfirmasi kuat.
- **Bantuan** dengan topik troubleshooting: cara memakai, kamera tidak terbuka, server tidak tersambung, scan gagal, antrean offline, hubungi Operator IT.

## Keamanan

- **Reader Secret** disimpan di Android Keystore via `EncryptedSharedPreferences` (AES256-GCM). Tidak pernah ditampilkan di UI setelah disimpan.
- **Antrean offline** dienkripsi lokal dengan AES/GCM melalui `LocalAes` (Android Keystore alias `schoolhub_pending_queue`). Scan yang gagal karena internet tetap antre; scan yang ditolak server dicatat sebagai ditolak agar tidak tertahan selamanya.
- **Tanda tangan request** memakai HMAC-SHA256 dengan body-hash + timestamp + nonce di setiap scan ke server.
- **Riwayat scan** hanya menyimpan 4 karakter terakhir kode QR (masked) — tidak ada secret/signature/nonce/raw QR yang ditulis ke storage.
- Build release wajib HTTPS (`SchoolHubApiClient.validateServerUrl`) dan cleartext traffic dimatikan di release.
- Build debug boleh HTTP untuk tes lokal dan manifest debug diselaraskan lewat placeholder Gradle.
- `allowBackup="false"` + aturan backup/data extraction mengecualikan shared preferences, database, dan file lokal sensitif.

## Cara Operator Memakai APK

1. **Pertama kali**: buka aplikasi — splash muncul singkat, lalu layar **Aktivasi HP Scanner** terbuka.
2. Isi:
   - **Alamat Server** (contoh: `https://absensi.man1rokanhulu.cloud`)
   - **Nama HP Scanner** (contoh: `HP Scanner 1`)
   - **Lokasi** (opsional, contoh: `Fleksibel`)
   - **Kode Aktivasi Rahasia** dari admin sekolah. Kode ini disembunyikan otomatis di layar.
3. Tekan **Tes Sambungan** untuk memastikan server bisa dihubungi.
4. Tekan **Simpan & Mulai Scan** — HP akan diaktifkan dan masuk ke layar utama.
5. **Layar utama** menampilkan status, lokasi, dan pilihan mode scan.
6. Pilih **Scan Gerbang** untuk datang/pulang atau **Scan Mushola** untuk sholat siswa.
7. Kamera terbuka, arahkan QR siswa/guru sesuai mode yang dipilih.
8. Tunggu sampai feedback berubah:
   - **Hijau**: scan berhasil, langsung scan siswa berikutnya.
   - **Merah**: ditolak server (alasan ditampilkan).
   - **Kuning**: internet bermasalah, scan masuk antrean otomatis.
9. Tekan **Ubah Mode** untuk kembali ke layar utama, atau **Kirim Ulang Antrean** kalau ada antrean offline.
10. Buka **Riwayat** untuk melihat 20 scan terakhir.
11. Buka **Pengaturan** untuk toggle bunyi/getaran, kelola antrean, atau reset aktivasi (dengan konfirmasi).

## Build & Test

JDK 17/21 + Android SDK wajib tersedia.

```bash
# Test debug unit (rapi)
./test-jdk17.sh

# Build APK debug ke folder output/
./build-debug-jdk17.sh

# Build APK release (butuh keystore.properties di root)
./build-release-jdk17.sh
```

Build manual (jika env sudah siap):

```bash
./gradlew testDebugUnitTest
./gradlew assembleDebug
```

## Struktur Kode

```
app/src/main/java/id/sch/man1rokanhulu/absensi/
├── MainActivity.kt          ← shell tipis: routing antar layar
├── data/
│   ├── LocalConfig.kt       ← prefs (alamat, deviceId/secret terenkripsi, toggle)
│   ├── OfflineQueueRepository.kt
│   ├── PendingScan.kt
│   └── ScanHistoryStore.kt  ← 20 scan terakhir, kode QR di-mask
├── network/SchoolHubApiClient.kt   ← OkHttp + Signer (HMAC + nonce + body-hash)
├── scanner/
│   ├── BarcodeAnalyzer.kt
│   ├── ContinuousScanGate.kt
│   └── ScanDebouncer.kt
├── security/
│   ├── CanonicalJson.kt     ← JSON deterministik untuk signing
│   ├── LocalAes.kt          ← AES/GCM via Android Keystore
│   ├── QrParser.kt          ← validasi format `schoolhub:qr:v1:QR_…`
│   └── Signer.kt            ← HMAC-SHA256 signed headers
└── ui/
    ├── theme/AppTheme.kt    ← Material 3 token sekolah
    ├── components/          ← komponen reusable (StatusBar, FeedbackCard, dll)
    └── screens/             ← satu file per layar (Splash, Setup, Home, Scanner, Settings, Help, History)
```

## Konfigurasi Branding

Konfigurasi default ada di `gradle.properties` dan bisa digenerate via Python GUI Builder:

```bash
cd tools/apk-builder
./jalankan-apk-builder.sh
```

Windows: double click `tools\apk-builder\jalankan-apk-builder.bat`.

Panduan operator lengkap: `docs/CARA_BUILD_APK_UNTUK_OPERATOR.md`.
