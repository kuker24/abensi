import { REQUIRED_CARD_FIELD_LABELS } from './cardTemplates.js';

const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export const ALLOWED_USER_FIELDS = [
  'id',
  'nama',
  'tempat_lahir',
  'tanggal_lahir',
  'ttl',
  'nisn',
  'alamat',
  'kelas',
  'jurusan',
  'role',
  'status',
  'qr_value',
  'tahun_ajaran',
  'nomor_kartu',
  'createdAt',
  'updatedAt',
];

const ALLOWED_USER_FIELD_SET = new Set(ALLOWED_USER_FIELDS);

export const SENSITIVE_FIELD_NAMES = [
  'password',
  'pass',
  'pwd',
  'username',
  'user',
  'token',
  'secret',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'cookie',
  'session',
  'credential',
  'auth',
  'key',
  'raw',
];

const SENSITIVE_FIELD_KEYS = new Set([
  ...SENSITIVE_FIELD_NAMES.map((field) => field.replace(/_/g, ' ')),
  ...SENSITIVE_FIELD_NAMES,
]);
const SENSITIVE_COMPACT_KEYS = new Set(SENSITIVE_FIELD_NAMES.map((field) => field.replace(/[_\s-]+/g, '')));
const SENSITIVE_TOKEN_KEYS = new Set(['password', 'pass', 'pwd', 'username', 'user', 'token', 'secret', 'cookie', 'session', 'credential', 'auth', 'key', 'raw']);
const QR_SENSITIVE_PATTERN = /(?:password|pass|pwd|token|secret|api[_\s-]?key|access[_\s-]?token|refresh[_\s-]?token|cookie|session|credential|auth)/i;

export const FIELD_ALIASES = {
  id: ['id', 'ID', 'identity_id'],
  nama: ['nama', 'Nama', 'Nama Lengkap', 'nama lengkap', 'name'],
  tempat_lahir: ['tempat_lahir', 'Tempat Lahir', 'tempat lahir', 'tempat', 'birth_place'],
  tanggal_lahir: ['tanggal_lahir', 'Tanggal Lahir', 'tanggal lahir', 'tgl_lahir', 'tgl lahir', 'lahir', 'birth_date'],
  ttl: ['ttl', 'TTL', 'Tempat Tanggal Lahir', 'tempat tanggal lahir', 'tempat_tanggal_lahir', 'Tempat/Tanggal Lahir'],
  nisn: ['nisn', 'NISN', 'nomor nisn', 'Nomor NISN', 'no_nisn', 'no nisn'],
  alamat: ['alamat', 'Alamat', 'address', 'domisili'],
  qr_value: ['qr_value', 'QR Value', 'qr value', 'qr', 'QR', 'kode_qr', 'kode qr'],
  kelas: ['kelas', 'Kelas', 'kelas/jabatan', 'Kelas/Jabatan', 'rombel'],
  jurusan: ['jurusan', 'Jurusan', 'program', 'program studi', 'peminatan'],
  role: ['role', 'Role', 'jenis pengguna', 'Jenis Pengguna', 'tipe', 'status pengguna'],
  tahun_ajaran: ['tahun_ajaran', 'Tahun Ajaran', 'tahun ajaran', 'periode', 'Periode'],
  nomor_kartu: ['nomor_kartu', 'Nomor Kartu', 'nomor kartu', 'card_number', 'no kartu'],
  status: ['status', 'Status'],
  createdAt: ['createdAt', 'created_at', 'created at', 'dibuat'],
  updatedAt: ['updatedAt', 'updated_at', 'updated at', 'diubah'],
};

export const normalizeHeaderKey = (key = '') => {
  return String(key)
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[./-]+/g, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ');
};

const cleanString = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

export const isSensitiveFieldName = (field = '') => {
  const key = normalizeHeaderKey(field);
  const compactKey = key.replace(/\s+/g, '');

  if (!key) return false;
  if (SENSITIVE_FIELD_KEYS.has(key) || SENSITIVE_COMPACT_KEYS.has(compactKey)) return true;

  return key.split(' ').some((token) => SENSITIVE_TOKEN_KEYS.has(token));
};

