import { ForbiddenException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { csrfProtection, CSRF_COOKIE, CSRF_HEADER } from './csrf';

function runCsrf(method: string, originalUrl: string, headers: Record<string, string> = {}) {
  const next = jest.fn() as jest.MockedFunction<NextFunction>;
  csrfProtection({ method, originalUrl, headers } as Request, {} as Response, next);
  return next.mock.calls[0]?.[0];
}

describe('csrfProtection', () => {
  it('exempts login endpoints regardless of whether Nest global prefix is visible to middleware', () => {
    expect(runCsrf('POST', '/auth/login')).toBeUndefined();
    expect(runCsrf('POST', '/api/v1/auth/login')).toBeUndefined();
  });

  it('keeps unsafe authenticated endpoints protected', () => {
    const error = runCsrf('POST', '/auth/logout');
    expect(error).toBeInstanceOf(ForbiddenException);
  });

  it('accepts unsafe requests only when CSRF cookie and header match', () => {
    const token = 'csrf-token-for-test';
    const error = runCsrf('POST', '/auth/logout', {
      cookie: `${CSRF_COOKIE}=${encodeURIComponent(token)}`,
      [CSRF_HEADER]: token
    });
    expect(error).toBeUndefined();
  });
});
