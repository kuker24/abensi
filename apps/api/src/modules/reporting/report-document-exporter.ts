import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf' | 'docx';

export interface ExportColumn {
  key: string;
  label: string;
}

export interface ReportDocumentMetadata {
  generatedAt: string;
  generatedBy: string;
  reportType: string;
  format: ExportFormat;
  filters: Record<string, unknown>;
  warning: string | null;
  counts: Record<string, number>;
  range: { from: string; to: string; label: string };
}

export interface ReportDocumentModel {
  title: string;
  subtitle: string;
  institution: string;
  applicationName: string;
  addressLine: string;
  metadata: ReportDocumentMetadata;
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
  logo?: Buffer | null;
}

export interface RenderedReport {
  buffer: Buffer;
  contentType: string;
  extension: ExportFormat;
}

const BRAND_GREEN = '126B3A';
const BRAND_GOLD = 'D7A928';
const LIGHT_GREEN = 'EAF5EF';
const LIGHT_GOLD = 'FFF7D8';
const BORDER = 'C8D5CC';
const TEXT = '1F2937';
const MUTED = '64748B';
const A4_LANDSCAPE_WIDTH_DXA = 16838;
const A4_LANDSCAPE_HEIGHT_DXA = 11906;
const A4_MARGIN_DXA = 720;
const DOCX_CONTENT_WIDTH = A4_LANDSCAPE_WIDTH_DXA - A4_MARGIN_DXA * 2;
export const MAX_PRINT_DOCUMENT_ROWS = 1000;
export const EMPTY_REPORT_MESSAGE = 'Tidak ada data pada periode ini.';

export function printDocumentRowLimitViolation(format: ExportFormat, rowCount: number): string | null {
  if ((format === 'pdf' || format === 'docx') && rowCount > MAX_PRINT_DOCUMENT_ROWS) {
    return `Export ${format.toUpperCase()} dibatasi maksimal ${MAX_PRINT_DOCUMENT_ROWS} baris. Persempit tanggal/filter atau gunakan CSV/XLSX untuk data besar.`;
  }
  return null;
}

export const REPORT_TYPE_TITLES: Record<string, string> = {
  recap_classes: 'Rekap Kehadiran per Kelas',
  recap_students: 'Rekap Kehadiran per Siswa',
  recap_subjects: 'Rekap Kehadiran per Mata Pelajaran',
  recap_teachers: 'Rekap Kehadiran Guru',
  teacher_monthly: 'Rekap Bulanan Guru',
  staff_gate_attendance: 'Laporan Kepala/Staf Datang-Pulang',
  teacher_session_activity: 'Laporan Guru Masuk Mengajar',
  student_prayer_attendance: 'Laporan Sholat Siswa',
  student_worship_recap: 'Rekap Karakter/Ibadah Siswa',
  student_daily_complete_attendance: 'Rekap Kehadiran Lengkap Siswa',
  missing_arrival_scan: 'Belum Scan Datang',
  missing_departure_scan: 'Belum Scan Pulang',
  class_present_no_gate_scan: 'Hadir Kelas Tanpa Scan Gerbang',
  gate_scan_no_class_attendance: 'Scan Gerbang Tanpa Absensi Kelas',
  prayer_recap: 'Rekap Sholat Siswa',
  audit_coverage: 'Cakupan Audit Presensi'
};

