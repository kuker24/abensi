import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderReportDocument, type ExportFormat, type ReportDocumentModel } from './report-document-exporter';

function fixtureModel(): ReportDocumentModel {
  return {
    title: 'Rekap Kehadiran per Kelas',
    subtitle: 'Dokumen resmi rekapitulasi presensi SIAB2',
    institution: 'MAN 1 Rokan Hulu',
    applicationName: 'SIAB2 - Sistem Informasi Akademik Berkarakter',
    addressLine: 'Dokumen resmi internal madrasah - e-Hadir MAN 1 Rokan Hulu',
    logo: readFileSync(join(process.cwd(), 'assets', 'logoman1.jpeg')),
    metadata: {
      generatedAt: '2026-06-19T00:00:00.000Z',
      generatedBy: 'ADMIN_TU',
      reportType: 'recap_classes',
      format: 'xlsx',
      filters: { from: '2026-06-01', to: '2026-06-19' },
      warning: null,
      counts: { overrideCount: 0, openAnomalyCount: 0, resolvedAnomalyCount: 0, correctionCount: 0 },
      range: { from: '2026-06-01T00:00:00.000Z', to: '2026-06-19T23:59:59.999Z', label: '2026-06-01 sampai 2026-06-19' }
    },
    columns: [
      { key: 'class_code', label: 'Kode Kelas' },
      { key: 'class_name', label: 'Nama Kelas' },
      { key: 'coverage_percent', label: 'Cakupan (%)' }
    ],
    rows: [
      { class_code: 'X A', class_name: 'Kelas X A', coverage_percent: 98.5 },
      { class_code: 'X B', class_name: 'Kelas X B', coverage_percent: 96 }
    ]
  };
}

describe('report document exporter', () => {
  it.each([
    ['csv', 'text/csv; charset=utf-8', 'report_metadata'],
    ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'PK'],
    ['pdf', 'application/pdf', '%PDF'],
    ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'PK']
  ] as Array<[ExportFormat, string, string]>)('renders %s official report', async (format, contentType, magic) => {
    const model = fixtureModel();
    model.metadata.format = format;

    const rendered = await renderReportDocument(model, format);

    expect(rendered.contentType).toBe(contentType);
    expect(rendered.extension).toBe(format);
    expect(rendered.buffer.length).toBeGreaterThan(100);
    expect(rendered.buffer.toString('utf8', 0, Math.min(rendered.buffer.length, 32))).toContain(magic);
  });
});
