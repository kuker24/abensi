import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CARD_PIXEL_HEIGHT,
  CARD_PIXEL_WIDTH,
  getCardIdentityNumber,
  getCardLevel,
  getCardRoleLabel,
  getQrPayload,
} from './cardConfig.js';

test('official CR80 portrait render dimensions match centered QR card layout', () => {
  assert.equal(CARD_PIXEL_WIDTH, 324);
  assert.equal(CARD_PIXEL_HEIGHT, 514);
});

test('role labels map SIAB2 roles without falling back to username', () => {
  assert.equal(getCardRoleLabel({ role: 'SISWA' }), 'SISWA');
  assert.equal(getCardRoleLabel({ role: 'GURU_MAPEL' }), 'GURU');
  assert.equal(getCardRoleLabel({ role: 'GURU_PIKET' }), 'GURU PIKET');
  assert.equal(getCardRoleLabel({ role: 'ADMIN_TU' }), 'ADMIN TU');
  assert.equal(getCardRoleLabel({ role: 'OPERATOR_IT' }), 'OPERATOR IT');
  assert.equal(getCardRoleLabel({ role: 'KEPALA_SEKOLAH' }), 'KEPALA SEKOLAH');
});

test('identity number uses NIS/NISN for students and NIP for teachers when available', () => {
  assert.equal(getCardIdentityNumber({ role: 'SISWA', nis: '10203', username: 'siswa.login' }), '10203');
  assert.equal(getCardIdentityNumber({ role: 'GURU_MAPEL', nip: '19800101', username: 'guru.login' }), '19800101');
});

test('class and jabatan labels come from official export fields', () => {
  assert.equal(getCardLevel({ role: 'SISWA', className: 'X A · Kelas X A' }), 'X A · Kelas X A');
  assert.equal(getCardLevel({ role: 'GURU_MAPEL', level: 'Guru / Pegawai MAN 1 Rokan Hulu' }), 'Guru / Pegawai MAN 1 Rokan Hulu');
});

test('QR payload remains the opaque schoolhub QR value when supplied', () => {
  const payload = 'schoolhub:qr:v1:QR_ABCDEFGHIJKL';
  assert.equal(getQrPayload({ qrCode: payload }), payload);
});

test('IDCard source keeps QR in main panel before name band and has no legacy bottom QR row', () => {
  const source = readFileSync(new URL('./IDCard.jsx', import.meta.url), 'utf8');
  assert.match(source, /h-\[210px\][\s\S]*<QRCodeSVG/);
  assert.match(source, /<QRCodeSVG[\s\S]*h-\[96px\]/);
  assert.doesNotMatch(source, /grid-cols-\[1fr_52px\]/);
  assert.match(source, /KARTU TANDA PENGENAL RESMI/);
  assert.match(source, /Kartu Tanda Pengenal SIAB2/);
});
