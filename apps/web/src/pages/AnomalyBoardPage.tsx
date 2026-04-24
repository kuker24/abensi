import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { escalateFlag, listFlags, resolveFlag } from '../lib/api';
import { simulateAsyncTransition } from '../lib/experienceState';
import type { ReconciliationFlag } from '../types/domain';
import type { MockSessionState } from '../types/experience';
import {
  Badge,
  Button,
  Card,
  Dropdown,
  EmptyState,
  Select,
  Sheet,
  StatusPill,
  Table,
  Textarea,
  useToast
} from '../components/ui';
import { formatDateTime } from '../lib/format';
import { labelForRole, labelForStatus } from '../lib/uiLabels';

const typeOptions = [
  { label: 'Semua Tipe', value: '' },
  { label: 'Diduga Membolos Kelas', value: 'BOLOS_KELAS' },
  { label: 'Lupa Tap Gerbang', value: 'LUPA_TAP_GERBANG' },
  { label: 'Tidak Mengajar', value: 'TIDAK_MENGAJAR' },
  { label: 'Buka Sesi Tanpa Tap Gerbang', value: 'ANOMALI_BUKA_TANPA_GERBANG' },
  { label: 'Tanpa Keterangan', value: 'ALPA' }
];

type ActionMode = 'resolve' | 'escalate';

