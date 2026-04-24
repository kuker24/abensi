import { useEffect, useMemo, useState } from 'react';
import { listAudit, listUsers } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { labelForRole } from '../lib/uiLabels';
import type { AuditEntry, BasicUser, PaginationMeta } from '../types/domain';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Table,
  Tooltip,
  useToast
} from '../components/ui';

export function AuditPage() {
  const { pushToast } = useToast();

  const [users, setUsers] = useState<BasicUser[]>([]);
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);

  const [actorId, setActorId] = useState('');
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState(() => new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [limit, setLimit] = useState('100');

  const actorOptions = useMemo(
    () => [
      { label: 'Semua Aktor', value: '' },
      ...users.map((user) => ({ label: `${user.fullName} (${labelForRole(user.role)})`, value: user.id }))
    ],
    [users]
  );

  async function loadUsers() {
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memuat daftar user.', 'error');
    }
  }

  async function loadAudit() {
    setLoading(true);
    try {
      const data = await listAudit({
        page: 1,
        limit: Number(limit) || 100,
        actorId: actorId || undefined,
        module: module.trim() || undefined,
        action: action.trim() || undefined,
        from: from || undefined,
        to: to || undefined
      });

      setItems(data.items);
      setMeta(data.meta);
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memuat audit log.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function resetFilters() {
    setActorId('');
    setModule('');
    setAction('');
    setFrom(new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    setTo(new Date().toISOString().slice(0, 10));
    setLimit('100');
  }

  useEffect(() => {
    void loadUsers();
    void loadAudit();
  }, []);

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Catatan Audit</h2>
        <p>Catatan permanen untuk aksi sensitif dengan filter aktor, modul, aksi, dan rentang tanggal.</p>
      </Card>

      <Card>
        <div className="toolbar">
          <div className="toolbar-group">
            <label>Aktor</label>
            <Select value={actorId} onChange={setActorId} options={actorOptions} />
          </div>

          <div className="toolbar-group">
            <label>Modul</label>
            <Input value={module} onChange={setModule} placeholder="Contoh: reconciliation" />
          </div>

          <div className="toolbar-group">
            <label>Aksi</label>
            <Input value={action} onChange={setAction} placeholder="Contoh: class.session.closed" />
          </div>

          <div className="toolbar-group">
            <label>Dari</label>
            <input className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>

          <div className="toolbar-group">
            <label>Sampai</label>
            <input className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>

          <div className="toolbar-group">
            <label>Limit</label>
            <Input value={limit} onChange={setLimit} />
          </div>
        </div>

        <div className="action-row wrap" style={{ marginBottom: '0.75rem' }}>
          <Tooltip content="Terapkan filter audit">
            <span>
              <Button onClick={() => void loadAudit()}>Terapkan Filter</Button>
            </span>
          </Tooltip>
          <Button
            variant="ghost"
            onClick={() => {
              resetFilters();
              setTimeout(() => void loadAudit(), 0);
            }}
          >
            Atur Ulang
          </Button>
          <Badge tone="info">{meta?.total ?? items.length} entri</Badge>
          {meta ? <small>Halaman backend: {meta.page}/{meta.totalPages}</small> : null}
        </div>

        {items.length === 0 && !loading ? (
          <EmptyState title="Audit kosong" description="Belum ada entri audit untuk filter yang dipilih." />
        ) : (
          <Table
            rows={items}
            loading={loading}
            title="Jejak Audit"
            searchPlaceholder="Cari aksi, sumber daya, aktor, atau modul"
            searchAccessor={(row) =>
              `${row.action} ${row.module ?? ''} ${row.resource} ${row.resourceId ?? ''} ${row.actor?.fullName ?? ''} ${row.actorRole ?? ''} ${row.reason ?? ''}`
            }
            columns={[
              {
                key: 'createdAt',
                header: 'Waktu',
                sortable: true,
                accessor: (row) => formatDateTime(row.createdAt),
                sortAccessor: (row) => new Date(row.createdAt).getTime()
              },
              {
                key: 'actor',
                header: 'Aktor',
                sortable: true,
                accessor: (row) => row.actor?.fullName ?? '-',
                sortAccessor: (row) => row.actor?.fullName ?? ''
              },
              {
                key: 'actorRole',
                header: 'Peran',
                sortable: true,
                accessor: (row) => labelForRole(row.actorRole ?? row.actor?.role ?? ''),
                sortAccessor: (row) => row.actorRole ?? row.actor?.role ?? ''
              },
              {
                key: 'module',
                header: 'Modul',
                sortable: true,
                accessor: (row) => row.module ?? '-',
                sortAccessor: (row) => row.module ?? ''
              },
              {
                key: 'action',
                header: 'Aksi',
                sortable: true,
                accessor: (row) => row.action,
                sortAccessor: (row) => row.action
              },
              {
                key: 'resource',
                header: 'Resource',
                accessor: (row) => `${row.resource} · ${row.resourceId ?? '-'}`
              },
              {
                key: 'reason',
                header: 'Alasan',
                accessor: (row) => row.reason ?? '-'
              },
              {
                key: 'origin',
                header: 'IP / Device',
                accessor: (row) => `${row.requestIp ?? '-'} · ${row.requestDevice ?? '-'}`
              }
            ]}
          />
        )}
      </Card>
    </div>
  );
}
