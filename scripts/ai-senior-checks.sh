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

printf 'Senior AI engineering checks for %s\n' "$(pwd)"
run_cmd "Git status" optional "git status --short"

if [[ -f package.json ]]; then
  run_cmd "TypeScript typecheck" required "npm run typecheck:all"
  run_cmd "API unit tests" required "npm run test:api"
  run_cmd "Web unit tests" required "npm run test:web"
  run_cmd "Worker unit tests" required "npm run test --prefix apps/worker"

  if node -e "const p=require('./apps/web/package.json'); const d={...(p.dependencies||{}),...(p.devDependencies||{})}; process.exit(d['@vitest/coverage-v8']?0:1)" >/dev/null 2>&1; then
    run_cmd "Vitest coverage" optional "npm run test --prefix apps/web -- --coverage --reporter=dot"
  else
    printf '\n== Vitest coverage ==\nSKIP: apps/web does not declare @vitest/coverage-v8. Add it before enabling coverage gate.\n'
  fi

  if npm run | grep -q '^  build:all'; then
    run_cmd "Build all" required "npm run build:all"
  fi

  if npm run | grep -q '^  lint:all'; then
    run_cmd "Lint all" required "npm run lint:all"
  fi
fi

if have gitleaks; then
  rm -f repomix-output.*
  run_cmd "Gitleaks git history" optional "gitleaks git --redact --report-format json --report-path gitleaks-report.json ."
  run_cmd "Gitleaks working tree" optional "gitleaks dir --redact --report-format json --report-path gitleaks-dir-report.json ."
else
  printf '\n== Gitleaks ==\nSKIP: gitleaks not found\n'
fi

if have osv-scanner; then
  run_cmd "OSV-Scanner" optional "osv-scanner scan source -r . --format json --output-file osv-results.json"
else
  printf '\n== OSV-Scanner ==\nSKIP: osv-scanner not found\n'
fi

if have semgrep; then
  run_cmd "Semgrep CE" optional "semgrep scan --config p/default --metrics=off --json --json-output=semgrep-results.json"
else
  printf '\n== Semgrep CE ==\nSKIP: semgrep not found\n'
fi

if [[ -f package.json ]]; then
  if npx --no-install knip --version >/dev/null 2>&1; then
    run_cmd "Knip" optional "npx --no-install knip"
  else
    printf '\n== Knip ==\nSKIP: knip not available via npx --no-install\n'
  fi
fi

if have repomix; then
  run_cmd "Repomix compressed bundle" optional "repomix --compress"
else
  printf '\n== Repomix ==\nSKIP: repomix not found\n'
fi

printf '\n== StrykerJS mutation testing ==\nmanual-only, not run. Run only when explicitly requested.\n'
printf '\n== Summary ==\nrequired_failures=%s\nwarnings=%s\n' "$failures" "$warnings"
printf 'Local reports are intentionally gitignored: semgrep-results.json, osv-results.json, gitleaks-*.json, repomix-output.*\n'

if [[ $failures -gt 0 ]]; then
  exit 1
fi
