#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail=0

require_file() {
  local path="$1"
  if [[ ! -f "$ROOT/$path" ]]; then
    echo "Missing file: $path" >&2
    fail=1
  fi
}

require_text() {
  local path="$1"
  local pattern="$2"
  local desc="$3"
  if ! grep -Fq -- "$pattern" "$ROOT/$path"; then
    echo "Missing in $path: $desc ($pattern)" >&2
    fail=1
  fi
}

require_file scripts/lib/schoolhub_release_pins.sh
require_file scripts/sync_release_pins.sh
require_file scripts/prune_schoolhub_images.sh
require_file scripts/stabilization_status.sh
require_file ops/systemd/schoolhub-stabilization-check.service
require_file ops/systemd/schoolhub-stabilization-check.timer

require_text scripts/sync_release_pins.sh 'schoolhub_env_upsert' 'env upsert helper usage'
require_text scripts/sync_release_pins.sh 'ACTIVE_RELEASE_SHA' 'active release pin'
require_text scripts/sync_release_pins.sh 'SCHOOLHUB_IMAGE_TAG' 'image tag sync'
require_text scripts/prune_schoolhub_images.sh 'beyond-keep-' 'retention cutoff'
require_text scripts/prune_schoolhub_images.sh 'running_tags' 'protect running tags'
require_text scripts/stabilization_status.sh 'pinsAligned' 'pin alignment check'
require_text scripts/stabilization_status.sh 'schoolhubImageTag' 'env tag in report'
require_text ops/systemd/schoolhub-stabilization-check.service 'User=schoolhub' 'run as schoolhub'
require_text ops/systemd/schoolhub-stabilization-check.service 'stabilization_status.sh' 'new status script'
require_text scripts/deploy_production.sh 'sync_release_pins.sh' 'deploy writes pins after success'
require_text scripts/deploy_production.sh 'prune_schoolhub_images.sh' 'deploy prunes old images'
require_text scripts/rollback_production.sh 'sync_release_pins.sh' 'rollback rewrites pins'

# syntax checks
for f in \
  scripts/lib/schoolhub_release_pins.sh \
  scripts/sync_release_pins.sh \
  scripts/prune_schoolhub_images.sh \
  scripts/stabilization_status.sh \
  scripts/deploy_production.sh \
  scripts/rollback_production.sh
do
  bash -n "$ROOT/$f" || { echo "bash -n failed: $f" >&2; fail=1; }
done

if (( fail > 0 )); then
  echo "ops stabilization static checks FAILED" >&2
  exit 1
fi
echo "ops stabilization static checks passed"
