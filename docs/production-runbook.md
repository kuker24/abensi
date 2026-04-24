# Production Runbook

## 1. Prasyarat
- NAT publik 80/443 sudah diarahkan ke host deployment.
- Docker + Docker Compose tersedia.
- File `.env` diisi dari `.env.production.example`.

## 2. Deploy
```bash
./scripts/deploy_production.sh .env
```

## 3. Verifikasi
```bash
docker compose -f docker-compose.production.yml --env-file .env ps
curl -i http://<PUBLIC_IP>/health/live
curl -i http://<PUBLIC_IP>/health/ready
```

## 4. Rollback cepat
```bash
docker compose -f docker-compose.production.yml --env-file .env down
docker image ls | grep schoolhub
# jalankan kembali image tag sebelumnya (pin tag di compose jika diperlukan)
```

## 5. Operasional harian
- Lihat log API: `docker logs -f schoolhub-api`
- Lihat log worker: `docker logs -f schoolhub-worker`
- Backup DB harian via `pg_dump` dari container postgres.
