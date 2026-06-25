import { ForbiddenException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { csrfProtection, CSRF_COOKIE, CSRF_HEADER } from './csrf';

function runCsrf(method: string, originalUrl: string, headers: Record<string, string> = {}) {
  const next = jest.fn() as jest.MockedFunction<NextFunction>;
  csrfProtection({ method, originalUrl, headers } as Request, {} as Response, next);
  return next.mock.calls[0]?.[0];
}

describe('csrfProtection', () => {
  it('exempts prefixed login endpoints used by the real API', () => {
    expect(runCsrf('POST', '/api/v1/auth/login')).toBeUndefined();
  });

  it('exempts Android provisioning completion because the APK has no browser CSRF cookie', () => {
    expect(runCsrf('POST', '/api/v1/device-readers/android/provision/complete')).toBeUndefined();
  });

  it('exempts signed Android reader heartbeat/status because it uses HMAC reader auth, not browser cookies', () => {
    expect(runCsrf('POST', '/api/v1/device-readers/android/status')).toBeUndefined();
  });

  it('keeps unsafe authenticated endpoints protected', () => {
    const error = runCsrf('POST', '/api/v1/auth/logout');
    expect(error).toBeInstanceOf(ForbiddenException);
  });

  it('accepts unsafe requests only when CSRF cookie and header match', () => {
    const token = 'csrf-token-for-test';
    const error = runCsrf('POST', '/api/v1/auth/logout', {
      cookie: `${CSRF_COOKIE}=${encodeURIComponent(token)}`,
      [CSRF_HEADER]: token
    });
    expect(error).toBeUndefined();
  });
});