export const isSensitiveQrValue = (value = '') => QR_SENSITIVE_PATTERN.test(cleanString(value));

const getAliasedValue = (row, aliases) => {
  const normalized = Object.entries(row || {}).reduce((acc, [key, value]) => {
    acc[normalizeHeaderKey(key)] = value;
    return acc;
  }, {});

  for (const alias of aliases) {
    const value = normalized[normalizeHeaderKey(alias)];
    if (value !== undefined && cleanString(value)) {
      return cleanString(value);
    }
  }

  return '';
};

export const getCanonicalAllowedField = (header = '') => {
  const normalized = normalizeHeaderKey(header);

  if (!normalized) return '';

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (!ALLOWED_USER_FIELD_SET.has(field)) continue;
    if (aliases.some((alias) => normalizeHeaderKey(alias) === normalized)) return field;
  }

  return ALLOWED_USER_FIELD_SET.has(normalized) ? normalized : '';
};

const uniqueCleanValues = (values) => [...new Set(values.map(cleanString).filter(Boolean))];

export const analyzeCsvPrivacy = (headers = [], rows = []) => {
  const columns = uniqueCleanValues(headers);
  const sensitiveColumns = [];
  const ignoredColumns = [];

  columns.forEach((column) => {
    if (isSensitiveFieldName(column)) {
      sensitiveColumns.push(column);
      return;
    }

    if (!getCanonicalAllowedField(column)) {
      ignoredColumns.push(column);
    }
  });

  const qrSensitiveRows = rows
    .map((row, index) => ({ row: index + 1, value: getAliasedValue(row, FIELD_ALIASES.qr_value) }))
    .filter((item) => isSensitiveQrValue(item.value))
    .map((item) => item.row);

  return {
    sensitiveColumns: uniqueCleanValues(sensitiveColumns),
    ignoredColumns: uniqueCleanValues(ignoredColumns),
    qrSensitiveRows,
  };
};

export const cleanName = (name) => {
  if (!name) return '';

  let cleaned = cleanString(name);
  cleaned = cleaned.replace(/,([A-Za-z])/g, ', $1');
  cleaned = cleaned.replace(/, S\.?Pd\.?I/gi, ', S.Pd.I');
  cleaned = cleaned.replace(/, S\.?Pd/gi, ', S.Pd');
  cleaned = cleaned.replace(/, M\.?Pd/gi, ', M.Pd');
  cleaned = cleaned.replace(/, S\.?E/gi, ', S.E');
  cleaned = cleaned.replace(/, S\.?Kom/gi, ', S.Kom');
  cleaned = cleaned.replace(/, S\.?Si/gi, ', S.Si');
  cleaned = cleaned.replace(/, S\.?T/gi, ', S.T');
  cleaned = cleaned.replace(/, Drs/gi, ', Drs.');
  cleaned = cleaned.replace(/, Dr/gi, ', Dr.');

  return cleaned;
};

const normalizeRole = (role) => {
  const roleLower = cleanString(role).toLowerCase();

  if (['teacher', 'guru', 'pengajar', 'pegawai'].includes(roleLower)) {
    return 'teacher';
  }

  return 'student';
};

const parseTtl = (ttlValue) => {
  const ttl = cleanString(ttlValue);
  if (!ttl) return { tempat_lahir: '', tanggal_lahir: '' };

  const commaParts = ttl.split(',').map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    return {
      tempat_lahir: commaParts[0],
      tanggal_lahir: commaParts.slice(1).join(', '),
    };
  }

  return {
    tempat_lahir: '',
    tanggal_lahir: ttl,
  };
};

export const formatDateLabel = (value) => {
  const raw = cleanString(value);
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const monthName = MONTHS_ID[Number(month) - 1];
    if (monthName) return `${Number(day)} ${monthName} ${year}`;
  }

  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const monthName = MONTHS_ID[Number(month) - 1];
    if (monthName) return `${Number(day)} ${monthName} ${year}`;
  }

  return raw;
};

