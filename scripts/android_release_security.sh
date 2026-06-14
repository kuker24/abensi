#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts/android-security
cd apps/android-reader
./gradlew --no-daemon test lint assembleDebug
if grep -R "android:allowBackup=\"true\"" -n app/src/main AndroidManifest.xml >/tmp/android-backup.txt 2>/dev/null; then
  cp /tmp/android-backup.txt ../../artifacts/android-security/backup-fail.txt
  exit 1
fi
if grep -R "android:usesCleartextTraffic=\"true\"" -n app/src/main AndroidManifest.xml >/tmp/android-cleartext.txt 2>/dev/null; then
  cp /tmp/android-cleartext.txt ../../artifacts/android-security/cleartext-fail.txt
  exit 1
fi
apk=$(find app/build/outputs/apk/debug -name '*.apk' | head -1)
sha256sum "$apk" > ../../artifacts/android-security/debug-apk.sha256
printf '{"ok":true}\n' > ../../artifacts/android-security/result.json
