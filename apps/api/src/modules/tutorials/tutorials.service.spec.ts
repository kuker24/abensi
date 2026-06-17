import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { TutorialsService } from './tutorials.service';

function makePrisma() {
  const prisma = {
    userTutorialState: {
      findUnique: jest.fn(),
      upsert: jest.fn()
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn()
    },
    auditEntry: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' })
    }
  } as any;
  prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
  return prisma;
}

describe('TutorialsService', () => {
  it('menampilkan tutorial pertama kali untuk pengguna baru dan mencatat audit', async () => {
    const prisma = makePrisma();
    prisma.userTutorialState.findUnique.mockResolvedValue(null);
    prisma.userTutorialState.upsert.mockResolvedValue({ id: 'state-1', userId: 'u-1', tutorialVersion: '2026.04.26', lastSeenAt: new Date(), forceShowAt: null, forceShowBy: null });
    const service = new TutorialsService(prisma);

    const result = await service.getMyTutorial({ sub: 'u-1', role: Role.GURU_MAPEL });

    expect(result.shouldShow).toBe(true);
    expect(prisma.userTutorialState.upsert).toHaveBeenCalled();
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'tutorial.shown', module: 'tutorial' }) });
  });

  it('menyelesaikan tutorial pengguna dan menyimpan audit', async () => {
    const prisma = makePrisma();
    prisma.userTutorialState.upsert.mockResolvedValue({ id: 'state-1', userId: 'u-1', tutorialVersion: '2026.04.26' });
    const service = new TutorialsService(prisma);

    const result = await service.completeMyTutorial({ sub: 'u-1', role: Role.SISWA });

    expect(result.shouldShow).toBe(false);
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'tutorial.completed' }) });
  });

  it('developer dapat mengaktifkan tutorial untuk akun target', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'target-1', username: 'guru.demo', fullName: 'Guru Demo', role: Role.GURU_MAPEL, active: true });
    prisma.userTutorialState.upsert.mockResolvedValue({ id: 'state-2', userId: 'target-1', tutorialVersion: '2026.04.26', forceShowAt: new Date() });
    const service = new TutorialsService(prisma);

    const result = await service.activateForUser('target-1', { sub: 'dev-1', role: Role.DEVELOPER }, 'Aktifkan ulang untuk pelatihan guru.');

    expect(result.ok).toBe(true);
    expect(result.tutorial.shouldShow).toBe(true);
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'tutorial.activated_for_user', actorRole: Role.DEVELOPER }) });
  });

  it('non-developer ditolak saat mengaktifkan tutorial akun lain', async () => {
    const prisma = makePrisma();
    const service = new TutorialsService(prisma);

    await expect(service.activateForUser('target-1', { sub: 'admin-1', role: Role.ADMIN_TU }, 'Tidak boleh.')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
