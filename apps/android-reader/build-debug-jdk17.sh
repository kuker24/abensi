#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck disable=SC1091
source ./env-jdk17.sh
./gradlew assembleDebug
mkdir -p output
version_name="$(grep -E '^SCHOOLHUB_VERSION_NAME=' gradle.properties | tail -1 | cut -d= -f2-)"
version_code="$(grep -E '^SCHOOLHUB_VERSION_CODE=' gradle.properties | tail -1 | cut -d= -f2-)"
friendly="$PWD/output/Absensi-MAN-1-Rokan-Hulu-v${version_name:-1.1.1}-code${version_code:-3}-debug.apk"
cp -f "$PWD/app/build/outputs/apk/debug/app-debug.apk" "$friendly"
printf '\nAPK debug siap di:\n%s\n\nCopy ke HP dari file ini:\n%s\n' "$PWD/app/build/outputs/apk/debug/app-debug.apk" "$friendly"
