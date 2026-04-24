import { useEffect, useMemo, useRef, useState } from 'react';
import { getLiveMonitor, openLiveMonitorStream } from '../lib/api';
import type { LiveFeedItem } from '../types/domain';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  StatusPill,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  useToast
} from '../components/ui';
import { formatDateTime } from '../lib/format';
import { labelForRole, labelForStatus } from '../lib/uiLabels';

const TOKEN_KEY = 'schoolhub_access_token';

export function LiveMonitorPage() {
  const { pushToast } = useToast();
  const streamRef = useRef<EventSource | null>(null);
  const streamStatusRef = useRef<'connected' | 'reconnecting' | 'polling'>('polling');

  const [items, setItems] = useState<LiveFeedItem[]>([]);
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [streamStatus, setStreamStatus] = useState<'connected' | 'reconnecting' | 'polling'>('polling');

  function updateStreamStatus(value: 'connected' | 'reconnecting' | 'polling') {
    streamStatusRef.current = value;
    setStreamStatus(value);
  }

  async function loadSnapshot() {
    try {
      const feed = await getLiveMonitor(200);
      setItems(feed.items);
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memuat live monitor.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function connectStream() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      updateStreamStatus('polling');
      return;
    }

    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }

    const source = openLiveMonitorStream({
      token,
      limit: 200,
      onMessage: (payload) => {
        setItems(payload.items);
        updateStreamStatus('connected');
        setLoading(false);
      },
      onError: () => {
        updateStreamStatus('reconnecting');
      }
    });

    source.onopen = () => {
      updateStreamStatus('connected');
    };

    streamRef.current = source;
  }

  useEffect(() => {
    void loadSnapshot();
    connectStream();

    const pollTimer = setInterval(() => {
      if (streamStatusRef.current !== 'connected') {
        void loadSnapshot();
      }
    }, 10000);

    const reconnectTimer = setInterval(() => {
      if (streamStatusRef.current !== 'connected') {
        connectStream();
      }
    }, 12000);

    return () => {
      clearInterval(pollTimer);
      clearInterval(reconnectTimer);
      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
      }
    };
  }, []);

  const roleOptions = useMemo(() => {
    const roles = Array.from(new Set(items.map((item) => item.actorRole).filter(Boolean) as string[])).sort();
    return [{ label: 'Semua peran', value: 'ALL' }, ...roles.map((role) => ({ label: labelForRole(role), value: role }))];
  }, [items]);

  const statusOptions = useMemo(() => {
    const statuses = Array.from(new Set(items.map((item) => item.status))).sort();
    return [{ label: 'Semua status', value: 'ALL' }, ...statuses.map((status) => ({ label: labelForStatus(status), value: status }))];
  }, [items]);

  const filtered = useMemo(() => {
    const lower = keyword.trim().toLowerCase();
    return items.filter((item) => {
      if (roleFilter !== 'ALL' && item.actorRole !== roleFilter) return false;
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (!lower) return true;
      return (
        item.title.toLowerCase().includes(lower) ||
        item.subtitle.toLowerCase().includes(lower) ||
        item.type.toLowerCase().includes(lower) ||
        (item.actorName ?? '').toLowerCase().includes(lower) ||
        (item.method ?? '').toLowerCase().includes(lower) ||
        (item.result ?? '').toLowerCase().includes(lower) ||
        (item.location ?? '').toLowerCase().includes(lower) ||
        (item.context ?? '').toLowerCase().includes(lower)
      );
    });
  }, [items, keyword, roleFilter, statusFilter]);

  const tableRows = useMemo(
    () =>
      filtered.map((item, index) => ({
        ...item,
        id: item.id ?? `${item.timestamp}-${item.type}-${index}`
      })),
    [filtered]
  );

  const streamTone =
    streamStatus === 'connected' ? 'success' : streamStatus === 'reconnecting' ? 'warning' : 'neutral';

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Pemantauan Langsung</h2>
        <p>Aliran real-time untuk tap gerbang, buka/tutup sesi, dan anomali beserta konteks kejadian.</p>
      </Card>

      <Card>
        <div className="toolbar">
          <div className="toolbar-group" style={{ minWidth: 320 }}>
            <label>Filter aktivitas</label>
            <Input value={keyword} onChange={setKeyword} placeholder="Cari kejadian, aktor, metode, atau lokasi" />
          </div>
          <div className="toolbar-group">
            <label>Peran</label>
            <Select value={roleFilter} onChange={setRoleFilter} options={roleOptions} />
          </div>
          <div className="toolbar-group">
            <label>Status</label>
            <Select value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
          </div>
          <div className="toolbar-group">
            <Tooltip content="Status koneksi real-time SSE ke server">
              <span>
                <Badge tone={streamTone}>
                  {streamStatus === 'connected'
                    ? 'Terhubung real-time'
                    : streamStatus === 'reconnecting'
                      ? 'Menyambung ulang'
                      : 'Mode pemindaian berkala'}
                </Badge>
              </span>
            </Tooltip>
          </div>
          <div className="toolbar-group">
            <Button variant="secondary" onClick={() => void loadSnapshot()}>
              Muat Ulang Data
            </Button>
          </div>
        </div>

        {loading ? <p>Memuat aktivitas real-time...</p> : null}
        {!loading && filtered.length === 0 ? (
          <EmptyState title="Aktivitas kosong" description="Belum ada kejadian yang sesuai dengan filter." />
        ) : (
          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">Linimasa</TabsTrigger>
              <TabsTrigger value="table">Tabel</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline">
              <ul className="monitor-feed-list">
                {filtered.map((item, index) => (
                  <li key={item.id ?? `${item.timestamp}-${item.type}-${index}`} className="monitor-feed-item">
                    <div className="monitor-feed-main">
                      <Avatar name={item.actorName ?? item.title} />
                      <div className="stack-sm">
                        <strong>{item.title}</strong>
                        <p>{item.subtitle}</p>
                        <small>
                          {formatDateTime(item.timestamp)} · {labelForRole(item.actorRole ?? '')} ·{' '}
                          {item.method ?? '-'} · {item.result ?? '-'}
                        </small>
                        {item.context ? <small>{item.context}</small> : null}
                      </div>
                    </div>
                    <div className="monitor-feed-meta">
                      <StatusPill status={item.type} />
                      <StatusPill status={item.status} />
                      {item.location ? <Badge tone="info">{item.location}</Badge> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </TabsContent>

            <TabsContent value="table">
              <Table
                title="Catatan Aktivitas Langsung"
                rows={tableRows}
                searchPlaceholder="Cari judul, aktor, atau metode"
                searchAccessor={(row) =>
                  `${row.title} ${row.subtitle} ${row.type} ${row.status} ${row.actorName ?? ''} ${row.method ?? ''} ${row.result ?? ''} ${row.location ?? ''} ${row.context ?? ''}`
                }
                columns={[
                  {
                    key: 'timestamp',
                    header: 'Waktu',
                    sortable: true,
                    accessor: (row) => formatDateTime(row.timestamp),
                    sortAccessor: (row) => new Date(row.timestamp).getTime()
                  },
                  {
                    key: 'event',
                    header: 'Event',
                    sortable: true,
                    accessor: (row) => row.title,
                    sortAccessor: (row) => row.title
                  },
                  {
                    key: 'actor',
                    header: 'Aktor',
                    sortable: true,
                    accessor: (row) => `${row.actorName ?? '-'} (${labelForRole(row.actorRole ?? '')})`,
                    sortAccessor: (row) => `${row.actorRole ?? ''}${row.actorName ?? ''}`
                  },
                  {
                    key: 'method',
                    header: 'Metode',
                    accessor: (row) => row.method ?? '-',
                    sortable: true,
                    sortAccessor: (row) => row.method ?? ''
                  },
                  {
                    key: 'result',
                    header: 'Hasil',
                    accessor: (row) => row.result ?? '-',
                    sortable: true,
                    sortAccessor: (row) => row.result ?? ''
                  },
                  {
                    key: 'location',
                    header: 'Lokasi',
                    accessor: (row) => row.location ?? '-',
                    sortable: true,
                    sortAccessor: (row) => row.location ?? ''
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    accessor: (row) => <StatusPill status={row.status} />,
                    sortable: true,
                    sortAccessor: (row) => row.status
                  }
                ]}
              />
            </TabsContent>
          </Tabs>
        )}
      </Card>
    </div>
  );
}
