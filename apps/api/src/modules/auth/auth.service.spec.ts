import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(async () => true)
}));

function makeService() {
  const prisma: any = {
    user: { findUnique: jest.fn() },
    authSession: { create: jest.fn() },
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
});
