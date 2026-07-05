const DEFAULT_API_BASE = '/api/v1';

const cleanString = (value) => String(value ?? '').trim();
const FORBIDDEN_CARD_FIELDS = /(?:password|passwordHash|token|secret|cookie|session|accessToken|refreshToken|resetToken)/i;

const isStudentRole = (role = '') => {
  const normalized = cleanString(role).toUpperCase();
  return ['SISWA', 'STUDENT', 'ROLE.SISWA'].includes(normalized);
};

export const getSiab2ApiBase = () => {
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
  return cleanString(env.VITE_SIAB2_API_BASE_URL || env.VITE_API_BASE_URL) || DEFAULT_API_BASE;
};

export const buildSiab2CardExportPath = ({ classId = '', userId = '' } = {}) => {
  const safeUserId = cleanString(userId);
  const safeClassId = cleanString(classId);
  if (safeUserId) return `/qr-credentials/export/users/${encodeURIComponent(safeUserId)}/card`;
  if (safeClassId) return `/qr-credentials/export/class/${encodeURIComponent(safeClassId)}/cards`;
  return '/qr-credentials/export/cards';
};

export const mapSiab2CardToGeneratorUser = (card = {}, index = 0) => {
  for (const key of Object.keys(card || {})) {
    if (FORBIDDEN_CARD_FIELDS.test(key)) throw new Error('Payload kartu resmi memuat field kredensial terlarang.');
  }

  const role = cleanString(card.role || card.roleLabel || card.displayRole);
  const isStudent = isStudentRole(role) || isStudentRole(card.roleLabel) || cleanString(card.displayRole).toUpperCase() === 'SISWA';
  const fullName = cleanString(card.nama || card.fullName || card.name);
  const qrValue = cleanString(card.qr_value || card.qrCode || card.qr || card.code);

  return {
    id: cleanString(card.userId || card.id) || `siab2_card_${index + 1}`,
    nama: fullName,
    nisn: cleanString(card.nisn || card.nis || (isStudent ? card.username : card.nip) || card.shortCode),
    role: isStudent ? 'student' : 'teacher',
    kelas: cleanString(card.className || card.classCode || card.level),
    jurusan: cleanString(card.program),
    status: cleanString(card.status || card.cardStatus) || 'Aktif',
    qr_value: qrValue,
    card_source: 'database',
    card_source_label: cleanString(card.sourceLabel) || 'RESMI / DATABASE',
    is_official: 'true',
    nomor_kartu: cleanString(card.shortCode),
    createdAt: cleanString(card.issuedAt || card.createdAt),
    updatedAt: cleanString(card.generatedAt || card.updatedAt),
  };
};

export const mapSiab2CardsPayload = (payload = {}) => {
  const cards = Array.isArray(payload.cards) ? payload.cards : [];
  return cards.map((card, index) => mapSiab2CardToGeneratorUser({ ...card, generatedAt: payload.generatedAt }, index));
};

export const EMPTY_OFFICIAL_CARD_RESULT_MESSAGE = 'Data resmi dari endpoint kosong. Pastikan QR sudah dibuat dan URL tidak memakai classId/userId stale.';

export const buildSiab2CardLoadScope = ({ mode = 'manual', classId = '', userId = '' } = {}) => {
  if (mode === 'auto') return { classId: cleanString(classId), userId: cleanString(userId) };
  return { classId: '', userId: '' };
};

export const buildSiab2CardLoadMessage = ({ count = 0, classId = '', userId = '' } = {}) => {
  if (cleanString(userId)) return `Data resmi pengguna dimuat: ${count} kartu.`;
  if (cleanString(classId)) return `Data resmi kelas dimuat: ${count} kartu.`;
  return `Data resmi dari database dimuat: ${count} kartu.`;
};

export const ensureNonEmptySiab2Cards = (users = []) => {
  if (!Array.isArray(users) || users.length === 0) throw new Error(EMPTY_OFFICIAL_CARD_RESULT_MESSAGE);
  return users;
};

const parseJsonResponse = async (response) => {
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    throw new Error(message || `HTTP ${response.status}`);
  }
  return data;
};

export const fetchSiab2Cards = async ({ classId = '', userId = '', apiBase = getSiab2ApiBase(), fetchImpl = fetch } = {}) => {
  const path = buildSiab2CardExportPath({ classId, userId });
  const url = `${apiBase}${path}`;
  const request = () => fetchImpl(url, { headers: { accept: 'application/json' }, credentials: 'include' });
  let response = await request();

  if (response.status === 401) {
    await fetchImpl(`${apiBase}/auth/refresh`, { method: 'POST', headers: { accept: 'application/json' }, credentials: 'include' }).catch(() => null);
    response = await request();
  }

  const payload = await parseJsonResponse(response);
  return { payload, users: mapSiab2CardsPayload(payload), path };
};

export const fetchRequiredSiab2Cards = async (options = {}) => {
  const result = await fetchSiab2Cards(options);
  ensureNonEmptySiab2Cards(result.users);
  return result;
};
