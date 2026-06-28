import { expect, test } from '@playwright/test';
import { createHmac } from 'node:crypto';

const rawApiBaseURL = process.env.FULL_STACK_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1/';
const apiBaseURL = rawApiBaseURL.endsWith('/') ? rawApiBaseURL : `${rawApiBaseURL}/`;
const adminPassword = process.env.FULL_STACK_ADMIN_PASSWORD ?? 'Admin#12345678';
const defaultPassword = process.env.FULL_STACK_DEFAULT_PASSWORD ?? 'User#12345678';
const workerToken = process.env.FULL_STACK_WORKER_TOKEN ?? 'full-stack-worker-token-with-redis-nonce-32chars';

function setCookieHeaders(response: { headersArray(): Array<{ name: string; value: string }> }) {
  return response.headersArray().filter((header) => header.name.toLowerCase() === 'set-cookie').map((header) => header.value);
}

function expectCookieFlag(cookies: string[], name: string, flag: string) {
  const cookie = cookies.find((item) => item.startsWith(`${name}=`));
  expect(cookie, `${name} cookie should be set`).toBeTruthy();
  expect(cookie!.toLowerCase()).toContain(flag.toLowerCase());
}

function cookiePair(cookies: string[], name: string) {
  const cookie = cookies.find((item) => item.startsWith(`${name}=`));
  expect(cookie, `${name} cookie should be set`).toBeTruthy();
  return cookie!.split(';')[0];
}

function signWorker(path: string, nonce: string) {
  const timestamp = new Date().toISOString();
  const signature = createHmac('sha256', workerToken).update(`${timestamp}.${nonce}.POST.${path}`).digest('hex');
  return {
    'x-worker-token': workerToken,
    'x-worker-timestamp': timestamp,
    'x-worker-nonce': nonce,
    'x-worker-signature': signature
  };
}

