#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts/a11y
if [[ -f apps/web/playwright.a11y.config.ts ]]; then
  npx --prefix apps/web playwright test --config=playwright.a11y.config.ts
else
  echo '{"ok":false,"reason":"playwright.a11y.config.ts missing"}' | tee artifacts/a11y/result.json
  exit 1
fi
