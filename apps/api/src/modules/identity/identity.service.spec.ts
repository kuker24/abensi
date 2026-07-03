import { CardStatus, QrCredentialStatus, Role } from '@prisma/client';
import { IdentityService } from './identity.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(async (value: string) => `hash:length:${value.length}`),
  compare: jest.fn(async (value: string, hash: string) => hash === 'hash:pin:valid' ? value === '123456' : value === 'AdminPass#123')
}));

function safeJson(value: unknown) {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item);
}

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
    authSession: { count: jest.fn().mockResolvedValue(0) },
    qrCredential: { count: jest.fn().mockResolvedValue(0) },
    teacherLeave: { count: jest.fn().mockResolvedValue(0) },
    weeklySchedule: { count: jest.fn().mockResolvedValue(0) },
    prayerAttendanceLog: { count: jest.fn().mockResolvedValue(0) },
    attendanceOverride: { count: jest.fn().mockResolvedValue(0) },
    attendanceCorrectionEvent: { count: jest.fn().mockResolvedValue(0) },
    userTutorialState: { deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
    accountDeleteSecuritySetting: {
      findUnique: jest.fn(),
      upsert: jest.fn()
    },
    auditEntry: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn()
    },
    __tx: undefined,
    $transaction: jest.fn(async (fn) => {
      const tx = {
        user: {
          update: prisma.user.update,
          delete: jest.fn().mockResolvedValue({})
        },
        authSession: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        qrCredential: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        smartCard: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        userTutorialState: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        notification: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        accountDeleteSecuritySetting: { upsert: prisma.accountDeleteSecuritySetting.upsert },
        auditEntry: { create: prisma.auditEntry.create },
        auditChainState: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() }
      };
      prisma.__tx = tx;
      return fn(tx);
    })
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
    prisma.user.update.mockResolvedValue({ id: 'u1', username: 'siswa', fullName: 'Siswa', role: Role.SISWA, cardStatus: CardStatus.INACTIVE, active: false });
    const service = new IdentityService(prisma);

    const result = await service.deactivateUser('u1', actor, 'Lulus');

    expect(result.active).toBe(false);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ active: false, cardStatus: CardStatus.INACTIVE }) }));
    expect(prisma.__tx.qrCredential.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'u1', status: QrCredentialStatus.ACTIVE },
      data: expect.objectContaining({ status: QrCredentialStatus.REVOKED, revokedById: 'admin-1', revokeReason: 'Lulus' })
    }));
    expect(prisma.__tx.smartCard.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', status: { not: CardStatus.INACTIVE } }, data: { status: CardStatus.INACTIVE } });
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'user.deactivated', reason: 'Lulus' }) });
  });

  it('previews valid import rows', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([]);
    const service = new IdentityService(prisma);

    const preview = await service.previewUsersImport([{ username: 'baru', fullName: 'Siswa Baru', role: Role.SISWA, password: 'Import#12345' }]);

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

  it('marks import rows without password as invalid', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([]);
    const service = new IdentityService(prisma);

    const preview = await service.previewUsersImport([{ username: 'tanpa.password', fullName: 'Tanpa Password', role: Role.SISWA }]);

    expect(preview.summary).toEqual({ total: 1, valid: 0, invalid: 1 });
    expect(preview.rows[0].errors).toContain('password wajib diisi');
  });

  it('does not commit invalid import rows', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([{ username: 'duplikat' }]);
    const service = new IdentityService(prisma);

    const result = await service.commitUsersImport([{ username: 'duplikat', fullName: 'Duplikat', role: Role.SISWA, password: 'Import#12345' }], actor);

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


  it('generates account login slips for active allowed users without storing plaintext', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([
      { id: 'student-1', username: 'siswa.test', fullName: 'Siswa Test', role: Role.SISWA, active: true },
      { id: 'teacher-1', username: 'guru.test', fullName: 'Guru Test', role: Role.GURU_MAPEL, active: true }
    ]);
    prisma.user.update.mockResolvedValue({});
    const service = new IdentityService(prisma);

    const result = await service.generateAccountLoginSlips({ userIds: ['student-1', 'teacher-1'], reason: 'Cetak slip akun awal.' }, actor);

    expect(result.slips).toHaveLength(2);
    expect(result.revokeSessions).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledTimes(2);
    for (const slip of result.slips) {
      expect(slip.initialPassword).toHaveLength(14);
      expect(safeJson(prisma.user.update.mock.calls)).not.toContain(`"initialPassword":"${slip.initialPassword}"`);
      expect(safeJson(prisma.user.update.mock.calls)).not.toContain(`"password":"${slip.initialPassword}"`);
    }
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'student-1' },
      data: expect.objectContaining({
        passwordHash: expect.stringMatching(/^hash:length:/),
        mustChangePassword: false,
        passwordChangedAt: null,
        sessionVersion: { increment: 1 }
      })
    }));
    expect(prisma.__tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: { in: ['student-1', 'teacher-1'] }, revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedReason: 'account-slip-generated' }
    });
    const auditCall = prisma.auditEntry.create.mock.calls.at(-1)?.[0];
    expect(auditCall).toEqual({ data: expect.objectContaining({ action: 'account_slips.generated', module: 'identity', reason: 'Cetak slip akun awal.' }) });
    for (const slip of result.slips) {
      expect(safeJson(auditCall)).not.toContain(slip.initialPassword);
    }
  });

  it('rejects empty and oversized account login slip batches', async () => {
    const prisma = makePrisma();
    const service = new IdentityService(prisma);

    await expect(service.generateAccountLoginSlips({ userIds: [], reason: 'Cetak slip akun awal.' }, actor)).rejects.toThrow('Pilih minimal satu pengguna.');
    await expect(service.generateAccountLoginSlips({ userIds: Array.from({ length: 51 }, (_, index) => `u-${index}`), reason: 'Cetak slip akun awal.' }, actor)).rejects.toThrow('Maksimal 50 pengguna per batch.');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('rejects operator IT and developer target account slips', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([{ id: 'dev-1', username: 'developer', fullName: 'Developer', role: Role.DEVELOPER, active: true }]);
    const service = new IdentityService(prisma);

    await expect(service.generateAccountLoginSlips({ userIds: ['student-1'], reason: 'Cetak slip akun awal.' }, { sub: 'operator-1', role: 'OPERATOR_IT' })).rejects.toThrow('Lembar akun login hanya boleh dibuat oleh Admin TU atau Developer.');
    await expect(service.generateAccountLoginSlips({ userIds: ['dev-1'], reason: 'Cetak slip akun awal.' }, { sub: 'dev-admin', role: 'DEVELOPER' })).rejects.toThrow('Target lembar akun hanya SISWA, GURU_MAPEL, GURU_PIKET, atau KEPALA_SEKOLAH.');
  });

  it('rejects inactive users for account login slips', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([{ id: 'student-1', username: 'siswa.test', fullName: 'Siswa Test', role: Role.SISWA, active: false }]);
    const service = new IdentityService(prisma);

    await expect(service.generateAccountLoginSlips({ userIds: ['student-1'], reason: 'Cetak slip akun awal.' }, actor)).rejects.toThrow('Lembar akun hanya boleh dibuat untuk pengguna aktif.');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('configures account delete PIN with admin re-auth and never audits the PIN', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', username: 'admin', role: Role.ADMIN_TU, active: true, passwordHash: 'hash:admin' });
    prisma.accountDeleteSecuritySetting.upsert.mockResolvedValue({ id: 1, updatedAt: new Date('2026-07-03T00:00:00.000Z') });
    const service = new IdentityService(prisma);

    const result = await service.configureAccountDeletePin({ currentPassword: 'AdminPass#123', pin: '123456', confirmPin: '123456', reason: 'Menyiapkan PIN hapus akun.' }, actor);

    expect(result.configured).toBe(true);
    expect(prisma.accountDeleteSecuritySetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ deletePinHash: expect.stringMatching(/^hash:length:/), updatedById: 'admin-1' })
    }));
    expect(safeJson(prisma.auditEntry.create.mock.calls)).not.toContain('123456');
  });

  it('previews account delete decisions without mutating data', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([
      { id: 'fresh-1', username: 'fresh.user', fullName: 'Fresh User', role: Role.SISWA, active: true, cardStatus: CardStatus.ACTIVE, archivedAt: null },
      { id: 'kepsek-1', username: 'kepsek', fullName: 'Kepala Sekolah', role: Role.KEPALA_SEKOLAH, active: true, cardStatus: CardStatus.ACTIVE, archivedAt: null }
    ]);
    prisma.studentAttendance.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    const service = new IdentityService(prisma);

    const preview = await service.previewAccountDelete({ userIds: ['fresh-1', 'kepsek-1'] }, actor);

    expect(preview.summary).toEqual({ hardDeleteCount: 1, archiveCount: 1, rejectedCount: 0 });
    expect(preview.items[0].action).toBe('HARD_DELETE');
    expect(preview.items[1].action).toBe('ARCHIVE');
    expect(preview.items[1].warnings.join(' ')).toMatch(/Kepala Sekolah/);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('rejects duplicate account delete IDs before PIN verification', async () => {
    const prisma = makePrisma();
    const service = new IdentityService(prisma);

    await expect(service.deleteAccounts({ userIds: ['u1', 'u1'], reason: 'Menghapus akun duplikat.', pin: '123456', confirmText: 'HAPUS AKUN' }, actor)).rejects.toThrow('duplikat');
    expect(prisma.accountDeleteSecuritySetting.findUnique).not.toHaveBeenCalled();
  });

  it('audits wrong delete PIN without storing PIN', async () => {
    const prisma = makePrisma();
    prisma.accountDeleteSecuritySetting.findUnique.mockResolvedValue({ deletePinHash: 'hash:pin:valid' });
    const service = new IdentityService(prisma);

    await expect(service.deleteAccounts({ userIds: ['u1'], reason: 'Menghapus akun salah input.', pin: '000000', confirmText: 'HAPUS AKUN' }, actor)).rejects.toThrow('PIN konfirmasi salah');
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'identity.accounts.delete_pin_failed' }) });
    expect(safeJson(prisma.auditEntry.create.mock.calls)).not.toContain('000000');
  });

  it('archives account with dependencies and revokes sessions and QR credentials', async () => {
    const prisma = makePrisma();
    prisma.accountDeleteSecuritySetting.findUnique.mockResolvedValue({ deletePinHash: 'hash:pin:valid' });
    prisma.user.findMany.mockResolvedValue([{ id: 'student-1', username: 'siswa.histori', fullName: 'Siswa Histori', role: Role.SISWA, active: true, cardStatus: CardStatus.ACTIVE, archivedAt: null }]);
    prisma.studentAttendance.count.mockResolvedValue(1);
    prisma.user.update.mockResolvedValue({});
    const service = new IdentityService(prisma);

    const result = await service.deleteAccounts({ userIds: ['student-1'], reason: 'Membersihkan akun tidak dipakai.', pin: '123456', confirmText: 'HAPUS AKUN' }, actor);

    expect(result.archivedCount).toBe(1);
    expect(result.hardDeletedCount).toBe(0);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'student-1' },
      data: expect.objectContaining({ active: false, archivedById: 'admin-1', deleteMode: 'ARCHIVED_BY_ACCOUNT_DELETE', sessionVersion: { increment: 1 } })
    }));
    expect(prisma.__tx.authSession.updateMany).toHaveBeenCalledWith({ where: { userId: 'student-1', revokedAt: null }, data: { revokedAt: expect.any(Date), revokedReason: 'account-archived' } });
    expect(prisma.__tx.qrCredential.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'student-1', status: QrCredentialStatus.ACTIVE } }));
    expect(safeJson(prisma.auditEntry.create.mock.calls)).not.toContain('123456');
  });

  it('hard deletes only orphan accounts', async () => {
    const prisma = makePrisma();
    prisma.accountDeleteSecuritySetting.findUnique.mockResolvedValue({ deletePinHash: 'hash:pin:valid' });
    prisma.user.findMany.mockResolvedValue([{ id: 'fresh-1', username: 'fresh.user', fullName: 'Fresh User', role: Role.SISWA, active: true, cardStatus: CardStatus.ACTIVE, archivedAt: null }]);
    const service = new IdentityService(prisma);

    const result = await service.deleteAccounts({ userIds: ['fresh-1'], reason: 'Menghapus akun test kosong.', pin: '123456', confirmText: 'HAPUS AKUN', mode: 'hard-delete-only-if-safe' }, actor);

    expect(result.hardDeletedCount).toBe(1);
    expect(result.archivedCount).toBe(0);
    expect(prisma.__tx.userTutorialState.deleteMany).toHaveBeenCalledWith({ where: { userId: 'fresh-1' } });
    expect(prisma.__tx.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: 'fresh-1' } });
    expect(prisma.__tx.user.delete).toHaveBeenCalledWith({ where: { id: 'fresh-1' } });
  });

});
