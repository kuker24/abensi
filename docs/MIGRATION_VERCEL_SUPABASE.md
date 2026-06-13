# Migrasi ke Vercel + Supabase

## Ringkasan

```
SEBELUM (semua di VPS):
┌─────────────────────────────────────┐
│              VPS                    │
│  ┌──────┐ ┌──────┐ ┌──────┐       │
│  │ Nginx│ │ NestJS│ │ Redis│       │
│  └──────┘ └──────┘ └──────┘       │
│  ┌──────┐ ┌──────┐                 │
│  │  PG  │ │Worker│                 │
│  └──────┘ └──────┘                 │
└─────────────────────────────────────┘

SESUDAH (hybrid):
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Vercel  │  │   VPS    │  │ Supabase │
│ (gratis) │  │(Rp 50rb) │  │ (gratis) │
│          │  │          │  │          │
│ Frontend │  │ NestJS   │  │PostgreSQL│
│ React    │  │ Worker   │  │ Database │
│ Vite     │  │ Nginx    │  │          │
└──────────┘  └──────────┘  └──────────┘
```

## Step 1: Buat Supabase Database

### 1.1 Daftar Supabase

1. Buka https://supabase.com
2. Klik "Start your project"
3. Sign up dengan GitHub (gratis)

### 1.2 Buat Project Baru

1. Klik "New Project"
2. Isi:
   - **Organization**: pilih atau buat baru
   - **Project name**: `schoolhub-ehadir`
   - **Database password**: buat password kuat (SIMPAN!)
   - **Region**: `Southeast Asia (Singapore)`
3. Klik "Create new project"
4. Tunggu ~2 menit provisioning

### 1.3 Ambil Connection String

1. Klik **Settings** (gear icon) → **Database**
2. Scroll ke **Connection string**
3. Klik tab **URI**
4. Copy connection string, contoh:

```
postgresql://postgres.xxxxx:your-password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

5. Simpan dua versi:

```env
# Pooling (port 6543) — untuk runtime app
DATABASE_URL=postgresql://postgres.xxxxx:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres

# Direct (port 5432) — untuk Prisma migrate
DIRECT_URL=postgresql://postgres.xxxxx:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

---

## Step 2: Update Environment Variables di VPS

### 2.1 Copy template Supabase

```bash
cd /path/to/Absensi
cp .env.production.supabase.example .env
```

### 2.2 Edit .env

```bash
nano .env
```

Isi dengan:

```env
# Database Supabase
DATABASE_URL=postgresql://postgres.xxxxx:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.xxxxx:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres

# JWT (generate random string)
JWT_SECRET=$(openssl rand -hex 32)
WORKER_TOKEN=$(openssl rand -hex 16)

# CORS (isi setelah tahu URL Vercel di Step 3)
CORS_ORIGIN=https://nama-project.vercel.app
PUBLIC_APP_ORIGIN=https://nama-project.vercel.app

# Admin
ADMIN_USERNAME=admin.tu
ADMIN_PASSWORD=password-kuat-anda
ADMIN_FULL_NAME=Admin TU
DEFAULT_USER_PASSWORD=password-default-siswa

# Developer
DEVELOPER_USERNAME=developer
DEVELOPER_PASSWORD=password-developer
DEVELOPER_FULL_NAME=Developer SchoolHub
```

### 2.3 Migrate database ke Supabase

```bash
cd /path/to/Absensi

# Generate Prisma client
npx prisma generate

# Push schema ke Supabase
npx prisma db push

# Seed data awal
npx prisma db seed
```

### 2.4 Jalankan backend dengan Supabase

```bash
# Stop backend lama (kalau jalan)
docker compose down

# Jalankan dengan config Supabase
docker compose -f docker-compose.supabase.yml up -d --build

# Cek log
docker compose -f docker-compose.supabase.yml logs -f api
```

---

## Step 3: Deploy Frontend ke Vercel

### 3.1 Daftar Vercel

1. Buka https://vercel.com
2. Klik "Sign Up"
3. Sign up dengan GitHub (gratis)

### 3.2 Import Project

1. Klik "Add New..." → "Project"
2. Cari repo kamu di GitHub
3. Klik "Import"

### 3.3 Configure Project

Isi settings:

| Setting | Value |
|---------|-------|
| **Framework Preset** | Vite |
| **Root Directory** | `apps/web` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

### 3.4 Set Environment Variables

Klik "Environment Variables" dan tambah:

| Key | Value |
|-----|-------|
| `VITE_API_BASE_URL` | `https://URL-VPS-KAMU/api/v1` |

**Untuk VITE_API_BASE_URL**, isi dengan salah satu:

```txt
# Kalau pakai Cloudflare Tunnel:
https://preferences-nail-division-needle.trycloudflare.com/api/v1

# Kalau punya domain sendiri:
https://api.ehadir.sch.id/api/v1

# Kalau pakai IP VPS langsung (tidak disarankan):
http://157.15.40.21/api/v1
```

### 3.5 Deploy

