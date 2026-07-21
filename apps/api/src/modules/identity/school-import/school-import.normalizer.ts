import { createHash } from 'node:crypto';
import { Role } from '@prisma/client';
import type { NormalizedSchoolImportRow, RawImportRow, SchoolImportOptions, SchoolImportSourceKind } from './school-import.types';

const ALLOWED_STAFF_ROLES = new Set<Role>([Role.GURU_MAPEL, Role.GURU_PIKET, Role.KEPALA_SEKOLAH]);

function clean(value?: string | null) {
  return String(value ?? '').replace(/^\ufeff/, '').replace(/\s+/g, ' ').trim();
}

function get(row: RawImportRow, aliases: string[]) {
  const entries = Object.entries(row).map(([key, value]) => [clean(key).toLowerCase(), value] as const);
  for (const alias of aliases) {
    const found = entries.find(([key]) => key === alias.toLowerCase());
    if (found) return clean(found[1]);
  }
  return '';
}

function normalizeDate(value: string) {
  const text = clean(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parts = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (parts) return `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  return text;
}

function isValidDate(value?: string | null) {
  if (!value) return true;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function slugPart(value: string) {
  return clean(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 24);
}

function digits(value: string) {
  return clean(value).replace(/\D+/g, '');
}

function normalizeNkd(value: string) {
  const nkd = clean(value);
  if (!nkd) return null;
  return /^\d{4}$/.test(nkd) ? nkd : null;
}

function usernameFrom(row: { fullName: string; nis?: string | null; nip?: string | null; subjectType: 'student' | 'staff' }) {
  if (row.subjectType === 'student' && row.nis) return `siswa.${digits(row.nis) || slugPart(row.fullName)}`.slice(0, 48);
  if (row.subjectType === 'staff' && row.nip) return `pegawai.${digits(row.nip).slice(-10) || slugPart(row.fullName)}`.slice(0, 48);
  return `${row.subjectType === 'student' ? 'siswa' : 'pegawai'}.${slugPart(row.fullName)}`.slice(0, 48);
}

function roleFromLegacy(value: string) {
  const text = clean(value).toLowerCase();
  if (text === 'siswa') return Role.SISWA;
  if (text.includes('kepala')) return Role.KEPALA_SEKOLAH;
  if (text.includes('piket')) return Role.GURU_PIKET;
  return Role.GURU_MAPEL;
}

function roleFromStaff(value: string, jobTitle: string) {
  const text = `${clean(value)} ${clean(jobTitle)}`.toLowerCase();
  if (text.includes('kepala sekolah')) return Role.KEPALA_SEKOLAH;
  if (text.includes('piket')) return Role.GURU_PIKET;
  return Role.GURU_MAPEL;
}

function normalizeClassCode(value: string) {
  const text = clean(value).replace(/Kelas\s+\d+\s+-\s+/i, '').replace(/KELAS\s+/i, '').replace(/\s+/g, ' ').trim().toUpperCase();
  return text || null;
}

function fingerprint(row: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0, 16);
}

function baseErrors(row: NormalizedSchoolImportRow) {
  if (!row.fullName) row.errors.push('nama lengkap wajib');
  if (!row.username) row.errors.push('username wajib atau harus bisa digenerate');
  if (row.role === Role.DEVELOPER || row.role === Role.ADMIN_TU || row.role === Role.OPERATOR_IT) row.errors.push('role sensitif tidak boleh dari import sekolah');
  if (!isValidDate(row.birthDate)) row.errors.push('tanggal lahir tidak valid');
  if (row.subjectType === 'student') {
    if (!row.nkd) row.errors.push('NKD siswa wajib');
    if (!row.classCode) row.errors.push('kelas siswa wajib');
  }
  if (row.subjectType === 'staff' && row.nkd) row.errors.push('NKD hanya boleh dipakai siswa');
  if (row.subjectType === 'staff' && !row.nip) row.errors.push('NIP pegawai/guru wajib');
  if (row.subjectType === 'staff' && !ALLOWED_STAFF_ROLES.has(row.role)) row.errors.push('role pegawai/guru tidak valid');
}

export function normalizeSchoolImportRows(rows: RawImportRow[], source: SchoolImportSourceKind, options: SchoolImportOptions = {}) {
  const yearLabel = clean(options.academicYear) || '2026/2027';

  return rows.map((raw, index): NormalizedSchoolImportRow => {
    const warnings: string[] = [];
    const errors: string[] = [];
    const legacyRole = get(raw, ['Role', 'role']);
    const typeUser = get(raw, ['TIPE USER', 'tipe_user', 'type', 'jenis']);
    const classOrJob = get(raw, ['classCode', 'Kode Kelas', 'Kelas/Jabatan', 'kelas_jabatan', 'kelas', 'jabatan']);
    const sheetName = get(raw, ['__sheetName', 'sheetName']);
    const fullName = get(raw, ['Nama Lengkap', 'NAMA LENGKAP', 'nama_lengkap', 'fullName', 'nama']);
    const nis = get(raw, ['NIS', 'nis', 'NISN', 'nisn']) || null;
    const nkdInput = get(raw, ['NKD', 'nkd', 'Nomor Kartu Digital']);
    const nkd = normalizeNkd(nkdInput);
    const nip = get(raw, ['NIP', 'nip']) || null;
    const birthDate = normalizeDate(get(raw, ['TANGGAL LAHIR', 'tanggal_lahir', 'birthDate', 'tanggal lahir']));
    const ignoredLegacyPassword = Boolean(get(raw, ['Password', 'password']));

    let subjectType: 'student' | 'staff' = source === 'student-class' ? 'student' : 'staff';
    let role: Role = Role.GURU_MAPEL;
    let classCode: string | null = null;
    let className: string | null = null;
    let jobTitle: string | null = null;
    let sourceType: string | null = null;

    if (source === 'legacy-siab1') {
      role = roleFromLegacy(legacyRole);
      subjectType = role === Role.SISWA ? 'student' : 'staff';
      if (subjectType === 'student') {
        classCode = normalizeClassCode(classOrJob);
        className = classCode;
      } else {
        jobTitle = classOrJob || null;
      }
      sourceType = legacyRole || null;
    } else if (source === 'student-class') {
      role = Role.SISWA;
      classCode = normalizeClassCode(classOrJob || sheetName);
      className = classCode;
      sourceType = 'siswa';
    } else {
      role = roleFromStaff(typeUser, classOrJob);
      jobTitle = classOrJob || typeUser || null;
      sourceType = typeUser || null;
      const loweredType = clean(typeUser).toLowerCase();
      if (loweredType && loweredType !== 'guru') warnings.push(`TIPE USER '${typeUser}' dimapping sementara ke ${role}`);
    }

    const existingUsername = get(raw, ['Username', 'username']);
    const username = clean(existingUsername || usernameFrom({ fullName, nis, nip, subjectType })).toLowerCase();
    if (ignoredLegacyPassword) warnings.push('kolom Password sumber diabaikan; SIAB2 generate password baru');

    const row: NormalizedSchoolImportRow = {
      index: index + 1,
      source,
      subjectType,
      username,
      fullName,
      role,
      nis,
      nkd,
      nip,
      birthDate,
      classCode,
      className,
      yearLabel,
      jobTitle,
      sourceType,
      ignoredLegacyPassword,
      fingerprint: fingerprint({ source, username, fullName, nis, nkd, nip, classCode, role }),
      errors,
      warnings
    };
    if (nkdInput && !nkd) errors.push('NKD harus tepat empat digit angka');
    baseErrors(row);
    return row;
  });
}

export function summarizeNormalizedRows(rows: NormalizedSchoolImportRow[]) {
  const duplicateUsernames = new Set<string>();
  const duplicateNis = new Set<string>();
  const duplicateNkds = new Set<string>();
  const duplicateNip = new Set<string>();
  const seenUsernames = new Map<string, number>();
  const seenNis = new Map<string, number>();
  const seenNkds = new Map<string, number>();
  const seenNip = new Map<string, number>();

  for (const row of rows) {
    if (row.username) seenUsernames.set(row.username, (seenUsernames.get(row.username) || 0) + 1);
    if (row.nis) seenNis.set(row.nis, (seenNis.get(row.nis) || 0) + 1);
    if (row.nkd) seenNkds.set(row.nkd, (seenNkds.get(row.nkd) || 0) + 1);
    if (row.nip) seenNip.set(row.nip, (seenNip.get(row.nip) || 0) + 1);
  }
  for (const [value, count] of seenUsernames) if (count > 1) duplicateUsernames.add(value);
  for (const [value, count] of seenNis) if (count > 1) duplicateNis.add(value);
  for (const [value, count] of seenNkds) if (count > 1) duplicateNkds.add(value);
  for (const [value, count] of seenNip) if (count > 1) duplicateNip.add(value);

  for (const row of rows) {
    if (duplicateUsernames.has(row.username)) row.errors.push('username duplikat di file import');
    if (row.nis && duplicateNis.has(row.nis)) row.errors.push('NIS duplikat di file import');
    if (row.nkd && duplicateNkds.has(row.nkd)) row.errors.push('NKD duplikat di file import');
    if (row.nip && duplicateNip.has(row.nip)) row.errors.push('NIP duplikat di file import');
  }

  return {
    duplicateUsernames: duplicateUsernames.size,
    duplicateNis: duplicateNis.size,
    duplicateNkds: duplicateNkds.size,
    duplicateNip: duplicateNip.size
  };
}
