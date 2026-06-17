import { createHash } from 'node:crypto';
import {
  credentialHashMatches,
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
