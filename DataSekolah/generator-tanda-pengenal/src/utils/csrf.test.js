import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { getCsrfToken } from './csrf.js';

const originalDocument = globalThis.document;
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.document = originalDocument;
  globalThis.fetch = originalFetch;
});

test('uses an existing CSRF cookie without a network request', async () => {
  globalThis.document = { cookie: 'schoolhub_csrf_token=existing-token' };
  globalThis.fetch = async () => {
    throw new Error('CSRF endpoint must not be called when the cookie exists.');
  };

  assert.equal(await getCsrfToken(), 'existing-token');
});

test('fetches a CSRF token for an authenticated generator mutation', async () => {
  globalThis.document = { cookie: '' };
  let request;
  globalThis.fetch = async (input, options) => {
    request = { input, options };
    return {
      ok: true,
      json: async () => ({ csrfToken: 'fresh-token' }),
    };
  };

  assert.equal(await getCsrfToken(), 'fresh-token');
  assert.deepEqual(request, {
    input: '/api/v1/auth/csrf',
    options: {
      headers: { accept: 'application/json' },
      credentials: 'include',
    },
  });
});

test('rejects an unavailable CSRF endpoint before mutating QR credentials', async () => {
  globalThis.document = { cookie: '' };
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });

  await assert.rejects(getCsrfToken(), /HTTP 401/);
});
