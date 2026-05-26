import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

export interface ImportUploadFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

export type ImportRow = Record<string, string>;

export const MAX_IMPORT_FILE_BYTES = Number(process.env.IMPORT_FILE_MAX_BYTES ?? String(2 * 1024 * 1024));
export const MAX_IMPORT_ROWS = Number(process.env.IMPORT_FILE_MAX_ROWS ?? '5000');
export const IMPORT_FILE_INTERCEPTOR_OPTIONS = { limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 } };

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).text ?? '').trim();
  }
  return String(value).trim();
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(buffer: Buffer): ImportRow[] {
  const lines = buffer.toString('utf8').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, normalizeCell(cells[index])]));
  });
}

async function parseXlsx(buffer: Buffer): Promise<ImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber - 1] = normalizeCell(cell.value);
  });
  const rows: ImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const item: ImportRow = {};
    headers.forEach((header, index) => {
      if (!header) return;
      item[header] = normalizeCell(row.getCell(index + 1).value);
    });
    if (Object.values(item).some(Boolean)) rows.push(item);
  });
  return rows;
}

export async function parseImportFile(file?: ImportUploadFile): Promise<ImportRow[]> {
  if (!file?.buffer) throw new BadRequestException('File import wajib diunggah pada field file.');
  if (file.buffer.byteLength > MAX_IMPORT_FILE_BYTES) {
    throw new BadRequestException(`Ukuran file terlalu besar. Maksimal ${Math.floor(MAX_IMPORT_FILE_BYTES / 1024 / 1024)}MB.`);
  }
  const name = (file.originalname || '').toLowerCase();
  const type = (file.mimetype || '').toLowerCase();
  const rows = name.endsWith('.xlsx') || type.includes('spreadsheetml')
    ? await parseXlsx(file.buffer)
    : name.endsWith('.csv') || type.includes('csv') || type.includes('text/plain')
      ? parseCsv(file.buffer)
      : null;
  if (!rows) throw new BadRequestException('Format file belum didukung. Gunakan CSV atau XLSX.');
  if (rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`Jumlah baris terlalu banyak. Maksimal ${MAX_IMPORT_ROWS} baris.`);
  return rows;
}
