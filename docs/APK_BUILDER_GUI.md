# SIAB2 APK Builder

Aplikasi desktop builder berada di:

```text
tools/apk-builder
```

Nama aplikasi:

```text
SIAB2 APK Builder — Mode Mudah
```

Builder dirancang agar operator awam cukup mengikuti tab **1 sampai 4**:

1. **Cek Laptop**
2. **Hubungkan Web**
3. **Atur APK**
4. **Buat APK**

Tab **5 Publish Web** dan **Mode Lanjutan** hanya dipakai jika perlu.

## Prasyarat

- Python 3.11+
- JDK 17/21 untuk build Android
- Android SDK dan `ANDROID_HOME`/`ANDROID_SDK_ROOT`
- Project Android di `apps/android-reader`

> APK tidak dibuild di VPS. Build dilakukan di laptop/komputer operator.

## Cara paling mudah

### Linux

```bash
cd tools/apk-builder
./jalankan-apk-builder.sh
```

### Windows

Double click:

```text
tools\apk-builder\jalankan-apk-builder.bat
```

Launcher otomatis memilih JDK 17/21 dan Android SDK jika sudah ada di laptop, membuat `.venv`, install dependency Python, lalu membuka GUI. Jika auto-detect gagal, operator IT dapat mengatur `JAVA_HOME`, `ANDROID_HOME`, atau `ANDROID_SDK_ROOT` sesuai lokasi instalasi di laptop tersebut.

## Fitur Mode Mudah

- Tombol besar **CEK KESIAPAN LAPTOP**.
- Cek dan cari otomatis JDK 17/21, Android SDK, Gradle launcher, project Android, icon, dan ADB opsional.
- Layar **Hubungkan Web SIAB2**.
- Test otomatis:
  - `/health/live`
  - `/api/v1/mobile/android-reader/version`
- Tombol **Ambil Pengaturan dari Web** untuk mengisi metadata versi dan menaikkan `versionCode`.
- Pilihan sederhana:
  - **APK Percobaan** = debug APK untuk uji internal.
  - **APK Resmi Sekolah** = release/signed APK untuk petugas.
- Tombol utama **BUAT APK SEKARANG**.
- Tombol **Buka Folder APK**.
- Tombol **Install ke HP via Kabel USB** jika ADB tersedia.
- Tombol **Lihat Panduan Provisioning**.

## Mode Lanjutan

Dipakai operator IT untuk:

- Mengubah `applicationId`.
- Memilih folder project Android.
- Memilih output folder APK.
- Import/generate keystore release.
- Save/load profile JSON.
- Increment versionCode manual.

Password keystore tidak disimpan di profile JSON kecuali user mencentang opsi penyimpanan lokal.

## Publish Metadata ke Web

Tab **5 Publish Web** bisa mengupdate metadata versi APK di backend:

```http
PUT /api/v1/mobile/android-reader/version
```

Data yang dikirim:

- `latestVersionName`
- `latestVersionCode`
- `minSupportedVersionCode`
- `downloadUrl` opsional
- `releaseNotes` opsional
- `forceUpdate`

Builder login via:

```http
POST /api/v1/auth/login
```

Catatan keamanan:

- Password web tidak disimpan.
- Builder tidak mengupload file APK otomatis.
- File APK tetap harus ditempatkan di lokasi download sekolah jika ingin memakai `downloadUrl`.

## Build via command line tetap tersedia

```bash
cd apps/android-reader
./gradlew assembleDebug
./gradlew assembleRelease
```

Custom via `gradle.properties`:

```properties
SCHOOLHUB_APP_NAME=SIAB2 Reader
SCHOOLHUB_APPLICATION_ID=id.sch.man1rokanhulu.absensi
SCHOOLHUB_SERVER_BASE_URL=https://absensi.man1rokanhulu.cloud
SCHOOLHUB_VERSION_NAME=1.2.0
SCHOOLHUB_VERSION_CODE=4
```

## Keamanan

- Builder hanya membangun APK/branding dan metadata versi.
- Builder tidak menyimpan reader secret production.
- Secret perangkat diprovision setelah APK terinstall lewat server/admin panel.
- Secret disimpan APK di encrypted storage/Android Keystore.
- Jangan share keystore release, password keystore, kode aktivasi HP, atau secret reader.

Panduan operator lengkap:

```text
docs/CARA_BUILD_APK_UNTUK_OPERATOR.md
```
