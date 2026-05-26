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
  it('renders the e-Hadir login screen', () => {
    mockStorage();
    window.history.replaceState({}, '', '/login');
    render(<App />);
    expect(screen.getAllByText(/e-Hadir/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/ABSENSI SEKOLAH DIGITAL/i)).toBeInTheDocument();
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
    fireEvent.change(screen.getByPlaceholderText('Masukkan kata sandi'), { target: { value: 'sandi-test-aman' } });
    fireEvent.click(screen.getByRole('button', { name: /Masuk/i }));
    await waitFor(() => expect(window.location.pathname).toBe('/admin/dashboard'));
  });
});
