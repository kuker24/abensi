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

1. Admin buka web `/admin/devices`.
2. Pilih tab **Aktivasi HP Scanner**.
3. Pilih **HP Scanner 1** atau **HP Scanner 2**; keduanya otomatis mendapat Mode Gerbang dan Mode Mushola.
4. Klik **Buat Kode Aktivasi**.
5. Buka APK di HP.
6. Isi server URL.
7. Tempel kode aktivasi dari admin.
8. APK memanggil:

```http
POST /api/v1/device-readers/android/provision/complete
```

9. Server mengembalikan `deviceId`, `readerSecret`, dan daftar mode sekali saja.
10. APK menyimpan secret di encrypted storage/Android Keystore.

## Cara scan untuk operator awam

1. Buka aplikasi.
2. Pilih **Scan Gerbang** untuk datang/pulang atau **Scan Mushola** untuk sholat siswa.
3. Arahkan QR siswa/guru ke kamera sesuai mode yang dipilih.
4. Tunggu tanda besar di layar:
   - Hijau **Berhasil**: scan diterima server.
   - Merah **Ditolak**: scan tidak boleh dipakai, baca alasannya.
   - Kuning **Internet Bermasalah**: scan disimpan sementara dan belum final.

Scanner berjalan terus-menerus. Setelah satu siswa hijau, siswa berikutnya bisa langsung scan tanpa keluar masuk menu.

## Mode fleksibel 2 HP scanner

APK mendukung penggunaan seperti kiosk fleksibel:

- Maksimal 2 HP scanner aktif di server.
- Kedua HP dapat sama-sama memilih **Mode Gerbang** saat pagi/pulang.
- Kedua HP dapat sama-sama memilih **Mode Mushola** saat jadwal sholat.
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
