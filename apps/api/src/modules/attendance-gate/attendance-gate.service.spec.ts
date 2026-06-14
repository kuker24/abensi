import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { AndroidReaderMode, CardStatus, DeviceReaderStatus, GateDirection, PrayerType, Prisma, ReaderType, Role } from '@prisma/client';
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
    qrCredential: { update: jest.fn().mockResolvedValue({ id: 'qr-1' }) },
    attendanceOverride: { upsert: jest.fn().mockResolvedValue({ id: 'override-1', studentId: user.id, status: 'APPROVED' }) },
    auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    auditChainState: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() }
  };
  return {
    attendancePolicy: { findUnique: jest.fn().mockResolvedValue(policy), create: jest.fn().mockResolvedValue(policy), upsert: jest.fn().mockResolvedValue(policy) },
    deviceReader: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn(), update: jest.fn() },
    smartCard: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    gateLog: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null) },
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

function signedHeaders(secret: string, payload: unknown, nonce = `nonce-${Math.random()}`, path = '/api/v1/attendance/reader-scan') {
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
    prisma.deviceReader.findFirst.mockResolvedValue({ id: 'reader-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.MUSHOLA, readerSecretCiphertext: signatures.encryptSecret(secret) });
    const service = new AttendanceGateService(prisma, signatures);
    const payload = { cardUid: 'CARD1' };

    const result = await service.readerScan(payload, signedHeaders(secret, payload, 'nonce-prayer-1'));

    expect(result.message).toBe('Scan Ashar tercatat.');
    expect(prisma.__tx.prayerAttendanceLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ prayerType: PrayerType.ASHAR, signatureVerified: true }) }));
  });

  it('menolak scan ibadah duplikat dan tidak menimpa log lama', async () => {
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
    prisma.deviceReader.findFirst.mockResolvedValue({ id: 'reader-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.MUSHOLA, readerSecretCiphertext: signatures.encryptSecret(secret) });
    const service = new AttendanceGateService(prisma, signatures);
    const payload = { cardUid: 'CARD1' };

    await expect(service.readerScan(payload, signedHeaders(secret, payload, 'nonce-prayer-dup'))).rejects.toBeInstanceOf(ConflictException);
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

  it('menerima official signed Android QR reader scan GATE_IN', async () => {
    const user = { id: 'siswa-1', username: 'siswa1', fullName: 'Siswa Satu', active: true, role: Role.SISWA, enrollments: [] };
    const prisma = makePrisma(user);
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const signatures = new DeviceSignatureService(prisma, redis);
    const secret = signatures.generateReaderSecret();
    prisma.deviceReader.findFirst.mockResolvedValue({ id: 'reader-1', deviceId: 'android-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GATE_IN, AndroidReaderMode.CHECK_ONLY], appVersion: '1.0.0', appVersionCode: 1, readerSecretCiphertext: signatures.encryptSecret(secret) });
    const qrCredentials = { findActiveByQrCode: jest.fn().mockResolvedValue({ id: 'qr-1', user }) } as any;
    const mobile = { getAndroidReaderVersion: jest.fn().mockResolvedValue({ minSupportedVersionCode: 1 }) } as any;
    const service = new AttendanceGateService(prisma, signatures, undefined, undefined, qrCredentials, mobile);
    const payload = { credentialType: 'QR' as const, qrCode: 'schoolhub:qr:v1:QR_7F3K9X2P8LQ0', mode: AndroidReaderMode.GATE_IN, appVersion: '1.0.0', appVersionCode: 1 };

    const result = await service.qrReaderScan(payload, signedHeaders(secret, payload, 'nonce-qr-gate-in', '/api/v1/attendance/qr-reader-scan'));

    expect(result.kind).toBe('GATE');
    expect(result.user.fullName).toBe('Siswa Satu');
    expect(prisma.__tx.gateLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ qrCredentialId: 'qr-1', scanMode: AndroidReaderMode.GATE_IN, signatureVerified: true }) }));
  });

  it('menolak official QR jika device reader dicabut', async () => {
    const user = { id: 'siswa-1', username: 'siswa1', fullName: 'Siswa Satu', active: true, role: Role.SISWA, enrollments: [] };
    const prisma = makePrisma(user);
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const signatures = new DeviceSignatureService(prisma, redis);
    const secret = signatures.generateReaderSecret();
    prisma.deviceReader.findFirst.mockResolvedValue({ id: 'reader-1', status: DeviceReaderStatus.REVOKED, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GATE_IN], readerSecretCiphertext: signatures.encryptSecret(secret) });
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
    prisma.deviceReader.findFirst.mockResolvedValue({ id: 'reader-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GATE_IN], readerSecretCiphertext: signatures.encryptSecret(secret) });
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
    prisma.deviceReader.findFirst.mockResolvedValue({ id: 'reader-1', deviceId: 'android-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.CHECK_ONLY], appVersion: '1.0.0', appVersionCode: 1, readerSecretCiphertext: signatures.encryptSecret(secret) });
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
  it('menolak signature salah', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const prisma = { deviceReader: { findFirst: jest.fn().mockResolvedValue({ id: 'reader-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.GATE, readerSecretCiphertext: null }) } } as any;
    const service = new DeviceSignatureService(prisma, redis);
    const secret = service.generateReaderSecret();
    const encrypted = service.encryptSecret(secret);
    prisma.deviceReader.findFirst.mockResolvedValue({ id: 'reader-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.GATE, readerSecretCiphertext: encrypted });
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
    const prisma = { deviceReader: { findFirst: jest.fn() } } as any;
    const service = new DeviceSignatureService(prisma, redis);
    const secret = service.generateReaderSecret();
    const encrypted = service.encryptSecret(secret);
    prisma.deviceReader.findFirst.mockResolvedValue({ id: 'reader-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.GATE, readerSecretCiphertext: encrypted });
    const rawBody = JSON.stringify({ cardUid: 'CARD1' });
    const timestamp = new Date().toISOString();
    const nonce = 'nonce-1';
    const bodyHash = sha256Hex(rawBody);
    const signature = createHmac('sha256', secret).update(['POST', '/api/v1/attendance/reader-scan', timestamp, nonce, bodyHash].join('\n')).digest('hex');

    await expect(service.assertValidSignedReaderRequest({ method: 'POST', path: '/api/v1/attendance/reader-scan', rawBody, headers: { deviceId: 'reader-1', timestamp, nonce, bodyHash, signature } })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('menolak timestamp reader yang terlalu jauh dari waktu server', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null), setPx: jest.fn() } as any;
    const prisma = { deviceReader: { findFirst: jest.fn() } } as any;
    const service = new DeviceSignatureService(prisma, redis);
    const secret = service.generateReaderSecret();
    const encrypted = service.encryptSecret(secret);
    prisma.deviceReader.findFirst.mockResolvedValue({ id: 'reader-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.GATE, readerSecretCiphertext: encrypted });
    const rawBody = JSON.stringify({ cardUid: 'CARD1' });
    const timestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const nonce = 'nonce-old';
    const bodyHash = sha256Hex(rawBody);
    const signature = createHmac('sha256', secret).update(['POST', '/api/v1/attendance/reader-scan', timestamp, nonce, bodyHash].join('\n')).digest('hex');

    await expect(service.assertValidSignedReaderRequest({ method: 'POST', path: '/api/v1/attendance/reader-scan', rawBody, headers: { deviceId: 'reader-1', timestamp, nonce, bodyHash, signature } })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