1. Klik "Deploy"
2. Tunggu ~1-2 menit build
3. Selesai! Frontend sudah di Vercel

### 3.6 Catat URL Vercel

Setelah deploy, Vercel kasih URL seperti:

```
https://schoolhub-ehadir.vercel.app
```

**Copy URL ini** — nanti dipakai untuk update CORS_ORIGIN di .env backend.

### 3.7 Update CORS di Backend

```bash
# Edit .env di VPS
nano .env

# Update CORS_ORIGIN dengan URL Vercel
CORS_ORIGIN=https://schoolhub-ehadir.vercel.app
PUBLIC_APP_ORIGIN=https://schoolhub-ehadir.vercel.app

# Restart backend
docker compose -f docker-compose.supabase.yml restart api
```

---

## Step 4: Verifikasi

### 4.1 Cek Backend

```bash
# Health check
curl https://URL-VPS-KAMU/health/ready

# Expected output:
# {"status":"ready","database":{"status":"ok"},"redis":{"status":"ok"}}
```

### 4.2 Cek Frontend

1. Buka https://schoolhub-ehadir.vercel.app
2. Harus muncul halaman login
3. Login dengan admin / password
4. Cek console browser, tidak boleh ada error CORS

### 4.3 Cek Database Supabase

1. Buka https://supabase.com → project kamu
2. Klik **Table Editor**
3. Harus ada tabel-tabel: `User`, `Student`, `TeachingSession`, dll
4. Data seed sudah masuk

---

## Step 5: Auto-Deploy Setup

### 5.1 Push ke GitHub

```bash
cd /path/to/Absensi
git add .
git commit -m "feat: migrate to Supabase + Vercel"
git push origin main
```

### 5.2 Vercel Auto-Deploy

Setiap push ke `main`, Vercel otomatis:
1. Build frontend
2. Deploy ke production
3. Update URL (tetap sama)

### 5.3 Flow Kerja Baru

```txt
1. Edit kode di laptop
2. git commit + git push
3. Vercel auto-deploy frontend (1-2 menit)
4. Backend tetap jalan di VPS
5. Database di Supabase (auto-backup)
```

---

## Troubleshooting

### CORS Error di Browser

```
Access to fetch at 'https://api.xxx' from origin 'https://vercel.app' 
has been blocked by CORS policy
```

**Fix:**
1. Pastikan `CORS_ORIGIN` di .env backend = URL Vercel kamu
2. Restart backend: `docker compose -f docker-compose.supabase.yml restart api`

### Database Connection Error

```
Can't reach database server at `aws-0-ap-southeast-1.pooler.supabase.com:6543`
```

**Fix:**
1. Cek password di connection string benar
2. Cek project Supabase sudah aktif (bukan paused)
3. Cek tidak ada typo di DATABASE_URL

### Prisma Migrate Error

```
Error: P1001: Can't reach database server
```

**Fix:**
1. Pastikan pakai `DIRECT_URL` (port 5432) untuk migrate
2. Jalankan: `npx prisma db push --schema prisma/schema.prisma`

### Vercel Build Error

```
Error: Command "npm run build" exited with 1
```

**Fix:**
1. Cek log build di Vercel dashboard
2. Pastikan `apps/web/package.json` punya script `build`
3. Pastikan tidak ada TypeScript error: `npm run typecheck --prefix apps/web`

### Backend Tidak Bisa Diakses dari Vercel

**Fix:**
1. Pastikan port 80 terbuka di VPS firewall
2. Pastikan nginx jalan: `docker compose -f docker-compose.supabase.yml logs reverse-proxy`
3. Test dari browser: `https://URL-VPS-KAMU/health/ready`

---

## Biaya

```txt
┌─────────────┬──────────────┬─────────────────┐
│  Komponen   │  Free Tier   │ Cukup untuk     │
├─────────────┼──────────────┼─────────────────┤
│ Vercel      │ 100GB bw/bln │ ~2000 user/hari │
│ Supabase    │ 500MB DB     │ ~5 tahun data   │
│ VPS         │ Rp 50-80rb   │ 1 sekolah       │
├─────────────┼──────────────┼─────────────────┤
│ Total       │ ~Rp 50-80rb  │ per bulan       │
└─────────────┴──────────────┴─────────────────┘
```

---

## Rollback ke VPS-only

Kalau mau balik ke setup lama:

```bash
# Stop Supabase config
docker compose -f docker-compose.supabase.yml down

# Jalankan config lama
cp .env.production.example .env
# Edit .env dengan database lama
docker compose -f docker-compose.production.yml up -d --build
```

---

## File yang Diubah/Ditambah

```
prisma/schema.prisma              ← tambah directUrl
.env.production.supabase.example  ← baru: template Supabase
docker-compose.supabase.yml       ← baru: compose tanpa postgres
ops/nginx/api-only.conf           ← baru: nginx API-only
apps/web/vercel.json              ← baru: config Vercel
apps/web/.env.example             ← baru: template env frontend
.gitignore                        ← update: track example files
docs/MIGRATION_VERCEL_SUPABASE.md ← baru: dokumen ini
```
