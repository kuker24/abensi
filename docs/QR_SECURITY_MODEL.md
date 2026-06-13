# QR Security Model — SchoolHub e-Hadir

## Keputusan arsitektur

Jalur produksi resmi QR memakai endpoint baru:

```http
POST /api/v1/attendance/qr-reader-scan
```

Endpoint lama `/api/v1/attendance/qr-scan` tetap ada sebagai **legacy/manual admin path**, bukan jalur produksi utama.

## Format QR credential

QR tidak menyimpan nama, NISN mentah, role, password, JWT, atau data pribadi sensitif.

Format:

```text
schoolhub:qr:v1:<opaqueCode>
```

Contoh:

```text
schoolhub:qr:v1:QR_7F3K9X2P8LQ0
```

Server menyimpan `SHA-256(normalizedQrCode)` sebagai `QrCredential.codeHash`. Plain QR hanya dikembalikan saat generate/provision cetak dan juga disimpan terenkripsi untuk export kartu oleh admin.

## Signed Android reader request

APK Android adalah reader resmi. Setiap scan harus mengirim header:

```text
x-reader-device-id
x-reader-timestamp
x-reader-nonce
x-reader-body-hash
x-reader-signature
```

Canonical payload:

```text
METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + NONCE + "\n" + BODY_HASH
```

Signature:

```text
HMAC-SHA256(deviceSecret, canonicalPayload)
```

Server mengecek:

1. `deviceId` terdaftar di `DeviceReader`.
2. Status reader `ACTIVE`, tidak `REVOKED`.
3. Type reader `QR_ANDROID`.
4. Mode ada di `allowedModes`.
5. Timestamp tidak melewati skew.
6. Nonce belum pernah dipakai.
7. Body hash cocok canonical JSON.
8. Signature HMAC cocok.
9. App version code tidak di bawah minimum.
10. QR credential aktif dan belum expired.
11. User aktif.
12. AttendancePolicy terpenuhi.

## Mode scan

| Mode | Efek |
|---|---|
| `GATE_IN` | Membuat `GateLog IN` jika policy valid |
| `GATE_OUT` | Membuat `GateLog OUT` jika IN ada, Ashar terpenuhi jika wajib |
| `MUSHOLA` | Server menentukan `DHUHA/DZUHUR/ASHAR` dari waktu server |
| `CHECK_ONLY` | Validasi user/QR saja, tidak membuat log absensi |

## Revocation

- QR hilang: revoke/rotate `QrCredential`.
- HP hilang: revoke `DeviceReader` Android.
- Secret bocor: rotate secret reader, provision ulang perangkat.

## Offline queue

APK boleh menyimpan pending scan terenkripsi lokal dengan batas jumlah. Pending bukan hadir final. Saat sync, server tetap boleh menolak berdasarkan policy dan waktu server.
