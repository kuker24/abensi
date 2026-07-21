import { Role } from '@prisma/client';
import { normalizeSchoolImportRows, summarizeNormalizedRows } from './school-import.normalizer';

describe('school import normalizer', () => {
  it('ignores legacy password and maps SIAB1 student rows', () => {
    const rows = normalizeSchoolImportRows([
      { Role: 'Siswa', 'Nama Lengkap': 'Siswa Uji', Username: 'siswa.uji', 'Kelas/Jabatan': 'X A', NKD: '0001', Password: 'legacy123' }
    ], 'legacy-siab1', { academicYear: '2026/2027' });
    summarizeNormalizedRows(rows);

    expect(rows[0]).toEqual(expect.objectContaining({ role: Role.SISWA, classCode: 'X A', username: 'siswa.uji', ignoredLegacyPassword: true }));
    expect(rows[0].warnings.join(' ')).toContain('Password sumber diabaikan');
    expect(rows[0].errors).toEqual([]);
  });

  it('maps XLSX sheet name into class code for student class files', () => {
    const rows = normalizeSchoolImportRows([
      { __sheetName: 'Kelas 10 - KELAS X A', nis: '1001', NKD: '0001', nama_lengkap: 'Siswa Satu', tanggal_lahir: '1/2/2010' }
    ], 'student-class', { academicYear: '2026/2027' });
    summarizeNormalizedRows(rows);

    expect(rows[0]).toEqual(expect.objectContaining({ role: Role.SISWA, classCode: 'X A', username: 'siswa.1001', birthDate: '2010-02-01' }));
    expect(rows[0].errors).toEqual([]);
  });

  it('requires a valid unique NKD for school student imports', () => {
    const rows = normalizeSchoolImportRows([
      { __sheetName: 'Kelas 10 - KELAS X A', nama_lengkap: 'Siswa Satu', NKD: '0001' },
      { __sheetName: 'Kelas 10 - KELAS X B', nama_lengkap: 'Siswa Dua', NKD: '0001' },
      { __sheetName: 'Kelas 10 - KELAS X C', nama_lengkap: 'Siswa Tiga', NKD: '12A4' }
    ], 'student-class');
    summarizeNormalizedRows(rows);

    expect(rows[1].errors).toContain('NKD duplikat di file import');
    expect(rows[2].errors).toEqual(expect.arrayContaining(['NKD harus tepat empat digit angka', 'NKD siswa wajib']));
  });

  it('maps staff type safely and flags duplicate NIP', () => {
    const rows = normalizeSchoolImportRows([
      { NIP: '19800101', 'NAMA LENGKAP': 'Pegawai Satu', 'TIPE USER': 'pegawai' },
      { NIP: '19800101', 'NAMA LENGKAP': 'Pegawai Dua', 'TIPE USER': 'pegawai' }
    ], 'staff');
    summarizeNormalizedRows(rows);

    expect(rows[0].role).toBe(Role.GURU_MAPEL);
    expect(rows[0].warnings.join(' ')).toContain('dimapping sementara');
    expect(rows[0].errors).toContain('NIP duplikat di file import');
  });
});
