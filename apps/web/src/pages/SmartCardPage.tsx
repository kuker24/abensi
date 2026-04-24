import { useEffect, useState } from 'react';
import {
  createReader,
  createSmartCard,
  listReaders,
  listSmartCards,
  listUsers,
  rotateReaderKey,
  updateReaderStatus,
  updateSmartCard
} from '../lib/api';
import type { ReaderDevice, SmartCard } from '../types/domain';
import { formatDateTime } from '../lib/format';
import { Button, Card, EmptyState, Input, Select, StatusPill, Table, Tabs, TabsContent, TabsList, TabsTrigger, useToast } from '../components/ui';
import { labelForRole } from '../lib/uiLabels';

export function SmartCardPage() {
  const { pushToast } = useToast();
  const [cards, setCards] = useState<SmartCard[]>([]);
  const [readers, setReaders] = useState<ReaderDevice[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; fullName: string; role: string }>>([]);
  const [loading, setLoading] = useState(true);

  const [newUid, setNewUid] = useState('');
  const [newUserId, setNewUserId] = useState('');
  const [newStatus, setNewStatus] = useState('ACTIVE');
  const [newNote, setNewNote] = useState('');

  const [readerName, setReaderName] = useState('Pembaca Gerbang Cadangan');

  async function loadData() {
    setLoading(true);
    try {
      const [cardData, readerData, userData] = await Promise.all([listSmartCards(), listReaders(), listUsers()]);
      setCards(cardData);
      setReaders(readerData);
      setUsers(userData);
      if (!newUserId && userData[0]) {
        setNewUserId(userData[0].id);
      }
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memuat data kartu/perangkat.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleCreateCard() {
    if (!newUid.trim()) {
      pushToast('UID kartu wajib diisi.', 'error');
      return;
    }

    try {
      await createSmartCard({
        uid: newUid.trim(),
        userId: newUserId || undefined,
        status: newStatus,
        note: newNote || undefined
      });
      pushToast('Kartu baru berhasil ditambahkan.', 'success');
      setNewUid('');
      setNewNote('');
      await loadData();
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal membuat kartu.', 'error');
    }
  }

  async function handleUpdateCard(cardId: string, payload: { status?: string; userId?: string | null }) {
    try {
      await updateSmartCard(cardId, payload);
      pushToast('Data kartu diperbarui.', 'success');
      await loadData();
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memperbarui kartu.', 'error');
    }
  }

  async function handleCreateReader() {
    try {
      await createReader({ name: readerName });
      pushToast('Perangkat pembaca baru berhasil dibuat.', 'success');
      await loadData();
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal membuat perangkat pembaca.', 'error');
    }
  }

  async function handleRotate(id: string) {
    try {
      await rotateReaderKey(id);
      pushToast('Kunci API perangkat pembaca berhasil diganti.', 'success');
      await loadData();
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal mengganti kunci API.', 'error');
    }
  }

  async function handleReaderStatus(id: string, status: string) {
    try {
      await updateReaderStatus(id, status);
      pushToast('Status perangkat pembaca diperbarui.', 'success');
      await loadData();
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memperbarui status perangkat pembaca.', 'error');
    }
  }

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Manajemen Kartu Pintar</h2>
        <p>Kelola UID kartu, pemilik kartu, dan perangkat pembaca.</p>
      </Card>

      <Tabs defaultValue="registrasi">
        <TabsList>
          <TabsTrigger value="registrasi">Registrasi</TabsTrigger>
          <TabsTrigger value="kartu">Daftar Kartu</TabsTrigger>
          <TabsTrigger value="reader">Perangkat Pembaca</TabsTrigger>
        </TabsList>

        <TabsContent value="registrasi">
          <section className="grid cols-2">
            <Card>
              <h3>Registrasi Kartu Baru</h3>
              <div className="stack-sm">
                <label>UID</label>
                <Input value={newUid} onChange={setNewUid} placeholder="Contoh: UID-MAN1-0099" />

                <label>Pemilik</label>
                <Select
                  value={newUserId}
                  onChange={setNewUserId}
                  options={
                    users.length > 0
                      ? [
                          { label: 'Tanpa pemilik', value: '' },
                          ...users.map((user) => ({ label: `${user.fullName} (${labelForRole(user.role)})`, value: user.id }))
                        ]
                      : [{ label: 'Belum ada pengguna', value: '' }]
                  }
                />

                <label>Status</label>
                <Select
                  value={newStatus}
                  onChange={setNewStatus}
                  options={[
                    { label: 'Aktif', value: 'ACTIVE' },
                    { label: 'Nonaktif', value: 'INACTIVE' },
                    { label: 'Hilang', value: 'LOST' }
                  ]}
                />

                <label>Catatan</label>
                <Input value={newNote} onChange={setNewNote} placeholder="Opsional" />

                <Button onClick={() => void handleCreateCard()}>Tambah Kartu</Button>
              </div>
            </Card>

            <Card>
              <h3>Tambah Perangkat Pembaca</h3>
              <div className="stack-sm">
                <label>Nama Perangkat Baru</label>
                <Input value={readerName} onChange={setReaderName} />
                <Button onClick={() => void handleCreateReader()}>Tambah Perangkat</Button>
              </div>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="kartu">
          <Card>
            {cards.length === 0 && !loading ? (
              <EmptyState title="Belum ada kartu" description="Tambahkan kartu baru untuk mulai operasional." />
            ) : (
              <Table
                rows={cards}
                loading={loading}
                title="Daftar Kartu"
                searchPlaceholder="Cari UID, nama pemilik, status"
                searchAccessor={(card) => `${card.uid} ${card.user?.fullName ?? ''} ${card.status}`}
                columns={[
                  {
                    key: 'uid',
                    header: 'UID',
                    sortable: true,
                    accessor: (card) => card.uid,
                    sortAccessor: (card) => card.uid
                  },
                  {
                    key: 'owner',
                    header: 'Pemilik',
                    sortable: true,
                    accessor: (card) => card.user?.fullName ?? '-',
                    sortAccessor: (card) => card.user?.fullName ?? ''
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    sortable: true,
                    accessor: (card) => <StatusPill status={card.status} />,
                    sortAccessor: (card) => card.status
                  },
                  {
                    key: 'lastTap',
                    header: 'Terakhir Tap',
                    accessor: (card) => (card.lastTappedAt ? formatDateTime(card.lastTappedAt) : '-')
                  },
                  {
                    key: 'actions',
                    header: 'Aksi',
                    accessor: (card) => (
                      <div className="action-row">
                        <Button size="sm" variant="secondary" onClick={() => void handleUpdateCard(card.id, { status: 'ACTIVE' })}>
                          Aktifkan
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void handleUpdateCard(card.id, { userId: null })}>
                          Lepas
                        </Button>
                      </div>
                    )
                  }
                ]}
              />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="reader">
          <Card>
            {readers.length === 0 && !loading ? (
              <EmptyState title="Belum ada perangkat pembaca" description="Tambahkan perangkat pembaca untuk mulai menerima tap gerbang." />
            ) : (
              <Table
                rows={readers}
                loading={loading}
                title="Daftar Perangkat Pembaca"
                searchPlaceholder="Cari nama perangkat pembaca"
                searchAccessor={(reader) => `${reader.name} ${reader.apiKey} ${reader.status}`}
                columns={[
                  {
                    key: 'name',
                    header: 'Nama',
                    sortable: true,
                    accessor: (reader) => reader.name,
                    sortAccessor: (reader) => reader.name
                  },
                  {
                    key: 'apiKey',
                    header: 'Kunci API',
                    accessor: (reader) => reader.apiKey
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    sortable: true,
                    accessor: (reader) => <StatusPill status={reader.status} />,
                    sortAccessor: (reader) => reader.status
                  },
                  {
                    key: 'lastSeen',
                    header: 'Terakhir Terlihat',
                    accessor: (reader) => (reader.lastSeenAt ? formatDateTime(reader.lastSeenAt) : '-')
                  },
                  {
                    key: 'actions',
                    header: 'Aksi',
                    accessor: (reader) => (
                      <div className="action-row">
                        <Select
                          value={reader.status}
                          onChange={(value) => void handleReaderStatus(reader.id, value)}
                          options={[
                            { label: 'Aktif', value: 'ACTIVE' },
                            { label: 'Nonaktif', value: 'INACTIVE' }
                          ]}
                        />
                        <Button variant="secondary" size="sm" onClick={() => void handleRotate(reader.id)}>
                          Ganti Kunci
                        </Button>
                      </div>
                    )
                  }
                ]}
              />
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
