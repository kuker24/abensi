#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${REDIS_URL:?REDIS_URL is required}"
: "${JWT_SECRET:?JWT_SECRET is required}"
: "${WORKER_TOKEN:?WORKER_TOKEN is required}"
: "${READER_SECRET_ENCRYPTION_KEY:?READER_SECRET_ENCRYPTION_KEY is required}"

mkdir -p artifacts/https-ci certs/https-ci tmp/https-ci
api_port=${HTTPS_CI_API_PORT:-3100}
web_port=${HTTPS_CI_WEB_PORT:-4178}
https_port=${HTTPS_CI_HTTPS_PORT:-3443}
http_port=${HTTPS_CI_HTTP_PORT:-3080}
base="https://localhost:${https_port}"
admin_username=${ADMIN_USERNAME:-admin.tu}
admin_password=${ADMIN_PASSWORD:-Admin#12345678}

cleanup() {
  set +e
  docker rm -f schoolhub-tls-ci >/dev/null 2>&1 || true
  [[ -n "${api_pid:-}" ]] && kill "$api_pid" >/dev/null 2>&1 || true
  [[ -n "${web_pid:-}" ]] && kill "$web_pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT

openssl req -x509 -newkey rsa:2048 -nodes -days 2 \
  -subj '/CN=SchoolHub CI Local CA' \
  -keyout certs/https-ci/ca.key \
  -out certs/https-ci/ca.crt >/dev/null 2>&1
cat > certs/https-ci/localhost.ext <<'EOF'
subjectAltName=DNS:localhost,IP:127.0.0.1
extendedKeyUsage=serverAuth
EOF
openssl req -newkey rsa:2048 -nodes \
  -subj '/CN=localhost' \
  -keyout certs/https-ci/localhost.key \
  -out certs/https-ci/localhost.csr >/dev/null 2>&1
openssl x509 -req -days 2 \
  -in certs/https-ci/localhost.csr \
  -CA certs/https-ci/ca.crt \
  -CAkey certs/https-ci/ca.key \
  -CAcreateserial \
  -extfile certs/https-ci/localhost.ext \
  -out certs/https-ci/localhost.crt >/dev/null 2>&1
chmod 0644 certs/https-ci/ca.crt certs/https-ci/localhost.crt certs/https-ci/localhost.key

cat > tmp/https-ci/nginx.conf <<EOF
map \$http_upgrade \$connection_upgrade { default upgrade; '' ''; }
server {
  listen ${http_port};
  server_name localhost;
  return 308 https://localhost:${https_port}\$request_uri;
}
server {
  listen ${https_port} ssl http2;
  server_name localhost;
  ssl_certificate /etc/nginx/certs/localhost.crt;
  ssl_certificate_key /etc/nginx/certs/localhost.key;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;
  if (\$http_x_forwarded_for ~ ".{256,}") { return 400; }
  if (\$http_x_forwarded_for ~ "[^0-9a-fA-F:., ]") { return 400; }
  location ^~ /api/v1/internal/ { return 404; }
  location = /api/v1/reports/live-monitor/stream {
    proxy_pass http://127.0.0.1:${api_port}/api/v1/reports/live-monitor/stream;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
  }
  location /api/ {
    proxy_pass http://127.0.0.1:${api_port}/api/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    add_header Cache-Control "no-store" always;
  }
  location /health/live {
    proxy_pass http://127.0.0.1:${api_port}/api/v1/health/live;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto https;
    add_header Cache-Control "no-store" always;
  }
  location /health/ready {
    proxy_pass http://127.0.0.1:${api_port}/api/v1/health/ready;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto https;
    add_header Cache-Control "no-store" always;
  }
  location / {
    proxy_pass http://127.0.0.1:${web_port};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto https;
  }
}
EOF

npm run prisma:generate
ADMIN_PASSWORD="$admin_password" DEFAULT_USER_PASSWORD="${DEFAULT_USER_PASSWORD:-User#12345678}" DEVELOPER_PASSWORD="${DEVELOPER_PASSWORD:-Dev#12345678}" npm run prisma:migrate
ADMIN_PASSWORD="$admin_password" DEFAULT_USER_PASSWORD="${DEFAULT_USER_PASSWORD:-User#12345678}" DEVELOPER_PASSWORD="${DEVELOPER_PASSWORD:-Dev#12345678}" npm run prisma:seed
npm run build --prefix apps/api
(
  cd apps/api
  NODE_ENV=production PORT="$api_port" CORS_ORIGIN="$base" PUBLIC_APP_ORIGIN="$base" TRUSTED_PROXY_CIDRS=loopback,linklocal,uniquelocal npm run start
) > artifacts/https-ci/api.log 2>&1 &
api_pid=$!
(
  cd apps/web
  VITE_API_BASE_URL=/api/v1 npm run dev -- --host 127.0.0.1 --port "$web_port"
) > artifacts/https-ci/web.log 2>&1 &
web_pid=$!

for i in {1..60}; do
  if curl -fsS "http://127.0.0.1:${api_port}/api/v1/health/live" >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:${web_port}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
  if [[ $i -eq 60 ]]; then
    echo 'API/web did not become ready' >&2
    exit 1
  fi
done

docker rm -f schoolhub-tls-ci >/dev/null 2>&1 || true
docker run -d --name schoolhub-tls-ci --network host \
  -v "$PWD/tmp/https-ci/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$PWD/certs/https-ci:/etc/nginx/certs:ro" \
  nginxinc/nginx-unprivileged:1.29-alpine >/dev/null

for i in {1..30}; do
  if curl --cacert certs/https-ci/ca.crt -fsS "$base/health/live" >/dev/null 2>&1; then break; fi
  sleep 2
  if [[ $i -eq 30 ]]; then docker ps -a > artifacts/https-ci/docker-ps.txt 2>&1 || true; docker logs schoolhub-tls-ci > artifacts/https-ci/nginx.log 2>&1 || true; exit 1; fi
done

curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "http://localhost:${http_port}/health/live" | tee artifacts/https-ci/http-redirect.txt
grep -Eq "^30[178] https://localhost:${https_port}/health/live" artifacts/https-ci/http-redirect.txt
curl --cacert certs/https-ci/ca.crt -fsS -D artifacts/https-ci/live.headers "$base/health/live" -o artifacts/https-ci/live.json
grep -iq '^strict-transport-security:' artifacts/https-ci/live.headers
curl --cacert certs/https-ci/ca.crt -fsS -D artifacts/https-ci/ready.headers "$base/health/ready" -o artifacts/https-ci/ready.json

cookie_jar=artifacts/https-ci/cookies.txt
curl --cacert certs/https-ci/ca.crt -fsS -c "$cookie_jar" -D artifacts/https-ci/login.headers \
  -H 'content-type: application/json' \
  --data "{\"username\":\"$admin_username\",\"password\":\"$admin_password\",\"expectedRole\":\"admin\"}" \
  "$base/api/v1/auth/login" -o artifacts/https-ci/login.json
grep -iq 'schoolhub_access_token=.*HttpOnly' artifacts/https-ci/login.headers
grep -iq 'schoolhub_access_token=.*Secure' artifacts/https-ci/login.headers
curl --cacert certs/https-ci/ca.crt -fsS -b "$cookie_jar" "$base/api/v1/auth/me" -o artifacts/https-ci/me.json
csrf=$(curl --cacert certs/https-ci/ca.crt -fsS -b "$cookie_jar" -c "$cookie_jar" "$base/api/v1/auth/csrf" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>console.log(JSON.parse(d).csrfToken))')
curl --cacert certs/https-ci/ca.crt -fsS -b "$cookie_jar" -c "$cookie_jar" -H "x-csrf-token: $csrf" -X POST "$base/api/v1/auth/logout" -o artifacts/https-ci/logout.json
curl --cacert certs/https-ci/ca.crt -fsS -c "$cookie_jar" -H 'content-type: application/json' --data "{\"username\":\"$admin_username\",\"password\":\"$admin_password\",\"expectedRole\":\"admin\"}" "$base/api/v1/auth/login" -o /dev/null
curl --cacert certs/https-ci/ca.crt -fsS -b "$cookie_jar" -D artifacts/https-ci/sse.headers -N --max-time 5 "$base/api/v1/reports/live-monitor/stream?limit=1" -o artifacts/https-ci/sse.txt || true
grep -iq 'content-type: text/event-stream' artifacts/https-ci/sse.headers
grep -q 'event: snapshot' artifacts/https-ci/sse.txt

for path in /api/v1/internal/reconciliation/run /api/v1/internal/sessions/mark-missed; do
  code=$(curl --cacert certs/https-ci/ca.crt -ksS -o /dev/null -w '%{http_code}' "$base$path")
  test "$code" = "404"
done
bad_forwarded=$(curl --cacert certs/https-ci/ca.crt -ksS -o /dev/null -w '%{http_code}' -H 'X-Forwarded-For: bad header' "$base/health/live")
test "$bad_forwarded" = "400"

docker logs schoolhub-tls-ci > artifacts/https-ci/nginx.log 2>&1 || true
OBSERVABILITY_OUTPUT=artifacts/https-ci/observability-log-check.json node scripts/observability_log_check.mjs artifacts/https-ci/api.log
printf '{"ok":true,"base":"%s","httpPort":%s,"httpsPort":%s}\n' "$base" "$http_port" "$https_port" > artifacts/https-ci/result.json
