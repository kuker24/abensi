#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck disable=SC1091
source ./env-jdk17.sh
./gradlew assembleRelease
mkdir -p output
version_name="$(grep -E '^SCHOOLHUB_VERSION_NAME=' gradle.properties | tail -1 | cut -d= -f2-)"
version_code="$(grep -E '^SCHOOLHUB_VERSION_CODE=' gradle.properties | tail -1 | cut -d= -f2-)"
release_dir="$PWD/app/build/outputs/apk/release"
if [ -f "$release_dir/app-release.apk" ]; then
  apk="$release_dir/app-release.apk"
  suffix="release"
else
  apk="$release_dir/app-release-unsigned.apk"
  suffix="release-unsigned"
fi
friendly="$PWD/output/Absensi-MAN-1-Rokan-Hulu-v${version_name:-1.2.0}-code${version_code:-4}-$suffix.apk"
cp -f "$apk" "$friendly"
printf '\nAPK release siap di folder:\n%s\n\nSalinan APK:\n%s\n' "$release_dir" "$friendly"
