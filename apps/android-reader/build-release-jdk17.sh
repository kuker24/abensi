#!/usr/bin/env bash

readonly DEFAULT_VERSION_NAME="1.2.9"
readonly DEFAULT_VERSION_CODE="13"
readonly PRODUCTION_PACKAGE_NAME="id.sch.man1rokanhulu.absensi"
readonly APPROVED_SIGNER_SHA256="d59641008136073660c01f7b57957895d21ca4f310bcf7a4329c05173a3581eb"

signing_error() {
  printf '%s\n' "Release signing belum siap: $1" >&2
  return 1
}

read_signing_property() {
  awk -F= -v property="$1" '
    $1 == property {
      value = $0
      sub(/^[^=]*=/, "", value)
    }
    END { print value }
  ' keystore.properties
}

normalize_sha256() {
  local normalized
  normalized="$(printf '%s' "$1" | tr -d '[:space:]:' | tr '[:upper:]' '[:lower:]')"
  [[ "$normalized" =~ ^[0-9a-f]{64}$ ]] || return 1
  printf '%s\n' "$normalized"
}

expected_signer_sha256() {
  local configured_signer signer
  configured_signer="${SCHOOLHUB_EXPECTED_SIGNER_SHA256:-$APPROVED_SIGNER_SHA256}"
  if [[ -n "${SCHOOLHUB_EXPECTED_SIGNER_SHA256:-}" && ! "$configured_signer" =~ ^[0-9A-Fa-f]{64}$ ]]; then
    signing_error "SCHOOLHUB_EXPECTED_SIGNER_SHA256 harus 64 karakter hex."
    return 1
  fi
  signer="$(normalize_sha256 "$configured_signer")" || {
    signing_error "fingerprint signer yang diharapkan harus 64 karakter hex."
    return 1
  }
  printf '%s\n' "$signer"
}

find_android_tool() {
  local tool="$1"
  local android_home="${ANDROID_HOME:-}"
  if [[ -z "$android_home" || ! -d "$android_home/build-tools" ]]; then
    signing_error "Android SDK build-tools tidak ditemukan."
    return 1
  fi

  find "$android_home/build-tools" -mindepth 2 -maxdepth 2 -type f -name "$tool" -print \
    | sort -V \
    | tail -n 1
}

metadata_field() {
  local metadata="$1"
  local field="$2"
  printf '%s\n' "$metadata" | sed -nE "s/.*[^A-Za-z]${field}='([^']*)'.*/\\1/p" | sed -n '1p'
}

attribute_is_false() {
  local attribute_line="$1"
  printf '%s\n' "$attribute_line" | grep -Eiq '(^|[^[:alnum:]_])(false|0x0+)([^[:xdigit:]]|$)'
}

validate_apk_metadata() {
  local apk="$1"
  local aapt_path="$2"
  local expected_version_name="$3"
  local expected_version_code="$4"
  local badging package_line package_name version_name version_code xmltree debuggable_line cleartext_line

  badging="$("$aapt_path" dump badging "$apk")" || {
    signing_error "metadata APK tidak dapat dibaca."
    return 1
  }
  package_line="$(printf '%s\n' "$badging" | sed -n '/^package: /{p;q;}')"
  package_name="$(metadata_field "$package_line" "name")"
  version_name="$(metadata_field "$package_line" "versionName")"
  version_code="$(metadata_field "$package_line" "versionCode")"

  if [[ "$package_name" != "$PRODUCTION_PACKAGE_NAME" ]]; then
    signing_error "package APK bukan package produksi."
    return 1
  fi
  if [[ "$version_name" != "$expected_version_name" ]]; then
    signing_error "versionName APK tidak sesuai release yang diminta."
    return 1
  fi
  if [[ "$version_code" != "$expected_version_code" ]]; then
    signing_error "versionCode APK tidak sesuai release yang diminta."
    return 1
  fi

  xmltree="$("$aapt_path" dump xmltree "$apk" AndroidManifest.xml)" || {
    signing_error "manifest APK tidak dapat dibaca."
    return 1
  }
  debuggable_line="$(printf '%s\n' "$xmltree" | grep -i 'android:debuggable' || true)"
  if [[ -n "$debuggable_line" ]] && ! attribute_is_false "$debuggable_line"; then
    signing_error "APK release tidak boleh debuggable."
    return 1
  fi

  cleartext_line="$(printf '%s\n' "$xmltree" | grep -i 'android:usesCleartextTraffic' || true)"
  if [[ -z "$cleartext_line" ]]; then
    signing_error "usesCleartextTraffic harus dideklarasikan eksplisit false."
    return 1
  fi
  if ! attribute_is_false "$cleartext_line"; then
    signing_error "APK release tidak boleh mengizinkan cleartext traffic."
    return 1
  fi
}