export function AnomalyBoardPage(props: {
  mockState: MockSessionState;
  setMockState: Dispatch<SetStateAction<MockSessionState>>;
}) {
  const { pushToast } = useToast();
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [typeFilter, setTypeFilter] = useState('');
  const [from, setFrom] = useState(() => new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [flags, setFlags] = useState<ReconciliationFlag[]>([]);
  const [selectedFlag, setSelectedFlag] = useState<ReconciliationFlag | null>(null);
  const [mode, setMode] = useState<ActionMode>('resolve');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  function patchActionState(flagId: string, asyncState: 'idle' | 'loading' | 'success' | 'error', action: ActionMode) {
    props.setMockState((prev) => ({
      ...prev,
      anomalyActions: {
        ...prev.anomalyActions,
        [flagId]: {
          asyncState,
          lastAction: action,
          updatedAt: new Date().toISOString()
        }
      }
    }));
  }

  async function loadFlags() {
    setLoading(true);
    try {
      const data = await listFlags({
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        from: from || undefined,
        to: to || undefined,
        page: 1,
        limit: 200
      });
      setFlags(data);
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memuat flag.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFlags();
  }, [statusFilter, typeFilter]);

  function openAction(flag: ReconciliationFlag, actionMode: ActionMode) {
    const optimisticState = props.mockState.anomalyActions[flag.id]?.asyncState;
    if (optimisticState === 'loading') {
      pushToast('Aksi masih diproses. Tunggu hingga selesai.', 'info');
      return;
    }
    setSelectedFlag(flag);
    setMode(actionMode);
    setReason('');
  }

  async function handleSubmit() {
    if (!selectedFlag) return;
    if (reason.trim().length < 10) {
      pushToast('Alasan minimal 10 karakter.', 'error');
      return;
    }

    const snapshot = flags;
    const now = new Date().toISOString();
    setSubmitting(true);
    patchActionState(selectedFlag.id, 'loading', mode);

    setFlags((prev) =>
      prev.map((flag) => {
        if (flag.id !== selectedFlag.id) return flag;
        if (mode === 'resolve') {
          return {
            ...flag,
            status: 'RESOLVED',
            resolvedAt: now,
            resolvedReason: reason.trim()
          };
        }
        return {
          ...flag,
          escalationQueue: {
            id: `local-queue-${Date.now()}`,
            status: 'QUEUED',
            reason: reason.trim(),
            createdAt: now,
            createdBy: {
              id: 'local-admin',
              fullName: 'Admin Local',
              role: 'ADMIN_TU'
            }
          }
        };
      })
    );

    try {
      await simulateAsyncTransition({ minMs: 550, maxMs: 1200, failRate: 0.12 });
      if (mode === 'resolve') {
        await resolveFlag(selectedFlag.id, reason.trim());
        pushToast('Flag berhasil diselesaikan.', 'success');
      } else {
        await escalateFlag(selectedFlag.id, reason.trim());
        pushToast('Flag berhasil masuk antrean eskalasi.', 'success');
      }

      patchActionState(selectedFlag.id, 'success', mode);
      setSelectedFlag(null);
      setReason('');
      await loadFlags();
    } catch (err: any) {
      setFlags(snapshot);
      patchActionState(selectedFlag.id, 'error', mode);
      pushToast(err?.response?.data?.message ?? `Gagal ${mode === 'resolve' ? 'menyelesaikan' : 'mengeskalasi'} flag.`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const openCount = useMemo(() => flags.filter((flag) => flag.status === 'OPEN').length, [flags]);
  const queueCount = useMemo(
    () => flags.filter((flag) => flag.escalationQueue?.status === 'QUEUED').length,
    [flags]
  );
  const pendingCount = useMemo(
    () => Object.values(props.mockState.anomalyActions).filter((item) => item.asyncState === 'loading').length,
    [props.mockState.anomalyActions]
  );

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Papan Anomali Rekonsiliasi</h2>
        <p>Tinjau semua flag lintas lapis (gerbang + kelas), selesaikan dengan alasan jelas, atau eskalasi ke wali.</p>
      </Card>

      <Card>
        <div className="toolbar">
          <div className="toolbar-group">
            <label>Status</label>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: 'Sedang Berjalan', value: 'OPEN' },
                { label: 'Terselesaikan', value: 'RESOLVED' },
                { label: 'Semua', value: '' }
              ]}
            />
          </div>

          <div className="toolbar-group">
            <label>Tipe Flag</label>
            <Select value={typeFilter} onChange={setTypeFilter} options={typeOptions} />
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
            <Button variant="secondary" onClick={() => void loadFlags()}>
              Terapkan Filter
            </Button>
          </div>

          <div className="toolbar-group">
            <Badge tone="danger">{openCount} Terbuka</Badge>
            <Badge tone="info">{queueCount} Dalam Antrean</Badge>
            <Badge tone="warning">{pendingCount} Sedang Diproses</Badge>
          </div>
        </div>

        {!loading && flags.length === 0 ? (
          <EmptyState title="Tidak ada flag" description="Tidak ada anomali sesuai filter saat ini." />
        ) : (
          <Table
            rows={flags}
            loading={loading}
            title="Daftar Flag Rekonsiliasi"
            searchPlaceholder="Cari tipe, pengguna, kelas, atau mapel"
            searchAccessor={(row) =>
              `${row.type} ${row.status} ${row.user.fullName} ${row.user.role} ${row.session?.schoolClass.code ?? ''} ${row.session?.subject.name ?? ''} ${row.escalationQueue?.status ?? ''}`
            }
            columns={[
              {
                key: 'type',
                header: 'Tipe',
                sortable: true,
                accessor: (row) => <StatusPill status={row.type} />,
                sortAccessor: (row) => row.type
              },
              {
                key: 'status',
                header: 'Status',
                sortable: true,
                accessor: (row) => <StatusPill status={row.status} />,
                sortAccessor: (row) => row.status
              },
              {
                key: 'queue',
                header: 'Eskalasi',
                accessor: (row) =>
                  row.escalationQueue ? (
                    <div className="stack-sm">
                      <StatusPill status={row.escalationQueue.status} />
                      <small>{row.escalationQueue.createdBy.fullName}</small>
                    </div>
                  ) : (
                    '-'
                  )
              },
              {
                key: 'sync',
                header: 'Sinkronisasi',
                accessor: (row) => {
                  const actionState = props.mockState.anomalyActions[row.id];
                  if (!actionState) return <Badge tone="neutral">Belum Ada</Badge>;
                  if (actionState.asyncState === 'loading') return <Badge tone="warning">Menyinkronkan</Badge>;
                  if (actionState.asyncState === 'error') return <Badge tone="danger">Gagal</Badge>;
                  if (actionState.asyncState === 'success') return <Badge tone="success">Tersinkron</Badge>;
                  return <Badge tone="neutral">Belum Ada</Badge>;
                }
              },
              {
                key: 'user',
                header: 'Pengguna',
                sortable: true,
                accessor: (row) => `${row.user.fullName} (${labelForRole(row.user.role)})`,
                sortAccessor: (row) => row.user.fullName
              },
              {
                key: 'context',
                header: 'Konteks',
                accessor: (row) => `${row.session?.schoolClass.code ?? '-'} · ${row.session?.subject.name ?? '-'}`
              },
              {
                key: 'createdAt',
                header: 'Waktu',
                sortable: true,
                accessor: (row) => formatDateTime(row.createdAt),
                sortAccessor: (row) => new Date(row.createdAt).getTime()
              },
              {
                key: 'actions',
                header: 'Aksi',
                accessor: (row) => {
                  const pending = props.mockState.anomalyActions[row.id]?.asyncState === 'loading';
                  return (
                    <Dropdown
                      label="Aksi"
                      items={[
                        {
                          label: pending ? 'Sedang disinkronkan...' : 'Selesaikan',
                          disabled: row.status !== 'OPEN' || pending,
                          onSelect: () => openAction(row, 'resolve')
                        },
                        {
                          label: 'Eskalasi ke Wali',
                          disabled: row.status !== 'OPEN' || Boolean(row.escalationQueue) || pending,
                          onSelect: () => openAction(row, 'escalate')
                        },
                        {
                          label: 'Salin ID',
                          onSelect: async () => {
                            try {
                              await navigator.clipboard.writeText(row.id);
                              pushToast('ID flag disalin.', 'success');
                            } catch {
                              pushToast('Gagal menyalin ID.', 'error');
                            }
                          }
                        }
                      ]}
                    />
                  );
                }
              }
            ]}
          />
        )}
      </Card>

      <Sheet
        open={Boolean(selectedFlag)}
        title={mode === 'resolve' ? 'Selesaikan Flag Anomali' : 'Eskalasi Flag ke Wali'}
        onClose={() => {
          if (submitting) return;
          setSelectedFlag(null);
          setReason('');
        }}
        side="right"
        preventClose={submitting}
      >
        <div className="stack-sm">
          <p>
            Flag: <strong>{labelForStatus(selectedFlag?.type)}</strong>
          </p>
          <p>
            Pengguna: <strong>{selectedFlag?.user.fullName}</strong>
          </p>
          <p>
            Kelas/Mapel: {selectedFlag?.session?.schoolClass.code ?? '-'} · {selectedFlag?.session?.subject.name ?? '-'}
          </p>

          {selectedFlag?.escalationQueue ? (
            <Card variant="outlined">
              <p>
                Flag ini sudah dalam antrean eskalasi oleh <strong>{selectedFlag.escalationQueue.createdBy.fullName}</strong>
                {' · '}
                {formatDateTime(selectedFlag.escalationQueue.createdAt)}
              </p>
            </Card>
          ) : null}

          <Textarea
            value={reason}
            onChange={setReason}
            rows={4}
            placeholder={
              mode === 'resolve'
                ? 'Tuliskan alasan penyelesaian minimal 10 karakter'
                : 'Tuliskan alasan eskalasi minimal 10 karakter'
            }
          />
          <div className="action-row">
            <Button
              variant="ghost"
              onClick={() => {
                if (submitting) return;
                setSelectedFlag(null);
                setReason('');
              }}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button onClick={() => void handleSubmit()} loading={submitting} loadingText="Menyimpan...">
              {mode === 'resolve' ? 'Simpan Penyelesaian' : 'Kirim Eskalasi'}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
