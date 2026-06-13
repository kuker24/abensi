import Papa from 'papaparse';

/**
 * Parse CSV file and return structured user data
 * @param {File} file - CSV file to parse
 * @returns {Promise<Array>} - Parsed user data
 */
export const parseDataFile = async (file) => {
  const text = typeof file === 'string' ? file : await file.text();
  const name = typeof file === 'string' ? '' : String(file.name || '').toLowerCase();
  const trimmed = text.trim();

  if (name.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseBackendQrExportText(text);
  }

  return parseCSVText(text);
};

export const parseCSV = async (file) => parseDataFile(file);

export const parseCSVText = (text) => {
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const users = processCSVData(results.data);
          resolve(users);
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      },
    });
  });
};

/**
 * Process raw CSV data into structured user objects
 * @param {Array} data - Raw CSV data
 * @returns {Array} - Processed user objects
 */
export const parseBackendQrExportText = (text) => {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('File JSON backend tidak valid. Pastikan file berasal dari export QR SchoolHub.');
  }

  const cards = Array.isArray(payload)
    ? payload
    : payload.cards || payload.items || payload.data?.cards || payload.data?.items || [];

  if (!Array.isArray(cards)) {
    throw new Error('Format JSON backend tidak dikenali. Harus berisi array cards/items.');
  }

  return cards.map((card) => mapBackendCard(card)).filter((user) => user.nama && user.username);
};

const mapBackendCard = (card) => {
  const rawRole = card.displayRole || card.role || card.user?.role || '';
  const username = String(card.username || card.user?.username || card.idNumber || '').trim();
  const fullName = cleanName(card.fullName || card.nama || card.user?.fullName || card.user?.nama || '');
  const className = String(card.className || card.classCode || card.kelas || card.level || card.user?.className || '').trim();
  const qrCode = String(card.qrCode || card.qr || card.qrPayload || card.credentialQr || '').trim();

  return {
    id: String(card.id || card.credentialId || card.userId || username || generateId()),
    userId: card.userId || card.user?.id || '',
    nama: fullName,
    fullName,
    username,
    idNumber: username,
    password: '',
    role: normalizeRole(rawRole),
    displayRole: formatDisplayRole(rawRole),
    kelas: className || 'MAN 1 Rokan Hulu',
    level: className || 'MAN 1 Rokan Hulu',
    program: 'e-Hadir Absensi',
    status: 'Aktif',
    qrCode,
    qrMasked: card.qrMasked || '',
    shortCode: card.shortCode || '',
    label: card.label || 'QR Absensi SchoolHub',
    note: card.note || 'Kartu hanya untuk absensi SchoolHub MAN 1 Rokan Hulu.',
    source: 'backend-qr-export',
    raw: card,
  };
};

const processCSVData = (data) => {
  return data.map((row) => {
    const nama = cleanName(row['Nama Lengkap'] || row['Nama'] || row['nama'] || row['fullName'] || '');
    const username = (row['Username'] || row['username'] || row['ID'] || row['Id'] || row['id'] || '').trim();
    const kelas = (row['Kelas/Jabatan'] || row['Kelas'] || row['kelas'] || row['Jabatan'] || row['Level'] || row['level'] || '').trim();
    const rawRole = (row['Role'] || row['role'] || '').trim();
    const program = (row['Program'] || row['program'] || row['Label'] || row['label'] || 'e-Hadir Absensi').trim();
    const qrCode = (row['QR Code'] || row['QRCode'] || row['qrCode'] || row['qr_code'] || row['Kode QR'] || row['KodeQR'] || '').trim();

    return {
      id: generateId(),
      no: (row['No'] || row['no'] || '').trim(),
      nama,
      fullName: nama,
      username,
      idNumber: username,
      password: (row['Password'] || row['password'] || '').trim(), // Disimpan untuk referensi admin, tidak dicetak di kartu.
      role: normalizeRole(rawRole),
      displayRole: rawRole || 'Siswa',
      kelas,
      level: kelas,
      program,
      status: (row['Status'] || row['status'] || 'Aktif').trim(),
      qrCode,
      bergabung: formatDate(row['Bergabung'] || row['bergabung'] || ''),
      raw: row,
    };
  }).filter((user) => user.nama && user.username);
};

/**
 * Generate unique ID
 * @returns {string} - Unique ID
 */
