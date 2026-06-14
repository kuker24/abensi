#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts/security
patterns='(AKIA[0-9A-Z]{16}|-----BEGIN (RSA|OPENSSH|EC|DSA|PRIVATE) KEY-----|ghp_[A-Za-z0-9_]{36,}|github_pat_[A-Za-z0-9_]{82,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})'
if rg -n --hidden --glob '!node_modules/**' --glob '!apps/**/node_modules/**' --glob '!artifacts/**' --glob '!backups/**' --glob '!apps/web/public/id-card-generator/assets/**' --glob '!*.lock' --glob '!package-lock.json' -e "$patterns" . > artifacts/security/secret-scan.txt; then
  echo 'Potential secret patterns found. Review artifacts/security/secret-scan.txt' >&2
  exit 1
fi
printf '{"ok":true}\n' > artifacts/security/secret-scan.json
