#!/usr/bin/env bash
# Dipakai oleh script build/test Android agar otomatis memilih JDK 17/21 yang cocok.
# Jalankan dengan: source ./env-jdk17.sh

set -euo pipefail

find_jdk() {
  local candidates=(
    "${JAVA_HOME:-}"
    "/usr/lib/jvm/java-17-openjdk"
    "/usr/lib/jvm/java-21-openjdk"
    "$HOME/.local/jdks/jdk-17"
    "$HOME/.local/jdks/jdk-21"
    "$HOME/.local/share/jdks/temurin-17"
    "$HOME/.local/share/jdks/temurin-21"
    "$HOME/.gradle/jdks/eclipse_adoptium-17-amd64-linux.2"
    "$HOME/.gradle/jdks/eclipse_adoptium-21-amd64-linux.2"
    "$HOME/android-studio/jbr"
  )
  local dir
  for dir in "${candidates[@]}"; do
    if [ -n "$dir" ] && [ -x "$dir/bin/java" ]; then
      local version
      version=$("$dir/bin/java" -version 2>&1 | head -1 || true)
      if [[ "$version" == *'"17.'* || "$version" == *'"21.'* ]]; then
        printf '%s\n' "$dir"
        return 0
      fi
    fi
  done
  return 1
}

find_sdk() {
  local candidates=(
    "${ANDROID_HOME:-}"
    "${ANDROID_SDK_ROOT:-}"
    "$HOME/Android/Sdk"
    "$HOME/.local/share/android-sdk"
  )
  local dir
  for dir in "${candidates[@]}"; do
    if [ -n "$dir" ] \
      && [ -d "$dir/platforms/android-35" ] \
      && [ -x "$dir/build-tools/35.0.0/aapt" ] \
      && [ -x "$dir/build-tools/35.0.0/apksigner" ]; then
      printf '%s\n' "$dir"
      return 0
    fi
  done
  return 1
}

JAVA_HOME="$(find_jdk)" || {
  echo "JDK 17/21 belum ditemukan. Install Temurin JDK 17/21, lalu jalankan lagi." >&2
  return 1 2>/dev/null || exit 1
}
ANDROID_HOME="$(find_sdk)" || {
  echo "Android SDK belum ditemukan. Install Android Studio dan pastikan folder Android/Sdk ada." >&2
  return 1 2>/dev/null || exit 1
}

export JAVA_HOME
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

echo "JDK siap: $JAVA_HOME"
echo "Android SDK siap: $ANDROID_HOME"
java -version
