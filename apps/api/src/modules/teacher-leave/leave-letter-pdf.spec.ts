import { buildLeaveLetterNumber, buildLeaveLetterPdf } from './leave-letter-pdf';

describe('leave-letter-pdf', () => {
  it('builds formal letter number from leave id and review year', () => {
    expect(buildLeaveLetterNumber('leave-abc12345', '2026-07-26T03:00:00.000Z')).toBe('IZN/2026/ABC12345');
  });

  it('renders formal PDF with logo and dual wet-sign blocks', async () => {
    const buffer = await buildLeaveLetterPdf({
      id: 'leave-abc12345',
      type: 'SAKIT',
      applicantName: 'Budi Santoso',
      applicantRole: 'GURU_MAPEL',
      startDate: '2026-07-20',
      endDate: '2026-07-22',
      reason: 'Pemulihan kesehatan pasca pemeriksaan dokter.',
      decisionNote: 'Dokumen medis lengkap.',
      reviewedByName: 'Admin TU',
      reviewedAt: '2026-07-21T02:00:00.000Z',
      letterNumber: 'IZN/2026/ABC12345',
      generatedAt: '26/7/2026, 11.00.00',
      visitInstruction: 'Pemohon wajib menjumpai Admin TU setelah masa sakit berakhir.'
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    // Logo JPEG is embedded; formal letter without logo is much smaller.
    expect(buffer.length).toBeGreaterThan(40_000);
    expect(buffer.includes(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);
    expect(buffer.toString('latin1')).toContain('/Type /Catalog');
    expect(buffer.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  it('keeps signatures clear of maximum-length letter content', async () => {
    const buffer = await buildLeaveLetterPdf({
      id: 'leave-long-content',
      type: 'IZIN',
      applicantName: 'Budi Santoso',
      applicantRole: 'GURU_MAPEL',
      startDate: '2026-07-20',
      endDate: '2026-07-22',
      reason: 'A'.repeat(2000),
      decisionNote: 'B'.repeat(2000),
      reviewedByName: 'Admin TU',
      reviewedAt: '2026-07-21T02:00:00.000Z',
      letterNumber: 'IZN/2026/LONG',
      generatedAt: '26/7/2026, 11.00.00',
      visitInstruction: 'Pemohon wajib menjumpai Admin TU untuk tanda tangan basah.'
    });

    expect(buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(buffer.toString('latin1').match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(1);
  });
});
