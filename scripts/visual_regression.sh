#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts/visual
if [[ -f apps/web/playwright.visual.config.ts ]]; then
  npx --prefix apps/web playwright test --config=playwright.visual.config.ts
else
  echo '{"ok":false,"reason":"playwright.visual.config.ts missing"}' | tee artifacts/visual/result.json
  exit 1
fi
