#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts/security
patterns='(AKIA[0-9A-Z]{16}|-----BEGIN (RSA|OPENSSH|EC|DSA|PRIVATE) KEY-----|ghp_[A-Za-z0-9_]{36,}|github_pat_[A-Za-z0-9_]{82,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})'
current_report=artifacts/security/secret-scan-current.txt
history_report=artifacts/security/secret-scan-history.txt
: > "$current_report"
: > "$history_report"
if rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!apps/**/node_modules/**' --glob '!artifacts/**' --glob '!backups/**' --glob '!apps/web/public/id-card-generator/assets/**' --glob '!*.lock' --glob '!package-lock.json' -e "$patterns" . > "$current_report"; then
  echo 'Potential current-tree secret patterns found. Review artifacts/security/secret-scan-current.txt' >&2
  exit 1
fi
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  while IFS= read -r commit; do
    git grep -I -n -E "$patterns" "$commit" -- . ':(exclude).git/**' ':(exclude)node_modules/**' ':(exclude)apps/**/node_modules/**' ':(exclude)artifacts/**' ':(exclude)backups/**' ':(exclude)apps/web/public/id-card-generator/assets/**' ':(exclude)*.lock' ':(exclude)package-lock.json' ':(exclude)apps/**/package-lock.json' >> "$history_report" || true
  done < <(git rev-list --all)
fi
if [[ -s "$history_report" ]]; then
  echo 'Potential git-history secret patterns found. Review artifacts/security/secret-scan-history.txt' >&2
  exit 1
fi
printf '{"ok":true,"currentReport":"%s","historyReport":"%s"}\n' "$current_report" "$history_report" > artifacts/security/secret-scan.json
