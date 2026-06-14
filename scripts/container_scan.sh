#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts/security
if command -v trivy >/dev/null 2>&1; then
  trivy fs --severity HIGH,CRITICAL --exit-code 1 --format json --output artifacts/security/trivy-fs.json .
else
  echo '{"ok":false,"reason":"trivy not installed"}' | tee artifacts/security/trivy-fs.json
  exit 1
fi