export const REPORT_COLUMN_LABELS: Record<string, string> = {
  evidence_label: 'Label Bukti',
  class_id: 'ID Kelas',
  class_code: 'Kode Kelas',
  class_name: 'Nama Kelas',
  session_count: 'Jumlah Sesi',
  closed_session_count: 'Sesi Ditutup',
  closed_sessions: 'Sesi Ditutup',
  coverage_percent: 'Cakupan (%)',
  attendance_coverage_percent: 'Cakupan Presensi (%)',
  session_coverage_percent: 'Cakupan Sesi (%)',
  presence_percent: 'Kehadiran (%)',
  present_percent: 'Hadir (%)',
  teacher_count: 'Jumlah Guru',
  subject_count: 'Jumlah Mapel',
  class_count: 'Jumlah Kelas',
  student_id: 'ID Siswa',
  full_name: 'Nama Lengkap',
  username: 'Username',
  attendance_count: 'Jumlah Presensi',
  class_codes: 'Kode Kelas',
  subject_codes: 'Kode Mapel',
  latest_at: 'Terakhir',
  subject_id: 'ID Mapel',
  subject_code: 'Kode Mapel',
  subject_name: 'Nama Mapel',
  teacher_id: 'ID Guru',
  month: 'Bulan',
  hadir: 'Hadir',
  telat: 'Telat',
  izin: 'Izin',
  sakit: 'Sakit',
  alpa: 'Alpa',
  excused_absence: 'Izin/Sakit/Dinas',
  alpa_mengajar: 'Alpa Mengajar',
  session_id: 'ID Sesi',
  teacher_name: 'Nama Guru',
  role: 'Peran',
  date: 'Tanggal',
  datang: 'Datang',
  pulang: 'Pulang',
  gate_arrival_at: 'Scan Datang',
  gate_departure_at: 'Scan Pulang',
  class_attendance: 'Absensi Kelas',
  prayer_attendance: 'Sholat',
  final_status: 'Status Akhir',
  note: 'Keterangan',
  school_class: 'Kelas',
  prayer_type: 'Sholat',
  scanned_at: 'Waktu Scan',
  reader: 'HP Scanner',
  dhuha_count: 'Jumlah Dhuha',
  dzuhur_count: 'Jumlah Dzuhur',
  ashar_count: 'Jumlah Ashar',
  period_summary: 'Ringkasan Periode',
  status: 'Status',
  starts_at: 'Mulai',
  ends_at: 'Selesai',
  started_at: 'Masuk Kelas',
  closed_at: 'Tutup Sesi',
  expected_actions: 'Aksi Wajib',
  recorded_actions: 'Aksi Terekam',
  missing_actions: 'Aksi Kurang'
};

function labelForKey(key: string) {
  return REPORT_COLUMN_LABELS[key] ?? key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function columnsFromRows(rows: Array<Record<string, unknown>>): ExportColumn[] {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return keys.map((key) => ({ key, label: labelForKey(key) }));
}

export function sanitizeSpreadsheetText(value: string): string {
  return /^(?:[\t\r]|\s*[=+\-@])/.test(value) ? `'${value}` : value;
}

function normalizeSpreadsheetCellValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return sanitizeSpreadsheetText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return sanitizeSpreadsheetText(JSON.stringify(value));
}

function normalizeDisplayCellValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

function valueAsText(value: unknown): string {
  const normalized = normalizeDisplayCellValue(value);
  return typeof normalized === 'string' ? normalized : String(normalized);
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.length ? value.map(formatMetadataValue).join(' | ') : '-';
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length ? entries.map(([key, item]) => `${labelForKey(key)}: ${formatMetadataValue(item)}`).join(' · ') : '-';
  }
  return String(value);
}

function objectMetadataRows(prefix: string, values: Record<string, unknown>): Array<[string, string]> {
  const entries = Object.entries(values || {}).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (entries.length === 0) return [[prefix, '-']];
  return entries.map(([key, value]) => [`${prefix} - ${labelForKey(key)}`, formatMetadataValue(value)]);
}

function metadataRows(model: ReportDocumentModel): Array<[string, string]> {
  return [
    ['Nama dokumen', model.title],
    ['Sistem', model.applicationName],
    ['Institusi', model.institution],
    ['Periode', model.metadata.range.label],
    ['Dibuat pada', model.metadata.generatedAt],
    ['Dibuat oleh', model.metadata.generatedBy],
    ['Jenis laporan', model.metadata.reportType],
    ['Peringatan', model.metadata.warning || '-'],
    ...objectMetadataRows('Filter', model.metadata.filters),
    ...objectMetadataRows('Ringkasan audit', model.metadata.counts)
  ];
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'string' ? sanitizeSpreadsheetText(value) : sanitizeSpreadsheetText(JSON.stringify(value));
  const normalized = raw.replaceAll('"', '""');
  return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
}

function buildCsv(model: ReportDocumentModel): Buffer {
  const exportRows = model.rows.length > 0 ? model.rows : [{ message: EMPTY_REPORT_MESSAGE }];
  const rows: Array<Record<string, unknown>> = exportRows.map((row) => ({ evidence_label: 'normal', ...row }));
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [
    [escapeCsvValue('# Metadata Laporan Resmi SIAB2'), ''].join(','),
    ...metadataRows(model).map(([label, value]) => [escapeCsvValue(`# ${label}`), escapeCsvValue(value)].join(',')),
    '',
    headers.join(',')
  ];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvValue(row[header])).join(','));
  }
  return Buffer.from(`\uFEFFsep=,\r\n${lines.join('\r\n')}\r\n`, 'utf-8');
}