export const formatBirthInfo = (user = {}) => {
  const tempat = cleanString(user.tempat_lahir);
  const tanggal = formatDateLabel(user.tanggal_lahir);

  if (tempat && tanggal) return `${tempat}, ${tanggal}`;
  if (cleanString(user.ttl)) return cleanString(user.ttl);
  if (tempat) return tempat;
  return tanggal;
};

export const buildQrValue = (user = {}) => {
  const explicit = cleanString(user.qr_value || user.qrValue || user.qr);
  if (explicit && !isSensitiveQrValue(explicit)) return explicit;

  const nisn = cleanString(user.nisn);
  if (nisn) return nisn;

  const nama = cleanString(user.nama);
  const ttl = formatBirthInfo(user);
  return ['SIAB2', 'MAN1ROHUL', nama, ttl].filter(Boolean).join('|');
};

export const sanitizeUser = (user = {}, index = 0) => {
  const source = user && typeof user === 'object' ? user : {};
  const safeUser = {};

  ALLOWED_USER_FIELDS.forEach((field) => {
    if (field === 'qr_value' || field === 'role' || field === 'status') return;
    const value = cleanString(source[field]);
    if (value) safeUser[field] = field === 'nama' ? cleanName(value) : value;
  });

  safeUser.id ||= `identity_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 9)}`;
  safeUser.nama = cleanName(source.nama || safeUser.nama);
  safeUser.tempat_lahir = cleanString(source.tempat_lahir || safeUser.tempat_lahir);
  safeUser.tanggal_lahir = cleanString(source.tanggal_lahir || safeUser.tanggal_lahir);
  safeUser.ttl = cleanString(source.ttl || safeUser.ttl || [safeUser.tempat_lahir, formatDateLabel(safeUser.tanggal_lahir)].filter(Boolean).join(', '));
  safeUser.nisn = cleanString(source.nisn || safeUser.nisn);
  safeUser.alamat = cleanString(source.alamat || safeUser.alamat);
  safeUser.kelas = cleanString(source.kelas || safeUser.kelas);
  safeUser.jurusan = cleanString(source.jurusan || safeUser.jurusan);
  safeUser.role = normalizeRole(source.role || safeUser.role);
  safeUser.status = cleanString(source.status || safeUser.status) || 'Aktif';
  safeUser.tahun_ajaran = cleanString(source.tahun_ajaran || safeUser.tahun_ajaran);
  safeUser.nomor_kartu = cleanString(source.nomor_kartu || safeUser.nomor_kartu);
  safeUser.createdAt = cleanString(source.createdAt || safeUser.createdAt);
  safeUser.updatedAt = cleanString(source.updatedAt || safeUser.updatedAt);
  safeUser.qr_value = buildQrValue({ ...safeUser, qr_value: cleanString(source.qr_value) });

  return ALLOWED_USER_FIELDS.reduce((acc, field) => {
    if (cleanString(safeUser[field])) acc[field] = safeUser[field];
    return acc;
  }, {});
};

export const sanitizeUsers = (users = []) => {
  if (!Array.isArray(users)) return [];
  return users.map((user, index) => sanitizeUser(user, index));
};

export const sanitizeSelectedUsers = (selectedUsers = [], users = []) => {
  if (!Array.isArray(selectedUsers)) return [];
  const allowedIds = new Set(users.map((user) => user.id));
  return [...new Set(selectedUsers.map(cleanString).filter((id) => allowedIds.has(id)))];
};

const sanitizeActivityLog = (activityLog = []) => {
  if (!Array.isArray(activityLog)) return [];

  return activityLog.slice(0, 50).map((activity, index) => {
    const message = cleanString(activity?.message);
    return {
      id: activity?.id || `activity_${index}`,
      message: isSensitiveQrValue(message) ? 'Aktivitas lama disembunyikan karena memuat pola sensitif.' : message,
      timestamp: cleanString(activity?.timestamp) || new Date().toISOString(),
    };
  });
};

