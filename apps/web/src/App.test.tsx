import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import indexHtml from '../index.html?raw';
import manifestRaw from '../public/site.webmanifest?raw';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@workos-inc/authkit-react', () => ({
  useAuth: () => ({
    isLoading: false,
    user: null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    getAccessToken: vi.fn(),
    organizationId: null,
    role: null,
    permissions: []
  }),
  AuthKitProvider: ({ children }: { children: ReactNode }) => children
}));

import { App } from './App';

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

afterEach(() => cleanup());

describe('PRD v2.2 UI shell', () => {
  it('keeps static PWA branding on the approved SIAB2 identity', () => {
    const manifest = JSON.parse(manifestRaw) as { name: string; short_name: string; description: string };

    expect(indexHtml).toContain('<title>SIAB2 · Sistem Informasi Akademik Berkarakter</title>');
    expect(manifest.name).toBe('SIAB2');
    expect(manifest.short_name).toBe('SIAB2');
    expect(manifest.description).toContain('Sistem Informasi Akademik Berkarakter');
  });

  it('redirects legacy /login to the canonical scoped SIAB2 login without prefilling the password', async () => {
    mockStorage();
    window.history.replaceState({}, '', '/login');
    const { container } = render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/siab2/login'));
    expect(container.querySelector('.login-left')).not.toBeInTheDocument();
    expect(screen.getAllByText(/SIAB2/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sistem Informasi Akademik Berkarakter/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/SchoolHub|e-Hadir|School Hub/i)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Masukkan nama akun')).toHaveValue('');
    expect(screen.getByPlaceholderText('Masukkan kata sandi')).toHaveValue('');
    expect(screen.queryByText(/password admin|password guru|password siswa/i)).not.toBeInTheDocument();
  });

  it('renders /siab2 as the canonical SIAB2 landing with a scoped login CTA', async () => {
    mockStorage();
    window.history.replaceState({}, '', '/siab2');
    render(<App />);

    expect(await screen.findByRole('main', { name: /SIAB2 Sistem Informasi Akademik Berkarakter/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Masuk SIAB2/i })).toHaveAttribute('href', '/siab2/login');
    expect(screen.getByRole('img', { name: /Foto grup resmi MAN 1 Rokan Hulu/i })).toHaveAttribute('src', '/man1-rohul-hero-group.jpeg');
    expect(screen.getByText(/Dokumentasi Madrasah/i)).toBeInTheDocument();
    expect(screen.queryByText(/Profil Resmi Madrasah/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/JL\.TUANKU TAMBUSAI NO\.183/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/07627393218/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/manpasir675027@yahoo\.co\.id/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Data Contoh|Mode Preview|Preview Build|Notifikasi rapi|Akses cepat|Data akademik terkelola/i)).not.toBeInTheDocument();
  });

  it('redirects /siab2-preview to canonical /siab2 instead of rendering an active preview route', async () => {
    mockStorage();
    window.history.replaceState({}, '', '/siab2-preview');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/siab2'));
    expect(await screen.findByRole('main', { name: /SIAB2 Sistem Informasi Akademik Berkarakter/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Masuk SIAB2/i })).toHaveAttribute('href', '/siab2/login');
  });

  it('renders /siab2/login as focused scoped login while preserving auth payload', async () => {
    mockStorage();
    window.history.replaceState({}, '', '/siab2/login');
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ user: { id: 'u1', username: 'admin', fullName: 'Admin TU', role: 'ADMIN_TU' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    ) as any;

    const { container } = render(<App />);
    expect(container.querySelector('.login-left')).not.toBeInTheDocument();
    expect(container.querySelector('.login-card')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tentang SIAB2/i })).toHaveAttribute('href', '/siab2');
    expect(screen.queryByText(/Notifikasi rapi|Akses cepat|Data akademik terkelola/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Admin/TU')[0]);
    fireEvent.change(screen.getByPlaceholderText('Masukkan nama akun'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText('Masukkan kata sandi'), { target: { value: 'sandi-test-aman' } });
    fireEvent.click(screen.getByRole('button', { name: /^Masuk$/i }));

    await waitFor(() => expect(window.location.pathname).toBe('/admin/dashboard'));
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/auth/login', expect.objectContaining({
      body: JSON.stringify({ username: 'admin', password: 'sandi-test-aman', expectedRole: 'admin' })
    }));
  });

  it('logs in admin and routes to dashboard', async () => {
    mockStorage();
    window.history.replaceState({}, '', '/siab2/login');
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ user: { id: 'u1', username: 'admin', fullName: 'Admin TU', role: 'ADMIN_TU' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    ) as any;

    render(<App />);
    fireEvent.click(screen.getAllByText('Admin/TU')[0]);
    fireEvent.change(screen.getByPlaceholderText('Masukkan nama akun'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText('Masukkan kata sandi'), { target: { value: 'sandi-test-aman' } });
    fireEvent.click(screen.getByRole('button', { name: /^Masuk$/i }));
    await waitFor(() => expect(window.location.pathname).toBe('/admin/dashboard'));
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/auth/login', expect.objectContaining({
      body: JSON.stringify({ username: 'admin', password: 'sandi-test-aman', expectedRole: 'admin' })
    }));
  });

  it('rejects login when selected tab does not match the account role', async () => {
    mockStorage();
    window.history.replaceState({}, '', '/siab2/login');
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/logout')) {
        return new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ user: { id: 'u1', username: 'admin', fullName: 'Admin TU', role: 'ADMIN_TU' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as any;

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('Masukkan nama akun'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText('Masukkan kata sandi'), { target: { value: 'sandi-test-aman' } });
    fireEvent.click(screen.getByRole('button', { name: /^Masuk$/i }));

    await waitFor(() => expect(screen.getByText(/terdaftar sebagai Admin\/TU, bukan Guru/i)).toBeInTheDocument());
    expect(window.location.pathname).toBe('/siab2/login');
    expect(window.localStorage.getItem('schoolhub_user')).toBeNull();
  });

  it('shows a friendly role mismatch message when the backend rejects expectedRole', async () => {
    mockStorage();
    window.history.replaceState({}, '', '/siab2/login');
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ message: 'Akun tidak sesuai pilihan peran.' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    })) as any;

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('Masukkan nama akun'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText('Masukkan kata sandi'), { target: { value: 'sandi-test-aman' } });
    fireEvent.click(screen.getByRole('button', { name: /^Masuk$/i }));

    await waitFor(() => expect(screen.getByText(/Akun ini bukan akun Guru/i)).toBeInTheDocument());
    expect(window.location.pathname).toBe('/siab2/login');
    expect(window.localStorage.getItem('schoolhub_user')).toBeNull();
  });

  it('maps invalid login credentials to operator-friendly Indonesian copy', async () => {
    mockStorage();
    window.history.replaceState({}, '', '/siab2/login');
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ message: 'Username atau password salah.' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    })) as any;

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('Masukkan nama akun'), { target: { value: 'akun-salah' } });
    fireEvent.change(screen.getByPlaceholderText('Masukkan kata sandi'), { target: { value: 'sandi-salah' } });
    fireEvent.click(screen.getByRole('button', { name: /^Masuk$/i }));

    await waitFor(() => expect(screen.getByText('Nama akun atau kata sandi salah.')).toBeInTheDocument());
    expect(screen.queryByText(/401|Unauthorized|stack|JSON/i)).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/siab2/login');
  });

  it('keeps student attendance read-only and does not expose a self check-in route', async () => {
    const storage = mockStorage();
    const student = { id: 's1', username: 'siswa', fullName: 'Siswa Demo', role: 'SISWA' };
    storage.setItem('schoolhub_user', JSON.stringify(student));
    window.history.replaceState({}, '', '/siswa/check-in');
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return new Response(JSON.stringify({ user: student }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.endsWith('/health/live')) {
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as any;

    render(<App />);

    await waitFor(() => expect(screen.getByText(/Menu ini belum tersedia/i)).toBeInTheDocument());
    expect(screen.queryByText(/Mulai Absen Masuk/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Check.?in/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('Kehadiran Saya').length).toBeGreaterThan(0);
  });
});
