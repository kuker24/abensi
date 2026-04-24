import { useEffect, useMemo, useState } from 'react';
import { listClassSessions } from '../lib/api';
import { toIsoDateLocal } from '../lib/format';
import { Card, EmptyState, StatusPill, useToast } from '../components/ui';

export function TeacherRecapPage() {
  const { pushToast } = useToast();
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const data = await listClassSessions(toIsoDateLocal());
        setSessions(data);
      } catch (err: any) {
        pushToast(err?.response?.data?.message ?? 'Gagal memuat rekap kelas.', 'error');
      }
    }

    void load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const session of sessions) {
      const key = `${session.schoolClass.code} · ${session.subject.name}`;
      map.set(key, [...(map.get(key) ?? []), session]);
    }
    return Array.from(map.entries());
  }, [sessions]);

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Rekap Kelas Ampuan</h2>
        <p>Ringkasan sesi yang Anda ampu hari ini.</p>
      </Card>

      {grouped.length === 0 ? (
        <Card>
          <EmptyState title="Belum ada sesi" description="Tidak ada sesi ampuan pada hari ini." />
        </Card>
      ) : (
        grouped.map(([key, list]) => (
          <Card key={key}>
            <h3>{key}</h3>
            <ul className="timeline-list">
              {list.map((item) => (
                <li key={item.id} className="timeline-item">
                  <div>
                    <strong>{new Date(item.startsAt).toLocaleTimeString('id-ID')}</strong>
                    <p>{item.schoolClass.name}</p>
                  </div>
                  <StatusPill status={item.status} />
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
