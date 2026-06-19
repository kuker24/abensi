import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { AndroidReaderMode, CardStatus, DevicePlatform, DeviceReaderStatus, GateDirection, PrayerType, Prisma, ReaderType, Role } from '@prisma/client';
import { AttendanceGateService } from './attendance-gate.service';
import { canonicalJson } from '../security/canonical-json';
import { DeviceSignatureService, sha256Hex } from '../security/device-signature.service';

const admin = { sub: 'admin-1', role: Role.ADMIN_TU };

function makePrisma(user: any) {
  const policy = {
    id: 1,
    dhuhaStartTime: '07:00',
    dhuhaEndTime: '10:30',
    dzuhurStartTime: '11:45',
    dzuhurEndTime: '13:30',
    asharStartTime: '15:00',
    asharEndTime: '16:30',
    asharRequiredClassEndTime: '15:00',
    requireStudentAsharForAfternoon: true,
    allowStudentAsharCheckoutOverride: true,
    allowManualOverride: true,
    duplicateScanWindowMinutes: 5,
    legacyQrScanEnabled: true,
    preferOfficialQrReader: true
  };
  const tx = {
    gateLog: { create: jest.fn().mockResolvedValue({ id: 'gate-1', userId: user.id, direction: GateDirection.IN }) },
    smartCard: { update: jest.fn() },
    deviceReader: { updateMany: jest.fn(), update: jest.fn().mockResolvedValue({ id: 'reader-1' }) },
    prayerAttendanceLog: { create: jest.fn().mockResolvedValue({ id: 'prayer-1', studentId: user.id, prayerType: PrayerType.ASHAR }) },
    studentAttendance: { create: jest.fn(), createMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), upsert: jest.fn() },
    qrCredential: { update: jest.fn().mockResolvedValue({ id: 'qr-1' }) },
    attendanceOverride: { upsert: jest.fn().mockResolvedValue({ id: 'override-1', studentId: user.id, status: 'APPROVED' }) },
    auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    auditChainState: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() }
  };
  return {
    attendancePolicy: { findUnique: jest.fn().mockResolvedValue(policy), create: jest.fn().mockResolvedValue(policy), upsert: jest.fn().mockResolvedValue(policy) },
    deviceReader: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn(), update: jest.fn() },
    smartCard: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    gateLog: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    session: { count: jest.fn().mockResolvedValue(0) },
    weeklySchedule: { count: jest.fn().mockResolvedValue(0) },
    prayerAttendanceLog: { findUnique: jest.fn().mockResolvedValue(null) },
    qrCredential: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    attendanceOverride: { findFirst: jest.fn().mockResolvedValue(null) },
    reconciliationFlag: { upsert: jest.fn().mockResolvedValue({}) },
    rejectedDeviceScan: { create: jest.fn().mockResolvedValue({ id: 'rejected-1' }) },
    auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-root' }) },
    auditChainState: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    $transaction: jest.fn(async (fn) => fn(tx)),
    __tx: tx,
    __policy: policy
  } as any;
}

function withGateIn(prisma: any) {
  prisma.gateLog.findFirst
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ id: 'gate-in-1', direction: GateDirection.IN, tappedAt: new Date(Date.now() - 60 * 60 * 1000) });
}

function signedHeaders(secret: string, payload: unknown, nonce = `nonce-${randomUUID()}`, path = '/api/v1/attendance/reader-scan') {
  const rawBody = canonicalJson(payload);
  const timestamp = new Date().toISOString();
  const bodyHash = sha256Hex(rawBody);
  const signature = createHmac('sha256', secret).update(['POST', path, timestamp, nonce, bodyHash].join('\n')).digest('hex');
  return { deviceId: 'reader-1', timestamp, nonce, bodyHash, signature, method: 'POST', path };
}

