#!/usr/bin/env bash
set -Eeuo pipefail

TMP_DIR="$(mktemp -d)"
SERVER_LOG="$TMP_DIR/server.log"
PORT_FILE="$TMP_DIR/port"
RESULT_JSON="$TMP_DIR/result.json"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

node - "$PORT_FILE" >"$SERVER_LOG" 2>&1 <<'NODE' &
const http = require('http');
const fs = require('fs');
const portFile = process.argv[2];

const html = '<!doctype html><html><head><title>SIAB2</title></head><body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>';
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/admin/audit') {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'self'",
      'x-content-type-options': 'nosniff'
    });
    res.end(html);
    return;
  }
  if (req.url === '/api/v1/health/live') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', ts: new Date().toISOString() }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ message: 'not found' }));
});
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  fs.writeFileSync(portFile, String(address.port));
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
NODE
SERVER_PID=$!

for _ in {1..50}; do
  [[ -s "$PORT_FILE" ]] && break
  sleep 0.1
done
if [[ ! -s "$PORT_FILE" ]]; then
  echo "fixture server did not start" >&2
  cat "$SERVER_LOG" >&2 || true
  exit 1
fi

PORT="$(cat "$PORT_FILE")"
BASE_URL="http://127.0.0.1:$PORT" \
POST_DEPLOY_SMOKE_RESULT_JSON="$RESULT_JSON" \
bash scripts/post_deploy_smoke.sh

jq -e '.status == "PASS"' "$RESULT_JSON" >/dev/null
jq -e '.summary.fail == 0' "$RESULT_JSON" >/dev/null
jq -e '.checks[] | select(.name == "API live health status ok" and .status == "PASS")' "$RESULT_JSON" >/dev/null
jq -e '.checks[] | select(.name == "authenticated audit API smoke" and .status == "SKIP")' "$RESULT_JSON" >/dev/null
