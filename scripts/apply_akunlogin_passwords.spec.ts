import { Role } from '@prisma/client';
import { classifyRow, parseMustChangePasswordArg, type ExcelAccountRow } from './apply_akunlogin_passwords';

function row(partial: Partial<ExcelAccountRow>): ExcelAccountRow {
  return {
    rowNumber: partial.rowNumber ?? 2,
    fullName: partial.fullName ?? 'Guru Uji',
    roleLabel: partial.roleLabel ?? 'Guru Mapel',
    username: partial.username ?? 'pegawai.123',
    password: partial.password ?? 'StrongPassw0rd!'
  };
}

describe('parseMustChangePasswordArg', () => {
  it('defaults to true when unset', () => {
    expect(parseMustChangePasswordArg(null)).toBe(true);
    expect(parseMustChangePasswordArg(undefined)).toBe(true);
    expect(parseMustChangePasswordArg('')).toBe(true);
  });

  it('parses explicit true/false values', () => {
    expect(parseMustChangePasswordArg('false')).toBe(false);
    expect(parseMustChangePasswordArg('0')).toBe(false);
    expect(parseMustChangePasswordArg('no')).toBe(false);
    expect(parseMustChangePasswordArg('true')).toBe(true);
    expect(parseMustChangePasswordArg('1')).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(() => parseMustChangePasswordArg('maybe')).toThrow(/invalid --must-change-password/);
  });
});

describe('classifyRow akunlogin guards', () => {
  it('marks apply for active GURU_MAPEL', () => {
    const result = classifyRow(row({}), {
      id: 'u1',
      username: 'pegawai.123',
      role: Role.GURU_MAPEL,
      active: true
    });
    expect(result.outcome).toBe('apply');
  });

  it('protects kamad username and kepala sekolah excel role', () => {
    expect(classifyRow(row({ username: 'pegawai.2005011008' }), undefined).outcome).toBe('protected_username');
    expect(
      classifyRow(row({ username: 'pegawai.ok', roleLabel: 'Kepala Sekolah' }), {
        id: 'u2',
        username: 'pegawai.ok',
        role: Role.GURU_MAPEL,
        active: true
      }).outcome
    ).toBe('protected_excel_role');
  });

  it('protects ADMIN_TU and KEPALA_SEKOLAH db roles', () => {
    expect(
      classifyRow(row({ username: 'someone.admin' }), {
        id: 'u3',
        username: 'someone.admin',
        role: Role.ADMIN_TU,
        active: true
      }).outcome
    ).toBe('protected_db_role');
    expect(
      classifyRow(row({ username: 'kepsek.x' }), {
        id: 'u4',
        username: 'kepsek.x',
        role: Role.KEPALA_SEKOLAH,
        active: true
      }).outcome
    ).toBe('protected_db_role');
  });

  it('marks missing and inactive', () => {
    expect(classifyRow(row({ username: 'pegawai.missing' }), undefined).outcome).toBe('missing');
    expect(
      classifyRow(row({ username: 'pegawai.inactive' }), {
        id: 'u5',
        username: 'pegawai.inactive',
        role: Role.PEGAWAI,
        active: false
      }).outcome
    ).toBe('inactive');
  });

  it('rejects short password and protected admin.tu', () => {
    expect(classifyRow(row({ password: 'short' }), undefined).outcome).toBe('invalid');
    expect(classifyRow(row({ username: 'admin.tu' }), undefined).outcome).toBe('protected_username');
  });
});
