import { createHash } from 'node:crypto';
import { hashReaderApiKey, readerCandidateWhere, readerCredentialDigest, readerCredentialDigestCandidates, readerIdentityWhere, readerMatchesIdentifier } from './device-signature.service';

describe('reader credential digest', () => {
  const originalReaderSecret = process.env.READER_SECRET_ENCRYPTION_KEY;
  const originalHashSecret = process.env.READER_API_KEY_HASH_SECRET;

  beforeEach(() => {
    process.env.READER_SECRET_ENCRYPTION_KEY = 'test-reader-secret-material-that-is-long-enough';
    delete process.env.READER_API_KEY_HASH_SECRET;
  });

  afterEach(() => {
    if (originalReaderSecret === undefined) delete process.env.READER_SECRET_ENCRYPTION_KEY;
    else process.env.READER_SECRET_ENCRYPTION_KEY = originalReaderSecret;
    if (originalHashSecret === undefined) delete process.env.READER_API_KEY_HASH_SECRET;
    else process.env.READER_API_KEY_HASH_SECRET = originalHashSecret;
  });

  it('hashes new reader API keys with bcrypt and keeps deterministic legacy lookup candidates', () => {
    const value = 'shr_reader_test_value';
    const legacySha256 = createHash('sha256').update(value).digest('hex');
    const apiKeyHash = hashReaderApiKey(value);

    expect(apiKeyHash).toMatch(/^\$2[aby]\$12\$/);
    expect(readerMatchesIdentifier({ id: 'reader-1', apiKeyHash }, value)).toBe(true);
    expect(readerCredentialDigest(value)).toMatch(/^[a-f0-9]{64}$/);
    expect(readerCredentialDigest(value)).not.toBe(legacySha256);
    expect(readerCredentialDigestCandidates(value)).toEqual([readerCredentialDigest(value), legacySha256]);
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

  it('adds prefix/last4 candidate lookup only for bounded API-key-like identifiers', () => {
    expect(readerCandidateWhere('shr_1234567890')).toEqual(expect.objectContaining({
      OR: expect.arrayContaining([{ keyPrefix: 'shr_123', keyLast4: '7890' }])
    }));
    expect(readerCandidateWhere('x'.repeat(257))).toEqual({ id: '__never_match_reader__' });
  });
});
