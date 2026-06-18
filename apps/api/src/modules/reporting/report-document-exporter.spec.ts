import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { MAX_PRINT_DOCUMENT_ROWS, printDocumentRowLimitViolation, renderReportDocument, type ExportFormat, type ReportDocumentModel } from './report-document-exporter';

function fixtureModel(): ReportDocumentModel {
  return {
    title: 'Rekap Kehadiran per Kelas',
    subtitle: 'Dokumen resmi rekapitulasi presensi SIAB2',
    institution: 'MAN 1 Rokan Hulu',
    applicationName: 'SIAB2 - Sistem Informasi Akademik Berkarakter',
    addressLine: 'Dokumen resmi internal madrasah - MAN 1 Rokan Hulu',
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

function formulaInjectionModel(): ReportDocumentModel {
  const model = fixtureModel();
  model.columns = [
    { key: 'value', label: 'Nilai' },
    { key: 'normal', label: 'Normal' }
  ];
  model.rows = [
    { value: '=HYPERLINK("https://example.invalid","x")', normal: 'normal text' },
    { value: '+SUM(1,2)', normal: 'normal text' },
    { value: '-10+20', normal: 'normal text' },
    { value: '@cmd', normal: 'normal text' },
    { value: ' \t=TRIM("x")', normal: 'normal text' },
    { value: 'normal text', normal: 'normal text' },
    { value: 42, normal: 'number remains numeric' }
  ];
  model.metadata.filters = { from: '=2026-06-01', to: '+2026-06-19' };
  return model;
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

  it('does not contain old e-Hadir branding in the official report fixture', () => {
    const model = fixtureModel();
    const serialized = JSON.stringify(model);
    expect(serialized).not.toContain('e-Hadir');
    expect(serialized).not.toContain('SchoolHub e-Hadir');
    expect(serialized).not.toContain('Absensi MAN 1 Rokan Hulu');
  });

  it('prefixes dangerous CSV strings with an apostrophe to prevent spreadsheet formulas', async () => {
    const model = formulaInjectionModel();
    model.metadata.format = 'csv';

    const rendered = await renderReportDocument(model, 'csv');
    const csv = rendered.buffer.toString('utf8');

    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"",""x"")"');
    expect(csv).toContain('"\'+SUM(1,2)"');
    expect(csv).toContain("'-10+20");
    expect(csv).toContain("'@cmd");
    expect(csv).toContain("' \t=TRIM");
    expect(csv).toContain('normal text');
  });

  it('reports a safe PDF/DOCX row limit without limiting CSV/XLSX', () => {
    expect(printDocumentRowLimitViolation('pdf', MAX_PRINT_DOCUMENT_ROWS + 1)).toContain(String(MAX_PRINT_DOCUMENT_ROWS));
    expect(printDocumentRowLimitViolation('docx', MAX_PRINT_DOCUMENT_ROWS + 1)).toContain(String(MAX_PRINT_DOCUMENT_ROWS));
    expect(printDocumentRowLimitViolation('csv', MAX_PRINT_DOCUMENT_ROWS + 1)).toBeNull();
    expect(printDocumentRowLimitViolation('xlsx', MAX_PRINT_DOCUMENT_ROWS + 1)).toBeNull();
    expect(printDocumentRowLimitViolation('pdf', MAX_PRINT_DOCUMENT_ROWS)).toBeNull();
  });

  it('stores dangerous XLSX strings as apostrophe-prefixed text, not formulas', async () => {
    const model = formulaInjectionModel();
    model.metadata.format = 'xlsx';

    const rendered = await renderReportDocument(model, 'xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(rendered.buffer);
    const worksheet = workbook.getWorksheet('Laporan Resmi');
    expect(worksheet).toBeDefined();

    const values = [19, 20, 21, 22, 23, 24, 25].map((row) => worksheet!.getCell(`A${row}`).value);
    expect(values.slice(0, 5)).toEqual([
      '\'=HYPERLINK("https://example.invalid","x")',
      "'+SUM(1,2)",
      "'-10+20",
      "'@cmd",
      "' \t=TRIM(\"x\")"
    ]);
    expect(values[5]).toBe('normal text');
    expect(values[6]).toBe(42);
    for (const value of values.slice(0, 5)) {
      expect(typeof value).toBe('string');
      expect(value).not.toEqual(expect.objectContaining({ formula: expect.any(String) }));
    }
  });
});