function addXlsxLetterhead(workbook: ExcelJS.Workbook, worksheet: ExcelJS.Worksheet, model: ReportDocumentModel) {
  worksheet.mergeCells('B1:H1');
  worksheet.getCell('B1').value = model.institution.toUpperCase();
  worksheet.getCell('B1').font = { bold: true, size: 16, color: { argb: `FF${BRAND_GREEN}` } };
  worksheet.mergeCells('B2:H2');
  worksheet.getCell('B2').value = model.applicationName;
  worksheet.getCell('B2').font = { size: 11, color: { argb: `FF${TEXT}` } };
  worksheet.mergeCells('B3:H3');
  worksheet.getCell('B3').value = model.addressLine;
  worksheet.getCell('B3').font = { size: 10, color: { argb: `FF${MUTED}` } };
  worksheet.mergeCells('A5:H5');
  worksheet.getCell('A5').value = model.title;
  worksheet.getCell('A5').font = { bold: true, size: 14, color: { argb: `FF${TEXT}` } };
  worksheet.mergeCells('A6:H6');
  worksheet.getCell('A6').value = `${model.subtitle} · ${model.metadata.range.label}`;
  worksheet.getCell('A6').font = { size: 10, color: { argb: `FF${MUTED}` } };

  if (model.logo) {
    const imageId = workbook.addImage({ buffer: model.logo, extension: 'jpeg' });
    worksheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 68, height: 68 } });
  }

  worksheet.getRow(4).height = 6;
  worksheet.getCell('A4').border = { bottom: { style: 'medium', color: { argb: `FF${BRAND_GOLD}` } } };
}

