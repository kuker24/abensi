#!/usr/bin/env bash
set -euo pipefail

if [[ "${CI:-}" != "true" && "${NODE_ENV:-}" != "test" ]]; then
  echo "Refusing to run destructive upgrade migration suite unless CI=true or NODE_ENV=test." >&2
  exit 2
fi

: "${DATABASE_URL:?DATABASE_URL is required}"

node scripts/run_upgrade_migration_scenarios.test.mjs

# The Node runner creates one isolated PostgreSQL database per fixture scenario,
# migrates each only through the legacy cutoff, loads populated legacy SQL,
# runs a read-only legacy preflight, deploys remaining migrations when safe, and
# asserts exact success or expected abort/post-verification failure.
node scripts/run_upgrade_migration_scenarios.mjs