validate_signed_apk() {
  local apk="$1"
  local apksigner_path="$2"
  local aapt_path="$3"
  local expected_version_name="$4"
  local expected_version_code="$5"
  local signer_output signer_lines actual_signer expected_signer

  if ! "$apksigner_path" verify --verbose "$apk" >/dev/null 2>&1; then
    signing_error "APK signed tidak valid."
    return 1
  fi
  signer_output="$("$apksigner_path" verify --print-certs "$apk")" || {
    signing_error "certificate APK tidak dapat dibaca."
    return 1
  }
  signer_lines="$(printf '%s\n' "$signer_output" | grep -i 'certificate SHA-256 digest:' || true)"
  if [[ "$(printf '%s\n' "$signer_lines" | sed '/^$/d' | wc -l | tr -d '[:space:]')" != "1" ]]; then
    signing_error "APK harus memiliki tepat satu certificate SHA-256."
    return 1
  fi
  actual_signer="$(printf '%s\n' "$signer_lines" | sed -n 's/.*certificate SHA-256 digest:[[:space:]]*//Ip')"
  actual_signer="$(normalize_sha256 "$actual_signer")" || {
    signing_error "fingerprint signer APK tidak valid."
    return 1
  }
  expected_signer="$(expected_signer_sha256)" || return 1
  if [[ "$actual_signer" != "$expected_signer" ]]; then
    signing_error "signer APK tidak cocok dengan signer produksi yang disetujui."
    return 1
  fi

  validate_apk_metadata "$apk" "$aapt_path" "$expected_version_name" "$expected_version_code"
}

validate_version_inputs() {
  local version_name="$1"
  local version_code="$2"
  if [[ ! "$version_name" =~ ^[0-9][0-9A-Za-z._-]*$ ]]; then
    signing_error "SCHOOLHUB_VERSION_NAME tidak valid."
    return 1
  fi
  if [[ ! "$version_code" =~ ^[1-9][0-9]*$ ]]; then
    signing_error "SCHOOLHUB_VERSION_CODE tidak valid."
    return 1
  fi
}

main() {
  cd "$(dirname "$0")"

  [[ -f keystore.properties ]] || signing_error "keystore.properties tidak ditemukan."

  local store_file store_password key_alias key_password keystore_path
  store_file="$(read_signing_property storeFile)"
  store_password="$(read_signing_property storePassword)"
  key_alias="$(read_signing_property keyAlias)"
  key_password="$(read_signing_property keyPassword)"
  if [[ -z "$store_file" || -z "$store_password" || -z "$key_alias" || -z "$key_password" ]]; then
    signing_error "properti signing tidak lengkap."
  fi

  if [[ "$store_file" = /* ]]; then
    keystore_path="$store_file"
  else
    keystore_path="$PWD/$store_file"
  fi
  [[ -f "$keystore_path" ]] || signing_error "file keystore tidak ditemukan."

  local expected_version_name expected_version_code
  expected_version_name="${SCHOOLHUB_VERSION_NAME:-$DEFAULT_VERSION_NAME}"
  expected_version_code="${SCHOOLHUB_VERSION_CODE:-$DEFAULT_VERSION_CODE}"
  validate_version_inputs "$expected_version_name" "$expected_version_code"

  # shellcheck disable=SC1091
  source ./env-jdk17.sh
  ./gradlew assembleRelease \
    "-PSCHOOLHUB_VERSION_NAME=$expected_version_name" \
    "-PSCHOOLHUB_VERSION_CODE=$expected_version_code"

  local release_dir apk apksigner_path aapt_path
  release_dir="$PWD/app/build/outputs/apk/release"
  apk="$release_dir/app-release.apk"
  [[ -s "$apk" ]] || signing_error "APK signed tidak dihasilkan."

  apksigner_path="$(find_android_tool apksigner)"
  [[ -n "$apksigner_path" ]] || signing_error "Android apksigner tidak ditemukan."
  aapt_path="$(find_android_tool aapt)"
  [[ -n "$aapt_path" ]] || signing_error "Android aapt tidak ditemukan."
  validate_signed_apk "$apk" "$apksigner_path" "$aapt_path" "$expected_version_name" "$expected_version_code"

  local friendly
  mkdir -p output
  friendly="$PWD/output/Absensi-MAN-1-Rokan-Hulu-v${expected_version_name}-code${expected_version_code}-release.apk"
  cp -f "$apk" "$friendly"
  printf '\nAPK signed release siap di folder:\n%s\n\nSalinan APK:\n%s\n' "$release_dir" "$friendly"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  main "$@"
fi
