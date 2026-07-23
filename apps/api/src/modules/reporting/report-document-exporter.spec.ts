import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { EMPTY_REPORT_MESSAGE, MAX_PRINT_DOCUMENT_ROWS, printDocumentRowLimitViolation, renderReportDocument, type ExportFormat, type ReportDocumentModel } from './report-document-exporter';

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

function rowNumberContaining(worksheet: ExcelJS.Worksheet, expected: string): number {
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    let found = false;
    row.eachCell((cell) => {
      if (cell.value === expected) found = true;
    });
    if (found) return rowNumber;
  }
  throw new Error(`Expected worksheet row containing ${expected}`);
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
    ['csv', 'text/csv; charset=utf-8', 'sep=,'],
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

  it('renders a professional XLSX workbook with official sheets, letterhead, and no raw metadata-only sheet', async () => {
    const model = fixtureModel();
    model.metadata.format = 'xlsx';

    const rendered = await renderReportDocument(model, 'xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(rendered.buffer);
    const mainSheet = workbook.getWorksheet('Laporan Resmi');
    const metadataSheet = workbook.getWorksheet('Metadata');

    expect(mainSheet).toBeDefined();
    expect(metadataSheet).toBeDefined();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(expect.arrayContaining(['Laporan Resmi', 'Metadata']));
    expect(mainSheet!.getCell('A1').value).not.toBe('report_metadata');
    expect(String(mainSheet!.getCell('A2').value ?? '')).not.toMatch(/^\s*\{/);
    expect(String(mainSheet!.getCell('B1').value)).toContain('MAN 1 ROKAN HULU');
    expect(String(mainSheet!.getCell('B2').value)).toContain('SIAB2');
    expect(String(mainSheet!.getCell('A5').value)).toContain('Rekap Kehadiran per Kelas');
    expect(String(mainSheet!.getCell('B16').value ?? '')).not.toMatch(/^\s*\{/);
    expect(metadataSheet!.getCell('A1').value).toBe('Field');
    expect(metadataSheet!.getColumn(2).values.map(String).join('\n')).not.toContain('{"from"');
  });

  it('renders empty XLSX reports with the official layout and an empty-state data row', async () => {
    const model = fixtureModel();
    model.metadata.format = 'xlsx';
    model.rows = [];
    model.columns = [];

    const rendered = await renderReportDocument(model, 'xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(rendered.buffer);
    const worksheet = workbook.getWorksheet('Laporan Resmi');

    expect(worksheet).toBeDefined();
    expect(String(worksheet!.getCell('B1').value)).toContain('MAN 1 ROKAN HULU');
    const headerRow = rowNumberContaining(worksheet!, 'Pesan');
    expect(worksheet!.getCell(`A${headerRow + 1}`).value).toBe(EMPTY_REPORT_MESSAGE);
    expect(worksheet!.getCell('A1').value).not.toBe('report_metadata');
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

    expect(csv.startsWith('\uFEFFsep=,\r\n')).toBe(true);
    expect(csv).not.toMatch(/(^|[^\r])\n/);
    expect(csv).toContain('# Metadata Laporan Resmi SIAB2');
    expect(csv).not.toContain('report_metadata');
    expect(csv).not.toContain('{"from"');
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

    const headerRow = rowNumberContaining(worksheet!, 'Nilai');
    const values = Array.from({ length: 7 }, (_, index) => worksheet!.getCell(`A${headerRow + 1 + index}`).value);
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
