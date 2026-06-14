#!/usr/bin/env bash
set -euo pipefail

if [[ "${CI:-}" != "true" && "${NODE_ENV:-}" != "test" ]]; then
  echo "Refusing to run destructive upgrade migration suite unless CI=true or NODE_ENV=test." >&2
  exit 2
fi

: "${DATABASE_URL:?DATABASE_URL is required}"
mkdir -p artifacts/upgrade-migrations

npx prisma migrate reset --force --skip-seed --schema prisma/schema.prisma
npm run preflight:production -- --json=artifacts/upgrade-migrations/preflight-empty.json --write-sql-table
npm run verify:post-migration -- --json=artifacts/upgrade-migrations/post-migration-empty.json
npm run audit:verify-chain

# Fixture inventory is intentionally explicit so missing scenarios fail the suite.
required=(
  valid_legacy_happy_path.sql
  gate_log_corrected_date_collision.sql
  session_generated_date_collision.sql
  schedule_overlap_expected_abort.sql
  audit_branch_expected_abort.sql
  audit_orphan_expected_abort.sql
  audit_tamper_expected_abort.sql
  roster_gap_expected_abort.sql
)
for fixture in "${required[@]}"; do
  test -s "prisma/fixtures/upgrade/${fixture}"
done

printf '{"ok":true,"checkedFixtures":%s}\n' "${#required[@]}" > artifacts/upgrade-migrations/fixture-inventory.json
