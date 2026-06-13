import { Role } from '@prisma/client';
import { SystemCleanupService } from './system-cleanup.service';

function makePrisma() {
  const prisma: any = {
    session: { count: jest.fn().mockResolvedValue(0) },
    classEnrollment: { count: jest.fn().mockResolvedValue(0) },
    gateLog: { count: jest.fn().mockResolvedValue(0) },
    studentAttendance: { count: jest.fn().mockResolvedValue(0) },
    teacherSessionPresence: { count: jest.fn().mockResolvedValue(0) },
    reconciliationFlag: { count: jest.fn().mockResolvedValue(0) },
    auditEntry: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) },
    teacherLeave: { count: jest.fn().mockResolvedValue(0) },
    weeklySchedule: { count: jest.fn().mockResolvedValue(0) },
    prayerAttendanceLog: { count: jest.fn().mockResolvedValue(0) },
    attendanceOverride: { count: jest.fn().mockResolvedValue(0) },
    attendanceCorrectionEvent: { count: jest.fn().mockResolvedValue(0) },
    picketNote: { count: jest.fn().mockResolvedValue(0) },
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: 'u1', username: 'contract.user.create.1', fullName: 'Contract User', role: Role.SISWA }])
    },
    smartCard: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([{ id: 'card-1', uid: 'UID-OLD', status: 'INACTIVE', user: { username: 'old.user', fullName: 'Old User' } }]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 })
    },
    notification: {
      findMany: jest.fn().mockResolvedValue([{ id: 'n1', title: 'Sudah dibaca', createdAt: new Date(), readAt: new Date() }]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 })
    },
    userTutorialState: {
      findMany: jest.fn().mockResolvedValue([{ id: 't1', tutorialVersion: 'old', updatedAt: new Date(), user: { username: 'old.user', fullName: 'Old User' } }]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 })
    }
  };
  prisma.$transaction = jest.fn(async (fn) => fn({
    smartCard: prisma.smartCard,
    notification: prisma.notification,
    userTutorialState: prisma.userTutorialState,
    user: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    auditEntry: prisma.auditEntry
  }));
  return prisma;
}

describe('SystemCleanupService', () => {
  const developer = { sub: 'dev-1', role: Role.DEVELOPER };

  it('preview menampilkan kandidat clean data dan data dilindungi', async () => {
    const prisma = makePrisma();
    const service = new SystemCleanupService(prisma);

    const preview = await service.preview(developer, { olderThanDays: 30 });

    expect(preview.categories.inactiveTestUsers.count).toBe(1);
    expect(preview.categories.inactiveUserCards.count).toBe(1);
    expect(preview.protectedData).toContain('Catatan audit resmi');
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'system_cleanup.previewed' }) });
  });

  it('run membersihkan data aman dan mencatat audit', async () => {
    const prisma = makePrisma();
    const service = new SystemCleanupService(prisma);

    const result = await service.run(developer, { inactiveTestUsers: true, inactiveUserCards: true, readNotifications: true, staleTutorialStates: true, olderThanDays: 30, reason: 'Membersihkan data test nonaktif.' });

    expect(result.ok).toBe(true);
    expect(result.executed.inactiveUserCards).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('non-developer ditolak menjalankan clean data', async () => {
    const prisma = makePrisma();
    const service = new SystemCleanupService(prisma);

    await expect(service.preview({ sub: 'admin-1', role: Role.ADMIN_TU }, {})).rejects.toThrow('Clean data sistem hanya boleh dilakukan Developer.');
  });
});
