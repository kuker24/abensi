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
- Production provisioning accepts one short-lived, one-time code issued for one of four server-pinned targets: `READER_DEV_TEST_01` and `READER_IDENTITY_01` are `CHECK_ONLY`; `READER_GATE_PRAYER_01` and `READER_GATE_PRAYER_02` allow `GERBANG` and `MUSHOLA`. Trust returned target device ID and allowed modes; never offer local override or reassign target identity.
- Store reader secret in Android Keystore-backed encrypted preferences. Encrypt offline queue with Keystore-backed AES/GCM. Never expose secret, raw QR, nonce, or signature in UI, logs, history, fixtures, or tests.
- QR history retains only masked data. Retry queue behavior must distinguish server rejection from connectivity failure.
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
