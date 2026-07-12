const CSRF_COOKIE = 'schoolhub_csrf_token';

const readCookie = (name) => {
  const prefix = `${name}=`;
  for (const entry of document.cookie.split(';')) {
    const cookie = entry.trim();
    if (!cookie.startsWith(prefix)) continue;
    return decodeURIComponent(cookie.slice(prefix.length));
  }
  return null;
};

export const getCsrfToken = async () => {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;

  const response = await fetch('/api/v1/auth/csrf', {
    headers: { accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`Gagal menyiapkan proteksi permintaan (HTTP ${response.status})`);

  const payload = await response.json();
  return readCookie(CSRF_COOKIE) || payload.csrfToken || null;
};
