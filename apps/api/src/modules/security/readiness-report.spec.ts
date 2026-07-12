import {
  createReadinessQueryFailure,
  createSanitizedReadinessReport,
  sanitizeReadinessDetails,
  sanitizedReadinessError
} from './readiness-report';

describe('readiness report sanitizer', () => {
  it('keeps failure counts and categories while excluding identifiers, PII, hashes, payloads, URLs, and raw errors', () => {
    const forbiddenId = 'student-private-123';
    const forbiddenName = 'Private Student Name';
    const forbiddenHash = 'a'.repeat(64);
    const forbiddenUrl = 'postgresql://admin:password@db.example.test:5432/schoolhub';
    const rawError = 'connection refused password=secret';
    const report = createSanitizedReadinessReport({
      generatedAt: '2026-07-12T00:00:00.000Z',
      checks: [{
        name: 'enrollment_period_overlaps',
        severity: 'BLOCKING',
        count: 2,
        details: [{
          category: 'enrollment_period_overlap',
          count: 2,
          studentId: forbiddenId,
          userId: forbiddenId,
          attendanceId: forbiddenId,
          sessionId: forbiddenId,
          weeklyScheduleId: forbiddenId,
          left_id: forbiddenId,
          right_id: forbiddenId,
          name: forbiddenName,
          payload: { forbiddenId },
          canonicalPayload: { forbiddenId },
          entryHash: forbiddenHash,
          prevHash: forbiddenHash,
          databaseUrl: forbiddenUrl,
          error: rawError
        }]
      }]
    });
    const serialized = JSON.stringify(report);

    expect(report.ok).toBe(false);
    expect(report.blockingCount).toBe(1);
    expect(report.checks[0]).toMatchObject({
      name: 'enrollment_period_overlaps',
      severity: 'BLOCKING',
      count: 2,
      details: [{ category: 'enrollment_period_overlap', count: 2 }]
    });
    for (const forbidden of [
      'studentId', 'userId', 'attendanceId', 'sessionId', 'weeklyScheduleId', 'left_id', 'right_id',
      'canonicalPayload', 'entryHash', 'prevHash', forbiddenId, forbiddenName, forbiddenHash, forbiddenUrl, rawError
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('allows audit status, numeric sequence/range, and issue codes without raw verifier material', () => {
    const details = sanitizeReadinessDetails([{
      status: 'PASS_WITH_APPROVED_HISTORICAL_BOUNDARY',
      trustedThroughSequence: '520',
      historicalUntrustedRange: { from: '521', to: '964' },
      activeEpoch: 2,
      issueCodes: ['ENTRY_HASH_MISMATCH', 'UNEXPECTED_GENESIS'],
      entryHash: 'b'.repeat(64),
      canonicalPayload: { person: 'private' }
    }]);
    const serialized = JSON.stringify(details);

    expect(details).toEqual([{
      status: 'PASS_WITH_APPROVED_HISTORICAL_BOUNDARY',
      trustedThroughSequence: '520',
      historicalUntrustedRange: { from: '521', to: '964' },
      activeEpoch: 2,
      issueCodes: ['ENTRY_HASH_MISMATCH', 'UNEXPECTED_GENESIS']
    }]);
    expect(serialized).not.toContain('entryHash');
    expect(serialized).not.toContain('canonicalPayload');
    expect(serialized).not.toContain('private');
  });

  it('preserves active historical findings instead of hiding approved-boundary warnings', () => {
    const report = createSanitizedReadinessReport({
      generatedAt: '2026-07-12T00:00:00.000Z',
      checks: [{
        name: 'audit_chain_integrity',
        severity: 'INFO',
        count: 0,
        details: [{
          status: 'PASS_WITH_APPROVED_HISTORICAL_BOUNDARY',
          historicalFindings: 9,
          trustedThroughSequence: '520',
          historicalUntrustedRange: { from: '521', to: '964' },
          activeEpoch: 2
        }]
      }]
    });

    expect(report).toMatchObject({ ok: true, blockingCount: 0 });
    expect(report.checks[0].details).toEqual([{
      status: 'PASS_WITH_APPROVED_HISTORICAL_BOUNDARY',
      historicalFindings: 9,
      trustedThroughSequence: '520',
      historicalUntrustedRange: { from: '521', to: '964' },
      activeEpoch: 2
    }]);
  });

  it('preserves aggregate collision counts without serialized source identifiers', () => {
    const report = createSanitizedReadinessReport({
      generatedAt: '2026-07-12T00:00:00.000Z',
      checks: [{
        name: 'duplicate_gate_log_daily_direction',
        severity: 'BLOCKING',
        count: 3,
        details: [{
          category: 'duplicate_gate_log_daily_direction',
          scope: 'IN',
          businessDate: '2026-07-12',
          groupCount: 3,
          eventCount: 6,
          userId: 'private-user-id',
          ids: ['private-gate-log-id'],
          rawError: 'private error'
        }]
      }]
    });
    const serialized = JSON.stringify(report);

    expect(report.checks[0].details).toEqual([{
      category: 'duplicate_gate_log_daily_direction',
      scope: 'IN',
      businessDate: '2026-07-12',
      groupCount: 3,
      eventCount: 6
    }]);
    expect(serialized).not.toContain('private-user-id');
    expect(serialized).not.toContain('private-gate-log-id');
    expect(serialized).not.toContain('private error');
  });

  it('emits fixed query and top-level failure codes instead of raw exception messages', () => {
    expect(createReadinessQueryFailure('enrollment_period_overlaps')).toEqual({
      name: 'enrollment_period_overlaps',
      severity: 'BLOCKING',
      count: 1,
      details: [{ category: 'query_error', code: 'READINESS_QUERY_FAILED', count: 1 }]
    });
    expect(sanitizedReadinessError('POST_MIGRATION_VERIFICATION_FAILED')).toEqual({
      ok: false,
      status: 'ERROR',
      code: 'POST_MIGRATION_VERIFICATION_FAILED'
    });
  });
});
