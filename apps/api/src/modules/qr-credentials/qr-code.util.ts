import { BadRequestException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

export const QR_PREFIX = 'schoolhub:qr:v1:';

export function generateOpaqueQrCode() {
  return `QR_${randomBytes(12).toString('base64url').replace(/[^A-Z0-9_]/gi, '').toUpperCase().slice(0, 18)}`;
}

export function formatSchoolHubQr(opaqueCode: string) {
  const code = String(opaqueCode || '').trim();
  if (!/^QR_[A-Z0-9_-]{10,48}$/.test(code)) throw new BadRequestException('Format kode QR internal tidak valid.');
  return `${QR_PREFIX}${code}`;
}

export function parseSchoolHubQr(qrCode: string) {
  const value = String(qrCode || '').trim();
  if (!value.startsWith(QR_PREFIX)) throw new BadRequestException('Format QR tidak didukung.');
  const opaqueCode = value.slice(QR_PREFIX.length).trim();
  if (!/^QR_[A-Z0-9_-]{10,64}$/.test(opaqueCode)) throw new BadRequestException('Format credential QR tidak valid.');
  return { opaqueCode, qrCode: `${QR_PREFIX}${opaqueCode}` };
}

export function qrCodeHash(qrCode: string) {
  const { qrCode: normalized } = parseSchoolHubQr(qrCode);
  return createHash('sha256').update(normalized).digest('hex');
}

export function shortQrCode(qrCode: string) {
  const { opaqueCode } = parseSchoolHubQr(qrCode);
  return opaqueCode.slice(-8);
}

export function redactQr(qrCode: string) {
  try {
    const { opaqueCode } = parseSchoolHubQr(qrCode);
    return `${QR_PREFIX}${opaqueCode.slice(0, 5)}…${opaqueCode.slice(-4)}`;
  } catch {
    return 'schoolhub:qr:v1:INVALID';
  }
}
