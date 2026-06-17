import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';

function makeStrategy(user: Partial<{ id: string; username: string; role: Role; active: boolean; sessionVersion: number; mustChangePassword: boolean }> = {}) {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'u1',
        username: 'guru',
        role: Role.GURU_MAPEL,
        active: true,
        sessionVersion: 1,
        mustChangePassword: false,
        ...user
      })
    },
    authSession: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'session-1',
        userId: 'u1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000)
      })
    }
  };
  return { prisma, strategy: new JwtStrategy(prisma) };
}

const payload = {
  sub: 'u1',
  username: 'guru',
  role: Role.GURU_MAPEL,
  sid: 'session-1',
  ver: 1,
  jti: 'jwt-1'
};

describe('JwtStrategy password-change enforcement', () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalIssuer = process.env.JWT_ISSUER;
  const originalAudience = process.env.JWT_AUDIENCE;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-with-enough-length-for-jwt-strategy';
    process.env.JWT_ISSUER = 'schoolhub-test';
    process.env.JWT_AUDIENCE = 'schoolhub-web-test';
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
    process.env.JWT_ISSUER = originalIssuer;
    process.env.JWT_AUDIENCE = originalAudience;
  });

  it('denies protected non-auth endpoints when password change is required', async () => {
    const { strategy } = makeStrategy({ mustChangePassword: true });

    await expect(strategy.validate({ path: '/api/v1/reports/dashboard' } as any, payload)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows auth/change-password when password change is required', async () => {
    const { strategy } = makeStrategy({ mustChangePassword: true });

    await expect(strategy.validate({ path: '/api/v1/auth/change-password' } as any, payload)).resolves.toEqual(expect.objectContaining({
      sub: 'u1',
      mustChangePassword: true
    }));
  });

  it('rejects tokens without a JWT ID', async () => {
    const { strategy } = makeStrategy();

    await expect(strategy.validate({ path: '/api/v1/reports/dashboard' } as any, { ...payload, jti: undefined })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