test.describe('real full-stack auth, cookies, and CSRF', () => {
  test('login sets HttpOnly/SameSite cookies, auth/me works, CSRF blocks unsafe mutation, logout clears session', async ({ playwright }) => {
    const context = await playwright.request.newContext({ baseURL: apiBaseURL });

    const login = await context.post('auth/login', {
      data: { username: 'admin.tu', password: adminPassword, expectedRole: 'admin' }
    });
    expect(login.ok()).toBeTruthy();
    const cookies = setCookieHeaders(login);
    expectCookieFlag(cookies, 'schoolhub_access_token', 'HttpOnly');
    expectCookieFlag(cookies, 'schoolhub_access_token', 'SameSite=Lax');
    expectCookieFlag(cookies, 'schoolhub_refresh_token', 'HttpOnly');
    expectCookieFlag(cookies, 'schoolhub_refresh_token', 'SameSite=Lax');
    if (process.env.EXPECT_SECURE_COOKIES === 'true') {
      expectCookieFlag(cookies, 'schoolhub_access_token', 'Secure');
      expectCookieFlag(cookies, 'schoolhub_refresh_token', 'Secure');
    }

    const me = await context.get('auth/me');
    expect(me.ok()).toBeTruthy();
    await expect(me.json()).resolves.toMatchObject({ user: { username: 'admin.tu', role: 'ADMIN_TU' } });

    const missingCsrf = await context.post('auth/logout');
    expect(missingCsrf.status()).toBe(403);

    await context.get('auth/csrf');
    const state = await context.storageState();
    const csrf = state.cookies.find((cookie) => cookie.name === 'schoolhub_csrf_token')?.value;
    expect(csrf).toBeTruthy();

    const logout = await context.post('auth/logout', { headers: { 'x-csrf-token': csrf! } });
    expect(logout.ok()).toBeTruthy();

    const afterLogout = await context.get('auth/me');
    expect(afterLogout.status()).toBe(401);
    await context.dispose();
  });

  test('login rejects invalid password, role mismatch, and inactive account without localStorage seeding', async ({ playwright }) => {
    const context = await playwright.request.newContext({ baseURL: apiBaseURL });

    await expect((await context.post('auth/login', { data: { username: 'admin.tu', password: 'wrong-password', expectedRole: 'admin' } })).status()).toBe(401);
    await expect((await context.post('auth/login', { data: { username: 'guru.matematika', password: defaultPassword, expectedRole: 'admin' } })).status()).toBe(401);
    await expect((await context.post('auth/login', { data: { username: 'operator.it', password: defaultPassword, expectedRole: 'admin' } })).status()).toBe(401);
    await context.dispose();
  });

  test('student self-report is available only through real cookie login', async ({ playwright }) => {
    const context = await playwright.request.newContext({ baseURL: apiBaseURL });
    const login = await context.post('auth/login', {
      data: { username: 'siswa.citra', password: defaultPassword, expectedRole: 'siswa' }
    });
    expect(login.ok()).toBeTruthy();

    const selfReport = await context.get('reports/my-attendance?days=14');
    expect(selfReport.ok()).toBeTruthy();
    await context.dispose();
  });

  test('browser form login starts unauthenticated and uses server cookies, not pre-seeded localStorage', async ({ page, context }) => {
    await page.goto('/siab2/login');
    await expect(page).toHaveURL(/\/siab2\/login$/);
    await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible();
    await expect(page.evaluate(() => window.localStorage.getItem('schoolhub_user'))).resolves.toBeNull();

    await expect(page.getByRole('tab', { name: 'Guru' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('textbox', { name: 'Nama akun Guru' }).fill('guru.matematika');
    await page.getByRole('textbox', { name: 'Kata Sandi' }).fill(defaultPassword);
    await page.getByRole('button', { name: /Masuk/ }).click();
    await expect(page).toHaveURL(/\/guru\//);

    const apiCookies = await context.cookies(apiBaseURL);
    expect(apiCookies.find((cookie) => cookie.name === 'schoolhub_access_token')?.httpOnly).toBe(true);
    expect(apiCookies.find((cookie) => cookie.name === 'schoolhub_refresh_token')?.httpOnly).toBe(true);
    const me = await context.request.get(`${apiBaseURL}auth/me`);
    expect(me.ok()).toBeTruthy();
    await expect(me.json()).resolves.toMatchObject({ user: { username: 'guru.matematika', role: 'GURU_MAPEL' } });
  });

  test('refresh token reuse revokes the token family with real PostgreSQL session state', async ({ playwright }) => {
    const context = await playwright.request.newContext({ baseURL: apiBaseURL });
    const login = await context.post('auth/login', {
      data: { username: 'admin.tu', password: adminPassword, expectedRole: 'admin' }
    });
    expect(login.ok()).toBeTruthy();
    const initialCookies = setCookieHeaders(login);
    const oldRefreshCookie = cookiePair(initialCookies, 'schoolhub_refresh_token');

    const refresh = await context.post('auth/refresh');
    expect(refresh.ok()).toBeTruthy();

    const replayContext = await playwright.request.newContext({ baseURL: apiBaseURL, extraHTTPHeaders: { cookie: oldRefreshCookie } });
    const replay = await replayContext.post('auth/refresh');
    expect(replay.status()).toBe(401);

    const afterReplay = await context.get('auth/me');
    expect(afterReplay.status()).toBe(401);
    await replayContext.dispose();
    await context.dispose();
  });

  test('internal worker endpoint requires signed requests and Redis-backed nonce replay protection', async ({ playwright }) => {
    const context = await playwright.request.newContext({ baseURL: apiBaseURL });
    const path = '/api/v1/internal/reconciliation/run';
    const headers = signWorker(path, `full-stack-${Date.now()}`);

    const first = await context.post('internal/reconciliation/run', { headers });
    expect(first.ok()).toBeTruthy();

    const replay = await context.post('internal/reconciliation/run', { headers });
    expect(replay.status()).toBe(403);

    const tampered = await context.post('internal/reconciliation/run', { headers: { ...headers, 'x-worker-signature': 'bad' } });
    expect(tampered.status()).toBe(403);
    await context.dispose();
  });

  test('live monitor SSE authenticates with real cookies and emits an initial snapshot', async ({ context }) => {
    const login = await context.request.post(`${apiBaseURL}auth/login`, {
      data: { username: 'admin.tu', password: adminPassword, expectedRole: 'admin' }
    });
    expect(login.ok()).toBeTruthy();

    const page = await context.newPage();
    await page.goto('/login');
    const message = await page.evaluate((streamUrl) => new Promise<{ type: string; payloadKeys: string[] }>((resolve, reject) => {
      const source = new EventSource(streamUrl, { withCredentials: true });
      const timeout = window.setTimeout(() => {
        source.close();
        reject(new Error('Timed out waiting for live monitor snapshot'));
      }, 10_000);
      source.addEventListener('snapshot', (event) => {
        window.clearTimeout(timeout);
        source.close();
        const parsed = JSON.parse((event as MessageEvent).data);
        resolve({ type: event.type, payloadKeys: Object.keys(parsed) });
      });
      source.onerror = () => {
        window.clearTimeout(timeout);
        source.close();
        reject(new Error('SSE connection failed'));
      };
    }), `${apiBaseURL}reports/live-monitor/stream?limit=1`);
    await page.close();

    expect(message.type).toBe('snapshot');
    expect(message.payloadKeys.length).toBeGreaterThan(0);
  });
});
