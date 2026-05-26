#!/usr/bin/env bash
# SchoolHub APK Builder — Launcher
# Jalankan: bash jalankan-apk-builder.sh
# Buka di browser: http://localhost:8765

set -euo pipefail
cd "$(dirname "$0")"

PORT="${1:-8765}"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   SchoolHub APK Builder              ║"
echo "  ║   http://localhost:${PORT}             ║"
echo "  ╚══════════════════════════════════════╝"
echo ""
echo "  Buka link di atas di browser."
echo "  Tekan Ctrl+C untuk stop."
echo ""

# Auto-open browser (best effort)
if command -v xdg-open &>/dev/null; then
    (sleep 1 && xdg-open "http://localhost:${PORT}") &
elif command -v open &>/dev/null; then
    (sleep 1 && open "http://localhost:${PORT}") &
fi

exec python3 apk_builder_gui.py --port "$PORT"
