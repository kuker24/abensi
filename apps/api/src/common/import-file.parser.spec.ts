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

  it('parses Excel Windows CSV with BOM, separator directive, and CRLF rows', async () => {
    const rows = await parseImportFile({
      originalname: 'users.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from('\uFEFFsep=,\r\nusername,fullName,role\r\nsiswa1,Siswa Á,SISWA\r\n')
    });

    expect(rows).toEqual([{ username: 'siswa1', fullName: 'Siswa Á', role: 'SISWA' }]);
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

    expect(rows).toEqual([{ __sheetName: 'Import', type: 'class', code: 'X-A', name: 'X A', yearLabel: '2026/2027' }]);
  });



  it('parses all XLSX sheets and keeps the sheet name for school imports', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheetA = workbook.addWorksheet('Kelas 10 - KELAS X A');
    sheetA.addRow(['nis', 'nama_lengkap']);
    sheetA.addRow(['1001', 'Siswa Satu']);
    const sheetB = workbook.addWorksheet('Kelas 10 - KELAS X B');
    sheetB.addRow(['nis', 'nama_lengkap']);
    sheetB.addRow(['1002', 'Siswa Dua']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const rows = await parseImportFile({
      originalname: 'kelas.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer
    });

    expect(rows).toEqual([
      { __sheetName: 'Kelas 10 - KELAS X A', nis: '1001', nama_lengkap: 'Siswa Satu' },
      { __sheetName: 'Kelas 10 - KELAS X B', nis: '1002', nama_lengkap: 'Siswa Dua' }
    ]);
  });

  it('rejects unsupported formats', async () => {
    await expect(parseImportFile({ originalname: 'data.txt', mimetype: 'application/octet-stream', buffer: Buffer.from('x') })).rejects.toBeInstanceOf(BadRequestException);
  });
});
