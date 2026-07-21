# Android Reader DOX

## Purpose
Kotlin/Jetpack Compose operator application for activated Android QR readers. Scans gate and prayer attendance, stores encrypted offline queue, then submits signed requests to SIAB2 API.

## Ownership
- Compose entry shell and route coordination: `app/src/main/java/id/sch/man1rokanhulu/absensi/MainActivity.kt`.
- Reader configuration, encrypted queue, and history: `data/`.
- HTTP and signed API requests: `network/` and `security/`.
- Camera/QR behavior: `scanner/`; UI: `ui/`; update policy/install: `update/`.
- Build configuration: `app/build.gradle.kts`; operator/build guidance: `README.md`.

## Local Contracts
- Production scans target API `POST /api/v1/attendance/qr-reader-scan`; requests require activated device identity plus timestamp, nonce, body hash, and HMAC-SHA256 signature.
- Production provisioning accepts one short-lived, one-time code issued for one of four server-pinned targets: `READER_DEV_TEST_01` is `CHECK_ONLY`; `READER_IDENTITY_01` permits test-only `GATE_IN`, `GATE_OUT`, and `MUSHOLA` validation without attendance writes; `READER_GATE_PRAYER_01` and `READER_GATE_PRAYER_02` record those modes normally. Trust returned target device ID and allowed modes; never offer local override or reassign target identity. Home screen shows separate "Scan Gerbang Datang" and "Scan Gerbang Pulang" buttons for gate readers. The legacy combined `GERBANG` mode is never selectable.
- Store reader secret in Android Keystore-backed encrypted preferences. Encrypt offline queue with Keystore-backed AES/GCM. Never expose secret, raw QR, nonce, or signature in UI, logs, history, fixtures, or tests.
- QR history retains only masked data. Queue rows preserve original scan time in `createdAt`; every resend supplies it as `clientScannedAt` while request-signature time remains current. Sync selects only rows below 10 attempts, so parked rows never block later rows. Decrypt and QR validation happen per row: corruption is deleted with sanitized local rejection history, never retried or exposed; unexpected local failures remain unchanged and stop current flush for investigation. HTTP `408`, `425`, `429`, `5xx`, and `IOException` stay queued, increment atomically, and park after 10 attempts for operator action; terminal business `4xx` is sanitized then deleted.
- Release builds require HTTPS and disable cleartext traffic. Debug may allow HTTP only for local testing.
- `allowBackup="false"` and sensitive-data backup exclusions protect local state. Do not weaken them.
- Release signing depends on local `keystore.properties`; never read, print, or commit keystore material.

## Work Guidance
- Keep client canonical JSON and signing logic synchronized with API verifier and QR-reader endpoint tests.
- Preserve activation before scanning, server-pinned mode enforcement, camera permission guidance, bounded history, encrypted queue, and operator-visible offline feedback. `CHECK_ONLY` must not mutate attendance.
- Use JDK 17 toolchain. Check Android build/manifest changes against security tests.
- Generated APKs and build output are not source artifacts.

## Verification
From `apps/android-reader/`, JDK 17/21 and Android SDK required:

- `./test-jdk17.sh`
- `./gradlew testDebugUnitTest`
- `./build-debug-jdk17.sh` or `./gradlew assembleDebug`
- Release security scope: repository root `npm run security:android`; release build needs local signing material and explicit authorization.

## Child DOX Index
No child DOX. Kotlin packages follow this contract.
