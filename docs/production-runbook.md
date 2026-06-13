# Production Runbook

## 1. Prasyarat
- Docker + Docker Compose tersedia.
- File `.env` production ada di `/opt/schoolhub/.env`.
- Untuk trial, Cloudflare Quick Tunnel aktif. Untuk produksi resmi, gunakan Named Tunnel/domain tetap.

## 2. Deploy
```bash
cd /opt/schoolhub
./scripts/deploy_production.sh .env
```

## 3. Verifikasi
```bash
docker compose -f docker-compose.production.yml --env-file .env ps
curl -i http://127.0.0.1/api/v1/health/live
curl -i http://127.0.0.1/api/v1/health/ready
curl -i http://127.0.0.1/api/v1/health/detail
```

Jika memakai Quick Tunnel:
```bash
URL=$(schoolhub-public-url)
curl -i "$URL/api/v1/health/ready"
```

## 4. Rollback cepat
```bash
cd /opt/schoolhub
docker compose -f docker-compose.production.yml --env-file .env down
# restore source/image sebelumnya jika tersedia, lalu:
docker compose -f docker-compose.production.yml --env-file .env up -d --build
```

## 5. Operasional harian
- Log API: `docker compose -f docker-compose.production.yml --env-file .env logs -f api`
- Log worker: `docker compose -f docker-compose.production.yml --env-file .env logs -f worker`
- Status service: `docker compose -f docker-compose.production.yml --env-file .env ps`
- Performance smoke: `BASE_URL=$(schoolhub-public-url)/api/v1 npm run test:perf-smoke`

## 6. Backup database otomatis

Script backup:
```bash
/opt/schoolhub/scripts/backup_database.sh
```

Install timer systemd:
```bash
sudo cp /opt/schoolhub/ops/systemd/schoolhub-db-backup.service /etc/systemd/system/
sudo cp /opt/schoolhub/ops/systemd/schoolhub-db-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now schoolhub-db-backup.timer
```

Verifikasi:
```bash
systemctl status schoolhub-db-backup.timer --no-pager
systemctl list-timers --all --no-pager | grep schoolhub-db-backup
```

Backup tersimpan di:
```text
/home/schoolhub/backups/database/schoolhub-YYYYMMDD-HHMMSS.sql.gz
```

Retention default: 14 hari.

## 7. Restore database

> Perhatian: restore akan menimpa data database aktif. Lakukan saat maintenance window.

Verifikasi restore ke database sementara minimal berkala:

```bash
cd /opt/schoolhub
ROOT_DIR=/opt/schoolhub ENV_FILE=/opt/schoolhub/.env bash scripts/verify_backup_restore.sh
```

Restore produksi harus memakai guard agar tidak terpencet tidak sengaja:

```bash
cd /opt/schoolhub
docker compose -f docker-compose.production.yml --env-file .env stop api worker web reverse-proxy
CONFIRM_RESTORE=YES_RESTORE bash scripts/restore_database.sh /home/schoolhub/backups/database/<file>.sql.gz
docker compose -f docker-compose.production.yml --env-file .env up -d
```

## 8. Monitoring smoke terjadwal
Aktifkan timer systemd agar smoke test berjalan periodik:

```bash
chmod +x scripts/ops_smoke_monitor.sh scripts/install_smoke_monitor_timer.sh
sudo bash scripts/install_smoke_monitor_timer.sh
```

Artefak hasil monitor:
- Log per run: `output/smoke-monitor/<timestamp>/smoke.log`
- Ringkasan terakhir: `output/smoke-monitor/latest-status.json`

## 9. Monitoring health + alert

Script health alert:

```bash
/opt/schoolhub/scripts/ops_health_alert.sh
```

Yang dicek:
- `/api/v1/health/ready`
- `/api/v1/health/detail`
- root HTML
- status container Docker Compose
- status `schoolhub-db-backup.timer`
- umur backup database terakhir

Konfigurasi rahasia alert tidak disimpan di repo. Jika memakai webhook, buat file `/opt/schoolhub/.env.alert`:

```bash
ALERT_BASE_URL=https://domain-resmi-sekolah.example
ALERT_WEBHOOK_URL=https://example-webhook-url
ALERT_MIN_BACKUP_AGE_HOURS=26
```

Install timer systemd:

```bash
sudo cp /opt/schoolhub/ops/systemd/schoolhub-health-alert.service /etc/systemd/system/
sudo cp /opt/schoolhub/ops/systemd/schoolhub-health-alert.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now schoolhub-health-alert.timer
```

Test manual:

```bash
sudo systemctl start schoolhub-health-alert.service
systemctl status schoolhub-health-alert.service --no-pager
cat /opt/schoolhub/output/health-alert/latest-status.json
```

Jika alert gagal:
1. Cek `docker compose -f /opt/schoolhub/docker-compose.production.yml --env-file /opt/schoolhub/.env ps`.
2. Cek log API: `docker compose -f /opt/schoolhub/docker-compose.production.yml --env-file /opt/schoolhub/.env logs --tail 100 api`.
3. Cek backup terakhir: `ls -lh /home/schoolhub/backups/database | tail`.
4. Jalankan smoke: `cd /opt/schoolhub && BASE_URL=$(schoolhub-public-url) bash scripts/uat_smoke.sh`.

## 10. Scale API ringan jika dibutuhkan

Untuk beta normal, tetap pakai 1 API. Jika latency/CPU naik, API sudah siap dinaikkan ke 2 instance:

```bash
cd /opt/schoolhub
docker compose -f docker-compose.production.yml --env-file .env up -d --scale api=2 --no-recreate
```

Turunkan kembali:

```bash
docker compose -f docker-compose.production.yml --env-file .env up -d --scale api=1 --no-recreate
```

Catatan: Redis dipakai untuk rate limit login sehingga aman saat API lebih dari satu instance.

## 11. SOP Guru Absen Kelas

Flow operasional kelas:

1. Guru klik `Absen Masuk / Mulai Kelas` saat mulai pembelajaran.
2. Guru mengisi `Presensi siswa awal pembelajaran` sekali di awal kelas.
3. Guru klik `Simpan Presensi Awal`.
4. Saat jam selesai, guru klik `Absen Keluar / Akhiri Kelas`.
5. Jika keluar sebelum jam selesai, guru wajib mengisi alasan minimal 10 karakter.
6. Siswa hanya melihat hasil, tidak input presensi sendiri.

Detail lengkap: `docs/SOP_GURU_ABSEN_KELAS_20260425.md`.

## 12. Cloudflare domain tetap
Lihat `docs/cloudflare-named-tunnel.md`.
