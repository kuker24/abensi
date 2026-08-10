import { buildIdentityAudit } from '../../../../../scripts/audit_reporting_identity';

const account = (overrides: Record<string, unknown>) => ({
  id: 'account-1',
  fullName: 'Personel Sintetis',
  nip: null,
  active: true,
  archivedAt: null,
  _count: { gateLogs: 0, taughtSessions: 0, teacherPresences: 0 },
  ...overrides
}) as any;

describe('reporting identity audit', () => {
  it('classifies duplicate NIP as ambiguous without exposing identifiers', () => {
    const report = buildIdentityAudit([
      account({ id: 'legacy-account', nip: '1980 0101 2005 011 001', _count: { gateLogs: 0, taughtSessions: 0, teacherPresences: 0 } }),
      account({ id: 'master-account', nip: '198001012005011001', _count: { gateLogs: 8, taughtSessions: 2, teacherPresences: 2 } })
    ]);

    expect(report.summary.classificationCounts.AMBIGUOUS).toBe(1);
    expect(report.candidates[0]).toEqual(expect.objectContaining({
      classification: 'AMBIGUOUS',
      accountCount: 2,
      gateLogCount: 8,
      affectedReports: expect.arrayContaining(['staff_gate_attendance', 'teacher_monthly'])
    }));
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('198001012005011001');
    expect(serialized).not.toContain('legacy-account');
    expect(serialized).not.toContain('master-account');
    expect(serialized).not.toContain('Personel Sintetis');
  });

  it('marks same normalized name without unique evidence as review-only', () => {
    const report = buildIdentityAudit([
      account({ id: 'legacy-account', fullName: 'NAMA CONTOH, S.Pd', nip: null }),
      account({ id: 'master-account', fullName: 'Nama Contoh S.Pd', nip: null })
    ]);

    expect(report.summary.classificationCounts.NAME_ONLY_REVIEW).toBe(1);
    expect(report.contract.autoMergeAllowed).toBe(false);
    expect(report.contract.uniquePersonnelIdentityAvailable).toBe(false);
  });

  it('marks conflicting names under the same NIP for manual verification', () => {
    const report = buildIdentityAudit([
      account({ id: 'account-a', fullName: 'Nama Pertama', nip: '111' }),
      account({ id: 'account-b', fullName: 'Nama Kedua', nip: '111' })
    ]);

    expect(report.summary.classificationCounts.CONFLICT).toBe(1);
    expect(report.candidates[0].classification).toBe('CONFLICT');
  });
});
