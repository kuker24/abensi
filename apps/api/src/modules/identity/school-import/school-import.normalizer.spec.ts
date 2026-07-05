import { Role } from '@prisma/client';
import { normalizeSchoolImportRows, summarizeNormalizedRows } from './school-import.normalizer';

describe('school import normalizer', () => {
  it('ignores legacy password and maps SIAB1 student rows', () => {
    const rows = normalizeSchoolImportRows([
      { Role: 'Siswa', 'Nama Lengkap': 'Siswa Uji', Username: 'siswa.uji', 'Kelas/Jabatan': 'X A', Password: 'legacy123' }
    ], 'legacy-siab1', { academicYear: '2026/2027' });
    summarizeNormalizedRows(rows);

    expect(rows[0]).toEqual(expect.objectContaining({ role: Role.SISWA, classCode: 'X A', username: 'siswa.uji', ignoredLegacyPassword: true }));
    expect(rows[0].warnings.join(' ')).toContain('Password sumber diabaikan');
    expect(rows[0].errors).toEqual(expect.arrayContaining(['NIS siswa wajib']));
  });

  it('maps XLSX sheet name into class code for student class files', () => {
    const rows = normalizeSchoolImportRows([
      { __sheetName: 'Kelas 10 - KELAS X A', nis: '1001', nama_lengkap: 'Siswa Satu', tanggal_lahir: '1/2/2010' }
    ], 'student-class', { academicYear: '2026/2027' });
    summarizeNormalizedRows(rows);

    expect(rows[0]).toEqual(expect.objectContaining({ role: Role.SISWA, classCode: 'X A', username: 'siswa.1001', birthDate: '2010-02-01' }));
    expect(rows[0].errors).toEqual([]);
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
