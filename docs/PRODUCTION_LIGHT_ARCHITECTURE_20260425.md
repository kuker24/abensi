# Target Arsitektur Produksi Ringan — SchoolHub e-Hadir

Tanggal: 2026-04-25

Scope: menjaga sistem stabil dan cepat tanpa bongkar total arsitektur. Domain permanen, hardware RFID fisik, simulasi hardware, dan APK tidak masuk scope ini.

## Keputusan Arsitektur

Arsitektur tetap sederhana dan cocok untuk beta/operasional sekolah:

```text
Cloudflare Tunnel / domain sementara
        ↓
Nginx reverse proxy
        ↓
React static web + NestJS API
        ↓
PostgreSQL + Redis + Worker
```

Tidak pindah ke Kubernetes untuk tahap ini karena belum perlu. Docker Compose + Nginx + Redis + PostgreSQL lebih mudah dirawat, lebih murah, dan cukup untuk skala MAN 1/beta.

## Perubahan yang Diterapkan

### 1. Redis untuk login rate limit

Rate limit login tidak lagi bergantung pada memori proses saja.

- Kunci percobaan login disimpan di Redis.
- Jika Redis tidak tersedia, sistem tetap punya fallback memori lokal agar login protection tidak mati total.
- Ini membuat sistem lebih siap jika API nanti dijalankan lebih dari 1 instance.

Env terkait:

```env
REDIS_URL=redis://redis:6379
LOGIN_MAX_FAILED_ATTEMPTS=5
LOGIN_WINDOW_MS=600000
LOGIN_LOCK_MS=600000
```

### 2. Redis cache ringan

Redis juga dipakai untuk cache pendek endpoint laporan yang sering dibaca:

- `/reports/dashboard` cache pendek 10–60 detik.
- `/reports/trend` cache 30 detik.

Tujuannya mengurangi query berulang dari dashboard tanpa mengorbankan data penting.

### 3. Nginx tuning dasar

Nginx sekarang memiliki:

- gzip compression;
- cache static asset 7 hari untuk JS/CSS/image/font;
- no-store untuk API;
- security headers dasar;
- rate limit tambahan untuk `/api/v1/auth/login`;
- rate limit ringan untuk API umum;
- timeout proxy yang lebih aman;
- SSE live monitor tetap tanpa buffering.

File:

```text
ops/nginx/reverse-proxy.conf
```

### 4. Mode scale-ready API

Service `api` pada `docker-compose.production.yml` tidak memakai `container_name` tetap, sehingga bisa di-scale jika dibutuhkan.

Contoh jika traffic meningkat:

```bash
docker compose -f docker-compose.production.yml --env-file .env up -d --scale api=2 --no-recreate
```

Catatan: untuk beta normal, tetap gunakan 1 API dulu. Scale hanya jika CPU/latency mulai tinggi.

### 5. Log rotation container

Semua service utama memakai logging driver `json-file` dengan batas:

```text
max-size: 10m
max-file: 5
```

Ini mencegah disk VPS penuh karena log container.

### 6. Index PostgreSQL tambahan

Migration baru:

```text
prisma/migrations/0007_stability_performance_indexes/migration.sql
```

Index ditambahkan untuk pola akses umum:

- user aktif/peran;
- sesi per status/tanggal/kelas/guru/ruang;
- presensi siswa;
- log gerbang;
- anomali/status/prioritas/deadline;
- audit IP/tanggal;
- izin guru;
- jadwal mingguan;
- notifikasi.

### 7. Worker lebih rapi

Worker sekarang menjalankan job terpisah:

- `auto-missed`;
- `reconciliation`.

Masing-masing punya interval sendiri dan tidak menumpuk jika tick sebelumnya masih berjalan.

Env terkait:

```env
WORKER_AUTO_MISSED_INTERVAL_MS=15000
WORKER_RECONCILE_INTERVAL_MS=30000
```

### 8. Observability ringan

Endpoint baru/ditingkatkan:

```text
GET /api/v1/health/detail
```

Berisi:

- status database;
- status Redis;
- latency dependency;
- uptime proses;
- penggunaan memori proses.

Health alert otomatis juga mengecek `/health/detail`.

### 9. Backup/restore lebih matang

Script baru:

```text
scripts/restore_database.sh
scripts/verify_backup_restore.sh
```

Gunakan verifikasi restore berkala:

```bash
ROOT_DIR=/opt/schoolhub ENV_FILE=/opt/schoolhub/.env bash scripts/verify_backup_restore.sh
```

Restore produksi sengaja diberi guard:

```bash
CONFIRM_RESTORE=YES_RESTORE bash scripts/restore_database.sh /path/backup.sql.gz
```

Untuk uji restore ke DB sementara:

```bash
CONFIRM_RESTORE=YES_RESTORE TARGET_DB=schoolhub_restore_test bash scripts/restore_database.sh /path/backup.sql.gz
```

### 10. Performance smoke test

Script baru:

```text
scripts/perf_smoke.mjs
```

Mengetes login dan endpoint penting, lalu menghitung p95 latency.

Contoh:

```bash
BASE_URL=https://alamat/api/v1 npm run test:perf-smoke
```

Default threshold p95: `1500ms`.

## Keputusan yang Tidak Dilakukan Sekarang

### PDF native

Tidak ditambahkan package PDF berat. Laporan tetap memakai print browser yang ringan dan stabil. PDF native bisa ditambahkan nanti jika sekolah membutuhkan arsip otomatis resmi.

### Migrasi paksa `yearLabel`

Data lama tetap kompatibel dengan `yearLabel`. Tahun ajaran/semester/ruang sudah tersedia, tetapi migrasi penuh ke relasi baru dilakukan bertahap setelah data sekolah rapi.

### Kubernetes

Tidak dipakai sekarang. Untuk skala sekolah/beta, Kubernetes menambah kompleksitas tanpa manfaat langsung.

## Kapan Naik Arsitektur?

Naik ke arsitektur lebih kuat jika salah satu terjadi:

- p95 API rutin di atas 1.5–2 detik;
- CPU VPS sering >70%;
- RAM sering >75%;
- user aktif bersamaan meningkat besar;
- laporan bulanan mulai berat;
- sekolah butuh SLA lebih tinggi.

Tahap berikutnya jika dibutuhkan:

1. scale API ke 2 instance;
2. Redis cache untuk lebih banyak laporan;
3. pisahkan database ke managed PostgreSQL atau VPS database khusus;
4. pakai object storage untuk arsip export/PDF;
5. load balancer lebih matang.
