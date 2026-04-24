import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard, getLiveMonitor, getTrend } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { DashboardData, LiveFeedItem, TrendItem } from '../types/domain';
import {
  Button,
  Card,
  EmptyState,
  StatCard,
  StatusPill,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Timeline
} from '../components/ui';

export function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [trend, setTrend] = useState<TrendItem[]>([]);
  const [feed, setFeed] = useState<LiveFeedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [dash, trendData, monitor] = await Promise.all([getDashboard(), getTrend(7), getLiveMonitor(8)]);
        setDashboard(dash);
        setTrend(trendData.items);
        setFeed(monitor.items);
      } catch (err: any) {
        setError(err?.response?.data?.message ?? 'Gagal memuat dasbor admin.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Dasbor Admin/TU</h2>
        <p>Ringkasan operasional hari ini: sesi, cakupan, anomali, dan aktivitas gerbang.</p>
      </Card>

      <section className="grid cols-4">
        <StatCard label="Sesi Hari Ini" value={dashboard?.sessionsToday ?? '-'} />
        <StatCard
          label="Cakupan Presensi"
          value={`${dashboard?.attendanceCoveragePercent ?? '-'}%`}
          tone="success"
        />
        <StatCard label="Anomali Terbuka" value={dashboard?.anomalyOpenCount ?? '-'} tone="warning" />
        <StatCard label="Guru Hadir" value={dashboard?.teacherPresenceCount ?? '-'} />
      </section>

      <section className="grid cols-2">
        <Card>
          <div className="section-header">
            <h3>Tren 7 Hari Terakhir</h3>
            <Link to="/admin/laporan">
              <Button variant="secondary" size="sm">
                Buka Laporan
              </Button>
            </Link>
          </div>
          {loading ? <p>Memuat tren...</p> : null}
          {trend.length === 0 ? (
            <EmptyState title="Belum ada data tren" description="Data akan muncul setelah sesi berjalan." />
          ) : (
            <ul className="trend-list">
              {trend.map((item) => (
                <li key={item.date}>
                  <div>
                    <strong>{item.date}</strong>
                    <p>
                      Sesi {item.sessions} · Selesai {item.closed} · Anomali {item.anomalies}
                    </p>
                  </div>
                  <div className="trend-bar-wrap">
                    <div className="trend-bar" style={{ width: `${Math.min(item.coveragePercent, 100)}%` }} />
                    <span>{item.coveragePercent}%</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="section-header">
            <h3>Pemantauan Langsung (Ringkas)</h3>
            <Link to="/admin/live-monitor">
              <Button variant="secondary" size="sm">
                Layar Penuh
              </Button>
            </Link>
          </div>

          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">Linimasa</TabsTrigger>
              <TabsTrigger value="compact">Ringkas</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline">
              {feed.length === 0 ? (
                <EmptyState title="Belum ada feed" description="Aktivitas realtime akan tampil di sini." />
              ) : (
                <Timeline
                  items={feed.map((item, index) => ({
                    id: `${item.timestamp}-${index}`,
                    title: item.title,
                    description: item.subtitle,
                    meta: formatDateTime(item.timestamp),
                    badge: <StatusPill status={item.status} />
                  }))}
                />
              )}
            </TabsContent>

            <TabsContent value="compact">
              {feed.length === 0 ? (
                <EmptyState title="Belum ada feed" description="Aktivitas realtime akan tampil di sini." />
              ) : (
                <ul className="monitor-list">
                  {feed.map((item, index) => (
                    <li key={`${item.timestamp}-${index}`}>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.subtitle}</p>
                        <small>{formatDateTime(item.timestamp)}</small>
                      </div>
                      <StatusPill status={item.status} />
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </Card>
      </section>

      <Card>
        <div className="action-row">
          <Link to="/admin/anomali">
            <Button>Papan Anomali</Button>
          </Link>
          <Link to="/admin/riwayat">
            <Button variant="secondary">Riwayat Absen</Button>
          </Link>
          <Link to="/admin/jadwal">
            <Button variant="secondary">Jadwal & Sesi</Button>
          </Link>
        </div>
      </Card>

      {error ? <p className="text-error">{error}</p> : null}
    </div>
  );
}