export const sanitizePersistedGeneratorState = (persistedState = {}) => {
  if (!persistedState || typeof persistedState !== 'object') {
    return { users: [], selectedUsers: [], activityLog: [] };
  }

  const users = sanitizeUsers(persistedState.users);

  return {
    users,
    selectedUsers: sanitizeSelectedUsers(persistedState.selectedUsers, users),
    activityLog: sanitizeActivityLog(persistedState.activityLog),
    cardSettings: persistedState.cardSettings,
  };
};

export const normalizeIdentityRow = (row, index = 0) => {
  const ttlValue = getAliasedValue(row, FIELD_ALIASES.ttl);
  const parsedTtl = parseTtl(ttlValue);
  const tempatLahir = getAliasedValue(row, FIELD_ALIASES.tempat_lahir) || parsedTtl.tempat_lahir;
  const tanggalLahir = getAliasedValue(row, FIELD_ALIASES.tanggal_lahir) || parsedTtl.tanggal_lahir;

  return sanitizeUser({
    id: getAliasedValue(row, FIELD_ALIASES.id) || `identity_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 9)}`,
    nama: getAliasedValue(row, FIELD_ALIASES.nama),
    tempat_lahir: tempatLahir,
    tanggal_lahir: tanggalLahir,
    ttl: ttlValue || [tempatLahir, formatDateLabel(tanggalLahir)].filter(Boolean).join(', '),
    nisn: getAliasedValue(row, FIELD_ALIASES.nisn),
    alamat: getAliasedValue(row, FIELD_ALIASES.alamat),
    qr_value: getAliasedValue(row, FIELD_ALIASES.qr_value),
    kelas: getAliasedValue(row, FIELD_ALIASES.kelas),
    jurusan: getAliasedValue(row, FIELD_ALIASES.jurusan),
    role: getAliasedValue(row, FIELD_ALIASES.role),
    tahun_ajaran: getAliasedValue(row, FIELD_ALIASES.tahun_ajaran),
    nomor_kartu: getAliasedValue(row, FIELD_ALIASES.nomor_kartu),
    status: getAliasedValue(row, FIELD_ALIASES.status) || 'Aktif',
    createdAt: getAliasedValue(row, FIELD_ALIASES.createdAt),
    updatedAt: getAliasedValue(row, FIELD_ALIASES.updatedAt),
  }, index);
};

export const isLikelyEmptyRow = (row = {}) => {
  return !Object.values(row).some((value) => cleanString(value));
};

export const validateCardUser = (user = {}) => {
  const errors = [];

  if (!cleanString(user.nama) || cleanString(user.nama).length < 2) {
    errors.push(`${REQUIRED_CARD_FIELD_LABELS.nama} wajib diisi minimal 2 karakter`);
  }

  const birthInfo = formatBirthInfo(user);
  if (!birthInfo) {
    errors.push(`${REQUIRED_CARD_FIELD_LABELS.tempat_tanggal_lahir} wajib diisi`);
  }

  if (!cleanString(user.nisn)) {
    errors.push(`${REQUIRED_CARD_FIELD_LABELS.nisn} wajib diisi`);
  }

  if (!cleanString(user.alamat)) {
    errors.push(`${REQUIRED_CARD_FIELD_LABELS.alamat} wajib diisi`);
  }

  if (!buildQrValue(user)) {
    errors.push(`${REQUIRED_CARD_FIELD_LABELS.qr} tidak bisa dibuat`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export const validateCardUsers = (users = []) => {
  const validUsers = [];
  const invalidUsers = [];

  users.forEach((user, index) => {
    const validation = validateCardUser(user);
    if (validation.isValid) {
      validUsers.push(user);
    } else {
      invalidUsers.push({
        row: index + 1,
        user,
        errors: validation.errors,
      });
    }
  });

  return {
    validUsers,
    invalidUsers,
    totalRows: users.length,
    validCount: validUsers.length,
    invalidCount: invalidUsers.length,
  };
};

export const getReadinessSummary = (users = []) => validateCardUsers(users);

export const getInitials = (name = '') => {
  return cleanString(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'ID';
};

export const getUniqueClasses = (users = []) => {
  const classes = [...new Set(users.map((user) => cleanString(user.kelas)).filter(Boolean))];
  return classes.sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
};
