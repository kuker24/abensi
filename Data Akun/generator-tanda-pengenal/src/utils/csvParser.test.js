import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, validateUsers } from './csvParser.js';
import { formatBirthInfo, validateCardUser } from './identityCard.js';

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

const FORBIDDEN_VALUES = ['pass123', 'abc123', 'secret123', 'rahasia', 'password=abc123'];

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

test('parses normal CSV as valid card data with QR fallback to NISN', async () => {
  const csv = `nama,tempat_lahir,tanggal_lahir,nisn,alamat,kelas,qr_value\nAhmad Fauzan,Rokan Hulu,2010-02-14,1234567890,"Jl. Tuanku Tambusai",X A,\n`;

  const { users, privacyReport } = await parseCSV(csv);
  const report = validateUsers(users);

  assert.equal(users.length, 1);
  assert.equal(users[0].nama, 'Ahmad Fauzan');
  assert.equal(formatBirthInfo(users[0]), 'Rokan Hulu, 14 Februari 2010');
  assert.equal(users[0].qr_value, '1234567890');
  assert.equal(report.validCount, 1);
  assert.equal(report.invalidCount, 0);
  assert.deepEqual(privacyReport.sensitiveColumns, []);
  assert.deepEqual(privacyReport.ignoredColumns, []);
  assert.deepEqual(privacyReport.qrSensitiveRows, []);
});

test('parses CSV with sensitive columns while warning by column name only', async () => {
  const csv = `nama,ttl,nisn,alamat,username,password,token,secret,qr_value\nSiti Rahma,"Pekanbaru, 12 Agustus 2010",0987654321,"Desa Rambah",siti,pass123,abc123,secret123,\n`;

  const result = await parseCSV(csv);
  const [user] = result.users;

  assert.equal(validateCardUser(user).isValid, true);
  assert.equal(user.nama, 'Siti Rahma');
  assert.equal(user.qr_value, '0987654321');
  assert.deepEqual(result.privacyReport.sensitiveColumns, ['username', 'password', 'token', 'secret']);
  assert.deepEqual(result.privacyReport.ignoredColumns, []);
  assertNoForbiddenKeys(user);
  assertNoForbiddenValues(result);
});

test('parses TTL without comma and strips password column', async () => {
  const csv = `Nama,Tempat Tanggal Lahir,NISN,Alamat,password\nBudi Santoso,Rambah 10 Januari 2011,1122334455,"Jl. Pendidikan No. 1",rahasia\n`;

  const result = await parseCSV(csv);
  const [user] = result.users;

  assert.equal(validateCardUser(user).isValid, true);
  assert.equal(user.ttl, 'Rambah 10 Januari 2011');
  assert.equal(formatBirthInfo(user), 'Rambah 10 Januari 2011');
  assert.equal(user.qr_value, '1122334455');
  assert.deepEqual(result.privacyReport.sensitiveColumns, ['password']);
  assertNoForbiddenKeys(user);
  assertNoForbiddenValues(result);
});

test('ignores sensitive QR values and warns without printing QR contents', async () => {
  const csv = `nama,ttl,nisn,alamat,qr_value\nRina Putri,"Rokan Hulu, 1 Mei 2011",9988776655,"Jl. Lintas",password=abc123\n`;

  const result = await parseCSV(csv);
  const [user] = result.users;

  assert.equal(validateCardUser(user).isValid, true);
  assert.equal(user.qr_value, '9988776655');
  assert.deepEqual(result.privacyReport.qrSensitiveRows, [1]);
  assert.deepEqual(result.privacyReport.sensitiveColumns, []);
  assertNoForbiddenValues(result);
});

test('keeps required-field validation failures visible', async () => {
  const csv = `nama,ttl,nisn,alamat\n,,,\nSiswa Tanpa NISN,"Rambah, 10 Januari 2011",,"Jl. Pendidikan"\nSiswa Tanpa Alamat,"Rambah, 10 Januari 2011",1234567890,\n`;

  const { users } = await parseCSV(csv);
  const report = validateUsers(users);

  assert.equal(users.length, 2);
  assert.equal(report.validCount, 0);
  assert.equal(report.invalidCount, 2);
  assert.ok(report.invalidUsers[0].errors.some((error) => error.includes('NISN')));
  assert.ok(report.invalidUsers[1].errors.some((error) => error.includes('Alamat')));
});
