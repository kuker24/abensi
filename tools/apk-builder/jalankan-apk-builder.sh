#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

find_jdk() {
  local candidates=(
    "$HOME/.local/jdks/jdk-17"
    "$HOME/.local/jdks/jdk-21"
    "$HOME/.gradle/jdks/eclipse_adoptium-17-amd64-linux.2"
    "$HOME/.gradle/jdks/eclipse_adoptium-21-amd64-linux.2"
    "$HOME/android-studio/jbr"
    "/usr/lib/jvm/java-17-openjdk"
    "/usr/lib/jvm/java-21-openjdk"
  )
  local dir
  for dir in "${candidates[@]}"; do
    if [ -x "$dir/bin/java" ]; then
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
  local candidates=("${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Android/Sdk")
  local dir
  for dir in "${candidates[@]}"; do
    if [ -n "$dir" ] && [ -d "$dir/platforms" ]; then
      printf '%s\n' "$dir"
      return 0
    fi
  done
  return 1
}

if jdk_home=$(find_jdk); then
  export JAVA_HOME="$jdk_home"
  export PATH="$JAVA_HOME/bin:$PATH"
  echo "JDK otomatis dipakai: $JAVA_HOME"
else
  echo "Peringatan: JDK 17/21 belum ditemukan. Builder tetap dibuka, tetapi build APK butuh JDK 17/21."
  echo "Download JDK: https://adoptium.net/temurin/releases/?version=17"
fi

if sdk_home=$(find_sdk); then
  export ANDROID_HOME="$sdk_home"
  export ANDROID_SDK_ROOT="$sdk_home"
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
  echo "Android SDK otomatis dipakai: $ANDROID_HOME"
else
  echo "Peringatan: Android SDK belum ditemukan. Install Android Studio jika build APK gagal."
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 belum terpasang. Install Python 3.11+ dulu."
  exit 1
fi

if [ ! -d .venv ]; then
  echo "Membuat virtual environment Python..."
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
. .venv/bin/activate

python -m pip install --upgrade pip
pip install -r requirements.txt
python main.py
