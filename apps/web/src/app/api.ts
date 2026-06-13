import type { PaginationMeta, RouteArea, User } from './types';

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
export const USER_KEY = 'schoolhub_user';
export const AUTH_EXPIRED_EVENT = 'schoolhub_auth_expired';

let refreshPromise: Promise<boolean> | null = null;
let csrfPromise: Promise<string | null> | null = null;

export function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function normalizeRole(apiRole?: string, fallback: RouteArea = 'admin'): RouteArea {
  if (apiRole === 'GURU_MAPEL') return 'guru';
  if (apiRole === 'SISWA') return 'siswa';
  if (apiRole === 'ADMIN_TU' || apiRole === 'OPERATOR_IT' || apiRole === 'GURU_PIKET' || apiRole === 'DEVELOPER') return 'admin';
  return fallback;
}

export function defaultPathFor(user?: User | null): string {
  if (user?.role === 'DEVELOPER') return '/admin/developer-control';
  if (user?.role === 'OPERATOR_IT') return '/admin/it-dashboard';
  if (user?.role === 'GURU_PIKET') return '/admin/picket-dashboard';
  const role = normalizeRole(user?.role, 'admin');
  if (role === 'guru') return '/guru/dashboard';
  if (role === 'siswa') return '/siswa/dashboard';
  return '/admin/dashboard';
}

export function pathArea(path: string): RouteArea {
  if (path.startsWith('/guru')) return 'guru';
  if (path.startsWith('/siswa')) return 'siswa';
  if (path.startsWith('/admin')) return 'admin';
  return 'public';
}

export function go(path: string): void {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function qs(params?: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : '';
}

function notifyAuthExpired(): void {
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const cookie = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function isUnsafeMethod(method?: string) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes((method || 'GET').toUpperCase());
}

async function ensureCsrfToken(): Promise<string | null> {
  const current = readCookie('schoolhub_csrf_token');
  if (current) return current;
  if (!csrfPromise) {
    csrfPromise = fetch(`${API_BASE}/auth/csrf`, { method: 'GET', headers: { accept: 'application/json' }, credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = await response.json().catch(() => null);
        return readCookie('schoolhub_csrf_token') || data?.csrfToken || null;
      })
      .catch(() => null)
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

async function refreshAuth(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, { method: 'POST', headers: { accept: 'application/json' }, credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return false;
        await response.json().catch(() => null);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', ...(options.headers as Record<string, string> | undefined) };
  if (options.body && !(options.body instanceof FormData)) headers['content-type'] = 'application/json';
  if (isUnsafeMethod(options.method) && path !== '/auth/login' && path !== '/auth/refresh') {
    const csrfToken = await ensureCsrfToken();
    if (csrfToken) headers['x-csrf-token'] = csrfToken;
  }
  let response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  const canRefresh = path !== '/auth/login' && path !== '/auth/refresh';
  let authExpiredNotified = false;
  if (response.status === 401 && canRefresh) {
    if (await refreshAuth()) {
      response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
    } else {
      notifyAuthExpired();
      authExpiredNotified = true;
    }
  }
  if (response.status === 401 && canRefresh && !authExpiredNotified) notifyAuthExpired();
  const contentType = response.headers.get('content-type') || '';
  const text = contentType.includes('application/json') ? await response.text() : '';
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(Array.isArray(data?.message) ? data.message.join(', ') : data?.message || `HTTP ${response.status}`);
  return data;
}

export async function apiDownload(path: string, filename = 'export.xlsx'): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include'
  });
  if (!response.ok) throw new Error(`Unduhan gagal HTTP ${response.status}`);
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const finalName = match?.[1] || filename;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = finalName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function itemsOf<T = any>(payload: any): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.roster)) return payload.roster;
  return [];
}

export function metaOf(payload: any): PaginationMeta {
  return payload?.meta || { page: 1, total: itemsOf(payload).length, totalPages: 1 };
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(value);
  }
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthNow(): string {
  return new Date().toISOString().slice(0, 7);
}

export function initials(name = 'User'): string {
  return String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase())
    .join('') || 'U';
}
