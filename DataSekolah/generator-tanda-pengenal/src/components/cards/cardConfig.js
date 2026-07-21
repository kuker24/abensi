export const CARD_WIDTH_MM = 53.98;
export const CARD_HEIGHT_MM = 85.6;
export const CARD_PIXEL_WIDTH = 324;
export const CARD_PIXEL_HEIGHT = 514;

export const safeText = (value, fallback = '—') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

export const getCardRoleLabel = (user = {}) => {
  const rawRole = user?.roleLabel || user?.displayRole || user?.role || '';
  const role = normalizeRole(rawRole).replace(/[_.-]+/g, ' ');

  if (role.includes('guru piket')) return 'GURU PIKET';
  if (role.includes('kepala')) return 'KEPALA SEKOLAH';
  if (role.includes('operator')) return 'OPERATOR IT';
  if (role.includes('admin') || role === 'tu' || role.includes('admin tu')) return 'ADMIN TU';
  if (role.includes('guru') || role.includes('teacher')) return 'GURU';
  if (role.includes('pegawai') || role.includes('staff') || role.includes('staf')) return 'PEGAWAI';
  if (role.includes('siswa') || role.includes('student')) return 'SISWA';
  if (role.includes('developer')) return 'DEVELOPER';

  return safeText(rawRole || 'MAN 1 ROKAN HULU').toUpperCase();
};

export const getCardSubLabel = (user = {}) => {
  const roleLabel = getCardRoleLabel(user);
  if (roleLabel === 'SISWA') return 'Peserta Didik';
  if (roleLabel === 'GURU' || roleLabel === 'GURU PIKET') return 'Guru / Tendik';
  if (roleLabel === 'KEPALA SEKOLAH') return 'Kepala Madrasah';
  if (roleLabel === 'ADMIN TU' || roleLabel === 'OPERATOR IT') return 'Admin / Operator';
  return 'Anggota';
};

export const isStudentCard = (user = {}) => getCardRoleLabel(user) === 'SISWA';

export const getStudentCardNumbers = (user = {}) => ({
  nisn: safeText(user?.nisn || user?.nis || user?.raw?.nisn || user?.raw?.nis, '—'),
  nkd: safeText(user?.nkd || user?.raw?.nkd || user?.nid || user?.raw?.nid, '—'),
});

export const getStaffCardNumber = (user = {}) => safeText(user?.nip || user?.raw?.nip, '—');

export const getCardIdentityNumber = (user = {}) => {
  if (isStudentCard(user)) return getStudentCardNumbers(user).nisn;
  return getStaffCardNumber(user);
};

export const getCardLevel = (user = {}) => safeText(
  user?.className || user?.classCode || user?.kelas || user?.level || user?.raw?.['Kelas/Jabatan'],
  'MAN 1 Rokan Hulu'
);

export const getQrPayload = (user) => {
  const explicitQr = safeText(
    user?.qrCode || user?.qr || user?.qrPayload || user?.credentialQr || user?.raw?.qrCode || user?.raw?.['QR Code'] || user?.raw?.KodeQR,
    ''
  );

  if (explicitQr) return explicitQr;

  const identifier = safeText(user?.username || user?.idNumber || user?.raw?.Username, 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-');

  return `schoolhub:id-card:v1:${identifier}`;
};
