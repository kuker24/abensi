import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_EXPIRED_EVENT, USER_KEY, apiDownload, apiFetch, formatDateTime, today } from './api';

function mockStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => map.set(key, String(value))),
    removeItem: vi.fn((key: string) => map.delete(key)),
    clear: vi.fn(() => map.clear())
  };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  return storage;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Jakarta date helpers', () => {
  it('formats dates with school timezone independent of browser timezone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T17:30:00.000Z'));

    expect(today()).toBe('2027-01-01');
    expect(formatDateTime('2026-06-14T00:15:00.000Z')).toContain('07.15');
  });
});

describe('apiDownload official report downloads', () => {
  it('downloads server Blob responses using Content-Disposition filename and server Content-Type', async () => {
    const createObjectURL = vi.fn(() => 'blob:report-download');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('PK official workbook', {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="recap_classes_resmi.xlsx"'
      }
    })));

    const result = await apiDownload('/reports/export?reportType=recap_classes&format=xlsx', 'fallback.xlsx');

    expect(fetch).toHaveBeenCalledWith('/api/v1/reports/export?reportType=recap_classes&format=xlsx', expect.objectContaining({
      credentials: 'include',
      headers: { accept: '*/*' }
    }));
    expect(result.filename).toBe('recap_classes_resmi.xlsx');
    expect(result.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report-download');
  });
});

describe('apiFetch auth handling', () => {
  it('membersihkan sesi lokal dan memberi tahu app saat refresh gagal', async () => {
    const storage = mockStorage();
    storage.setItem(USER_KEY, JSON.stringify({ id: 'u1', role: 'ADMIN_TU' }));
    const onExpired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Sesi habis' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    })));

    await expect(apiFetch('/reports/dashboard')).rejects.toThrow('Sesi habis');
    expect(storage.getItem(USER_KEY)).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  });

  it('menggabungkan refresh paralel saat beberapa request mendapat 401', async () => {
    const storage = mockStorage();
    storage.setItem(USER_KEY, JSON.stringify({ id: 'u1', role: 'ADMIN_TU' }));
    let refreshCalls = 0;
    let reportCalls = 0;

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      reportCalls += 1;
      if (reportCalls <= 2) {
        return new Response(JSON.stringify({ message: 'Sesi habis' }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }));

    await expect(Promise.all([apiFetch('/reports/dashboard'), apiFetch('/reports/dashboard')])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1);
    expect(reportCalls).toBe(4);
  });
});
