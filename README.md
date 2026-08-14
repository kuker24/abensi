# SIAB2 — Sistem Informasi Akademik Berkarakter

Academic and attendance system for MAN 1 Rokan Hulu. The school-facing product name in the UI is **e-Hadir**.

I built this while teaching introductory AI at the same school, then trained staff to use it.

## What it is

A production attendance and academic-operations system:

- Teachers and staff record presence at the gate and in class
- An official Android reader scans student/teacher QR credentials
- Requests are signed and bound to a known device
- A worker reconciles attendance so the dashboard stays consistent
- Admin, teacher, and student roles see different work

This is not a demo CRUD app. It is the system the school actually runs.

## Stack

- NestJS API + Prisma + PostgreSQL
- React (Vite) frontend
- Redis + reconciliation worker
- Nginx reverse proxy
- Docker Compose
- Official Android QR reader

## Visual proof

UI stills from a **test** environment (no student records):

| View | File |
| --- | --- |
| Login / role picker | [docs/public/screenshots/login.png](docs/public/screenshots/login.png) |
| Admin dashboard | [docs/public/screenshots/dashboard.png](docs/public/screenshots/dashboard.png) |
| Teacher dashboard | [docs/public/screenshots/teacher-dashboard.png](docs/public/screenshots/teacher-dashboard.png) |

Public architecture (high level, no extra attack detail): [docs/public/architecture.md](docs/public/architecture.md)

There is no public 30–90s production video yet. The stills are a UI walkthrough, not a live production capture.

## Security (high level)

- Official reader path is HMAC-signed
- Nonce on the signed request (replay is not a casual copy-paste)
- Readers are known devices, not anonymous scanners
- RBAC across admin / teacher / student
- Audit log + reconciliation worker

Do not expect keys, production hosts, or extra endpoints in this README.

---

Implementasi baseline production untuk sistem informasi akademik dan kehadiran MAN 1 Rokan Hulu dengan stack:
- NestJS API + Prisma + PostgreSQL
- React (Vite) frontend
- Worker reconciliation
- Redis
- Nginx reverse proxy
- Docker Compose production

## Arsitektur QR Android Reader Resmi

Jalur QR produksi diarahkan ke APK Android resmi **SIAB2 Reader**.

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

- `docs/deployment/vps-production-runbook.md` — runbook deployment VPS production terkini
- `docs/deployment/post-deploy-checklist.md` — checklist monitoring setelah deploy
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
