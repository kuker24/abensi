import { REQUIRED_CARD_FIELD_LABELS } from './cardTemplates';

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

export const FIELD_ALIASES = {
  nama: ['nama', 'Nama', 'Nama Lengkap', 'nama lengkap', 'name'],
  tempat_lahir: ['tempat_lahir', 'Tempat Lahir', 'tempat lahir', 'tempat', 'birth_place'],
  tanggal_lahir: ['tanggal_lahir', 'Tanggal Lahir', 'tanggal lahir', 'tgl_lahir', 'tgl lahir', 'lahir', 'birth_date'],
  ttl: ['ttl', 'TTL', 'Tempat Tanggal Lahir', 'tempat tanggal lahir', 'tempat_tanggal_lahir', 'Tempat/Tanggal Lahir'],
  nisn: ['nisn', 'NISN', 'nomor nisn', 'Nomor NISN', 'no_nisn', 'no nisn'],
  alamat: ['alamat', 'Alamat', 'address', 'domisili'],
  qr_value: ['qr_value', 'QR Value', 'qr value', 'qr', 'QR', 'kode_qr', 'kode qr'],
  foto: ['foto', 'Foto', 'photo', 'photo_url', 'foto_url', 'url_foto'],
  kelas: ['kelas', 'Kelas', 'kelas/jabatan', 'Kelas/Jabatan', 'rombel'],
  role: ['role', 'Role', 'jenis pengguna', 'Jenis Pengguna', 'tipe', 'status pengguna'],
  tahun_ajaran: ['tahun_ajaran', 'Tahun Ajaran', 'tahun ajaran', 'periode', 'Periode'],
  nomor_kartu: ['nomor_kartu', 'Nomor Kartu', 'nomor kartu', 'card_number', 'no kartu'],
  status: ['status', 'Status'],
  username: ['username', 'Username'],
  password: ['password', 'Password'],
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
  if (explicit) return explicit;

  const nisn = cleanString(user.nisn);
  if (nisn) return nisn;

  const nama = cleanString(user.nama);
  const ttl = formatBirthInfo(user);
  return ['SIAB2', 'MAN1ROHUL', nama, ttl].filter(Boolean).join('|');
};

export const normalizeIdentityRow = (row, index = 0) => {
  const ttlValue = getAliasedValue(row, FIELD_ALIASES.ttl);
  const parsedTtl = parseTtl(ttlValue);
  const tempatLahir = getAliasedValue(row, FIELD_ALIASES.tempat_lahir) || parsedTtl.tempat_lahir;
  const tanggalLahir = getAliasedValue(row, FIELD_ALIASES.tanggal_lahir) || parsedTtl.tanggal_lahir;
  const nisn = getAliasedValue(row, FIELD_ALIASES.nisn);
  const nama = cleanName(getAliasedValue(row, FIELD_ALIASES.nama));
  const alamat = getAliasedValue(row, FIELD_ALIASES.alamat);

  const user = {
    id: `identity_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 9)}`,
    nama,
    tempat_lahir: tempatLahir,
    tanggal_lahir: tanggalLahir,
    ttl: ttlValue || [tempatLahir, formatDateLabel(tanggalLahir)].filter(Boolean).join(', '),
    nisn,
    alamat,
    qr_value: getAliasedValue(row, FIELD_ALIASES.qr_value),
    foto: getAliasedValue(row, FIELD_ALIASES.foto),
    kelas: getAliasedValue(row, FIELD_ALIASES.kelas),
    role: normalizeRole(getAliasedValue(row, FIELD_ALIASES.role)),
    tahun_ajaran: getAliasedValue(row, FIELD_ALIASES.tahun_ajaran),
    nomor_kartu: getAliasedValue(row, FIELD_ALIASES.nomor_kartu),
    status: getAliasedValue(row, FIELD_ALIASES.status) || 'Aktif',
    username: getAliasedValue(row, FIELD_ALIASES.username),
    password: getAliasedValue(row, FIELD_ALIASES.password),
    raw: row,
  };

  user.qr_value = buildQrValue(user);
  return user;
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
