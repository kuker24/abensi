import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { labelForRole, labelForStatus } from '../lib/uiLabels';
import { SessionUser } from '../types/auth';

interface Props {
  user: SessionUser;
  onLogout: () => void;
}

export function DashboardPage({ user, onLogout }: Props) {
  const [dashboard, setDashboard] = useState<any>(null);
  const [flags, setFlags] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canSeeAnomaly = useMemo(() => ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET'].includes(user.role), [user.role]);

  useEffect(() => {
    async function load() {
      try {
        const [dashRes, sessionRes] = await Promise.all([
          api.get('/reports/dashboard'),
          api.get('/attendance/class-sessions')
        ]);

        setDashboard(dashRes.data);
        setSessions(sessionRes.data);

        if (canSeeAnomaly) {
          const flagRes = await api.get('/reconciliation/flags', { params: { status: 'OPEN' } });
          setFlags(flagRes.data);
        }
      } catch (err: any) {
        setError(err?.response?.data?.message ?? 'Gagal memuat data dashboard.');
      }
    }

    void load();
  }, [canSeeAnomaly]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>SchoolHub e-Hadir</h1>
          <p>
            {user.fullName} · {labelForRole(user.role)}
          </p>
        </div>
        <button onClick={onLogout}>Keluar</button>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="grid cards-4">
        <article className="card small">
          <h3>Sesi Hari Ini</h3>
          <strong>{dashboard?.sessionsToday ?? '-'}</strong>
        </article>
        <article className="card small">
          <h3>Cakupan Presensi</h3>
          <strong>{dashboard?.attendanceCoveragePercent ?? '-'}%</strong>
        </article>
        <article className="card small">
          <h3>Anomali Terbuka</h3>
          <strong>{dashboard?.anomalyOpenCount ?? '-'}</strong>
        </article>
        <article className="card small">
          <h3>Tap Gerbang Hari Ini</h3>
          <strong>{dashboard?.gateTapToday ?? '-'}</strong>
        </article>
      </section>

      <section className="grid two-cols">
        <article className="card">
          <h2>Sesi Kelas</h2>
          <table>
            <thead>
              <tr>
                <th>Kelas</th>
                <th>Mapel</th>
                <th>Guru</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td>{session.schoolClass.code}</td>
                  <td>{session.subject.name}</td>
                  <td>{session.teacher.fullName}</td>
                  <td>{labelForStatus(session.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="card">
          <h2>Papan Anomali</h2>
          {!canSeeAnomaly ? <p>Peran Anda tidak memiliki akses papan anomali.</p> : null}
          {canSeeAnomaly && flags.length === 0 ? <p>Tidak ada flag terbuka.</p> : null}
          {canSeeAnomaly && flags.length > 0 ? (
            <ul className="flag-list">
              {flags.map((flag) => (
                <li key={flag.id}>
                  <strong>{labelForStatus(flag.type)}</strong>
                  <span>{flag.user?.fullName}</span>
                  <small>{new Date(flag.createdAt).toLocaleString('id-ID')}</small>
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      </section>
    </main>
  );
}