function addXlsxMetadata(worksheet: ExcelJS.Worksheet, model: ReportDocumentModel): number {
  let rowNumber = 8;
  for (const [label, value] of metadataRows(model)) {
    const row = worksheet.getRow(rowNumber);
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    row.getCell(1).font = { bold: true, color: { argb: `FF${TEXT}` } };
    row.getCell(2).font = { color: { argb: `FF${MUTED}` } };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    rowNumber += 1;
  }
  if (model.metadata.warning) {
    worksheet.mergeCells(rowNumber, 1, rowNumber, Math.max(2, model.columns.length));
    const warningCell = worksheet.getCell(rowNumber, 1);
    warningCell.value = `PERINGATAN: ${model.metadata.warning}`;
    warningCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${LIGHT_GOLD}` } };
    warningCell.font = { bold: true, color: { argb: 'FF92400E' } };
    rowNumber += 1;
  }
  return rowNumber + 2;
}

async function buildXlsx(model: ReportDocumentModel): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIAB2 - MAN 1 Rokan Hulu';
  workbook.created = new Date(model.metadata.generatedAt);
  workbook.modified = new Date(model.metadata.generatedAt);

  const worksheet = workbook.addWorksheet('Laporan Resmi', {
    views: [{ state: 'frozen', ySplit: 18 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  addXlsxLetterhead(workbook, worksheet, model);
  const startRow = Math.max(18, addXlsxMetadata(worksheet, model));
  worksheet.views = [{ state: 'frozen', ySplit: startRow }];
  const rows = model.rows.length > 0 ? model.rows : [{ message: EMPTY_REPORT_MESSAGE }];
  const columns = model.rows.length > 0 ? model.columns : [{ key: 'message', label: 'Pesan' }];

  columns.forEach((column, index) => {
    worksheet.getColumn(index + 1).key = column.key;
    worksheet.getColumn(index + 1).width = Math.min(Math.max(column.label.length + 8, 16), 42);
  });
  for (let index = columns.length + 1; index <= 8; index += 1) {
    worksheet.getColumn(index).width = 16;
  }

  const headerRow = worksheet.getRow(startRow);
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_GREEN}` } };
    cell.border = { top: { style: 'thin', color: { argb: `FF${BORDER}` } }, bottom: { style: 'thin', color: { argb: `FF${BORDER}` } }, left: { style: 'thin', color: { argb: `FF${BORDER}` } }, right: { style: 'thin', color: { argb: `FF${BORDER}` } } };
  });

  rows.forEach((row, rowIndex) => {
    const excelRow = worksheet.getRow(startRow + 1 + rowIndex);
    columns.forEach((column, columnIndex) => {
      const cell = excelRow.getCell(columnIndex + 1);
      cell.value = normalizeSpreadsheetCellValue(row[column.key]);
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = { bottom: { style: 'hair', color: { argb: `FF${BORDER}` } } };
      if (rowIndex % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });
  });

  worksheet.autoFilter = {
    from: { row: startRow, column: 1 },
    to: { row: startRow, column: columns.length }
  };

  const signatureRow = startRow + rows.length + 3;
  worksheet.mergeCells(signatureRow, 1, signatureRow, Math.max(2, Math.floor(columns.length / 2)));
  worksheet.getCell(signatureRow, 1).value = 'Mengetahui,\nKepala Madrasah\n\n\n________________________';
  worksheet.getCell(signatureRow, 1).alignment = { wrapText: true, vertical: 'top' };
  worksheet.mergeCells(signatureRow, Math.max(3, Math.floor(columns.length / 2) + 1), signatureRow, Math.max(4, columns.length));
  worksheet.getCell(signatureRow, Math.max(3, Math.floor(columns.length / 2) + 1)).value = 'Petugas,\nAdmin/TU\n\n\n________________________';
  worksheet.getCell(signatureRow, Math.max(3, Math.floor(columns.length / 2) + 1)).alignment = { wrapText: true, vertical: 'top' };
  worksheet.getRow(signatureRow).height = 80;

  const metadataSheet = workbook.addWorksheet('Metadata');
  metadataSheet.columns = [{ header: 'Field', key: 'field', width: 28 }, { header: 'Nilai', key: 'value', width: 90 }];
  metadataRows(model).forEach(([field, value]) => metadataSheet.addRow({ field, value }));
  metadataSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  metadataSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_GREEN}` } };
  metadataSheet.views = [{ state: 'frozen', ySplit: 1 }];
  metadataSheet.autoFilter = { from: 'A1', to: 'B1' };
  metadataSheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = { bottom: { style: 'hair', color: { argb: `FF${BORDER}` } } };
    });
  });

  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}

function pdfTableColumnWidths(columns: ExportColumn[], tableWidth: number) {
  const important = new Set(['full_name', 'class_name', 'subject_name', 'teacher_name', 'expected_actions', 'recorded_actions', 'missing_actions']);
  const weights = columns.map((column) => (important.has(column.key) ? 1.8 : 1));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((weight) => Math.max(42, Math.floor((weight / totalWeight) * tableWidth)));
}

function addPdfHeader(doc: PDFKit.PDFDocument, model: ReportDocumentModel) {
  const startY = doc.y;
  if (model.logo) {
    doc.image(model.logo, doc.page.margins.left, startY, { width: 52, height: 52 });
  }
  const left = doc.page.margins.left + 64;
  const width = doc.page.width - left - doc.page.margins.right;
  doc.font('Helvetica-Bold').fontSize(14).fillColor(`#${BRAND_GREEN}`).text(model.institution.toUpperCase(), left, startY, { width, align: 'center' });
  doc.font('Helvetica').fontSize(10).fillColor(`#${TEXT}`).text(model.applicationName, left, doc.y + 2, { width, align: 'center' });
  doc.fontSize(8).fillColor(`#${MUTED}`).text(model.addressLine, left, doc.y + 2, { width, align: 'center' });
  doc.moveTo(doc.page.margins.left, startY + 62).lineTo(doc.page.width - doc.page.margins.right, startY + 62).lineWidth(1.4).strokeColor(`#${BRAND_GOLD}`).stroke();
  doc.y = startY + 74;
  doc.font('Helvetica-Bold').fontSize(13).fillColor(`#${TEXT}`).text(model.title, { align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor(`#${MUTED}`).text(`${model.subtitle} · ${model.metadata.range.label}`, { align: 'center' });
  doc.moveDown(0.7);
}

function addPdfMetadata(doc: PDFKit.PDFDocument, model: ReportDocumentModel) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(`#${TEXT}`).text('Metadata Laporan');
  doc.font('Helvetica').fontSize(8).fillColor(`#${TEXT}`);
  for (const [label, value] of metadataRows(model).slice(3, 10)) {
    doc.text(`${label}: ${value}`);
  }
  if (model.metadata.warning) {
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fillColor('#92400E').text(`PERINGATAN: ${model.metadata.warning}`);
    doc.fillColor(`#${TEXT}`).font('Helvetica');
  }
  doc.moveDown(0.8);
}

