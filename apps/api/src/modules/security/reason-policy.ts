import { BadRequestException } from '@nestjs/common';

const WEAK_REASON_PATTERNS = [
  /^ok$/i,
  /^ya$/i,
  /^iya$/i,
  /^test$/i,
  /^tes$/i,
  /^manual$/i,
  /^override$/i,
  /^alasan$/i,
  /^-+$/,
  /^\.+$/
];

export function normalizeReason(reason?: string | null) {
  return String(reason || '').trim().replace(/\s+/g, ' ');
}

export function assertReasonQuality(reason: string | undefined | null, label = 'Alasan') {
  const normalized = normalizeReason(reason);
  if (normalized.length < 15) {
    throw new BadRequestException(`${label} minimal 15 karakter dan harus jelas.`);
  }
  if (WEAK_REASON_PATTERNS.some((pattern) => pattern.test(normalized))) {
    throw new BadRequestException(`${label} terlalu umum. Tulis alasan yang bisa diverifikasi.`);
  }
  const uniqueChars = new Set(normalized.toLowerCase().replace(/\s/g, '').split(''));
  if (uniqueChars.size < 6) {
    throw new BadRequestException(`${label} tidak cukup jelas.`);
  }
  return normalized;
}