const generateId = () => {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Clean and format name (handle Indonesian names with commas)
 * @param {string} name - Raw name
 * @returns {string} - Cleaned name
 */
export const cleanName = (name) => {
  if (!name) return '';
  
  // Remove extra whitespace
  let cleaned = name.trim();
  
  // Handle names with titles after comma (e.g., "Sri Arfangatun,SPd" -> "Sri Arfangatun, S.Pd")
  // Add space after comma if followed by title
  cleaned = cleaned.replace(/,([A-Za-z])/g, ', $1');
  
  // Ensure proper title formatting
  cleaned = cleaned.replace(/, S\.?Pd/gi, ', S.Pd');
  cleaned = cleaned.replace(/, M\.?Pd/gi, ', M.Pd');
  cleaned = cleaned.replace(/, S\.?Pd\.?I/gi, ', S.Pd.I');
  cleaned = cleaned.replace(/, S\.?E/gi, ', S.E');
  cleaned = cleaned.replace(/, S\.?Kom/gi, ', S.Kom');
  cleaned = cleaned.replace(/, S\.?Pd/gi, ', S.Pd');
  cleaned = cleaned.replace(/, S\.?Si/gi, ', S.Si');
  cleaned = cleaned.replace(/, S\.?T/gi, ', S.T');
  cleaned = cleaned.replace(/, Drs/gi, ', Drs.');
  cleaned = cleaned.replace(/, Dr/gi, ', Dr.');
  
  return cleaned;
};

/**
 * Normalize role to 'student' or 'teacher'
 * @param {string} role - Raw role
 * @returns {string} - Normalized role
 */
const normalizeRole = (role) => {
  const roleLower = role.toLowerCase().trim();

  if (['teacher', 'guru', 'pengajar', 'guru_mapel', 'guru piket', 'guru_piket'].includes(roleLower)) {
    return 'teacher';
  }

  if (['admin', 'admin_tu', 'operator', 'operator_it', 'tu', 'pegawai', 'staff', 'staf'].includes(roleLower)) {
    return 'staff';
  }

  if (['student', 'siswa', 'murid', 'pelajar'].includes(roleLower)) {
    return 'student';
  }

  return roleLower || 'student';
};

const formatDisplayRole = (role) => {
  const normalized = normalizeRole(role);
  if (normalized === 'teacher') return 'Guru';
  if (normalized === 'staff') return 'Pegawai';
  return 'Siswa';
};

/**
 * Format date to ISO format
 * @param {string} dateStr - Raw date string
 * @returns {string} - Formatted date
 */
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  
  try {
    // Try to parse various date formats
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
    return dateStr.trim();
  } catch {
    return dateStr.trim();
  }
};

/**
 * Validate user data
 * @param {Object} user - User object to validate
 * @returns {Object} - Validation result { isValid, errors }
 */
export const validateUser = (user) => {
  const errors = [];
  
  if (!user.nama || user.nama.trim().length < 2) {
    errors.push('Nama harus diisi minimal 2 karakter');
  }
  
  if (!user.username || user.username.trim().length < 2) {
    errors.push('Username harus diisi minimal 2 karakter');
  }
  
  if (!['student', 'teacher', 'staff'].includes(user.role)) {
    errors.push('Role harus Siswa, Guru, atau Pegawai/Admin');
  }

  if (!user.kelas) {
    errors.push('Kelas/Jabatan atau level harus diisi');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate all users and return validation report
 * @param {Array} users - Array of user objects
 * @returns {Object} - Validation report
 */
export const validateUsers = (users) => {
  const validUsers = [];
  const invalidUsers = [];
  const usernameCounts = new Map();

  users.forEach((user) => {
    const key = String(user.username || '').trim().toLowerCase();
    if (key) usernameCounts.set(key, (usernameCounts.get(key) || 0) + 1);
  });

  users.forEach((user, index) => {
    const validation = validateUser(user);
    const key = String(user.username || '').trim().toLowerCase();
    if (key && usernameCounts.get(key) > 1) validation.errors.push('Username/ID duplikat');

    if (validation.isValid && validation.errors.length === 0) {
      validUsers.push(user);
    } else {
      invalidUsers.push({
        row: index + 1,
        user,
        errors: validation.errors,
      });
    }
  });

  const officialQrCount = users.filter((user) => String(user.qrCode || '').startsWith('schoolhub:qr:v1:')).length;
  const duplicateUsernameCount = [...usernameCounts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
  const missingLevelCount = users.filter((user) => !String(user.kelas || user.level || '').trim()).length;

  return {
    validUsers,
    invalidUsers,
    totalRows: users.length,
    validCount: validUsers.length,
    invalidCount: invalidUsers.length,
    officialQrCount,
    fallbackQrCount: users.length - officialQrCount,
    duplicateUsernameCount,
    missingLevelCount,
  };
};

/**
 * Get unique classes from users
 * @param {Array} users - Array of user objects
 * @returns {Array} - Sorted array of unique classes
 */
export const getUniqueClasses = (users) => {
  const classes = [...new Set(users.map((u) => u.kelas).filter(Boolean))];
  return classes.sort((a, b) => {
    // Sort classes naturally (XII IPA 1, XII IPA 2, etc.)
    return a.localeCompare(b, 'id', { numeric: true });
  });
};

export default {
  parseDataFile,
  parseCSV,
  parseCSVText,
  parseBackendQrExportText,
  validateUser,
  validateUsers,
  cleanName,
  getUniqueClasses,
};
