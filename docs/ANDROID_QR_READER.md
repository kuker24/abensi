# Android QR Reader — SIAB2 Reader

Nama default APK:

```text
SIAB2
```

Project Android:

```text
apps/android-reader
```

## Fungsi

APK Android menjadi **reader resmi** SIAB2 Reader, bukan scanner biasa. Scan QR dikirim sebagai signed request ke server:

```http
POST /api/v1/attendance/qr-reader-scan
```

Mode runtime:

- `GERBANG` — datang/pulang otomatis berdasarkan riwayat harian server.
- `MUSHOLA` — scan sholat siswa, prayer type ditentukan dari waktu server.
- `CHECK_ONLY` — validasi QR tanpa mencatat presensi.

Payload lama `GATE_IN`/`GATE_OUT` tetap dikenali sebagai mode gerbang untuk kompatibilitas, tetapi APK baru mengirim `scanMode=GERBANG`.

## Prasyarat build

- JDK 17 atau 21 direkomendasikan untuk Android Gradle Plugin/Kotlin saat ini.
- Android SDK tersedia dan `ANDROID_HOME`/`ANDROID_SDK_ROOT` mengarah ke SDK.
- `gradlew` di project akan memakai Gradle lokal jika ada, atau mengunduh Gradle 8.7.

## Build APK paling mudah

Gunakan Python GUI Builder di laptop/komputer operator:

```bash
cd tools/apk-builder
./jalankan-apk-builder.sh
```

Windows: double click `tools\\apk-builder\\jalankan-apk-builder.bat`.

Ikuti tab **1 Cek Laptop → 2 Hubungkan Web → 3 Atur APK → 4 Buat APK**. Panduan awam lengkap ada di:

```text
docs/CARA_BUILD_APK_UNTUK_OPERATOR.md
```

## Instalasi debug manual

```bash
cd apps/android-reader
ANDROID_HOME=$HOME/Android/Sdk ANDROID_SDK_ROOT=$HOME/Android/Sdk ./gradlew assembleDebug
```

APK debug berada di:

```text
apps/android-reader/app/build/outputs/apk/debug
```

## Provisioning perangkat

PR128 menetapkan maksimal 4 HP reader produksi aktif:

| Reader | Fungsi | Mode APK |
|---|---|---|
| `READER_DEV_TEST_01` | Dev Test Identitas | `CHECK_ONLY` |
| `READER_IDENTITY_01` | Dev Test Gerbang & Mushola, tanpa presensi | `GATE_IN`, `GATE_OUT`, `MUSHOLA` |
| `READER_GATE_PRAYER_01` | Gerbang/mushola UAT | `GATE_IN`, `GATE_OUT`, `MUSHOLA` |
| `READER_GATE_PRAYER_02` | Gerbang/mushola backup | `GATE_IN`, `GATE_OUT`, `MUSHOLA` |

SOP setup operator:

1. Admin buka web `/admin/devices`.
2. Pilih reader target di daftar **Alat Pembaca**.
3. Klik **Kode Aktivasi** pada reader target.
4. Kode aktivasi tampil sekali dan kedaluwarsa singkat; jangan screenshot, share ke chat, log, tiket, atau artifact.
5. Operator buka APK resmi di HP target.
6. Pastikan waktu HP otomatis/sinkron, internet stabil, dan izin kamera aktif.
7. Isi server URL production.
8. Tempel kode aktivasi langsung di APK.
9. APK memanggil:

```http
POST /api/v1/device-readers/android/provision/complete
```

10. Server mengembalikan `deviceId`, `readerSecret`, dan daftar mode sekali saja.
11. APK menyimpan secret di encrypted storage/Android Keystore.
12. Admin cek `lastSeenAt`/heartbeat reader; lanjut controlled live UAT hanya setelah ada approval terpisah.

Catatan keamanan: activation code adalah one-time use dan short-lived. API key/signing secret mentah tidak ditempel ke HP dan tidak boleh dicatat di log/operator chat.

## Cara scan untuk operator awam

1. Buka aplikasi.
2. Pilih **Scan Gerbang Datang**, **Scan Gerbang Pulang**, atau **Scan Mushola**.
3. Arahkan QR siswa/guru ke kamera sesuai mode yang dipilih.
4. Tunggu tanda besar di layar:
   - Hijau **Berhasil**: scan diterima server.
   - Merah **Ditolak**: scan tidak boleh dipakai, baca alasannya.
   - Kuning **Internet Bermasalah**: scan disimpan sementara dan belum final.

Scanner berjalan terus-menerus. Setelah satu siswa hijau, siswa berikutnya bisa langsung scan tanpa keluar masuk menu.

## Mode fleksibel 4 HP scanner

APK mendukung penggunaan seperti kiosk terkontrol:

- Maksimal 4 HP scanner aktif di server.
- 2 HP `CHECK_ONLY` hanya untuk uji koneksi/verifikasi identitas tanpa mutasi absensi.
- 2 HP `GERBANG,MUSHOLA` dapat memilih **Mode Gerbang** saat pagi/pulang atau **Mode Mushola** saat jadwal sholat.
- Layar tetap menyala saat scanner aktif.
- Kamera tetap aktif terus selama halaman scanner dibuka.
- Tombol **Ubah Mode** menutup scanner agar operator memilih mode dari layar utama.
- Tombol **Lampu Kamera** tersedia untuk kondisi gelap.
- Opsi **Langsung buka scanner saat aplikasi dibuka** tersedia di Pengaturan.

QR yang sama dicegah terbaca berulang terlalu cepat, tetapi QR siswa berbeda bisa discan beruntun.

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Server tidak merespons | Cek URL, internet, domain, Nginx/API health |
| Release build menolak HTTP | Gunakan HTTPS untuk production |
| Signature invalid | Reprovision/rotate secret perangkat |
| QR ditolak | Cek status `QrCredential`, user aktif, expiry, revoke |
| Mode ditolak | Pilih Mode Gerbang untuk datang/pulang atau Mode Mushola untuk sholat siswa |
| Pulang ditolak | Pastikan sudah scan datang dan Ashar jika jadwal sore |

## Catatan keamanan

- Secret tidak di-hard-code ke APK.
- APK tidak menjadi source of truth presensi.
- Jangan log QR token penuh, secret, signature, atau response sensitif.
- Pending offline bukan hadir final.
