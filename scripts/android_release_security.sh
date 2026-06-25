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
if grep -RInE '(AKIA[0-9A-Z]{16}|-----BEGIN (RSA|OPENSSH|EC|DSA|PRIVATE) KEY-----|ghp_[A-Za-z0-9_]{36,}|github_pat_[A-Za-z0-9_]{82,}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{10,})' app/src/main app/src/test app/build.gradle.kts build.gradle.kts settings.gradle.kts >/tmp/android-secret-patterns.txt 2>/dev/null; then
  cp /tmp/android-secret-patterns.txt ../../artifacts/android-security/secret-patterns.txt
  exit 1
fi
if grep -RInE 'http://[^/[:space:]]+' app/src/main 2>/dev/null \
  | grep -Ev 'http://schemas\.android\.com|http://www\.w3\.org|startsWith\("http://"\)' \
  >/tmp/android-cleartext-url.txt; then
  cp /tmp/android-cleartext-url.txt ../../artifacts/android-security/cleartext-url-fail.txt
  exit 1
fi
if ! grep -q '<string name="app_name">SIAB2 Reader</string>' app/src/main/res/values/strings.xml; then
  printf 'Expected Android app label to remain SIAB2 Reader.\n' > ../../artifacts/android-security/branding-fail.txt
  exit 1
fi
if ! grep -q '^SCHOOLHUB_APPLICATION_ID=id\.sch\.man1rokanhulu\.absensi$' gradle.properties; then
  printf 'Android application ID changed unexpectedly.\n' > ../../artifacts/android-security/package-id-fail.txt
  exit 1
fi
apk=$(find app/build/outputs/apk/debug -name '*.apk' | head -1)
sha256sum "$apk" > ../../artifacts/android-security/debug-apk.sha256
printf '{"ok":true,"allowBackup":false,"cleartextTraffic":false,"secretPatterns":false,"cleartextUrls":false}\n' > ../../artifacts/android-security/result.json
