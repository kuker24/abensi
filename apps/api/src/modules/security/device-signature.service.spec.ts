import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { AndroidReaderMode, DeviceReaderStatus, ReaderType } from '@prisma/client';
import {
  credentialHashMatches,
  DeviceSignatureService,
  normalizedReaderIdentifier,
  readerCandidateWhere,
  readerCredentialDigest,
  readerCredentialDigestCandidates,
  readerIdentityWhere,
  readerLookupLimit,
  readerMatchesIdentifier,
  safeDigestEqual,
  uniqueReaderMatch
} from './device-signature.service';

describe('reader credential digest', () => {
  const originalReaderSecret = process.env.READER_SECRET_ENCRYPTION_KEY;
  const originalHashSecret = process.env.READER_API_KEY_HASH_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.READER_SECRET_ENCRYPTION_KEY = 'test-reader-secret-material-that-is-long-enough';
    delete process.env.READER_API_KEY_HASH_SECRET;
  });

  afterEach(() => {
    if (originalReaderSecret === undefined) delete process.env.READER_SECRET_ENCRYPTION_KEY;
    else process.env.READER_SECRET_ENCRYPTION_KEY = originalReaderSecret;
    if (originalHashSecret === undefined) delete process.env.READER_API_KEY_HASH_SECRET;
    else process.env.READER_API_KEY_HASH_SECRET = originalHashSecret;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('stores new reader API keys as deterministic keyed HMAC-SHA-256, not plaintext or legacy SHA-256', () => {
    const value = 'shr_reader_test_value';
    const legacySha256 = createHash('sha256').update(value).digest('hex');
    const apiKeyHash = readerCredentialDigest(value);

    expect(apiKeyHash).toBe(readerCredentialDigest(value));
    expect(apiKeyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(apiKeyHash).not.toBe(legacySha256);
    expect(apiKeyHash).not.toBe(value);
    expect(readerMatchesIdentifier({ id: 'reader-1', apiKeyHash }, value)).toBe(true);
    expect(readerCredentialDigestCandidates(value)).toEqual([readerCredentialDigest(value), legacySha256]);
  });

  it('keeps legacy SHA-256 reader API key compatibility with constant-time digest comparison', () => {
    const value = 'shr_reader_legacy_value';
    const legacySha256 = createHash('sha256').update(value).digest('hex');

    expect(credentialHashMatches(value, legacySha256)).toBe(true);
    expect(readerMatchesIdentifier({ id: 'reader-legacy', apiKeyHash: legacySha256 }, value)).toBe(true);
  });

  it('safeDigestEqual handles malformed and different-length digest inputs without throwing', () => {
    expect(safeDigestEqual('not-hex', readerCredentialDigest('x'))).toBe(false);
    expect(safeDigestEqual('abc', readerCredentialDigest('x'))).toBe(false);
    expect(safeDigestEqual(readerCredentialDigest('x'), readerCredentialDigest('x'))).toBe(true);
    expect(safeDigestEqual(readerCredentialDigest('x'), readerCredentialDigest('y'))).toBe(false);
  });

  it('normalizes empty, whitespace-only, and oversized identifiers fail-closed', () => {
    expect(normalizedReaderIdentifier('')).toBe('');
    expect(normalizedReaderIdentifier('   ')).toBe('');
    expect(normalizedReaderIdentifier('x'.repeat(257))).toBe('');
    expect(readerCandidateWhere('x'.repeat(257))).toEqual({ id: '__never_match_reader__' });
  });

  it('builds bounded reader lookup conditions for id, deviceId, current digest, and legacy digest', () => {
    const where = readerIdentityWhere(' reader-1 ', 'reader-1', 'x'.repeat(257), undefined);

    expect(where).toEqual({
      OR: [
        { id: 'reader-1' },
        { deviceId: 'reader-1' },
        { apiKeyHash: readerCredentialDigest('reader-1') },
        { apiKeyHash: createHash('sha256').update('reader-1').digest('hex') }
      ]
    });
  });

  it('adds prefix/last4 as candidate narrowing only, never as final authentication proof', () => {
    const identifier = 'shr_1234567890';
    const prefixOnlyCandidate = { id: 'reader-prefix', keyPrefix: 'shr_123', keyLast4: '7890', apiKeyHash: readerCredentialDigest('different') };

    expect(readerCandidateWhere(identifier)).toEqual(expect.objectContaining({
      OR: expect.arrayContaining([{ keyPrefix: 'shr_123', keyLast4: '7890' }])
    }));
    expect(readerMatchesIdentifier(prefixOnlyCandidate, identifier)).toBe(false);
  });

  it('requires exactly one semantic reader match and ignores database ordering', () => {
    const identifier = 'shr_reader_ordering';
    const matching = { id: 'reader-match', apiKeyHash: readerCredentialDigest(identifier) };
    const prefixCollision = { id: 'reader-collision', keyPrefix: identifier.slice(0, 7), keyLast4: identifier.slice(-4), apiKeyHash: readerCredentialDigest('other') };

    expect(uniqueReaderMatch([prefixCollision, matching], identifier)).toEqual({ status: 'matched', reader: matching });
    expect(uniqueReaderMatch([matching, prefixCollision], identifier)).toEqual({ status: 'matched', reader: matching });
  });

  it('fails closed on duplicate semantic matches across id/deviceId/current/legacy digest', () => {
    const identifier = 'shr_reader_duplicate';
    const currentHash = readerCredentialDigest(identifier);
    const legacyHash = createHash('sha256').update(identifier).digest('hex');

    expect(uniqueReaderMatch([
      { id: identifier, apiKeyHash: readerCredentialDigest('other') },
      { id: 'reader-hmac', apiKeyHash: currentHash }
    ], identifier)).toEqual({ status: 'ambiguous' });
    expect(uniqueReaderMatch([
      { id: 'reader-device', deviceId: identifier, apiKeyHash: readerCredentialDigest('other') },
      { id: 'reader-legacy', apiKeyHash: legacyHash }
    ], identifier)).toEqual({ status: 'ambiguous' });
    expect(uniqueReaderMatch([
      { id: 'reader-hmac', apiKeyHash: currentHash },
      { id: 'reader-legacy', apiKeyHash: legacyHash }
    ], identifier)).toEqual({ status: 'ambiguous' });
  });

  it('fails closed when candidate query result reaches the bounded lookup limit', () => {
    const identifier = 'shr_reader_limit';
    const candidates = Array.from({ length: readerLookupLimit() }, (_, index) => ({ id: `reader-${index}`, apiKeyHash: index === 0 ? readerCredentialDigest(identifier) : readerCredentialDigest(`other-${index}`) }));

    expect(uniqueReaderMatch(candidates, identifier)).toEqual({ status: 'too_many_candidates' });
  });

  it('requires a configured secret in production', () => {
    delete process.env.READER_API_KEY_HASH_SECRET;
    delete process.env.READER_SECRET_ENCRYPTION_KEY;
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';

    expect(() => readerCredentialDigest('shr_reader_no_secret')).toThrow('Reader credential hash secret wajib tersedia');
  });
});

describe('DeviceSignatureService signature and nonce enforcement', () => {
  function signedRequest(secret: string, rawBody: string, nonce = 'nonce-reader-test') {
    const timestamp = new Date().toISOString();
    const bodyHash = createHash('sha256').update(rawBody).digest('hex');
    const signature = createHmac('sha256', secret).update(['POST', '/api/v1/attendance/qr-reader-scan', timestamp, nonce, bodyHash].join('\n')).digest('hex');
    return { deviceId: 'android-1', timestamp, nonce, bodyHash, signature };
  }

  it('claims a valid nonce atomically only after signature validation', async () => {
    const redis = { setNxPx: jest.fn().mockResolvedValue(true) } as any;
    const prisma = { deviceReader: { findMany: jest.fn() } } as any;
    const service = new DeviceSignatureService(prisma, redis);
    const secret = service.generateReaderSecret();
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', deviceId: 'android-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GERBANG], readerSecretCiphertext: service.encryptSecret(secret) }]);
    const rawBody = JSON.stringify({ qrCode: 'schoolhub:qr:v1:QR_1', scanMode: AndroidReaderMode.GERBANG });
    const headers = signedRequest(secret, rawBody);

    await expect(service.assertValidSignedReaderRequest({ method: 'POST', path: '/api/v1/attendance/qr-reader-scan', rawBody, expectedType: ReaderType.QR_ANDROID, headers })).resolves.toMatchObject({ reader: { id: 'reader-1' } });
    expect(redis.setNxPx).toHaveBeenCalledWith(`schoolhub:reader-nonce:reader-1:${createHash('sha256').update(headers.nonce).digest('hex')}`, '1', 300_000);
  });

  it('does not consume nonce for a bad signature', async () => {
    const redis = { setNxPx: jest.fn().mockResolvedValue(true) } as any;
    const prisma = { deviceReader: { findMany: jest.fn() } } as any;
    const service = new DeviceSignatureService(prisma, redis);
    const secret = service.generateReaderSecret();
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', deviceId: 'android-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GERBANG], readerSecretCiphertext: service.encryptSecret(secret) }]);
    const rawBody = JSON.stringify({ qrCode: 'schoolhub:qr:v1:QR_1', scanMode: AndroidReaderMode.GERBANG });
    const headers = { ...signedRequest(secret, rawBody), signature: '0'.repeat(64) };

    await expect(service.assertValidSignedReaderRequest({ method: 'POST', path: '/api/v1/attendance/qr-reader-scan', rawBody, expectedType: ReaderType.QR_ANDROID, headers })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.setNxPx).not.toHaveBeenCalled();
  });

  it('does not inspect reader mode allowlist before validating a bad signature or claiming its nonce', async () => {
    const redis = { setNxPx: jest.fn().mockResolvedValue(true) } as any;
    const prisma = { deviceReader: { findMany: jest.fn() } } as any;
    const service = new DeviceSignatureService(prisma, redis);
    const secret = service.generateReaderSecret();
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', deviceId: 'android-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [], readerSecretCiphertext: service.encryptSecret(secret) }]);
    const rawBody = JSON.stringify({ qrCode: 'schoolhub:qr:v1:QR_1', scanMode: AndroidReaderMode.GERBANG });
    const headers = { ...signedRequest(secret, rawBody), signature: '0'.repeat(64) };

    await expect(service.assertValidSignedReaderRequest({ method: 'POST', path: '/api/v1/attendance/qr-reader-scan', rawBody, expectedType: ReaderType.QR_ANDROID, headers })).rejects.toMatchObject({
      message: 'Signature reader tidak valid.'
    });
    expect(redis.setNxPx).not.toHaveBeenCalled();
  });

  it('rejects replay and unavailable atomic nonce claims', async () => {
    const rawBody = JSON.stringify({ qrCode: 'schoolhub:qr:v1:QR_1', scanMode: AndroidReaderMode.GERBANG });
    const replayRedis = { setNxPx: jest.fn().mockResolvedValue(false) } as any;
    const replayPrisma = { deviceReader: { findMany: jest.fn() } } as any;
    const replayService = new DeviceSignatureService(replayPrisma, replayRedis);
    const replaySecret = replayService.generateReaderSecret();
    replayPrisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', deviceId: 'android-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GERBANG], readerSecretCiphertext: replayService.encryptSecret(replaySecret) }]);
    await expect(replayService.assertValidSignedReaderRequest({ method: 'POST', path: '/api/v1/attendance/qr-reader-scan', rawBody, expectedType: ReaderType.QR_ANDROID, headers: signedRequest(replaySecret, rawBody, 'nonce-replay') })).rejects.toBeInstanceOf(UnauthorizedException);

    const unavailableRedis = { setNxPx: jest.fn().mockResolvedValue(null) } as any;
    const unavailablePrisma = { deviceReader: { findMany: jest.fn() } } as any;
    const unavailableService = new DeviceSignatureService(unavailablePrisma, unavailableRedis);
    const unavailableSecret = unavailableService.generateReaderSecret();
    unavailablePrisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-1', deviceId: 'android-1', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GERBANG], readerSecretCiphertext: unavailableService.encryptSecret(unavailableSecret) }]);
    await expect(unavailableService.assertValidSignedReaderRequest({ method: 'POST', path: '/api/v1/attendance/qr-reader-scan', rawBody, expectedType: ReaderType.QR_ANDROID, headers: signedRequest(unavailableSecret, rawBody, 'nonce-unavailable') })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