describe('AttendanceGateService adaptive QR scan', () => {
  it('menolak scan mushola untuk guru/karyawan', async () => {
    const prisma = makePrisma({ id: 'guru-1', active: true, role: Role.GURU_MAPEL });
    const service = new AttendanceGateService(prisma);

    await expect(service.qrScan({ userId: 'guru-1', readerType: ReaderType.MUSHOLA, manualReason: 'Scan manual mushola untuk guru harus ditolak.' }, admin)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('mencatat scan gerbang dari input manual petugas memakai server time', async () => {
    const prisma = makePrisma({ id: 'siswa-1', active: true, role: Role.SISWA });
    const service = new AttendanceGateService(prisma);

    const result = await service.qrScan({ userId: 'siswa-1', readerType: ReaderType.GATE, direction: GateDirection.IN, scannedAt: '2020-01-01T00:00:00.000Z', manualReason: 'Validasi manual UAT presensi siswa.' }, admin);

    expect(result.kind).toBe('GATE');
    expect(prisma.__tx.gateLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'siswa-1', direction: GateDirection.IN, businessDate: expect.any(Date), manualReason: 'Validasi manual UAT presensi siswa.' }) }));
    expect(prisma.__tx.gateLog.create.mock.calls[0][0].data.tappedAt.getFullYear()).not.toBe(2020);
    expect(prisma.__tx.studentAttendance.create).not.toHaveBeenCalled();
    expect(prisma.__tx.studentAttendance.createMany).not.toHaveBeenCalled();
    expect(prisma.__tx.studentAttendance.updateMany).not.toHaveBeenCalled();
  });

  it('memetakan unique businessDate/direction menjadi kode konflik stabil', async () => {
    const prisma = makePrisma({ id: 'siswa-1', role: Role.SISWA, active: true });
    const service = new AttendanceGateService(prisma);
    const uniqueError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['userId', 'businessDate', 'direction'] }
    });
    prisma.$transaction.mockRejectedValueOnce(uniqueError);
    prisma.gateLog.findFirst.mockResolvedValueOnce({ id: 'gate-canonical' });

    await expect((service as any).recordGateScanWithoutPolicy('siswa-1', GateDirection.IN, new Date(), admin, {})).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'GATE_DIRECTION_ALREADY_RECORDED',
        canonicalGateLogId: 'gate-canonical'
      }),
      status: 409
    });
  });

  it('mengembalikan hasil canonical untuk replay deviceEventId yang sama', async () => {
    const prisma = makePrisma({ id: 'siswa-1', role: Role.SISWA, active: true });
    const service = new AttendanceGateService(prisma);
    const uniqueError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['deviceEventId'] }
    });
    prisma.$transaction.mockRejectedValueOnce(uniqueError);
    prisma.gateLog.findUnique.mockResolvedValueOnce({ id: 'gate-canonical', deviceEventId: 'evt-1', direction: GateDirection.IN });

    await expect((service as any).recordGateScanWithoutPolicy('siswa-1', GateDirection.IN, new Date(), admin, { deviceEventId: 'evt-1' })).resolves.toMatchObject({
      idempotent: true,
      item: { id: 'gate-canonical' }
    });
  });

  it('menolak scan ibadah di luar window tanpa membuat PrayerAttendanceLog', async () => {
    const prisma = makePrisma({ id: 'siswa-1', active: true, role: Role.SISWA });
    const service = new AttendanceGateService(prisma);

    await expect((service as any).rejectPrayerOutsideWindow('siswa-1', new Date(), ReaderType.MUSHOLA, admin, { readerId: 'reader-1' }, {
      prayerType: 'OUTSIDE_WINDOW',
      currentWindow: null,
      nextWindow: { prayerType: PrayerType.DZUHUR, startMinute: 11 * 60 + 45, endMinute: 13 * 60 + 30 }
    })).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PRAYER_OUTSIDE_WINDOW',
        nextWindow: expect.objectContaining({ prayerType: PrayerType.DZUHUR })
      }),
      status: 403
    });
    expect(prisma.__tx.prayerAttendanceLog.create).not.toHaveBeenCalled();
    expect(prisma.rejectedDeviceScan.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reason: 'PRAYER_OUTSIDE_WINDOW' }) }));
  });

  it('menolak scan mushola manual tanpa signature reader', async () => {
    const prisma = makePrisma({ id: 'siswa-1', active: true, role: Role.SISWA });
    const service = new AttendanceGateService(prisma);

    await expect(service.qrScan({ userId: 'siswa-1', readerType: ReaderType.MUSHOLA, manualReason: 'Scan manual ibadah tanpa reader resmi.' }, admin)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.__tx.prayerAttendanceLog.create).not.toHaveBeenCalled();
  });

  it('mencatat scan mushola hanya dari signed reader dan prayerType dihitung server', async () => {
    const prisma = makePrisma({ id: 'siswa-1', active: true, role: Role.SISWA });
    prisma.__policy.dhuhaStartTime = '01:00';
    prisma.__policy.dhuhaEndTime = '01:01';
    prisma.__policy.dzuhurStartTime = '02:00';
    prisma.__policy.dzuhurEndTime = '02:01';
    prisma.__policy.asharStartTime = '00:00';
    prisma.__policy.asharEndTime = '23:59';
    prisma.smartCard.findUnique.mockResolvedValue({ id: 'card-1', uid: 'CARD1', status: CardStatus.ACTIVE, user: { id: 'siswa-1', active: true, role: Role.SISWA } });
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const signatures = new DeviceSignatureService(prisma, redis);
    const secret = signatures.generateReaderSecret();
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.MUSHOLA, readerSecretCiphertext: signatures.encryptSecret(secret) }]);
    const service = new AttendanceGateService(prisma, signatures);
    const payload = { cardUid: 'CARD1' };

    const result = await service.readerScan(payload, signedHeaders(secret, payload, 'nonce-prayer-1'));

    expect(result.message).toBe('Sholat Ashar tercatat.');
    expect(prisma.__tx.prayerAttendanceLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ prayerType: PrayerType.ASHAR, signatureVerified: true }) }));
    expect(prisma.__tx.studentAttendance.create).not.toHaveBeenCalled();
    expect(prisma.__tx.studentAttendance.createMany).not.toHaveBeenCalled();
    expect(prisma.__tx.studentAttendance.updateMany).not.toHaveBeenCalled();
  });

  it('mengembalikan pesan ramah saat scan ibadah duplikat dan tidak menimpa log lama', async () => {
    const prisma = makePrisma({ id: 'siswa-1', active: true, role: Role.SISWA });
    prisma.__policy.dhuhaStartTime = '01:00';
    prisma.__policy.dhuhaEndTime = '01:01';
    prisma.__policy.dzuhurStartTime = '02:00';
    prisma.__policy.dzuhurEndTime = '02:01';
    prisma.__policy.asharStartTime = '00:00';
    prisma.__policy.asharEndTime = '23:59';
    prisma.smartCard.findUnique.mockResolvedValue({ id: 'card-1', uid: 'CARD1', status: CardStatus.ACTIVE, user: { id: 'siswa-1', active: true, role: Role.SISWA } });
    prisma.prayerAttendanceLog.findUnique.mockResolvedValueOnce({ id: 'existing-prayer' });
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const signatures = new DeviceSignatureService(prisma, redis);
    const secret = signatures.generateReaderSecret();
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.MUSHOLA, readerSecretCiphertext: signatures.encryptSecret(secret) }]);
    const service = new AttendanceGateService(prisma, signatures);
    const payload = { cardUid: 'CARD1' };

    const result = await service.readerScan(payload, signedHeaders(secret, payload, 'nonce-prayer-dup'));

    expect(result).toMatchObject({ kind: 'PRAYER', idempotent: true, message: 'Ashar hari ini sudah tercatat.' });
    expect(prisma.__tx.prayerAttendanceLog.create).not.toHaveBeenCalled();
  });

  it('menolak scan gerbang duplikat dalam window anti-replay', async () => {
    const prisma = makePrisma({ id: 'siswa-1', active: true, role: Role.SISWA });
    prisma.gateLog.findFirst.mockResolvedValueOnce({ id: 'dup-1', direction: GateDirection.IN, tappedAt: new Date() });
    const service = new AttendanceGateService(prisma);

    await expect(service.qrScan({ userId: 'siswa-1', readerType: ReaderType.GATE, direction: GateDirection.IN, manualReason: 'Validasi duplicate scan kartu siswa.' }, admin)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.reconciliationFlag.upsert).toHaveBeenCalled();
  });

  it('menolak siswa scan pulang tanpa IN valid hari itu', async () => {
    const prisma = makePrisma({ id: 'siswa-1', active: true, role: Role.SISWA });
    const service = new AttendanceGateService(prisma);

    await expect(service.qrScan({ userId: 'siswa-1', readerType: ReaderType.GATE, direction: GateDirection.OUT, manualReason: 'Validasi pulang tanpa scan masuk.' }, admin)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('menolak siswa jadwal sore scan pulang jika belum scan Ashar', async () => {
    const prisma = makePrisma({ id: 'siswa-1', active: true, role: Role.SISWA });
    withGateIn(prisma);
    prisma.session.count.mockResolvedValueOnce(1);
    const service = new AttendanceGateService(prisma);

    await expect(service.qrScan({ userId: 'siswa-1', readerType: ReaderType.GATE, direction: GateDirection.OUT, manualReason: 'Validasi pulang siswa sore.' }, admin)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('mengizinkan siswa jadwal sore scan pulang setelah scan Ashar', async () => {
    const prisma = makePrisma({ id: 'siswa-1', active: true, role: Role.SISWA });
    withGateIn(prisma);
    prisma.session.count.mockResolvedValueOnce(1);
    prisma.prayerAttendanceLog.findUnique.mockResolvedValueOnce({ id: 'ashar-1', prayerType: PrayerType.ASHAR });
    const service = new AttendanceGateService(prisma);

    const result = await service.qrScan({ userId: 'siswa-1', readerType: ReaderType.GATE, direction: GateDirection.OUT, manualReason: 'Validasi pulang setelah Ashar.' }, admin);

    expect(result.kind).toBe('GATE');
    expect(prisma.__tx.gateLog.create).toHaveBeenCalled();
  });

  it('override expired tidak berlaku untuk pulang tanpa Ashar', async () => {
    const prisma = makePrisma({ id: 'siswa-1', active: true, role: Role.SISWA });
    withGateIn(prisma);
    prisma.session.count.mockResolvedValueOnce(1);
    prisma.attendanceOverride.findFirst.mockResolvedValueOnce(null);
    const service = new AttendanceGateService(prisma);

    await expect(service.qrScan({ userId: 'siswa-1', readerType: ReaderType.GATE, direction: GateDirection.OUT, manualReason: 'Override lama sudah tidak berlaku.' }, admin)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('menerima official signed Android QR reader scan HP Gerbang sebagai datang untuk staf', async () => {
    const user = { id: 'staff-1', username: 'tu1', fullName: 'Staf TU Satu', active: true, role: Role.ADMIN_TU, enrollments: [] };
    const prisma = makePrisma(user);
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const signatures = new DeviceSignatureService(prisma, redis);
    const secret = signatures.generateReaderSecret();
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', deviceId: 'android-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT], appVersion: '1.0.0', appVersionCode: 1, readerSecretCiphertext: signatures.encryptSecret(secret) }]);
    const qrCredentials = { findActiveByQrCode: jest.fn().mockResolvedValue({ id: 'qr-1', user }) } as any;
    const mobile = { getAndroidReaderVersion: jest.fn().mockResolvedValue({ minSupportedVersionCode: 1 }) } as any;
    const service = new AttendanceGateService(prisma, signatures, undefined, undefined, qrCredentials, mobile);
    const payload = { credentialType: 'QR' as const, qrCode: 'schoolhub:qr:v1:QR_7F3K9X2P8LQ0', mode: AndroidReaderMode.GATE_IN, appVersion: '1.0.0', appVersionCode: 1 };

    const result = await service.qrReaderScan(payload, signedHeaders(secret, payload, 'nonce-qr-gate-in', '/api/v1/attendance/qr-reader-scan'));

    expect(result.kind).toBe('GATE');
    expect((result as any).action).toBe('Datang');
    expect(result.user.fullName).toBe('Staf TU Satu');
    expect(result.message).toContain('Datang');
    expect(prisma.__tx.gateLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ qrCredentialId: 'qr-1', scanMode: AndroidReaderMode.GATE_IN, signatureVerified: true }) }));
  });

  it('menerima siswa scan di HP Gerbang Android sebagai datang', async () => {
    const user = { id: 'siswa-1', username: 'siswa1', fullName: 'Siswa Satu', active: true, role: Role.SISWA, enrollments: [] };
    const prisma = makePrisma(user);
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const signatures = new DeviceSignatureService(prisma, redis);
    const secret = signatures.generateReaderSecret();
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', deviceId: 'android-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT], readerSecretCiphertext: signatures.encryptSecret(secret) }]);
    const qrCredentials = { findActiveByQrCode: jest.fn().mockResolvedValue({ id: 'qr-1', user }) } as any;
    const service = new AttendanceGateService(prisma, signatures, undefined, undefined, qrCredentials, { getAndroidReaderVersion: jest.fn().mockResolvedValue({ minSupportedVersionCode: 1 }) } as any);
    const payload = { credentialType: 'QR' as const, qrCode: 'schoolhub:qr:v1:QR_7F3K9X2P8LQ0', mode: AndroidReaderMode.GATE_IN, appVersionCode: 1 };

    const result = await service.qrReaderScan(payload, signedHeaders(secret, payload, 'nonce-gate-student-in', '/api/v1/attendance/qr-reader-scan'));

    expect(result).toMatchObject({ kind: 'GATE', ok: true, action: 'Datang', message: 'Datang tercatat.' });
    expect(prisma.__tx.gateLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'siswa-1', direction: GateDirection.IN, scanMode: AndroidReaderMode.GATE_IN }) }));
  });

  it('menerima guru mapel scan di HP Gerbang Android sebagai datang', async () => {
    const user = { id: 'guru-1', username: 'guru1', fullName: 'Guru Satu', active: true, role: Role.GURU_MAPEL, enrollments: [] };
    const prisma = makePrisma(user);
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const signatures = new DeviceSignatureService(prisma, redis);
    const secret = signatures.generateReaderSecret();
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', deviceId: 'android-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT], readerSecretCiphertext: signatures.encryptSecret(secret) }]);
    const qrCredentials = { findActiveByQrCode: jest.fn().mockResolvedValue({ id: 'qr-guru', user }) } as any;
    const service = new AttendanceGateService(prisma, signatures, undefined, undefined, qrCredentials, { getAndroidReaderVersion: jest.fn().mockResolvedValue({ minSupportedVersionCode: 1 }) } as any);
    const payload = { credentialType: 'QR' as const, qrCode: 'schoolhub:qr:v1:QR_GURU', mode: AndroidReaderMode.GATE_IN, appVersionCode: 1 };

    const result = await service.qrReaderScan(payload, signedHeaders(secret, payload, 'nonce-gate-guru-in', '/api/v1/attendance/qr-reader-scan'));

    expect(result).toMatchObject({ kind: 'GATE', ok: true, action: 'Datang' });
    expect(prisma.__tx.gateLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'guru-1', direction: GateDirection.IN }) }));
  });

  it('mencatat scan kedua siswa di HP Gerbang Android sebagai pulang setelah jeda minimum', async () => {
    const now = new Date();
    const firstIn = { id: 'gate-in-1', userId: 'siswa-1', direction: GateDirection.IN, tappedAt: new Date(now.getTime() - 60 * 60_000) };
    const user = { id: 'siswa-1', username: 'siswa1', fullName: 'Siswa Satu', active: true, role: Role.SISWA, enrollments: [] };
    const prisma = makePrisma(user);
    prisma.gateLog.findMany.mockResolvedValue([firstIn]);
    prisma.gateLog.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(firstIn);
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const signatures = new DeviceSignatureService(prisma, redis);
    const secret = signatures.generateReaderSecret();
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', deviceId: 'android-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT], readerSecretCiphertext: signatures.encryptSecret(secret) }]);
    const qrCredentials = { findActiveByQrCode: jest.fn().mockResolvedValue({ id: 'qr-1', user }) } as any;
    const service = new AttendanceGateService(prisma, signatures, undefined, undefined, qrCredentials, { getAndroidReaderVersion: jest.fn().mockResolvedValue({ minSupportedVersionCode: 1 }) } as any);
    const payload = { credentialType: 'QR' as const, qrCode: 'schoolhub:qr:v1:QR_SISWA', mode: AndroidReaderMode.GATE_IN, appVersionCode: 1 };

    const result = await service.qrReaderScan(payload, signedHeaders(secret, payload, 'nonce-gate-student-out', '/api/v1/attendance/qr-reader-scan'));

    expect((result as any).action).toBe('Pulang');
    expect(result.message).toBe('Pulang tercatat.');
    expect(prisma.__tx.gateLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ direction: GateDirection.OUT, scanMode: AndroidReaderMode.GATE_OUT }) }));
  });

  it('mengembalikan pesan sudah tercatat jika scan siswa HP Gerbang terlalu dekat', async () => {
    const now = new Date();
    const firstIn = { id: 'gate-in-1', userId: 'siswa-1', direction: GateDirection.IN, tappedAt: new Date(now.getTime() - 2 * 60_000) };
    const user = { id: 'siswa-1', username: 'siswa1', fullName: 'Siswa Satu', active: true, role: Role.SISWA, enrollments: [] };
    const prisma = makePrisma(user);
    prisma.gateLog.findMany.mockResolvedValue([firstIn]);
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const signatures = new DeviceSignatureService(prisma, redis);
    const secret = signatures.generateReaderSecret();
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', deviceId: 'android-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT], readerSecretCiphertext: signatures.encryptSecret(secret) }]);
    const qrCredentials = { findActiveByQrCode: jest.fn().mockResolvedValue({ id: 'qr-1', user }) } as any;
    const service = new AttendanceGateService(prisma, signatures, undefined, undefined, qrCredentials, { getAndroidReaderVersion: jest.fn().mockResolvedValue({ minSupportedVersionCode: 1 }) } as any);
    const payload = { credentialType: 'QR' as const, qrCode: 'schoolhub:qr:v1:QR_SISWA', mode: AndroidReaderMode.GATE_IN, appVersionCode: 1 };

    const result = await service.qrReaderScan(payload, signedHeaders(secret, payload, 'nonce-gate-student-dup', '/api/v1/attendance/qr-reader-scan'));

    expect(result).toMatchObject({ kind: 'GATE', idempotent: true, action: 'Datang', message: 'Sudah tercatat.' });
    expect(prisma.__tx.gateLog.create).not.toHaveBeenCalled();
  });

  it('menolak official QR saat mode tidak diizinkan dan menulis audit denied', async () => {
    const user = { id: 'staff-1', username: 'tu1', fullName: 'Staf TU Satu', active: true, role: Role.ADMIN_TU, enrollments: [] };
    const prisma = makePrisma(user);
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const signatures = new DeviceSignatureService(prisma, redis);
    const secret = signatures.generateReaderSecret();
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', deviceId: 'android-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.MUSHOLA], readerSecretCiphertext: signatures.encryptSecret(secret) }]);
    const qrCredentials = { findActiveByQrCode: jest.fn().mockResolvedValue({ id: 'qr-1', user }) } as any;
    const service = new AttendanceGateService(prisma, signatures, undefined, undefined, qrCredentials, { getAndroidReaderVersion: jest.fn().mockResolvedValue({ minSupportedVersionCode: 1 }) } as any);
    const payload = { credentialType: 'QR' as const, qrCode: 'schoolhub:qr:v1:QR_STAFF', mode: AndroidReaderMode.GATE_IN, appVersionCode: 1 };

    await expect(service.qrReaderScan(payload, signedHeaders(secret, payload, 'nonce-wrong-mode', '/api/v1/attendance/qr-reader-scan'))).rejects.toMatchObject({ message: 'Mode HP ini tidak cocok untuk scan ini.' });
    expect(qrCredentials.findActiveByQrCode).not.toHaveBeenCalled();
    expect(prisma.__tx.auditEntry.create).toHaveBeenCalled();
  });

  it('menolak official QR jika device reader dicabut', async () => {
    const user = { id: 'siswa-1', username: 'siswa1', fullName: 'Siswa Satu', active: true, role: Role.SISWA, enrollments: [] };
    const prisma = makePrisma(user);
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const signatures = new DeviceSignatureService(prisma, redis);
    const secret = signatures.generateReaderSecret();
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', status: DeviceReaderStatus.REVOKED, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GATE_IN], readerSecretCiphertext: signatures.encryptSecret(secret) }]);
    const service = new AttendanceGateService(prisma, signatures, undefined, undefined, { findActiveByQrCode: jest.fn() } as any, { getAndroidReaderVersion: jest.fn().mockResolvedValue({ minSupportedVersionCode: 1 }) } as any);
    const payload = { credentialType: 'QR' as const, qrCode: 'schoolhub:qr:v1:QR_7F3K9X2P8LQ0', mode: AndroidReaderMode.GATE_IN, appVersionCode: 1 };

    await expect(service.qrReaderScan(payload, signedHeaders(secret, payload, 'nonce-revoked-device', '/api/v1/attendance/qr-reader-scan'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('menolak official QR credential yang dicabut', async () => {
    const user = { id: 'siswa-1', username: 'siswa1', fullName: 'Siswa Satu', active: true, role: Role.SISWA, enrollments: [] };
    const prisma = makePrisma(user);
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const signatures = new DeviceSignatureService(prisma, redis);
    const secret = signatures.generateReaderSecret();
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GATE_IN], readerSecretCiphertext: signatures.encryptSecret(secret) }]);
    const qrCredentials = { findActiveByQrCode: jest.fn().mockRejectedValue(new ForbiddenException('QR credential tidak aktif.')) } as any;
    const service = new AttendanceGateService(prisma, signatures, undefined, undefined, qrCredentials, { getAndroidReaderVersion: jest.fn().mockResolvedValue({ minSupportedVersionCode: 1 }) } as any);
    const payload = { credentialType: 'QR' as const, qrCode: 'schoolhub:qr:v1:QR_7F3K9X2P8LQ0', mode: AndroidReaderMode.GATE_IN, appVersionCode: 1 };

    await expect(service.qrReaderScan(payload, signedHeaders(secret, payload, 'nonce-revoked-qr', '/api/v1/attendance/qr-reader-scan'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.__tx.gateLog.create).not.toHaveBeenCalled();
  });

  it('CHECK_ONLY official QR tidak membuat log absensi', async () => {
    const user = { id: 'siswa-1', username: 'siswa1', fullName: 'Siswa Satu', active: true, role: Role.SISWA, enrollments: [] };
    const prisma = makePrisma(user);
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const signatures = new DeviceSignatureService(prisma, redis);
    const secret = signatures.generateReaderSecret();
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', deviceId: 'android-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.CHECK_ONLY], appVersion: '1.0.0', appVersionCode: 1, readerSecretCiphertext: signatures.encryptSecret(secret) }]);
    const qrCredentials = { findActiveByQrCode: jest.fn().mockResolvedValue({ id: 'qr-1', user }) } as any;
    const service = new AttendanceGateService(prisma, signatures, undefined, undefined, qrCredentials, { getAndroidReaderVersion: jest.fn().mockResolvedValue({ minSupportedVersionCode: 1 }) } as any);
    const payload = { credentialType: 'QR' as const, qrCode: 'schoolhub:qr:v1:QR_7F3K9X2P8LQ0', mode: AndroidReaderMode.CHECK_ONLY, appVersionCode: 1 };

    const result = await service.qrReaderScan(payload, signedHeaders(secret, payload, 'nonce-check-only', '/api/v1/attendance/qr-reader-scan'));

    expect(result.kind).toBe('CHECK_ONLY');
    expect(prisma.__tx.gateLog.create).not.toHaveBeenCalled();
    expect(prisma.__tx.prayerAttendanceLog.create).not.toHaveBeenCalled();
  });

});

