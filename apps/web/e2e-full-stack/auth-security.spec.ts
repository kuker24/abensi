import { expect, test } from '@playwright/test';

const apiBaseURL = process.env.FULL_STACK_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';
const adminPassword = process.env.FULL_STACK_ADMIN_PASSWORD ?? 'Admin#12345678';
const defaultPassword = process.env.FULL_STACK_DEFAULT_PASSWORD ?? 'User#12345678';

function setCookieHeaders(response: { headersArray(): Array<{ name: string; value: string }> }) {
  return response.headersArray().filter((header) => header.name.toLowerCase() === 'set-cookie').map((header) => header.value);
}

function expectCookieFlag(cookies: string[], name: string, flag: string) {
  const cookie = cookies.find((item) => item.startsWith(`${name}=`));
  expect(cookie, `${name} cookie should be set`).toBeTruthy();
  expect(cookie!.toLowerCase()).toContain(flag.toLowerCase());
}

test.describe('real full-stack auth, cookies, and CSRF', () => {
  test('login sets HttpOnly/SameSite cookies, auth/me works, CSRF blocks unsafe mutation, logout clears session', async ({ playwright }) => {
    const context = await playwright.request.newContext({ baseURL: apiBaseURL });

    const login = await context.post('/auth/login', {
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

    const me = await context.get('/auth/me');
    expect(me.ok()).toBeTruthy();
    await expect(me.json()).resolves.toMatchObject({ user: { username: 'admin.tu', role: 'ADMIN_TU' } });

    const missingCsrf = await context.post('/auth/logout');
    expect(missingCsrf.status()).toBe(403);

    await context.get('/auth/csrf');
    const state = await context.storageState();
    const csrf = state.cookies.find((cookie) => cookie.name === 'schoolhub_csrf_token')?.value;
    expect(csrf).toBeTruthy();

    const logout = await context.post('/auth/logout', { headers: { 'x-csrf-token': csrf! } });
    expect(logout.ok()).toBeTruthy();

    const afterLogout = await context.get('/auth/me');
    expect(afterLogout.status()).toBe(401);
    await context.dispose();
  });

  test('login rejects invalid password, role mismatch, and inactive account without localStorage seeding', async ({ playwright }) => {
    const context = await playwright.request.newContext({ baseURL: apiBaseURL });

    await expect((await context.post('/auth/login', { data: { username: 'admin.tu', password: 'wrong-password', expectedRole: 'admin' } })).status()).toBe(401);
    await expect((await context.post('/auth/login', { data: { username: 'guru.matematika', password: defaultPassword, expectedRole: 'admin' } })).status()).toBe(401);
    await expect((await context.post('/auth/login', { data: { username: 'operator.it', password: defaultPassword, expectedRole: 'admin' } })).status()).toBe(401);
    await context.dispose();
  });

  test('student self-report is available only through real cookie login', async ({ playwright }) => {
    const context = await playwright.request.newContext({ baseURL: apiBaseURL });
    const login = await context.post('/auth/login', {
      data: { username: 'siswa.citra', password: defaultPassword, expectedRole: 'siswa' }
    });
    expect(login.ok()).toBeTruthy();

    const selfReport = await context.get('/reports/my-attendance?days=14');
    expect(selfReport.ok()).toBeTruthy();
    await context.dispose();
  });
});