function addPdfFooter(doc: PDFKit.PDFDocument, model: ReportDocumentModel) {
  const bottom = doc.page.height - 28;
  doc.fontSize(7).fillColor(`#${MUTED}`).text(
    `${model.applicationName} · ${model.institution} · Dibuat ${model.metadata.generatedAt}`,
    doc.page.margins.left,
    bottom,
    { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
  );
}

async function buildPdf(model: ReportDocumentModel): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    addPdfHeader(doc, model);
    addPdfMetadata(doc, model);

    const rows = model.rows.length > 0 ? model.rows : [{ message: EMPTY_REPORT_MESSAGE }];
    const columns = model.rows.length > 0 ? model.columns : [{ key: 'message', label: 'Pesan' }];
    const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const widths = pdfTableColumnWidths(columns, tableWidth);
    const rowHeight = 22;

    const drawHeader = () => {
      let x = doc.page.margins.left;
      const y = doc.y;
      doc.rect(x, y, tableWidth, rowHeight).fill(`#${BRAND_GREEN}`);
      columns.forEach((column, index) => {
        doc.fillColor('white').font('Helvetica-Bold').fontSize(7).text(column.label, x + 3, y + 5, { width: widths[index] - 6, height: rowHeight - 6, ellipsis: true });
        x += widths[index];
      });
      doc.y = y + rowHeight;
    };

    const drawRow = (row: Record<string, unknown>, rowIndex: number) => {
      if (doc.y + rowHeight + 40 > doc.page.height - doc.page.margins.bottom) {
        addPdfFooter(doc, model);
        doc.addPage();
        drawHeader();
      }
      let x = doc.page.margins.left;
      const y = doc.y;
      if (rowIndex % 2 === 0) doc.rect(x, y, tableWidth, rowHeight).fill('#F8FAFC');
      columns.forEach((column, index) => {
        doc.strokeColor(`#${BORDER}`).rect(x, y, widths[index], rowHeight).stroke();
        doc.fillColor(`#${TEXT}`).font('Helvetica').fontSize(6.5).text(valueAsText(row[column.key]), x + 3, y + 5, { width: widths[index] - 6, height: rowHeight - 6, ellipsis: true });
        x += widths[index];
      });
      doc.y = y + rowHeight;
    };

    drawHeader();
    rows.forEach((row, index) => drawRow(row, index));

    doc.moveDown(2);
    if (doc.y + 74 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    doc.font('Helvetica').fontSize(9).fillColor(`#${TEXT}`);
    const signWidth = (tableWidth - 80) / 2;
    const signY = doc.y + 8;
    doc.text('Mengetahui,\nKepala Madrasah\n\n\n________________________', doc.page.margins.left + 40, signY, { width: signWidth, align: 'center' });
    doc.text('Petugas,\nAdmin/TU\n\n\n________________________', doc.page.margins.left + 40 + signWidth + 80, signY, { width: signWidth, align: 'center' });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      addPdfFooter(doc, model);
    }
    doc.end();
  });
}

function paragraph(text: string, options: { bold?: boolean; size?: number; color?: string; align?: typeof AlignmentType[keyof typeof AlignmentType] } = {}) {
  return new Paragraph({
    alignment: options.align,
    spacing: { after: 90 },
    children: [new TextRun({ text, bold: options.bold, size: options.size ?? 20, color: options.color ?? TEXT, font: 'Arial' })]
  });
}

function cell(text: string, options: { bold?: boolean; fill?: string; color?: string; width?: number } = {}) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: BORDER };
  return new TableCell({
    width: { size: options.width ?? 1000, type: WidthType.DXA },
    shading: options.fill ? { fill: options.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 90, right: 90 },
    borders: { top: border, bottom: border, left: border, right: border },
    children: [paragraph(text, { bold: options.bold, color: options.color ?? TEXT, size: 16 })]
  });
}

