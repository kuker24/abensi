import { FormEvent, useState } from 'react';
import { Button, Card, Input, ThemeToggle } from '../components/ui';

interface Props {
  onSubmit: (username: string, password: string) => Promise<void>;
  mode: 'dark' | 'light';
  onToggleTheme: () => void;
}

export function LoginPage({ onSubmit, mode, onToggleTheme }: Props) {
  const [username, setUsername] = useState('admin.tu');
  const [password, setPassword] = useState('Admin#12345');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});

  function validateFields() {
    const nextErrors: { username?: string; password?: string } = {};
    if (username.trim().length < 3) nextErrors.username = 'Username minimal 3 karakter.';
    if (password.length < 8) nextErrors.password = 'Password minimal 8 karakter.';
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateFields()) return;
    setLoading(true);
    setError(null);

    try {
      await onSubmit(username, password);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Login gagal. Periksa kredensial Anda.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-root">
      <section className="login-hero">
        <small>SchoolHub e-Hadir</small>
        <h1>Kehadiran digital 2-lapis untuk madrasah modern.</h1>
        <p>
          Pantau tap gerbang, sesi kelas, dan anomali rekonsiliasi dalam satu panel operasional.
        </p>
      </section>

      <Card className="login-card" variant="glass">
        <header className="login-header">
          <div>
            <h2>Masuk ke Sistem</h2>
            <p>Admin/TU, Guru, Operator, atau Siswa</p>
          </div>
          <ThemeToggle mode={mode} onToggle={onToggleTheme} />
        </header>

        <form onSubmit={handleSubmit} className="login-form">
          <div>
            <label htmlFor="username">Username</label>
            <Input id="username" value={username} onChange={setUsername} error={fieldErrors.username} required />
            {fieldErrors.username ? <small className="text-error">{fieldErrors.username}</small> : null}
          </div>

          <div>
            <label htmlFor="password">Password</label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={setPassword}
              error={fieldErrors.password}
              required
            />
            {fieldErrors.password ? <small className="text-error">{fieldErrors.password}</small> : null}
          </div>

          {error ? <p className="text-error">{error}</p> : null}

          <Button type="submit" size="lg" disabled={loading}>
            {loading ? 'Memproses...' : 'Masuk'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
