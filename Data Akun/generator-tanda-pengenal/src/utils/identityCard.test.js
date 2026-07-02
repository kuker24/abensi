import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_USER_FIELDS,
  buildQrValue,
  formatBirthInfo,
  getCanonicalAllowedField,
  getCardRoleLabel,
  isSensitiveFieldName,
  isStudentCardUser,
  isSensitiveQrValue,
  normalizeIdentityRow,
  sanitizePersistedGeneratorState,
  sanitizeSelectedUsers,
  sanitizeUser,
  validateCardUser,
} from './identityCard.js';

const FORBIDDEN_KEYS = [
  'raw',
  'username',
  'password',
  'token',
  'secret',
  'cookie',
  'session',
  'credential',
];

const FORBIDDEN_VALUES = ['pass123', 'abc123', 'secret123', 'rahasia', 'password=abc123', 'cookie-value', 'session-value', 'credential-value'];
const LOCAL_OPAQUE_QR_PATTERN = /^schoolhub:qr:v1:QR_LOCAL_[A-Z0-9]{14}$/;

const assertOnlyAllowedFields = (user) => {
  Object.keys(user).forEach((field) => {
    assert.ok(ALLOWED_USER_FIELDS.includes(field), `unexpected field persisted: ${field}`);
  });
};

const assertNoForbiddenKeys = (user) => {
  FORBIDDEN_KEYS.forEach((field) => {
    assert.equal(Object.hasOwn(user, field), false, `forbidden field persisted: ${field}`);
  });
};

const assertNoForbiddenValues = (value) => {
  const serialized = JSON.stringify(value);
  FORBIDDEN_VALUES.forEach((forbiddenValue) => {
    assert.equal(serialized.includes(forbiddenValue), false, `forbidden value leaked: ${forbiddenValue}`);
  });
};

test('normalizes CSV row using allowed fields and opaque QR fallback', () => {
  const user = normalizeIdentityRow({
    nama: 'Ahmad Fauzan',
    tempat_lahir: 'Rokan Hulu',
    tanggal_lahir: '2010-02-14',
    nisn: '1234567890',
    alamat: 'Jl. Tuanku Tambusai',
    kelas: 'X A',
    qr_value: '',
  });

  assert.equal(user.nama, 'Ahmad Fauzan');
  assert.equal(formatBirthInfo(user), 'Rokan Hulu, 14 Februari 2010');
  assert.match(user.qr_value, LOCAL_OPAQUE_QR_PATTERN);
  assert.equal(buildQrValue(user), user.qr_value);
  assert.equal(user.qr_value.includes(user.nisn), false);
  assert.equal(user.qr_value.includes(user.nama.toUpperCase()), false);
  assert.equal(user.qr_value.includes(user.kelas), false);
  assert.equal(validateCardUser(user).isValid, true);
  assertOnlyAllowedFields(user);
  assertNoForbiddenKeys(user);
});

test('student card label ignores class so printed cards survive class promotion', () => {
  const user = normalizeIdentityRow({
    nama: 'Ahmad Fauzan',
    ttl: 'Rokan Hulu, 14 Februari 2010',
    nisn: '1234567890',
    alamat: 'Jl. Tuanku Tambusai',
    kelas: 'X A',
    role: 'SISWA',
  });

  assert.equal(isStudentCardUser(user), true);
  assert.equal(user.kelas, 'X A');
  assert.equal(getCardRoleLabel(user), 'SISWA');
});

test('non-student card label can still use stable role labels', () => {
  assert.equal(getCardRoleLabel({ role: 'GURU_MAPEL', kelas: 'Guru Biologi' }), 'GURU');
  assert.equal(getCardRoleLabel({ role: 'ADMIN_TU' }), 'ADMIN TU');
});

test('strips sensitive fields and never keeps raw CSV rows', () => {
  const user = normalizeIdentityRow({
    nama: 'Siti Rahma',
    ttl: 'Pekanbaru, 12 Agustus 2010',
    nisn: '0987654321',
    alamat: 'Desa Rambah',
    username: 'siti',
    password: 'pass123',
    token: 'abc123',
    secret: 'secret123',
    qr_value: '',
  });

  assert.equal(user.nama, 'Siti Rahma');
  assert.equal(user.ttl, 'Pekanbaru, 12 Agustus 2010');
  assert.match(user.qr_value, LOCAL_OPAQUE_QR_PATTERN);
  assert.equal(user.qr_value.includes(user.nisn), false);
  assert.equal(validateCardUser(user).isValid, true);
  assertOnlyAllowedFields(user);
  assertNoForbiddenKeys(user);
  assertNoForbiddenValues(user);
});

test('preserves TTL without comma while stripping sensitive fields', () => {
  const user = normalizeIdentityRow({
    Nama: 'Budi Santoso',
    'Tempat Tanggal Lahir': 'Rambah 10 Januari 2011',
    NISN: '1122334455',
    Alamat: 'Jl. Pendidikan No. 1',
    password: 'rahasia',
  });

  assert.equal(user.nama, 'Budi Santoso');
  assert.equal(user.ttl, 'Rambah 10 Januari 2011');
  assert.equal(formatBirthInfo(user), 'Rambah 10 Januari 2011');
  assert.match(user.qr_value, LOCAL_OPAQUE_QR_PATTERN);
  assert.equal(user.qr_value.includes(user.nisn), false);
  assert.equal(validateCardUser(user).isValid, true);
  assertOnlyAllowedFields(user);
  assertNoForbiddenKeys(user);
  assertNoForbiddenValues(user);
});

