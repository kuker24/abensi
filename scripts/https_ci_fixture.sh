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
  if [[ -n "${api_pid:-}" ]]; then kill "$api_pid" >/dev/null 2>&1 || true; fi
  if [[ -n "${web_pid:-}" ]]; then kill "$web_pid" >/dev/null 2>&1 || true; fi
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
  add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'" always;
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
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'" always;
  }
  location /health/ready {
    proxy_pass http://127.0.0.1:${api_port}/api/v1/health/ready;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto https;
    add_header Cache-Control "no-store" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'" always;
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


node <<'NODE'
const { PrismaClient, SessionStatus } = require('@prisma/client');
const prisma = new PrismaClient();
function jakartaDateKey(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
function jakartaDateTime(dateKey, hour, minute) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute, 0, 0));
}
function utcDateOnly(value) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0));
}
(async () => {
  const [subject, teacher] = await Promise.all([
    prisma.subject.findFirst({ orderBy: { createdAt: 'asc' } }),
    prisma.user.findFirst({ where: { role: 'GURU_MAPEL', active: true }, orderBy: { createdAt: 'asc' } })
  ]);
  if (!subject || !teacher) throw new Error('Seeded subject/teacher missing for TLS UAT fixture.');
  const dateKey = jakartaDateKey(new Date());
  const startsAt = jakartaDateTime(dateKey, 12, 0);
  const endsAt = jakartaDateTime(dateKey, 12, 45);
  const businessDate = utcDateOnly(startsAt);
  const enrollment = await prisma.classEnrollment.findFirst({
    where: {
      active: true,
      administrativeStatus: 'ACTIVE',
      effectiveFrom: { lte: businessDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: businessDate } }],
      student: { active: true, role: 'SISWA' }
    },
    include: { schoolClass: true, student: { select: { username: true } } },
    orderBy: { createdAt: 'asc' }
  });
  if (!enrollment) throw new Error(`No active enrolled student found for TLS UAT fixture on ${businessDate.toISOString().slice(0, 10)}.`);

  const existing = await prisma.session.findFirst({ where: { teacherId: teacher.id, startsAt, endsAt }, orderBy: { createdAt: 'asc' } });
  const data = {
    classId: enrollment.classId,
    subjectId: subject.id,
    teacherId: teacher.id,
    startsAt,
    endsAt,
    businessDate,
    status: SessionStatus.SCHEDULED,
    openedAt: null,
    closedAt: null,
    reconciledAt: null
  };
  const session = existing
    ? await prisma.$transaction(async (tx) => {
        await tx.studentAttendance.deleteMany({ where: { sessionId: existing.id } });
        await tx.teacherSessionPresence.deleteMany({ where: { sessionId: existing.id } });
        await tx.sessionRoster.deleteMany({ where: { sessionId: existing.id } });
        return tx.session.update({ where: { id: existing.id }, data });
      })
    : await prisma.session.create({ data });

  console.log(`Prepared TLS UAT session ${session.id} for class ${enrollment.schoolClass.code} with active student ${enrollment.student.username}.`);
})().finally(() => prisma.$disconnect());
NODE
node <<'NODE' > artifacts/https-ci/uat-geo.env
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
function jakartaDateKey(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
function jakartaDateTime(dateKey, hour, minute) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute, 0, 0));
}
(async () => {
  const teacher = await prisma.user.findFirst({ where: { role: 'GURU_MAPEL', active: true }, orderBy: { createdAt: 'asc' } });
  const dateKey = jakartaDateKey(new Date());
  const startsAt = jakartaDateTime(dateKey, 12, 0);
  const endsAt = jakartaDateTime(dateKey, 12, 45);
  const session = teacher ? await prisma.session.findFirst({ where: { teacherId: teacher.id, startsAt, endsAt }, orderBy: { createdAt: 'asc' } }) : null;
  const policy = await prisma.geofencePolicy.findUnique({ where: { id: 1 } });
  console.log(`UAT_SESSION_ID=${session?.id ?? ''}`);
  console.log(`UAT_LATITUDE=${policy?.centerLat ?? 0}`);
  console.log(`UAT_LONGITUDE=${policy?.centerLng ?? 0}`);
  console.log('UAT_ACCURACY_METER=25');
})().finally(() => prisma.$disconnect());
NODE
# shellcheck disable=SC1091
source artifacts/https-ci/uat-geo.env

PUBLIC_APP_ORIGIN="$base" \
PUBLIC_HTTP_ORIGIN="http://localhost:${http_port}" \
PUBLIC_HTTPS_CACERT=certs/https-ci/ca.crt \
CERT_MIN_REMAINING_DAYS=1 \
PUBLIC_HTTPS_CHECK_INTERNAL_PORTS=NO \
ADMIN_USERNAME="$admin_username" \
ADMIN_PASSWORD="$admin_password" \
PUBLIC_HTTPS_RESULT_JSON=artifacts/https-ci/public-https-result.json \
bash scripts/public_https_smoke.sh

BASE_URL="$base" \
CURL_CACERT=certs/https-ci/ca.crt \
ADMIN_USERNAME="$admin_username" \
ADMIN_PASSWORD="$admin_password" \
GURU_PASSWORD="${DEFAULT_USER_PASSWORD:-User#12345678}" \
SISWA_PASSWORD="${DEFAULT_USER_PASSWORD:-User#12345678}" \
UAT_SESSION_ID="${UAT_SESSION_ID:-}" \
UAT_RESULT_JSON=artifacts/https-ci/uat-read-only-result.json \
bash scripts/uat_smoke.sh

BASE_URL="$base" \
CURL_CACERT=certs/https-ci/ca.crt \
ADMIN_USERNAME="$admin_username" \
ADMIN_PASSWORD="$admin_password" \
GURU_PASSWORD="${DEFAULT_USER_PASSWORD:-User#12345678}" \
SISWA_PASSWORD="${DEFAULT_USER_PASSWORD:-User#12345678}" \
ALLOW_MUTATING_SMOKE=YES \
UAT_SESSION_ID="${UAT_SESSION_ID:-}" \
UAT_LATITUDE="$UAT_LATITUDE" \
UAT_LONGITUDE="$UAT_LONGITUDE" \
UAT_ACCURACY_METER="$UAT_ACCURACY_METER" \
UAT_RESULT_JSON=artifacts/https-ci/uat-mutating-result.json \
bash scripts/uat_smoke.sh

for path in /api/v1/internal/reconciliation/run /api/v1/internal/sessions/mark-missed; do
  code=$(curl --cacert certs/https-ci/ca.crt -sS -o /dev/null -w '%{http_code}' "$base$path")
  test "$code" = "404"
done
bad_forwarded=$(curl --cacert certs/https-ci/ca.crt -sS -o /dev/null -w '%{http_code}' -H 'X-Forwarded-For: bad header' "$base/health/live")
test "$bad_forwarded" = "400"

docker logs schoolhub-tls-ci > artifacts/https-ci/nginx.log 2>&1 || true
OBSERVABILITY_OUTPUT=artifacts/https-ci/observability-log-check.json node scripts/observability_log_check.mjs artifacts/https-ci/api.log
jq -n --arg base "$base" --argjson httpPort "$http_port" --argjson httpsPort "$https_port" '{ok:true,base:$base,httpPort:$httpPort,httpsPort:$httpsPort}' > artifacts/https-ci/result.json
