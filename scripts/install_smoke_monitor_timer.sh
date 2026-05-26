#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SERVICE_SRC="ops/systemd/schoolhub-smoke-monitor.service"
TIMER_SRC="ops/systemd/schoolhub-smoke-monitor.timer"
SERVICE_DST="/etc/systemd/system/schoolhub-smoke-monitor.service"
TIMER_DST="/etc/systemd/system/schoolhub-smoke-monitor.timer"

if [[ ! -f "$SERVICE_SRC" || ! -f "$TIMER_SRC" ]]; then
  echo "ERROR: File unit systemd tidak ditemukan di ops/systemd."
  exit 1
fi

install -m 0644 "$SERVICE_SRC" "$SERVICE_DST"
install -m 0644 "$TIMER_SRC" "$TIMER_DST"

systemctl daemon-reload
systemctl enable --now schoolhub-smoke-monitor.timer
systemctl restart schoolhub-smoke-monitor.timer

echo
echo "== schoolhub-smoke-monitor.timer =="
systemctl status schoolhub-smoke-monitor.timer --no-pager --full || true
echo
echo "== Timer entries =="
systemctl list-timers --all --no-pager | grep -E 'schoolhub-smoke-monitor|NEXT|LEFT' || true
