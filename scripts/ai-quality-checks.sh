#!/usr/bin/env bash
set -uo pipefail

failures=0
warnings=0

have() {
  command -v "$1" >/dev/null 2>&1
}

run_cmd() {
  local label="$1"
  local mode="$2"
  shift 2
  local cmd="$*"
  local status=0

  printf '\n== %s ==\n' "$label"
  if have omni; then
    bash -lc "$cmd" 2>&1 | omni
    status=${PIPESTATUS[0]}
  else
    bash -lc "$cmd"
    status=$?
  fi

  if [[ $status -eq 0 ]]; then
    printf 'OK: %s\n' "$label"
  elif [[ "$mode" == "required" ]]; then
    printf 'FAIL: %s (exit %s)\n' "$label" "$status" >&2
    failures=$((failures + 1))
  else
    printf 'WARN: %s (exit %s)\n' "$label" "$status" >&2
    warnings=$((warnings + 1))
  fi
}

printf 'AI quality checks for %s\n' "$(pwd)"
run_cmd "Git status" optional "git status --short"

if have omni; then
  run_cmd "OMNI doctor" optional "omni doctor"
else
  printf '\n== OMNI doctor ==\nSKIP: omni not found\n'
fi

if have semgrep; then
  run_cmd "Semgrep CE" optional "semgrep scan --config p/default --metrics=off --json --json-output=semgrep-results.json"
else
  printf '\n== Semgrep CE ==\nSKIP: semgrep not found\n'
fi

if have osv-scanner; then
  run_cmd "OSV-Scanner" optional "osv-scanner scan source -r . --format json --output-file osv-results.json"
else
  printf '\n== OSV-Scanner ==\nSKIP: osv-scanner not found\n'
fi

if have gitleaks; then
  rm -f repomix-output.*
  run_cmd "Gitleaks git history" optional "gitleaks git --redact --report-format json --report-path gitleaks-report.json ."
  run_cmd "Gitleaks working tree" optional "gitleaks dir --redact --report-format json --report-path gitleaks-dir-report.json ."
else
  printf '\n== Gitleaks ==\nSKIP: gitleaks not found\n'
fi

if [[ -f package.json ]]; then
  if npx --no-install knip --version >/dev/null 2>&1; then
    run_cmd "Knip" optional "npx --no-install knip"
  else
    printf '\n== Knip ==\nSKIP: knip not available via npx --no-install\n'
  fi
fi

if [[ -f apps/web/playwright.config.ts || -f playwright.config.ts || -f playwright.config.js ]]; then
  if npx --no-install playwright --version >/dev/null 2>&1; then
    run_cmd "Playwright chromium" optional "npm run test:e2e --prefix apps/web -- --project=chromium"
  else
    printf '\n== Playwright ==\nSKIP: playwright not available via npx --no-install\n'
  fi
fi

if have repomix; then
  run_cmd "Repomix compressed bundle" optional "repomix --compress"
else
  printf '\n== Repomix ==\nSKIP: repomix not found\n'
fi

printf '\n== Summary ==\nrequired_failures=%s\nwarnings=%s\n' "$failures" "$warnings"
printf 'Local reports are intentionally gitignored: semgrep-results.json, osv-results.json, gitleaks-*.json, repomix-output.*\n'

if [[ $failures -gt 0 ]]; then
  exit 1
fi
