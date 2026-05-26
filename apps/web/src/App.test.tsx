import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  it('renders the e-Hadir login screen without prefilling the password', () => {
    mockStorage();
    window.history.replaceState({}, '', '/login');
    render(<App />);
    expect(screen.getAllByText(/e-Hadir/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/ABSENSI SEKOLAH DIGITAL/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Masukkan nama akun')).toHaveValue('');
    expect(screen.getByPlaceholderText('Masukkan kata sandi')).toHaveValue('');
    expect(screen.queryByText(/password admin|password guru|password siswa/i)).not.toBeInTheDocument();
  });

  it('logs in admin and routes to dashboard', async () => {
    mockStorage();
    window.history.replaceState({}, '', '/login');
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ accessToken: 'token', user: { id: 'u1', username: 'admin', fullName: 'Admin TU', role: 'ADMIN_TU' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    ) as any;

    render(<App />);
    fireEvent.click(screen.getAllByText('Admin/TU')[0]);
    fireEvent.change(screen.getByPlaceholderText('Masukkan nama akun'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText('Masukkan kata sandi'), { target: { value: 'sandi-test-aman' } });
    fireEvent.click(screen.getByRole('button', { name: /Masuk/i }));
    await waitFor(() => expect(window.location.pathname).toBe('/admin/dashboard'));
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/auth/login', expect.objectContaining({
      body: JSON.stringify({ username: 'admin', password: 'sandi-test-aman', expectedRole: 'admin' })
    }));
  });

  it('rejects login when selected tab does not match the account role', async () => {
    mockStorage();
    window.history.replaceState({}, '', '/login');
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/logout')) {
        return new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ accessToken: 'token', user: { id: 'u1', username: 'admin', fullName: 'Admin TU', role: 'ADMIN_TU' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as any;

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('Masukkan nama akun'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText('Masukkan kata sandi'), { target: { value: 'sandi-test-aman' } });
    fireEvent.click(screen.getByRole('button', { name: /Masuk/i }));

    await waitFor(() => expect(screen.getByText(/terdaftar sebagai Admin\/TU, bukan Guru/i)).toBeInTheDocument());
    expect(window.location.pathname).toBe('/login');
    expect(window.localStorage.getItem('schoolhub_user')).toBeNull();
  });

  it('shows a friendly role mismatch message when the backend rejects expectedRole', async () => {
    mockStorage();
    window.history.replaceState({}, '', '/login');
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ message: 'Akun tidak sesuai pilihan peran.' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    })) as any;

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('Masukkan nama akun'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText('Masukkan kata sandi'), { target: { value: 'sandi-test-aman' } });
    fireEvent.click(screen.getByRole('button', { name: /Masuk/i }));

    await waitFor(() => expect(screen.getByText(/Akun ini bukan akun Guru/i)).toBeInTheDocument());
    expect(window.location.pathname).toBe('/login');
    expect(window.localStorage.getItem('schoolhub_user')).toBeNull();
  });
});
