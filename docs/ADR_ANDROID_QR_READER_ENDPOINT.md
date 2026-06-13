# ADR — Official Android QR Reader Endpoint

Status: Accepted

## Decision

Official Android QR attendance uses a new endpoint:

```http
POST /api/v1/attendance/qr-reader-scan
```

The legacy endpoint remains:

```http
POST /api/v1/attendance/qr-scan
```

but is explicitly treated as manual/legacy admin path and can be disabled through `AttendancePolicy.legacyQrScanEnabled`.

## Rationale

- Avoids breaking existing `/attendance/reader-scan` RFID/SmartCard integrations.
- Keeps signed QR Android payload distinct from legacy manual QR payload.
- Reuses the existing signed reader HMAC security model.
- Makes Nginx rate limiting and audit logs clearer.

## Security properties

The Android endpoint requires `x-reader-*` HMAC headers and verifies `DeviceReader.type = QR_ANDROID`, allowed scan mode, nonce anti-replay, timestamp skew, body hash, app version, QR credential status, user activity, and server-side AttendancePolicy.
