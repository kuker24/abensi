import assert from 'node:assert/strict';
import test from 'node:test';
import { bulkGenerateMissingQr } from './backendQr.js';

test('sends CSRF header for bulk QR generation', async () => {
  let request;
  const response = { ok: true };

  const result = await bulkGenerateMissingQr('csrf-token', async (input, options) => {
    request = { input, options };
    return response;
  });

  assert.equal(result, response);
  assert.deepEqual(request, {
    input: '/api/v1/qr-credentials/bulk-generate',
    options: {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-csrf-token': 'csrf-token',
      },
      credentials: 'include',
      body: JSON.stringify({ label: 'QR Absensi SIAB2', onlyMissing: true }),
    },
  });
});

test('does not mutate QR credentials when CSRF token is unavailable', async () => {
  let mutationCalled = false;

  await assert.rejects(
    bulkGenerateMissingQr(null, async () => {
      mutationCalled = true;
      return { ok: true };
    }),
    /Sesi keamanan tidak tersedia/,
  );

  assert.equal(mutationCalled, false);
});
