#!/usr/bin/env bash
set -euo pipefail
: "${HTTPS_BASE_URL:?HTTPS_BASE_URL is required}"
: "${ADMIN_USERNAME:?ADMIN_USERNAME is required}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}"
mkdir -p artifacts/https-smoke
base="${HTTPS_BASE_URL%/}"
http_base="http://${base#https://}"

curl -ksS -o /dev/null -w '%{http_code} %{redirect_url}\n' -H 'X-Forwarded-Proto: http' "$http_base/health/live" | tee artifacts/https-smoke/http-redirect.txt
grep -Eq '^30[178] https://' artifacts/https-smoke/http-redirect.txt

curl -fsS -D artifacts/https-smoke/live.headers "$base/health/live" -o artifacts/https-smoke/live.json
curl -fsS -D artifacts/https-smoke/ready.headers "$base/health/ready" -o artifacts/https-smoke/ready.json
grep -iq '^strict-transport-security:' artifacts/https-smoke/live.headers

cookie_jar="artifacts/https-smoke/cookies.txt"
curl -fsS -c "$cookie_jar" -D artifacts/https-smoke/login.headers \
  -H 'content-type: application/json' \
  --data "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\",\"expectedRole\":\"admin\"}" \
  "$base/api/v1/auth/login" -o artifacts/https-smoke/login.json
grep -iq 'schoolhub_access_token=.*HttpOnly' artifacts/https-smoke/login.headers
grep -iq 'schoolhub_access_token=.*Secure' artifacts/https-smoke/login.headers
curl -fsS -b "$cookie_jar" "$base/api/v1/auth/me" -o artifacts/https-smoke/me.json

csrf=$(curl -fsS -b "$cookie_jar" -c "$cookie_jar" "$base/api/v1/auth/csrf" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>console.log(JSON.parse(d).csrfToken))')
curl -fsS -b "$cookie_jar" -c "$cookie_jar" -H "x-csrf-token: $csrf" -X POST "$base/api/v1/auth/logout" -o artifacts/https-smoke/logout.json

curl -fsS -D artifacts/https-smoke/sse.headers -N --max-time 5 "$base/api/v1/reports/live-monitor/stream" -o artifacts/https-smoke/sse.txt || true
grep -Eiq 'content-type: text/event-stream|HTTP/[0-9.]+ 401|HTTP/[0-9.]+ 403' artifacts/https-smoke/sse.headers

for path in /api/v1/internal/reconciliation/run /api/v1/internal/sessions/mark-missed; do
  code=$(curl -ksS -o /dev/null -w '%{http_code}' "$base$path")
  test "$code" = "404" -o "$code" = "403" -o "$code" = "405"
done

printf '{"ok":true,"base":"%s"}\n' "$base" > artifacts/https-smoke/result.json