async function buildDocx(model: ReportDocumentModel): Promise<Buffer> {
  const rows = model.rows.length > 0 ? model.rows : [{ message: EMPTY_REPORT_MESSAGE }];
  const columns = model.rows.length > 0 ? model.columns : [{ key: 'message', label: 'Pesan' }];
  const columnWidth = Math.max(650, Math.floor(DOCX_CONTENT_WIDTH / columns.length));
  const headerChildren: Paragraph[] = [];
  if (model.logo) {
    headerChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ data: model.logo, transformation: { width: 58, height: 58 }, type: 'jpg' })]
    }));
  }
  headerChildren.push(
    paragraph(model.institution.toUpperCase(), { bold: true, size: 28, color: BRAND_GREEN, align: AlignmentType.CENTER }),
    paragraph(model.applicationName, { size: 20, align: AlignmentType.CENTER }),
    paragraph(model.addressLine, { size: 16, color: MUTED, align: AlignmentType.CENTER })
  );

  const metadataTable = new Table({
    width: { size: DOCX_CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [2600, DOCX_CONTENT_WIDTH - 2600],
    rows: metadataRows(model).slice(3, 10).map(([label, value]) => new TableRow({
      children: [cell(label, { bold: true, fill: LIGHT_GREEN, width: 2600 }), cell(value, { width: DOCX_CONTENT_WIDTH - 2600 })]
    }))
  });

  const dataTable = new Table({
    width: { size: DOCX_CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: columns.map(() => columnWidth),
    rows: [
      new TableRow({ children: columns.map((column) => cell(column.label, { bold: true, fill: BRAND_GREEN, color: 'FFFFFF', width: columnWidth })) }),
      ...rows.map((row, rowIndex) => new TableRow({
        children: columns.map((column) => cell(valueAsText(row[column.key]), { fill: rowIndex % 2 === 0 ? 'F8FAFC' : undefined, width: columnWidth }))
      }))
    ]
  });

  const children = [
    paragraph(model.title, { bold: true, size: 26, align: AlignmentType.CENTER }),
    paragraph(`${model.subtitle} · ${model.metadata.range.label}`, { size: 18, color: MUTED, align: AlignmentType.CENTER }),
    metadataTable,
    ...(model.metadata.warning ? [paragraph(`PERINGATAN: ${model.metadata.warning}`, { bold: true, color: '92400E' })] : []),
    paragraph('Tabel Data', { bold: true, size: 22 }),
    dataTable,
    paragraph(''),
    new Table({
      width: { size: DOCX_CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [DOCX_CONTENT_WIDTH / 2, DOCX_CONTENT_WIDTH / 2],
      rows: [new TableRow({ children: [
        cell('Mengetahui,\nKepala Madrasah\n\n\n________________________', { width: DOCX_CONTENT_WIDTH / 2 }),
        cell('Petugas,\nAdmin/TU\n\n\n________________________', { width: DOCX_CONTENT_WIDTH / 2 })
      ] })]
    })
  ];

  const doc = new Document({
    creator: 'SIAB2 - MAN 1 Rokan Hulu',
    title: model.title,
    description: model.subtitle,
    sections: [{
      properties: {
        page: {
          size: { width: A4_LANDSCAPE_WIDTH_DXA, height: A4_LANDSCAPE_HEIGHT_DXA, orientation: PageOrientation.LANDSCAPE },
          margin: { top: A4_MARGIN_DXA, right: A4_MARGIN_DXA, bottom: A4_MARGIN_DXA, left: A4_MARGIN_DXA }
        }
      },
      headers: { default: new Header({ children: headerChildren }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${model.applicationName} · ${model.institution} · Halaman `, size: 16, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED })] })] }) },
      children
    }]
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

export async function renderReportDocument(model: ReportDocumentModel, format: ExportFormat): Promise<RenderedReport> {
  if (format === 'csv') {
    return { buffer: buildCsv(model), contentType: 'text/csv; charset=utf-8', extension: format };
  }
  if (format === 'xlsx') {
    return { buffer: await buildXlsx(model), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: format };
  }
  if (format === 'pdf') {
    return { buffer: await buildPdf(model), contentType: 'application/pdf', extension: format };
  }
  return { buffer: await buildDocx(model), contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: format };
}
