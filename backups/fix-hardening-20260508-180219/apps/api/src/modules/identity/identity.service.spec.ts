import { Role } from '@prisma/client';
import { IdentityService } from './identity.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(async (value: string) => `hash:${value}`)
}));

function makePrisma() {
  const prisma: any = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(2),
      delete: jest.fn()
    },
    session: { count: jest.fn().mockResolvedValue(0) },
    classEnrollment: { count: jest.fn().mockResolvedValue(0) },
    gateLog: { count: jest.fn().mockResolvedValue(0) },
    studentAttendance: { count: jest.fn().mockResolvedValue(0) },
    teacherSessionPresence: { count: jest.fn().mockResolvedValue(0) },
    reconciliationFlag: { count: jest.fn().mockResolvedValue(0) },
    reconciliationEscalation: { count: jest.fn().mockResolvedValue(0) },
    picketNote: { count: jest.fn().mockResolvedValue(0) },
    smartCard: { count: jest.fn().mockResolvedValue(0) },
    teacherLeave: { count: jest.fn().mockResolvedValue(0) },
    weeklySchedule: { count: jest.fn().mockResolvedValue(0) },
    prayerAttendanceLog: { count: jest.fn().mockResolvedValue(0) },
    attendanceOverride: { count: jest.fn().mockResolvedValue(0) },
    attendanceCorrectionEvent: { count: jest.fn().mockResolvedValue(0) },
    userTutorialState: { deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
    auditEntry: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn()
    },
    $transaction: jest.fn(async (fn) => fn({
      user: {
        update: prisma.user.update,
        delete: jest.fn().mockResolvedValue({})
      },
      authSession: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userTutorialState: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      notification: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      auditEntry: { create: prisma.auditEntry.create },
      auditChainState: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() }
    }))
  };
  return prisma;
}

describe('IdentityService', () => {
  const actor = { sub: 'admin-1', role: 'ADMIN_TU' };

  it('updates user and writes audit', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'siswa', fullName: 'Siswa', role: Role.SISWA, cardStatus: 'ACTIVE', active: true });
    prisma.user.update.mockResolvedValue({ id: 'u1', username: 'siswa', fullName: 'Siswa Baru', role: Role.SISWA, cardStatus: 'ACTIVE', active: true });
    const service = new IdentityService(prisma);

    const result = await service.updateUser('u1', { fullName: 'Siswa Baru' }, actor);

    expect(result.fullName).toBe('Siswa Baru');
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ module: 'identity', action: 'user.updated' }) });
  });

  it('deactivates user as safe delete', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'siswa', fullName: 'Siswa', role: Role.SISWA, cardStatus: 'ACTIVE', active: true });
    prisma.user.update.mockResolvedValue({ id: 'u1', username: 'siswa', fullName: 'Siswa', role: Role.SISWA, active: false });
    const service = new IdentityService(prisma);

    const result = await service.deactivateUser('u1', actor, 'Lulus');

    expect(result.active).toBe(false);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ active: false }) }));
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'user.deactivated', reason: 'Lulus' }) });
  });

  it('previews valid import rows', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([]);
    const service = new IdentityService(prisma);

    const preview = await service.previewUsersImport([{ username: 'baru', fullName: 'Siswa Baru', role: Role.SISWA, password: 'SchoolHub#2026' }]);

    expect(preview.summary).toEqual({ total: 1, valid: 1, invalid: 0 });
  });

  it('marks invalid import rows', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([{ username: 'duplikat' }]);
    const service = new IdentityService(prisma);

    const preview = await service.previewUsersImport([{ username: 'duplikat', fullName: '', role: 'BUKAN_ROLE' as Role, password: 'short' }]);

    expect(preview.summary.invalid).toBe(1);
    expect(preview.rows[0].errors).toEqual(expect.arrayContaining(['fullName wajib', 'role tidak valid', 'username sudah ada', 'password minimal 8 karakter']));
  });

  it('does not commit invalid import rows', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([{ username: 'duplikat' }]);
    const service = new IdentityService(prisma);

    const result = await service.commitUsersImport([{ username: 'duplikat', fullName: 'Duplikat', role: Role.SISWA, password: 'SchoolHub#2026' }], actor);

    expect(result.committed).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('menolak admin saat hapus permanen akun', async () => {
    const prisma = makePrisma();
    const service = new IdentityService(prisma);

    await expect(service.deleteUserPermanently('u1', { confirmUsername: 'siswa', reason: 'Hapus akun test.' }, actor)).rejects.toThrow('Hapus permanen hanya boleh dilakukan Developer.');
  });

  it('developer bisa hapus permanen akun tanpa histori', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'test.user', fullName: 'Test User', role: Role.SISWA, cardStatus: 'INACTIVE', active: false });
    const service = new IdentityService(prisma);

    const result = await service.deleteUserPermanently('u1', { confirmUsername: 'test.user', reason: 'Menghapus akun test kosong.' }, { sub: 'dev-1', role: 'DEVELOPER' });

    expect(result.deleted).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('developer ditolak hapus akun dengan histori', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'siswa.histori', fullName: 'Siswa Histori', role: Role.SISWA, cardStatus: 'ACTIVE', active: false });
    prisma.studentAttendance.count.mockResolvedValueOnce(1);
    const service = new IdentityService(prisma);

    await expect(service.deleteUserPermanently('u1', { confirmUsername: 'siswa.histori', reason: 'Coba hapus akun historis.' }, { sub: 'dev-1', role: 'DEVELOPER' })).rejects.toThrow('Akun ini punya riwayat penting');
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'identity.user.permanent_delete_blocked' }) });
  });

  it('developer tidak bisa hapus diri sendiri', async () => {
    const prisma = makePrisma();
    const service = new IdentityService(prisma);

    await expect(service.deleteUserPermanently('dev-1', { confirmUsername: 'developer', reason: 'Tidak boleh hapus sendiri.' }, { sub: 'dev-1', role: 'DEVELOPER' })).rejects.toThrow('Anda tidak boleh menghapus akun sendiri.');
  });
});
