import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
    prisma.userTutorialState.upsert.mockResolvedValue({ id: 'state-1', userId: 'u-1', tutorialVersion: '2026.07.24', lastSeenAt: new Date(), forceShowAt: null, forceShowBy: null });
    const service = new TutorialsService(prisma);

    const result = await service.getMyTutorial({ sub: 'u-1', role: Role.GURU_MAPEL }, '2026.07.24');

    expect(result.shouldShow).toBe(true);
    expect(prisma.userTutorialState.upsert).toHaveBeenCalled();
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'tutorial.shown', module: 'tutorial' }) });
  });

  it('menyelesaikan tutorial pengguna dan menyimpan audit', async () => {
    const prisma = makePrisma();
    prisma.userTutorialState.upsert.mockResolvedValue({ id: 'state-1', userId: 'u-1', tutorialVersion: '2026.07.24' });
    const service = new TutorialsService(prisma);

    const result = await service.completeMyTutorial({ sub: 'u-1', role: Role.SISWA }, '2026.07.24');

    expect(result.shouldShow).toBe(false);
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'tutorial.completed' }) });
  });

  it('developer dapat mengaktifkan tutorial untuk akun target', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'target-1', username: 'guru.demo', fullName: 'Guru Demo', role: Role.GURU_MAPEL, active: true });
    prisma.userTutorialState.upsert.mockResolvedValue({ id: 'state-2', userId: 'target-1', tutorialVersion: '2026.07.24', forceShowAt: new Date() });
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

  it('membuka tutorial interaktif baru untuk Admin TU yang menutup versi lama', async () => {
    const prisma = makePrisma();
    const completedAt = new Date('2026-07-01T00:00:00.000Z');
    prisma.userTutorialState.findUnique.mockResolvedValue({ id: 'state-admin', userId: 'admin-1', tutorialVersion: '2026.04.26', completedAt, dismissedAt: null, forceShowAt: null, forceShowBy: null, lastSeenAt: completedAt });
    prisma.userTutorialState.upsert.mockResolvedValue({ id: 'state-admin', userId: 'admin-1', tutorialVersion: '2026.07.24', completedAt: null, dismissedAt: null, forceShowAt: null, forceShowBy: null, lastSeenAt: new Date() });
    const service = new TutorialsService(prisma);

    const result = await service.getMyTutorial({ sub: 'admin-1', role: Role.ADMIN_TU }, '2026.07.24');

    expect(result.shouldShow).toBe(true);
    expect(prisma.userTutorialState.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ tutorialVersion: '2026.07.24', completedAt: null, dismissedAt: null }) }));
  });

    it('bundle lama tidak dapat menutup tutorial baru', async () => {
    const prisma = makePrisma();
    const service = new TutorialsService(prisma);

    const status = await service.getMyTutorial({ sub: 'admin-1', role: Role.ADMIN_TU }, '2026.04.26');

    expect(status).toEqual(expect.objectContaining({ shouldShow: false, updateRequired: true }));
    expect(prisma.userTutorialState.upsert).not.toHaveBeenCalled();
    await expect(service.completeMyTutorial({ sub: 'admin-1', role: Role.ADMIN_TU }, '2026.04.26')).rejects.toBeInstanceOf(BadRequestException);
  });
});
