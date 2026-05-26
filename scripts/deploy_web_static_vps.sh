#!/usr/bin/env bash
set -euo pipefail

# Deploy the pre-built Vite frontend to the running static nginx container on VPS.
# This script intentionally replaces the whole html directory to prevent stale
# hashed assets and to keep lazy-loaded chunks (AdminPages/GuruPages/etc.) intact.
#
# Required env:
#   VPS_HOST              e.g. schoolhub@example.com
# Optional env:
#   VPS_PORT              default: 22
#   SSH_KEY               default: ~/.ssh/id_ed25519
#   WEB_CONTAINER         default: schoolhub-web
#   LOCAL_DIST            default: apps/web/dist
#   REMOTE_DIST           default: /tmp/schoolhub-dist
#   HTML_DIR              default: /usr/share/nginx/html
#   KEEP_ONLY_LOGIN_IMAGE default: 1 (remove unused scraped photos after copy)
#
# Example:
#   VPS_HOST=schoolhub@host VPS_PORT=9103 SSH_KEY=~/.ssh/key \
#     bash scripts/deploy_web_static_vps.sh

if [[ -z "${VPS_HOST:-}" ]]; then
  echo "VPS_HOST is required, e.g. VPS_HOST=schoolhub@your-host" >&2
  exit 1
fi

VPS_PORT="${VPS_PORT:-22}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
WEB_CONTAINER="${WEB_CONTAINER:-schoolhub-web}"
LOCAL_DIST="${LOCAL_DIST:-apps/web/dist}"
REMOTE_DIST="${REMOTE_DIST:-/tmp/schoolhub-dist}"
HTML_DIR="${HTML_DIR:-/usr/share/nginx/html}"
KEEP_ONLY_LOGIN_IMAGE="${KEEP_ONLY_LOGIN_IMAGE:-1}"

if [[ ! -d "$LOCAL_DIST" ]]; then
  echo "Local dist not found: $LOCAL_DIST" >&2
  echo "Run: npm run build --prefix apps/web" >&2
  exit 1
fi

if [[ ! -f "$LOCAL_DIST/index.html" || ! -d "$LOCAL_DIST/assets" ]]; then
  echo "Invalid Vite dist: $LOCAL_DIST must contain index.html and assets/" >&2
  exit 1
fi

SSH=(ssh -i "$SSH_KEY" -p "$VPS_PORT" -o StrictHostKeyChecking=accept-new)
RSYNC_RSH="ssh -i $SSH_KEY -p $VPS_PORT -o StrictHostKeyChecking=accept-new"

echo "==> Preparing remote temp directory"
"${SSH[@]}" "$VPS_HOST" "rm -rf '$REMOTE_DIST' && mkdir -p '$REMOTE_DIST'"
"${SSH[@]}" "$VPS_HOST" "docker exec '$WEB_CONTAINER' rm -rf '$REMOTE_DIST' >/dev/null 2>&1 || true"

echo "==> Uploading dist with rsync --delete"
rsync -az --delete -e "$RSYNC_RSH" "$LOCAL_DIST/" "$VPS_HOST:$REMOTE_DIST/"

echo "==> Copying dist into container temp"
"${SSH[@]}" "$VPS_HOST" "docker cp '$REMOTE_DIST/.' '$WEB_CONTAINER:$REMOTE_DIST/'"

echo "==> Replacing web root atomically inside container"
"${SSH[@]}" "$VPS_HOST" "docker exec '$WEB_CONTAINER' sh -c '
  set -eu
  test -f \"$REMOTE_DIST/index.html\"
  test -d \"$REMOTE_DIST/assets\"
  rm -rf \"$HTML_DIR\"/*
  cp -r \"$REMOTE_DIST\"/* \"$HTML_DIR\"/
  if [ \"$KEEP_ONLY_LOGIN_IMAGE\" = \"1\" ]; then
    rm -f \"$HTML_DIR/images/man1-guru-besar.png\" \"$HTML_DIR/images/man1-kepala.jpg\" 2>/dev/null || true
  fi
'"

echo "==> Reloading nginx"
"${SSH[@]}" "$VPS_HOST" "docker exec '$WEB_CONTAINER' nginx -s reload"

echo "==> Verifying deployed files"
"${SSH[@]}" "$VPS_HOST" "docker exec '$WEB_CONTAINER' sh -c '
  set -eu
  echo assets_count=\$(find \"$HTML_DIR/assets\" -maxdepth 1 -type f | wc -l)
  echo index_html=\$(test -f \"$HTML_DIR/index.html\" && echo present)
  for f in \"$HTML_DIR/assets\"/*.js \"$HTML_DIR/assets\"/*.css; do
    [ -f \"\$f\" ] || continue
    echo asset=\$(basename \"\$f\")
  done
'"

echo "Deploy complete."
