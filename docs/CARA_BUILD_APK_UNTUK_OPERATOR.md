# Cara Build APK Android SIAB2 Reader untuk Operator Awam

Panduan ini untuk membuat APK **SIAB2 Reader** tanpa perlu paham Gradle/Android teknis.

> Penting: APK dibuat di laptop/komputer operator, **bukan di VPS**. Secret reader tidak masuk APK. Secret dibuat saat provisioning dari web admin.

## Yang Perlu Disiapkan Sekali Saja

1. Laptop/PC dengan internet.
2. Python 3.11+.
3. JDK 17 atau 21.
4. Android Studio / Android SDK.
5. Source project aplikasi lengkap di laptop.

Kalau belum yakin laptop sudah siap, tidak apa-apa. Builder punya tombol **CEK KESIAPAN LAPTOP**.

## Buka APK Builder

### Linux

```bash
cd tools/apk-builder
./jalankan-apk-builder.sh
```

### Windows

Buka folder:

```text
tools\apk-builder
```

Lalu double click:

```text
jalankan-apk-builder.bat
```

Launcher akan otomatis:

- memilih JDK 17/21 jika ada di laptop,
- memilih Android SDK jika ada,
- membuat environment Python,
- membuka aplikasi **SIAB2 APK Builder**.

Jika auto-detect gagal, operator IT dapat mengatur `JAVA_HOME`, `ANDROID_HOME`, atau `ANDROID_SDK_ROOT` sesuai lokasi instalasi JDK/Android SDK di laptop tersebut.

## Langkah 1 — Cek Kesiapan Laptop

Di tab **1 Cek Laptop**, klik:

```text
1. CEK KESIAPAN LAPTOP
```

Jika semua penting hijau, lanjut. Jika merah:

- Java harus JDK 17/21, bukan Java 26. Builder akan mencari otomatis di laptop.
- Android SDK harus terdeteksi. Builder akan mencari otomatis di `~/Android/Sdk`.
- ADB boleh merah; itu hanya untuk install via kabel USB. APK tetap bisa dicopy manual.

## Langkah 2 — Hubungkan ke Web SIAB2

Di tab **2 Hubungkan Web**, isi alamat web aktif, contoh:

```text
https://absensi.man1rokanhulu.cloud
```

Klik:

```text
2. CEK KONEKSI KE WEB
```

Kalau berhasil, klik:

```text
Ambil Pengaturan dari Web
```

Builder akan mengambil metadata versi dari server dan otomatis menaikkan `versionCode` untuk APK baru.

## Langkah 3 — Atur APK

Di tab **3 Atur APK**:

1. Isi nama aplikasi, contoh:
   ```text
   SIAB2
   ```
2. Pilih jenis APK:
   - **APK Percobaan**: untuk uji coba internal.
   - **APK Resmi Sekolah**: untuk dipakai petugas, wajib keystore.
3. Icon boleh dikosongkan.
4. Klik:
   ```text
   3. SIMPAN BRANDING
   ```

## Langkah 4 — Buat APK

Di tab **4 Buat APK**, klik tombol besar:

```text
4. BUAT APK SEKARANG
```

Jika selesai, klik:

```text
Buka Folder APK
```

File APK siap dicopy/install ke HP Android.

## Jika Membuat APK Resmi Sekolah

Sebelum build release, buka tab **Mode Lanjutan**:

1. Isi **Store Password** minimal 8 karakter.
2. Klik **Buat Keystore Otomatis**.
3. Simpan file `.jks` dan password di tempat aman.
4. Kembali ke tab **3 Atur APK**.
5. Pilih **APK Resmi Sekolah — release/signed**.
6. Klik **BUAT APK SEKARANG**.

Jangan share file keystore dan password ke orang yang tidak berwenang.

## Publish Metadata Versi ke Web

Setelah APK berhasil dibuat dan file APK sudah ditaruh di tempat download sekolah, buka tab **5 Publish Web**.

Isi:

- Download URL APK, jika ada.
- Release notes.
- Username/password admin/operator.

Klik:

```text
PUBLISH METADATA KE WEB
```

Catatan:

- Builder **tidak mengupload file APK otomatis**.
- Builder hanya mengupdate metadata versi APK di web.
- Password web tidak disimpan.

## Setelah APK Terinstall di HP

1. Buka web admin.
2. Masuk ke `/admin/devices`.
3. Buka tab **Aktivasi HP Scanner**.
4. Pilih salah satu dari 4 reader target (`READER_DEV_TEST_01`, `READER_IDENTITY_01`, `READER_GATE_PRAYER_01`, `READER_GATE_PRAYER_02`), lalu buat kode aktivasi.
5. Buka APK di HP sesuai mapping.
6. Isi server URL production.
7. Tempel kode aktivasi dari admin; jangan screenshot/share ke chat/log.
8. Pastikan status heartbeat/seen muncul sebelum live scan.

`READER_DEV_TEST_01` khusus Dev Test Identitas (`CHECK_ONLY`). `READER_IDENTITY_01` khusus Dev Test Gerbang & Mushola (`GATE_IN`, `GATE_OUT`, `MUSHOLA`), tetapi semua scan hanya menguji validasi QR dan tidak mencatat absensi. Dua HP `READER_GATE_PRAYER_*` tetap untuk Gerbang/Mushola production setelah approval controlled UAT terpisah.

## Troubleshooting Singkat

| Masalah | Solusi |
|---|---|
| Java terdeteksi versi 26 | Install/gunakan JDK 17 atau 21 |
| Android SDK merah | Install Android Studio dan set `ANDROID_HOME` |
| Web gagal dicek | Pastikan URL benar dan web bisa dibuka di browser |
| APK Resmi gagal karena keystore | Buat/import keystore di Mode Lanjutan |
| Install USB gagal | Copy APK manual ke HP atau install Android platform-tools |
| Kode aktivasi kedaluwarsa | Buat kode aktivasi baru dari admin web |
