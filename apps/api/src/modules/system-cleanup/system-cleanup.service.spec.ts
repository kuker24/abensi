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
    auditEntry: prisma.auditEntry,
    reconciliationFlag: {
      findMany: jest.fn().mockResolvedValue([{ id: 'flag-1' }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 })
    },
    reconciliationEscalation: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }
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

  it('preview cleanup pilot tersedia untuk Admin/TU tanpa mengubah data', async () => {
    const prisma = makePrisma();
    prisma.session.count.mockResolvedValueOnce(89).mockResolvedValueOnce(51);
    prisma.notification.count = jest.fn().mockResolvedValue(102);
    prisma.reconciliationFlag.count.mockResolvedValue(51);
    const service = new SystemCleanupService(prisma);

    const preview = await service.previewPilot({ sub: 'admin-1', role: Role.ADMIN_TU }, { date: '2026-07-23' });

    expect(preview.counts).toEqual({ sessions: 89, missedSessions: 51, notifications: 102, flags: 51 });
    expect(preview.actions.sessions).toBe('PRESERVE');
    expect(prisma.session.count).toHaveBeenNthCalledWith(1, { where: { businessDate: new Date('2026-07-23T00:00:00.000Z') } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('run cleanup pilot hanya menghapus notifikasi dan menyelesaikan flag dalam transaksi', async () => {
    const prisma = makePrisma();
    prisma.session.count.mockResolvedValue(51);
    prisma.notification.count = jest.fn().mockResolvedValue(102);
    prisma.reconciliationFlag.count.mockResolvedValue(51);
    const service = new SystemCleanupService(prisma);

    const result = await service.runPilot(
      { sub: 'admin-1', role: Role.ADMIN_TU },
      { date: '2026-07-23', reason: 'Menutup artefak uji coba pegawai.', confirmText: 'BERSIHKAN PILOT' }
    );

    expect(result.ok).toBe(true);
    expect(result.executed).toEqual({ deletedNotifications: 1, resolvedFlags: 1, closedEscalations: 0 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'system_cleanup.pilot_executed' }) });
  });

  it('run cleanup pilot menolak role lain dan konfirmasi salah', async () => {
    const prisma = makePrisma();
    const service = new SystemCleanupService(prisma);
    const payload = { date: '2026-07-23', reason: 'Menutup artefak uji coba pegawai.', confirmText: 'SALAH' };

    await expect(service.runPilot({ sub: 'guru-1', role: Role.GURU_MAPEL }, payload)).rejects.toThrow('Cleanup pilot hanya boleh dilakukan');
    await expect(service.runPilot({ sub: 'admin-1', role: Role.ADMIN_TU }, payload)).rejects.toThrow('Ketik BERSIHKAN PILOT');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
