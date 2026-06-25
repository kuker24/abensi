import { ForbiddenException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';

export const CSRF_COOKIE = 'schoolhub_csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXEMPT_PATH_SUFFIXES = [
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/csrf',
  '/api/v1/device-readers/android/provision/complete',
  '/api/v1/device-readers/android/status',
  '/api/v1/attendance/reader-scan',
  '/api/v1/attendance/qr-reader-scan',
  '/api/v1/device/gate/events',
  '/api/v1/internal/reconciliation/run',
  '/api/v1/internal/sessions/mark-missed'
];

export function generateCsrfToken() {
  return randomBytes(32).toString('base64url');
}

export function csrfCookieOptions() {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Number(process.env.SESSION_TTL_MS ?? String(8 * 60 * 60 * 1000))
  };
}

function readCookie(request: Request, name: string) {
  const raw = request.headers.cookie || '';
  for (const part of raw.split(';').map((item) => item.trim())) {
    const [key, ...valueParts] = part.split('=');
    if (key === name) return decodeURIComponent(valueParts.join('='));
  }
  return undefined;
}

function safeEqual(left?: string, right?: string) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function csrfProtection(request: Request, _response: Response, next: NextFunction) {
  if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return next();
  const path = request.originalUrl.split('?')[0];
  if (EXEMPT_PATH_SUFFIXES.some((suffix) => path.endsWith(suffix))) return next();

  const cookieToken = readCookie(request, CSRF_COOKIE);
  const headerToken = Array.isArray(request.headers[CSRF_HEADER]) ? request.headers[CSRF_HEADER][0] : request.headers[CSRF_HEADER];
  if (!safeEqual(cookieToken, typeof headerToken === 'string' ? headerToken : undefined)) {
    return next(new ForbiddenException('CSRF token tidak valid.'));
  }
  return next();
}