describe('DeviceSignatureService signed reader request', () => {
  it('menolak lookup reader ambigu sebelum memverifikasi signature', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const service = new DeviceSignatureService({
      deviceReader: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'reader-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.GATE, readerSecretCiphertext: null },
          { id: 'reader-2', deviceId: 'reader-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.GATE, readerSecretCiphertext: null }
        ])
      }
    } as any, redis);
    const rawBody = JSON.stringify({ cardUid: 'CARD1' });

    await expect(service.assertValidSignedReaderRequest({
      method: 'POST',
      path: '/api/v1/attendance/reader-scan',
      rawBody,
      headers: { deviceId: 'reader-1', timestamp: new Date().toISOString(), nonce: 'nonce-ambiguous', bodyHash: sha256Hex(rawBody), signature: '0'.repeat(64) }
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('menolak QR_ANDROID inactive legacy-platform pada signed request', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const service = new DeviceSignatureService({
      deviceReader: { findMany: jest.fn().mockResolvedValue([{ id: 'reader-android-inactive', deviceId: 'android-legacy', status: DeviceReaderStatus.INACTIVE, type: ReaderType.QR_ANDROID, platform: DevicePlatform.HARDWARE, allowedModes: [AndroidReaderMode.MUSHOLA], readerSecretCiphertext: 'unused' }]) }
    } as any, redis);
    const rawBody = JSON.stringify({ credentialType: 'QR', qrCode: 'schoolhub:qr:v1:QR_7F3K9X2P8LQ0', mode: AndroidReaderMode.MUSHOLA });

    await expect(service.assertValidSignedReaderRequest({
      method: 'POST',
      path: '/api/v1/attendance/qr-reader-scan',
      rawBody,
      expectedType: ReaderType.QR_ANDROID,
      headers: { deviceId: 'android-legacy', timestamp: new Date().toISOString(), nonce: 'nonce-inactive-qr-android', bodyHash: sha256Hex(rawBody), signature: '0'.repeat(64) }
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(redis.setPx).not.toHaveBeenCalled();
  });

  it('menolak reader inactive pada signed request', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const service = new DeviceSignatureService({
      deviceReader: { findMany: jest.fn().mockResolvedValue([{ id: 'reader-1', status: DeviceReaderStatus.INACTIVE, type: ReaderType.GATE, readerSecretCiphertext: null }]) }
    } as any, redis);
    const rawBody = JSON.stringify({ cardUid: 'CARD1' });

    await expect(service.assertValidSignedReaderRequest({
      method: 'POST',
      path: '/api/v1/attendance/reader-scan',
      rawBody,
      headers: { deviceId: 'reader-1', timestamp: new Date().toISOString(), nonce: 'nonce-inactive', bodyHash: sha256Hex(rawBody), signature: '0'.repeat(64) }
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('menolak signature salah', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const prisma = { deviceReader: { findMany: jest.fn().mockResolvedValue([{ id: 'reader-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.GATE, readerSecretCiphertext: null }]) } } as any;
    const service = new DeviceSignatureService(prisma, redis);
    const secret = service.generateReaderSecret();
    const encrypted = service.encryptSecret(secret);
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.GATE, readerSecretCiphertext: encrypted }]);
    const rawBody = JSON.stringify({ cardUid: 'CARD1' });

    await expect(service.assertValidSignedReaderRequest({
      method: 'POST',
      path: '/api/v1/attendance/reader-scan',
      rawBody,
      headers: { deviceId: 'reader-1', timestamp: new Date().toISOString(), nonce: 'nonce-1', bodyHash: sha256Hex(rawBody), signature: '0'.repeat(64) }
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('menolak nonce replay', async () => {
    const redis = { get: jest.fn().mockResolvedValue('1'), setPx: jest.fn() } as any;
    const prisma = { deviceReader: { findMany: jest.fn() } } as any;
    const service = new DeviceSignatureService(prisma, redis);
    const secret = service.generateReaderSecret();
    const encrypted = service.encryptSecret(secret);
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.GATE, readerSecretCiphertext: encrypted }]);
    const rawBody = JSON.stringify({ cardUid: 'CARD1' });
    const timestamp = new Date().toISOString();
    const nonce = 'nonce-1';
    const bodyHash = sha256Hex(rawBody);
    const signature = createHmac('sha256', secret).update(['POST', '/api/v1/attendance/reader-scan', timestamp, nonce, bodyHash].join('\n')).digest('hex');

    await expect(service.assertValidSignedReaderRequest({ method: 'POST', path: '/api/v1/attendance/reader-scan', rawBody, headers: { deviceId: 'reader-1', timestamp, nonce, bodyHash, signature } })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('menolak timestamp reader yang terlalu jauh dari waktu server', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const prisma = { deviceReader: { findMany: jest.fn() } } as any;
    const service = new DeviceSignatureService(prisma, redis);
    const secret = service.generateReaderSecret();
    const encrypted = service.encryptSecret(secret);
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.GATE, readerSecretCiphertext: encrypted }]);
    const rawBody = JSON.stringify({ cardUid: 'CARD1' });
    const timestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const nonce = 'nonce-old';
    const bodyHash = sha256Hex(rawBody);
    const signature = createHmac('sha256', secret).update(['POST', '/api/v1/attendance/reader-scan', timestamp, nonce, bodyHash].join('\n')).digest('hex');

    await expect(service.assertValidSignedReaderRequest({ method: 'POST', path: '/api/v1/attendance/reader-scan', rawBody, headers: { deviceId: 'reader-1', timestamp, nonce, bodyHash, signature } })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
