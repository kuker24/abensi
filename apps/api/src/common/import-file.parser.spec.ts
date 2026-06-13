import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { parseImportFile } from './import-file.parser';

describe('parseImportFile', () => {
  it('parses CSV rows', async () => {
    const rows = await parseImportFile({
      originalname: 'users.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from('username,fullName,role\nsiswa1,Siswa Satu,SISWA\n')
    });

    expect(rows).toEqual([{ username: 'siswa1', fullName: 'Siswa Satu', role: 'SISWA' }]);
  });

  it('parses XLSX rows', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Import');
    sheet.addRow(['type', 'code', 'name', 'yearLabel']);
    sheet.addRow(['class', 'X-A', 'X A', '2026/2027']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const rows = await parseImportFile({
      originalname: 'academic.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer
    });

    expect(rows).toEqual([{ type: 'class', code: 'X-A', name: 'X A', yearLabel: '2026/2027' }]);
  });

  it('rejects unsupported formats', async () => {
    await expect(parseImportFile({ originalname: 'data.txt', mimetype: 'application/octet-stream', buffer: Buffer.from('x') })).rejects.toBeInstanceOf(BadRequestException);
  });
});
