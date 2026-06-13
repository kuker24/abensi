# SchoolHub e-Hadir (Production Stack)

Implementasi baseline production untuk PRD `prd-ehadir-v2.1.md` dengan stack:
- NestJS API + Prisma + PostgreSQL
- React (Vite) frontend
- Worker reconciliation
- Redis
- Nginx reverse proxy
- Docker Compose production

## Arsitektur QR Android Reader Resmi

Jalur absensi QR produksi diarahkan ke APK Android resmi **Absensi MAN 1 Rokan Hulu**.

```text
QR Credential siswa/guru
→ APK Android official reader
→ HMAC signed request /api/v1/attendance/qr-reader-scan
→ Server validasi DeviceReader + nonce + signature + QR credential
→ Server menjalankan AttendancePolicy
→ GateLog/PrayerAttendanceLog/audit/reconciliation
```

Endpoint legacy `/api/v1/attendance/qr-scan` tetap tersedia untuk input manual admin/operator, tetapi bukan jalur produksi utama.

Dokumentasi:

- `docs/ADR_ANDROID_QR_READER_ENDPOINT.md`
- `docs/ANDROID_QR_READER.md`
- `docs/APK_BUILDER_GUI.md`
- `docs/CARA_BUILD_APK_UNTUK_OPERATOR.md`
- `docs/QR_SECURITY_MODEL.md`
- `docs/QR_ROLLOUT_PLAN.md`

## Quick Start (Local)

```bash
cp .env.production.example .env
npm install --prefix apps/api
npm install --prefix apps/web
npm install --prefix apps/worker
npm install --prefix .
npx prisma generate --schema prisma/schema.prisma
npm run prisma:migrate
npm run prisma:seed
npm run build:all
```

Jalankan stack:

```bash
docker compose -f docker-compose.production.yml --env-file .env up -d --build
```

Health check:

```bash
curl -i http://localhost/health/live
curl -i http://localhost/health/ready
```
