-- Add a read-only leadership role for Kepala Sekolah dashboards.
-- Safe additive enum change; no existing data is modified.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'KEPALA_SEKOLAH';
