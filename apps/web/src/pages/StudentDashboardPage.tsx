import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyAttendance } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Button, Card, EmptyState, StatCard, StatusPill, Table, Tabs, TabsContent, TabsList, TabsTrigger, Timeline, useToast } from '../components/ui';

export function StudentDashboardPage() {
  const { pushToast } = useToast();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await getMyAttendance(30);
        setData(response);
      } catch (err: any) {
        pushToast(err?.response?.data?.message ?? 'Gagal memuat riwayat kehadiran.', 'error');
      }
    }

    void load();
  }, []);

  const counters = useMemo(() => {
    const map: Record<string, number> = {
      HADIR: 0,
      TELAT: 0,
      IZIN: 0,
      SAKIT: 0,
      ALPA: 0
    };

    for (const item of data?.classAttendances ?? []) {
      map[item.status] += 1;
    }

    return map;
  }, [data]);

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Dasbor Siswa</h2>
        <p>Riwayat kehadiran pribadi 30 hari terakhir.</p>
      </Card>

      <section className="grid cols-4">
        <StatCard label="Hadir" value={counters.HADIR} tone="success" />
        <StatCard label="Telat" value={counters.TELAT} tone="warning" />
        <StatCard label="Izin/Sakit" value={counters.IZIN + counters.SAKIT} tone="default" />
        <StatCard label="Alpa" value={counters.ALPA} tone="danger" />
      </section>

      <Card variant="glass">
        <div className="action-row wrap">
          <div className="stack-sm">
            <strong>Butuh absen sekarang?</strong>
            <small>Gunakan alur absen masuk bertahap untuk validasi data sebelum tersinkron ke kelas.</small>
          </div>
          <Link to="/siswa/check-in">
            <Button>Mulai Absen Masuk</Button>
          </Link>
        </div>
      </Card>

      <Tabs defaultValue="kelas">
        <TabsList>
          <TabsTrigger value="kelas">Riwayat Kelas</TabsTrigger>
          <TabsTrigger value="gate">Riwayat Tap Gerbang</TabsTrigger>
        </TabsList>

        <TabsContent value="kelas">
          <Card>
            {data?.classAttendances?.length ? (
              <Table
                rows={data.classAttendances}
                title="Riwayat Presensi Kelas"
                searchPlaceholder="Cari mapel, kelas, status"
                searchAccessor={(item: any) =>
                  `${item.session.schoolClass.code} ${item.session.subject.name} ${item.status}`
                }
                columns={[
                  {
                    key: 'date',
                    header: 'Tanggal',
                    sortable: true,
                    accessor: (item: any) => formatDateTime(item.session.startsAt),
                    sortAccessor: (item: any) => new Date(item.session.startsAt).getTime()
                  },
                  {
                    key: 'class',
                    header: 'Kelas',
                    sortable: true,
                    accessor: (item: any) => item.session.schoolClass.code,
                    sortAccessor: (item: any) => item.session.schoolClass.code
                  },
                  {
                    key: 'subject',
                    header: 'Mapel',
                    sortable: true,
                    accessor: (item: any) => item.session.subject.name,
                    sortAccessor: (item: any) => item.session.subject.name
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    sortable: true,
                    accessor: (item: any) => <StatusPill status={item.status} />,
                    sortAccessor: (item: any) => item.status
                  }
                ]}
              />
            ) : (
              <EmptyState title="Belum ada data kelas" description="Riwayat kelas akan muncul setelah sesi berjalan." />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="gate">
          <Card>
            {data?.gateLogs?.length ? (
              <Timeline
                items={data.gateLogs.map((log: any) => ({
                  id: log.id,
                  title: `Tap ${log.direction}`,
                  meta: formatDateTime(log.tappedAt)
                }))}
              />
            ) : (
              <EmptyState title="Belum ada tap" description="Aktivitas tap gerbang Anda akan tampil di sini." />
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
