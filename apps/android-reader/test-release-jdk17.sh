#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "$0")" && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

expect_reject() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    fail "${label} diterima"
  fi
}

mock_apksigner="$tmp_dir/apksigner"
mock_aapt="$tmp_dir/aapt"
mock_apk="$tmp_dir/app-release.apk"
touch "$mock_apk"

cat > "$mock_apksigner" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"--verbose"* ]]; then
  exit 0
fi
if [[ "$*" == *"--print-certs"* ]]; then
  for signer_number in $(seq 1 "${MOCK_CERT_COUNT:-1}"); do
    printf 'Signer #%s certificate SHA-256 digest: %s\n' "$signer_number" "${MOCK_SIGNER_SHA256}"
  done
  exit 0
fi
exit 2
EOF

cat > "$mock_aapt" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$2" == "badging" ]]; then
  printf "package: name='%s' versionCode='%s' versionName='%s' platformBuildVersionName='15' platformBuildVersionCode='35' compileSdkVersion='35' compileSdkVersionCodename='15'\n" \
    "${MOCK_PACKAGE_NAME}" "${MOCK_VERSION_CODE}" "${MOCK_VERSION_NAME}"
  exit 0
fi
if [[ "$2" == "xmltree" ]]; then
  if [[ "${MOCK_DEBUGGABLE}" != "absent" ]]; then
    printf 'A: android:debuggable(0x0101000f)=(type 0x12)%s\n' "${MOCK_DEBUGGABLE}"
  fi
  if [[ "${MOCK_CLEARTEXT}" != "absent" ]]; then
    printf 'A: android:usesCleartextTraffic(0x010104ec)=(type 0x12)%s\n' "${MOCK_CLEARTEXT}"
  fi
  exit 0
fi
exit 2
EOF
chmod 700 "$mock_apksigner" "$mock_aapt"

# Source validators without running release signing or Gradle.
# shellcheck disable=SC1090
source "$root_dir/build-release-jdk17.sh"

export MOCK_PACKAGE_NAME="id.sch.man1rokanhulu.absensi"
export MOCK_VERSION_NAME="1.2.5"
export MOCK_VERSION_CODE="9"
export MOCK_SIGNER_SHA256="d59641008136073660c01f7b57957895d21ca4f310bcf7a4329c05173a3581eb"
export MOCK_DEBUGGABLE="absent"
export MOCK_CLEARTEXT="0x0"
export MOCK_CERT_COUNT="1"

validate_signed_apk "$mock_apk" "$mock_apksigner" "$mock_aapt" "1.2.5" "9"

export MOCK_CERT_COUNT="2"
expect_reject "sertifikat ganda" validate_signed_apk "$mock_apk" "$mock_apksigner" "$mock_aapt" "1.2.5" "9"
export MOCK_CERT_COUNT="1"

export MOCK_SIGNER_SHA256="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
expect_reject "signer salah" validate_signed_apk "$mock_apk" "$mock_apksigner" "$mock_aapt" "1.2.5" "9"
export MOCK_SIGNER_SHA256="d59641008136073660c01f7b57957895d21ca4f310bcf7a4329c05173a3581eb"

export SCHOOLHUB_EXPECTED_SIGNER_SHA256="d5:96:41:00:81:36:07:36:60:c0:1f:7b:57:95:78:95:d2:1c:a4:f3:10:bc:f7:a4:32:9c:05:17:3a:35:81:eb"
expect_reject "override signer berformat salah" expected_signer_sha256
unset SCHOOLHUB_EXPECTED_SIGNER_SHA256

export MOCK_VERSION_CODE="8"
expect_reject "version code salah" validate_signed_apk "$mock_apk" "$mock_apksigner" "$mock_aapt" "1.2.5" "9"
export MOCK_VERSION_CODE="9"

export MOCK_DEBUGGABLE="0xffffffff"
expect_reject "APK debuggable" validate_signed_apk "$mock_apk" "$mock_apksigner" "$mock_aapt" "1.2.5" "9"
export MOCK_DEBUGGABLE="absent"

export MOCK_CLEARTEXT="0xffffffff"
expect_reject "cleartext aktif" validate_signed_apk "$mock_apk" "$mock_apksigner" "$mock_aapt" "1.2.5" "9"
export MOCK_CLEARTEXT="absent"
expect_reject "cleartext tidak eksplisit" validate_signed_apk "$mock_apk" "$mock_apksigner" "$mock_aapt" "1.2.5" "9"

printf 'PASS: mocked release signer and APK metadata gates.\n'
