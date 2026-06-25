#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="${1:-ops/performance/siab2-vps-tuning.conf}"
APPLY_MODE="false"
if [[ "${1:-}" == "--apply" ]]; then
  APPLY_MODE="true"
  CONFIG_PATH="${2:-ops/performance/siab2-vps-tuning.conf}"
fi

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "missing tuning config: $CONFIG_PATH" >&2
  exit 2
fi

if [[ "$APPLY_MODE" == "true" && "${CONFIRM_APPLY_SIAB2_VPS_TUNING:-}" != "YES" ]]; then
  echo "apply mode requires CONFIRM_APPLY_SIAB2_VPS_TUNING=YES" >&2
  exit 2
fi

printf 'SIAB2 VPS tuning validation (%s)\n' "$([[ "$APPLY_MODE" == "true" ]] && echo apply || echo dry-run)"

while IFS='|' read -r kind key current_observed proposed rollback validation_command reason; do
  [[ -z "${kind// }" || "$kind" =~ ^# ]] && continue
  if [[ -z "${key:-}" || -z "${proposed:-}" || -z "${rollback:-}" || -z "${validation_command:-}" || -z "${reason:-}" ]]; then
    echo "invalid config row for key '$key'" >&2
    exit 1
  fi

  current_runtime="unavailable"
  if [[ "$kind" == "sysctl" ]] && command -v sysctl >/dev/null 2>&1; then
    current_runtime="$(sysctl -n "$key" 2>/dev/null || true)"
  elif [[ "$kind" == "compose-env" ]]; then
    current_runtime="$current_observed"
  elif [[ "$kind" == "docker-logging" ]] && command -v docker >/dev/null 2>&1; then
    current_runtime="$(docker info --format '{{.LoggingDriver}}' 2>/dev/null || true)"
  fi

  printf 'kind=%s key=%s current_observed=%s current_runtime=%s proposed=%s rollback=%s validation=%s reason=%s\n' \
    "$kind" "$key" "$current_observed" "${current_runtime:-unavailable}" "$proposed" "$rollback" "$validation_command" "$reason"

  if [[ "$APPLY_MODE" == "true" ]]; then
    if [[ "$kind" == "sysctl" ]]; then
      if [[ $EUID -ne 0 ]]; then
        echo "sysctl apply requires root" >&2
        exit 2
      fi
      sysctl -w "$key=$proposed"
    else
      echo "apply for $kind/$key is documented-only; update the referenced config manually through review" >&2
    fi
  fi
done < "$CONFIG_PATH"

printf 'SIAB2 VPS tuning validation completed.\n'