test('uses only official opaque qr_value and ignores unsafe or direct identity values', () => {
  const officialQrUser = normalizeIdentityRow({
    nama: 'Aman',
    ttl: 'Rokan Hulu, 1 Mei 2011',
    nisn: '9988776655',
    alamat: 'Jl. Lintas',
    qr_value: 'QR_7F3K9X2P8LQ0',
  });
  const urlQrUser = normalizeIdentityRow({
    nama: 'Url Lama',
    ttl: 'Rokan Hulu, 1 Mei 2011',
    nisn: '9988776655',
    alamat: 'Jl. Lintas',
    qr_value: 'https://verifikasi.example/siswa/9988776655',
  });
  const sensitiveQrUser = normalizeIdentityRow({
    nama: 'Rina Putri',
    ttl: 'Rokan Hulu, 1 Mei 2011',
    nisn: '9988776655',
    alamat: 'Jl. Lintas',
    qr_value: 'password=abc123',
  });

  assert.equal(officialQrUser.qr_value, 'schoolhub:qr:v1:QR_7F3K9X2P8LQ0');
  assert.match(urlQrUser.qr_value, LOCAL_OPAQUE_QR_PATTERN);
  assert.equal(urlQrUser.qr_value.includes(urlQrUser.nisn), false);
  assert.equal(isSensitiveQrValue('password=abc123'), true);
  assert.match(sensitiveQrUser.qr_value, LOCAL_OPAQUE_QR_PATTERN);
  assert.equal(sensitiveQrUser.qr_value.includes(sensitiveQrUser.nisn), false);
  assertNoForbiddenValues(sensitiveQrUser);
});

test('required field validation fails clearly when required values are missing', () => {
  const validation = validateCardUser({
    nama: '',
    ttl: '',
    nisn: '',
    alamat: '',
  });

  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.some((error) => error.includes('Nama')));
  assert.ok(validation.errors.some((error) => error.includes('Tempat tanggal lahir')));
  assert.ok(validation.errors.some((error) => error.includes('NISN')));
  assert.ok(validation.errors.some((error) => error.includes('Alamat')));
});

test('documents allowed and sensitive field detection rules', () => {
  assert.equal(getCanonicalAllowedField('Nama Lengkap'), 'nama');
  assert.equal(getCanonicalAllowedField('Tempat Tanggal Lahir'), 'ttl');
  assert.equal(getCanonicalAllowedField('qr_value'), 'qr_value');
  assert.equal(getCanonicalAllowedField('password'), '');
  assert.equal(isSensitiveFieldName('password'), true);
  assert.equal(isSensitiveFieldName('access_token'), true);
  assert.equal(isSensitiveFieldName('session cookie'), true);
  assert.equal(isSensitiveFieldName('nisn'), false);
});

test('sanitizes legacy persisted state and keeps selected IDs valid', () => {
  const legacyState = {
    users: [
      {
        id: 'legacy-1',
        nama: 'Legacy User',
        ttl: 'Rambah 10 Januari 2011',
        nisn: '1112223334',
        alamat: 'Jl. Lama',
        username: 'legacy',
        password: 'pass123',
        token: 'abc123',
        secret: 'secret123',
        cookie: 'cookie-value',
        session: 'session-value',
        credential: 'credential-value',
        raw: { password: 'pass123' },
        qr_value: 'password=abc123',
      },
    ],
    selectedUsers: ['legacy-1', 'missing-id'],
    activityLog: [{ id: 1, message: 'Imported 1 users', timestamp: '2026-01-01T00:00:00.000Z' }],
    cardSettings: { showCutMarks: false },
  };

  const sanitized = sanitizePersistedGeneratorState(legacyState);

  assert.equal(sanitized.users.length, 1);
  assert.match(sanitized.users[0].qr_value, LOCAL_OPAQUE_QR_PATTERN);
  assert.equal(sanitized.users[0].qr_value.includes('1112223334'), false);
  assert.deepEqual(sanitized.selectedUsers, ['legacy-1']);
  assertOnlyAllowedFields(sanitized.users[0]);
  assertNoForbiddenKeys(sanitized.users[0]);
  assertNoForbiddenValues(sanitized);
});

test('sanitizeUser and sanitizeSelectedUsers tolerate malformed legacy values', () => {
  const sanitizedUser = sanitizeUser(null);
  const selectedUsers = sanitizeSelectedUsers(['', null, sanitizedUser.id, 'missing'], [sanitizedUser]);

  assert.ok(sanitizedUser.id.startsWith('identity_'));
  assert.deepEqual(selectedUsers, [sanitizedUser.id]);
  assertOnlyAllowedFields(sanitizedUser);
});
