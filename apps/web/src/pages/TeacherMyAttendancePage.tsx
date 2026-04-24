import { useEffect, useMemo, useState } from 'react';
import { getMyAttendance } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Card, EmptyState, StatCard, StatusPill, Table, Tabs, TabsContent, TabsList, TabsTrigger, Timeline, useToast } from '../components/ui';

export function TeacherMyAttendancePage() {
  const { pushToast } = useToast();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await getMyAttendance(30);
        setData(response);
      } catch (err: any) {
        pushToast(err?.response?.data?.message ?? 'Gagal memuat kehadiran guru.', 'error');
      }
    }

    void load();
  }, []);

  const counters = useMemo(() => {
    const map = {
      HADIR: 0,
      TELAT: 0,
      EXCUSED_ABSENCE: 0,
      ALPA_MENGAJAR: 0
    };

    for (const item of data?.teacherPresence ?? []) {
      if (item.status in map) {
        (map as any)[item.status] += 1;
      }
    }

    return map;
  }, [data]);

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Kehadiran Saya</h2>
        <p>Rekap kehadiran guru berdasarkan sesi dan tap gerbang.</p>
      </Card>

      <section className="grid cols-4">
        <StatCard label="Hadir" value={counters.HADIR} tone="success" />
        <StatCard label="Terlambat" value={counters.TELAT} tone="warning" />
        <StatCard label="Izin Tidak Mengajar" value={counters.EXCUSED_ABSENCE} />
        <StatCard label="Tidak Mengajar" value={counters.ALPA_MENGAJAR} tone="danger" />
      </section>

      <Tabs defaultValue="session">
        <TabsList>
          <TabsTrigger value="session">Riwayat Sesi</TabsTrigger>
          <TabsTrigger value="gate">Riwayat Tap Gerbang</TabsTrigger>
        </TabsList>

        <TabsContent value="session">
          <Card>
            {data?.teacherPresence?.length ? (
              <Table
                rows={data.teacherPresence}
                title="Riwayat Kehadiran Sesi"
                searchPlaceholder="Cari kelas, mapel, status"
                searchAccessor={(item: any) => `${item.session.schoolClass.code} ${item.session.subject.name} ${item.status}`}
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
              <EmptyState title="Belum ada data sesi" description="Riwayat sesi Anda akan muncul di sini." />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="gate">
          <Card>
            {data?.gateLogs?.length ? (
              <Timeline
                items={data.gateLogs.map((item: any) => ({
                  id: item.id,
                  title: `Tap ${item.direction}`,
                  meta: formatDateTime(item.tappedAt)
                }))}
              />
            ) : (
              <EmptyState title="Belum ada tap" description="Aktivitas gerbang Anda belum tercatat." />
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
