import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_OFFICIAL_CARD_RESULT_MESSAGE,
  buildSiab2CardExportPath,
  buildSiab2CardLoadMessage,
  buildSiab2CardLoadScope,
  fetchRequiredSiab2Cards,
  fetchSiab2Cards,
  mapSiab2CardsPayload,
} from './siab2Cards.js';

test('builds official SIAB2 card export endpoints without putting QR data in URL', () => {
  assert.equal(buildSiab2CardExportPath(), '/qr-credentials/export/cards');
  assert.equal(buildSiab2CardExportPath({ classId: 'kelas 7A' }), '/qr-credentials/export/class/kelas%207A/cards');
  assert.equal(buildSiab2CardExportPath({ userId: 'user-1', classId: 'kelas-1' }), '/qr-credentials/export/users/user-1/card');
});

test('manual DB card load ignores stale class/user URL scope and fetches all cards', () => {
  const scope = buildSiab2CardLoadScope({ mode: 'manual', classId: 'stale-class', userId: 'stale-user' });

  assert.deepEqual(scope, { classId: '', userId: '' });
  assert.equal(buildSiab2CardExportPath(scope), '/qr-credentials/export/cards');
  assert.equal(buildSiab2CardLoadMessage({ count: 312, ...scope }), 'Data resmi dari database dimuat: 312 kartu.');
});

test('autoLoad keeps class/user URL scope for deep-link exports', () => {
  const classScope = buildSiab2CardLoadScope({ mode: 'auto', classId: 'kelas 7A', userId: '' });
  const userScope = buildSiab2CardLoadScope({ mode: 'auto', classId: 'kelas-1', userId: 'user-1' });

  assert.equal(buildSiab2CardExportPath(classScope), '/qr-credentials/export/class/kelas%207A/cards');
  assert.equal(buildSiab2CardLoadMessage({ count: 31, ...classScope }), 'Data resmi kelas dimuat: 31 kartu.');
  assert.equal(buildSiab2CardExportPath(userScope), '/qr-credentials/export/users/user-1/card');
  assert.equal(buildSiab2CardLoadMessage({ count: 1, ...userScope }), 'Data resmi pengguna dimuat: 1 kartu.');
});

test('maps student cards with dynamic class from official export data', () => {
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

  assert.equal(users.length, 2);
  assert.equal(users[0].nama, 'Aisyah Putri');
  assert.equal(users[0].role, 'student');
  assert.equal(users[0].kelas, 'X A · IPA');
  assert.equal(users[0].qr_value, 'schoolhub:qr:v1:QR_ABCDEFGHIJKL');
  assert.equal(users[0].card_source, 'database');
  assert.equal(users[0].card_source_label, 'RESMI / DATABASE');
  assert.equal(users[0].is_official, 'true');
  assert.equal(users[1].role, 'teacher');
  assert.equal(users[1].kelas, 'Guru Piket');
});

test('maps official teacher card as teacher and prefers NIP over student-only identity fields', () => {
  const [teacher] = mapSiab2CardsPayload({
    generatedAt: '2026-07-02T00:00:00.000Z',
    cards: [
      {
        id: 'cred-teacher',
        userId: 'teacher-1',
        nama: 'Guru Satu',
        username: 'guru.satu',
        nip: '198001012006041001',
        nisn: null,
        role: 'GURU_MAPEL',
        roleLabel: 'Guru',
        displayRole: 'Guru',
        level: 'Guru / Pegawai MAN 1 Rokan Hulu',
        qr_value: 'schoolhub:qr:v1:QR_ZYXWVUTSRQPO',
      },
    ],
  });

  assert.equal(teacher.role, 'teacher');
  assert.equal(teacher.nisn, '198001012006041001');
  assert.equal(teacher.kelas, 'Guru / Pegawai MAN 1 Rokan Hulu');
});

test('rejects official card payloads that contain credential fields', () => {
  assert.throws(() => mapSiab2CardsPayload({
    cards: [{ nama: 'Aisyah', nisn: '1', passwordHash: 'secret', qr_value: 'schoolhub:qr:v1:QR_ABCDEFGHIJKL' }],
  }), /field kredensial terlarang/i);
});

test('manual DB load fetches all cards even when stale URL scope exists', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ cards: [{ nama: 'Aisyah', nisn: '1', role: 'SISWA', qr_value: 'schoolhub:qr:v1:QR_ABCDEFGHIJKL' }] }), { status: 200 });
  };

  const scope = buildSiab2CardLoadScope({ mode: 'manual', classId: 'stale-class', userId: 'stale-user' });
  const result = await fetchRequiredSiab2Cards({ ...scope, apiBase: '/api/v1', fetchImpl });

  assert.equal(calls[0].url, '/api/v1/qr-credentials/export/cards');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(result.users.length, 1);
});

test('autoLoad scoped DB loads keep class and user endpoints', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return new Response(JSON.stringify({ cards: [{ nama: 'Aisyah', nisn: '1', role: 'SISWA', qr_value: 'schoolhub:qr:v1:QR_ABCDEFGHIJKL' }] }), { status: 200 });
  };

  await fetchRequiredSiab2Cards({ ...buildSiab2CardLoadScope({ mode: 'auto', classId: 'kelas 7A' }), apiBase: '/api/v1', fetchImpl });
  await fetchRequiredSiab2Cards({ ...buildSiab2CardLoadScope({ mode: 'auto', userId: 'user-1' }), apiBase: '/api/v1', fetchImpl });

  assert.deepEqual(calls, [
    '/api/v1/qr-credentials/export/class/kelas%207A/cards',
    '/api/v1/qr-credentials/export/users/user-1/card',
  ]);
});

test('empty official card response throws actionable error instead of silent zero success', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ cards: [] }), { status: 200 });

  await assert.rejects(
    () => fetchRequiredSiab2Cards({ apiBase: '/api/v1', fetchImpl }),
    (error) => error.message === EMPTY_OFFICIAL_CARD_RESULT_MESSAGE,
  );
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
