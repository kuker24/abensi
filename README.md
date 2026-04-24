# SchoolHub e-Hadir (Production Stack)

Implementasi baseline production untuk PRD `prd-ehadir-v2.1.md` dengan stack:
- NestJS API + Prisma + PostgreSQL
- React (Vite) frontend
- Worker reconciliation
- Redis
- Nginx reverse proxy
- Docker Compose production

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
