import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listClassSessions } from '../lib/api';
import { formatDate, formatTime, toIsoDateLocal } from '../lib/format';
import type { SessionItem } from '../types/domain';
import { Button, Card, EmptyState, StatCard, StatusPill, Timeline } from '../components/ui';

export function TeacherDashboardPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listClassSessions(toIsoDateLocal());
        setSessions(data);
      } catch (err: any) {
        setError(err?.response?.data?.message ?? 'Gagal memuat sesi hari ini.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const nextSession = useMemo(() => {
    const now = Date.now();
    return sessions
      .filter((item) => new Date(item.endsAt).getTime() >= now)
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())[0];
  }, [sessions]);

  const stats = useMemo(() => {
    const openCount = sessions.filter((item) => item.status === 'OPEN').length;
    const closedCount = sessions.filter((item) => item.status === 'CLOSED').length;
    const scheduledCount = sessions.filter((item) => item.status === 'SCHEDULED').length;
    return { openCount, closedCount, scheduledCount };
  }, [sessions]);

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <p>{formatDate(new Date())}</p>
        <h2>Dasbor Guru</h2>
        <p>Kelola sesi kelas hari ini dengan alur cepat kurang dari 30 detik per kelas.</p>
      </Card>

      <section className="grid cols-4">
        <StatCard label="Sesi Hari Ini" value={sessions.length} hint="Total jadwal aktif" />
        <StatCard label="Sedang Berjalan" value={stats.openCount} tone="success" />
        <StatCard label="Sudah Selesai" value={stats.closedCount} tone="default" />
        <StatCard label="Masih Terjadwal" value={stats.scheduledCount} tone="warning" />
      </section>

      {nextSession ? (
        <Card variant="glass" className="next-session-card">
          <div>
            <h3>Sesi Selanjutnya</h3>
            <p>
              {nextSession.schoolClass.code} · {nextSession.subject.name}
            </p>
            <p>
              {formatTime(nextSession.startsAt)} - {formatTime(nextSession.endsAt)}
            </p>
          </div>
          <div className="action-row">
            <StatusPill status={nextSession.status} />
            <Link to={`/guru/presensi?sessionId=${nextSession.id}`}>
              <Button size="lg">Buka Input Presensi</Button>
            </Link>
          </div>
        </Card>
      ) : null}

      <Card>
        <h3>Linimasa Sesi Hari Ini</h3>
        {loading ? <p>Memuat sesi...</p> : null}
        {error ? <p className="text-error">{error}</p> : null}
        {!loading && sessions.length === 0 ? (
          <EmptyState
            title="Belum ada sesi"
            description="Sesi Anda belum terjadwal hari ini."
            action={
              <Link to="/guru/rekap">
                <Button variant="secondary">Lihat Rekap</Button>
              </Link>
            }
          />
        ) : (
          <Timeline
            items={sessions.map((session) => ({
              id: session.id,
              title: `${session.schoolClass.code} · ${session.subject.name}`,
              description: `${formatTime(session.startsAt)} - ${formatTime(session.endsAt)}`,
              badge: <StatusPill status={session.status} />,
              actions: (
                <Link to={`/guru/presensi?sessionId=${session.id}`}>
                  <Button variant="secondary" size="sm">
                    Kelola
                  </Button>
                </Link>
              )
            }))}
            emptyTitle="Belum ada sesi"
            emptyDescription="Sesi belum tersedia."
          />
        )}
      </Card>
    </div>
  );
}
