#!/usr/bin/env bash
set -euo pipefail
: "${HTTPS_BASE_URL:?HTTPS_BASE_URL is required}"
: "${ADMIN_USERNAME:?ADMIN_USERNAME is required}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}"
PUBLIC_APP_ORIGIN="$HTTPS_BASE_URL" bash scripts/public_https_smoke.sh
