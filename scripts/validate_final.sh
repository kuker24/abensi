#!/usr/bin/env bash
set -euo pipefail

for file in scripts/*.sh; do
  bash -n "$file"
done
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck scripts/*.sh
else
  echo "WARNING: shellcheck not installed; install it and run: shellcheck scripts/*.sh" >&2
fi
if command -v docker >/dev/null 2>&1; then
  docker compose -f docker-compose.production.yml -f docker-compose.vps.yml --env-file .env.production.test config >/tmp/schoolhub-compose-config.yml
  docker compose -f docker-compose.production.yml -f docker-compose.vps.yml --env-file .env.production.test config --format json >/tmp/schoolhub-compose-config.json
  node scripts/validate_compose_resources.mjs /tmp/schoolhub-compose-config.json
else
  echo "WARNING: docker not installed; skipping local compose config validation" >&2
fi
npm run prisma:generate
npx prisma validate --schema prisma/schema.prisma
npm run lint:all
npm run typecheck:all
npm run build:all
npm run test --prefix apps/api
npm run test --prefix apps/web
npm run test:e2e --prefix apps/web
npm audit --audit-level=high
npm audit --prefix apps/api --audit-level=high
npm audit --prefix apps/web --audit-level=high
npm audit --prefix apps/worker --audit-level=high

echo "Final validation completed."
