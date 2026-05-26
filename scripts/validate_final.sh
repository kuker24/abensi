#!/usr/bin/env bash
set -euo pipefail

bash -n scripts/uat_smoke.sh
bash -n scripts/deploy_production.sh
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
