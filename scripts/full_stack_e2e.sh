#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required for full-stack E2E}"
: "${REDIS_URL:?REDIS_URL is required for full-stack E2E}"
mkdir -p artifacts/full-stack-e2e
if [[ -f apps/web/playwright.full-stack.config.ts ]]; then
  npx --prefix apps/web playwright test --config=playwright.full-stack.config.ts
else
  echo '{"ok":false,"reason":"playwright.full-stack.config.ts missing"}' | tee artifacts/full-stack-e2e/result.json
  exit 1
fi
