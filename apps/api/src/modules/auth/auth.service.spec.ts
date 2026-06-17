import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(async () => true),
  hash: jest.fn(async () => 'new-password-hash')
}));

function makeService() {
  const prisma: any = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    authSession: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
    auditEntry: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      findMany: jest.fn().mockResolvedValue([])
    }
  };
  const jwt: any = { signAsync: jest.fn(async () => 'access-token') };
  const redis: any = {
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(null),
    incrWithTtl: jest.fn().mockResolvedValue(1),
    setPx: jest.fn().mockResolvedValue(null)
  };
  return { prisma, jwt, redis, service: new AuthService(prisma, jwt, redis) };
}

describe('AuthService role-aware login', () => {
  it('rejects a valid credential when expected login area does not match user role', async () => {
    const { prisma, service } = makeService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      username: 'admin',
      fullName: 'Admin TU',
      role: Role.ADMIN_TU,
      active: true,
      passwordHash: 'hash',
      sessionVersion: 1
    });

    await expect(service.login('admin', 'secret', {}, 'guru')).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.authSession.create).not.toHaveBeenCalled();
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'auth.login.role_mismatch',
        module: 'auth',
        resourceId: 'admin'
      })
    });
  });

  it('returns the current authenticated user without trusting local browser storage', async () => {
    const { prisma, service } = makeService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      username: 'guru',
      fullName: 'Guru Mapel',
      role: Role.GURU_MAPEL,
      active: true
    });

    await expect(service.currentUser('u1')).resolves.toEqual({
      id: 'u1',
      username: 'guru',
      fullName: 'Guru Mapel',
      role: Role.GURU_MAPEL
    });
  });

  it('revokes the whole refresh-token family when a rotated token is reused', async () => {
    const { prisma, service } = makeService();
    prisma.authSession.findFirst.mockResolvedValue({
      id: 'old-session',
      userId: 'u1',
      tokenFamilyId: 'family-1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'u1',
        username: 'guru',
        fullName: 'Guru Mapel',
        role: Role.GURU_MAPEL,
        active: true,
        sessionVersion: 1
      }
    });
    prisma.authSession.updateMany.mockResolvedValue({ count: 2 });

    await expect(service.refresh('reused-refresh-token', { requestIp: '127.0.0.1' })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', tokenFamilyId: 'family-1', revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedReason: 'refresh-token-reuse' }
    });
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'auth.refresh.reuse_detected', resourceId: 'old-session' })
    });
  });

  it('changes password atomically, revokes active sessions, and writes audit', async () => {
    const { prisma, service } = makeService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      username: 'guru',
      fullName: 'Guru Mapel',
      role: Role.GURU_MAPEL,
      active: true,
      passwordHash: 'old-hash'
    });
    prisma.authSession.updateMany.mockResolvedValue({ count: 3 });

    await expect(service.changePassword('u1', Role.GURU_MAPEL, 'Old#123456', 'New#123456')).resolves.toEqual({ ok: true });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        passwordHash: 'new-password-hash',
        passwordChangedAt: expect.any(Date),
        mustChangePassword: false,
        sessionVersion: { increment: 1 }
      }
    });
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedReason: 'password-change' }
    });
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'auth.password.changed', resourceId: 'u1' })
    });
  });
});
