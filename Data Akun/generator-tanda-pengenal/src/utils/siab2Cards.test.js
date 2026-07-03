import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSiab2CardExportPath,
  fetchSiab2Cards,
  mapSiab2CardsPayload,
} from './siab2Cards.js';

test('builds official SIAB2 card export endpoints without putting QR data in URL', () => {
  assert.equal(buildSiab2CardExportPath(), '/qr-credentials/export/cards');
  assert.equal(buildSiab2CardExportPath({ classId: 'kelas 7A' }), '/qr-credentials/export/class/kelas%207A/cards');
  assert.equal(buildSiab2CardExportPath({ userId: 'user-1', classId: 'kelas-1' }), '/qr-credentials/export/users/user-1/card');
});

test('maps student cards without class for stable identity card display', () => {
  const users = mapSiab2CardsPayload({
    generatedAt: '2026-07-02T00:00:00.000Z',
    cards: [
      {
        id: 'cred-1',
        userId: 'student-1',
        nama: 'Aisyah Putri',
        nisn: '1234567890',
        role: 'SISWA',
        roleLabel: 'SISWA',
        className: 'X A · IPA',
        qr_value: 'schoolhub:qr:v1:QR_ABCDEFGHIJKL',
        shortCode: 'ABCD12',
      },
      {
        id: 'cred-2',
        userId: 'teacher-1',
        nama: 'Budi Santoso',
        username: 'budi',
        role: 'GURU_MAPEL',
        className: 'Guru Piket',
        qr_value: 'schoolhub:qr:v1:QR_ZYXWVUTSRQPO',
      },
    ],
  });

  assert.equal(users[0].nama, 'Aisyah Putri');
  assert.equal(users[0].role, 'student');
  assert.equal(users[0].kelas, '');
  assert.equal(users[0].qr_value, 'schoolhub:qr:v1:QR_ABCDEFGHIJKL');
  assert.equal(users[0].card_source, 'database');
  assert.equal(users[0].card_source_label, 'RESMI / DATABASE');
  assert.equal(users[0].is_official, 'true');
  assert.equal(users[1].role, 'teacher');
  assert.equal(users[1].kelas, 'Guru Piket');
});

test('rejects official card payloads that contain credential fields', () => {
  assert.throws(() => mapSiab2CardsPayload({
    cards: [{ nama: 'Aisyah', nisn: '1', passwordHash: 'secret', qr_value: 'schoolhub:qr:v1:QR_ABCDEFGHIJKL' }],
  }), /field kredensial terlarang/i);
});

test('fetchSiab2Cards uses credentials and retries once after refresh', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
    if (url.endsWith('/auth/refresh')) return new Response('{}', { status: 200 });
    return new Response(JSON.stringify({ cards: [{ nama: 'Aisyah', nisn: '1', role: 'SISWA', qr_value: 'schoolhub:qr:v1:QR_ABCDEFGHIJKL' }] }), { status: 200 });
  };

  const result = await fetchSiab2Cards({ userId: 'student-1', apiBase: '/api/v1', fetchImpl });

  assert.equal(result.path, '/qr-credentials/export/users/student-1/card');
  assert.equal(result.users.length, 1);
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[1].url, '/api/v1/auth/refresh');
  assert.equal(calls[2].options.credentials, 'include');
});
