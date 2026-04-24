import { Search } from 'lucide-react';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  closeSession,
  getSessionRoster,
  listClassSessions,
  openSession,
  saveAttendanceBatch
} from '../lib/api';
import { formatDateTime, formatTime, toIsoDateLocal } from '../lib/format';
import { labelForStatus } from '../lib/uiLabels';
import type { SessionItem, SessionRoster, StudentAttendanceStatus } from '../types/domain';
import type { MockSessionState } from '../types/experience';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  StatusPill,
  Stepper,
  useToast
} from '../components/ui';

const statuses: StudentAttendanceStatus[] = ['HADIR', 'TELAT', 'IZIN', 'SAKIT', 'ALPA'];
const teacherFlowSteps = [
  { value: 'prepare', label: 'Persiapan', description: 'Pilih sesi dan cek roster' },
  { value: 'marking', label: 'Input', description: 'Tandai status kehadiran' },
  { value: 'review', label: 'Pengecekan', description: 'Simpan sebelum ditutup' },
  { value: 'closed', label: 'Selesai', description: 'Sesi telah berakhir' }
];

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getSessionTimer(session: SessionItem | null, nowMs: number) {
  if (!session) return null;
  const startsAtMs = new Date(session.startsAt).getTime();
  const endsAtMs = new Date(session.endsAt).getTime();

  if (session.status === 'SCHEDULED') {
    const seconds = Math.max(0, Math.round((startsAtMs - nowMs) / 1000));
    return {
      tone: 'warning' as const,
      label: 'Countdown mulai',
      value: formatDuration(seconds)
    };
  }

  if (session.status === 'OPEN') {
    const seconds = Math.max(0, Math.round((endsAtMs - nowMs) / 1000));
    return {
      tone: seconds <= 300 ? ('danger' as const) : ('success' as const),
      label: 'Sisa durasi sesi',
      value: formatDuration(seconds)
    };
  }

  const durationSeconds = Math.max(0, Math.round((endsAtMs - startsAtMs) / 1000));
  return {
    tone: 'neutral' as const,
    label: 'Durasi terjadwal',
    value: formatDuration(durationSeconds)
  };
}

function deriveTeacherPhase(status: SessionItem['status']) {
  if (status === 'SCHEDULED') return 'prepare';
  if (status === 'OPEN') return 'marking';
  if (status === 'CLOSED') return 'closed';
  return 'review';
}

export function ClassAttendancePage(props: {
  mockState: MockSessionState;
  setMockState: Dispatch<SetStateAction<MockSessionState>>;
}) {
  const [searchParams] = useSearchParams();
  const sessionFromQuery = searchParams.get('sessionId');
  const { pushToast } = useToast();

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [roster, setRoster] = useState<SessionRoster | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const selectedSession = useMemo(
    () => sessions.find((item) => item.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );

  const activePhase = selectedSessionId
    ? props.mockState.teacherSessions[selectedSessionId]?.phase ??
      (selectedSession ? deriveTeacherPhase(selectedSession.status) : 'prepare')
    : 'prepare';

  function patchTeacherSession(
    patch:
      | {
          phase: 'prepare' | 'marking' | 'review' | 'closed';
          hasUnsaved: boolean;
        }
      | ((current: { phase: 'prepare' | 'marking' | 'review' | 'closed'; hasUnsaved: boolean }) => {
          phase: 'prepare' | 'marking' | 'review' | 'closed';
          hasUnsaved: boolean;
        })
  ) {
    if (!selectedSessionId) return;
    props.setMockState((prev) => {
      const current = prev.teacherSessions[selectedSessionId] ?? {
        phase: selectedSession ? deriveTeacherPhase(selectedSession.status) : ('prepare' as const),
        hasUnsaved: false
      };
      const next = typeof patch === 'function' ? patch(current) : patch;
      return {
        ...prev,
        teacherSessions: {
          ...prev.teacherSessions,
          [selectedSessionId]: {
            phase: next.phase,
            hasUnsaved: next.hasUnsaved,
            updatedAt: new Date().toISOString()
          }
        }
      };
    });
  }

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    async function loadSessions() {
      setLoading(true);
      setError(null);
      try {
        const data = await listClassSessions(toIsoDateLocal());
        setSessions(data);
        if (data.length > 0) {
          const hasQuery = sessionFromQuery && data.some((item) => item.id === sessionFromQuery);
          setSelectedSessionId(hasQuery ? String(sessionFromQuery) : data[0].id);
        }
      } catch (err: any) {
        setError(err?.response?.data?.message ?? 'Gagal memuat sesi.');
      } finally {
        setLoading(false);
      }
    }

    void loadSessions();
  }, [sessionFromQuery]);

  useEffect(() => {
    async function loadRoster() {
      if (!selectedSessionId) {
        setRoster(null);
        return;
      }
      try {
        const data = await getSessionRoster(selectedSessionId);
        setRoster(data);
      } catch (err: any) {
        setError(err?.response?.data?.message ?? 'Gagal memuat roster sesi.');
      }
    }

    void loadRoster();
  }, [selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId || !selectedSession) return;
    props.setMockState((prev) => {
      if (prev.teacherSessions[selectedSessionId]) return prev;
      return {
        ...prev,
        teacherSessions: {
          ...prev.teacherSessions,
          [selectedSessionId]: {
            phase: deriveTeacherPhase(selectedSession.status),
            hasUnsaved: false,
            updatedAt: new Date().toISOString()
          }
        }
      };
    });
  }, [selectedSessionId, selectedSession?.status]);

  const sessionTimer = useMemo(() => getSessionTimer(selectedSession, nowMs), [selectedSession, nowMs]);

  const filteredRoster = useMemo(() => {
    if (!roster) return [];
    if (!search.trim()) return roster.roster;
    const keyword = search.toLowerCase();
    return roster.roster.filter(
      (item) => item.fullName.toLowerCase().includes(keyword) || item.username.toLowerCase().includes(keyword)
    );
  }, [roster, search]);

  const counters = useMemo(() => {
    const map: Record<StudentAttendanceStatus, number> = {
      HADIR: 0,
      TELAT: 0,
      IZIN: 0,
      SAKIT: 0,
      ALPA: 0
    };

    for (const item of roster?.roster ?? []) {
      map[item.status] += 1;
    }

    return map;
  }, [roster]);

  function updateStudentStatus(studentId: string, status: StudentAttendanceStatus) {
    if (!roster) return;
    setHasUnsavedChanges(true);
    patchTeacherSession({ phase: 'marking', hasUnsaved: true });
    setRoster({
      ...roster,
      roster: roster.roster.map((item) =>
        item.studentId === studentId
          ? {
              ...item,
              status,
              updatedAt: new Date().toISOString()
            }
          : item
      )
    });
  }

  function applyBulkStatus(status: StudentAttendanceStatus) {
    if (!roster) return;
    setHasUnsavedChanges(true);
    patchTeacherSession({ phase: 'marking', hasUnsaved: true });
    setRoster({
      ...roster,
      roster: roster.roster.map((item) => ({
        ...item,
        status,
        updatedAt: new Date().toISOString()
      }))
    });
  }

  function handleSelectSession(nextSessionId: string) {
    if (!nextSessionId || nextSessionId === selectedSessionId) {
      setSelectedSessionId(nextSessionId);
      return;
    }
    if (hasUnsavedChanges) {
      setPendingSessionId(nextSessionId);
      setShowLeaveModal(true);
      return;
    }
    setSelectedSessionId(nextSessionId);
  }

  async function handleOpenSession() {
    if (!selectedSession) return;
    try {
      await openSession(selectedSession.id);
      pushToast('Sesi berhasil dibuka.', 'success');
      const [updatedSessions, updatedRoster] = await Promise.all([
        listClassSessions(toIsoDateLocal()),
        getSessionRoster(selectedSession.id)
      ]);
      setSessions(updatedSessions);
      setRoster(updatedRoster);
      setHasUnsavedChanges(false);
      patchTeacherSession({ phase: 'marking', hasUnsaved: false });
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal membuka sesi.', 'error');
    }
  }

  async function handleSaveAttendance() {
    if (!selectedSession || !roster) return;
    setSaving(true);
    try {
      await saveAttendanceBatch(
        selectedSession.id,
        roster.roster.map((item) => ({
          studentId: item.studentId,
          status: item.status,
          note: item.note ?? undefined
        }))
      );
      pushToast('Presensi tersimpan.', 'success');
      const refreshed = await getSessionRoster(selectedSession.id);
      setRoster(refreshed);
      setHasUnsavedChanges(false);
      patchTeacherSession({ phase: 'review', hasUnsaved: false });
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal menyimpan presensi.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleCloseSession() {
    if (!selectedSession) return;
    setSaving(true);
    try {
      await closeSession(selectedSession.id);
      pushToast('Sesi ditutup dan siap direkonsiliasi.', 'success');
      const [updatedSessions, updatedRoster] = await Promise.all([
        listClassSessions(toIsoDateLocal()),
        getSessionRoster(selectedSession.id)
      ]);
      setSessions(updatedSessions);
      setRoster(updatedRoster);
      setShowCloseModal(false);
      setHasUnsavedChanges(false);
      patchTeacherSession({ phase: 'closed', hasUnsaved: false });
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal menutup sesi.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Input Presensi Kelas</h2>
        <p>Aksi inti guru: buka sesi, update status siswa, simpan, lalu tutup sesi.</p>
      </Card>

      <Card>
        <div className="toolbar">
          <div className="toolbar-group">
            <label htmlFor="session-select">Pilih Sesi</label>
            <Select
              id="session-select"
              value={selectedSessionId}
              onChange={handleSelectSession}
              options={
                sessions.length > 0
                  ? sessions.map((session) => ({
                      label: `${session.schoolClass.code} · ${session.subject.name} (${formatTime(session.startsAt)})`,
                      value: session.id
                    }))
                  : [{ label: 'Belum ada sesi', value: '' }]
              }
            />
          </div>

          <div className="toolbar-group">
            <label htmlFor="search-student">Cari siswa</label>
            <div className="search-wrap">
              <Search size={14} />
              <Input id="search-student" value={search} onChange={setSearch} placeholder="Nama/NIS" />
            </div>
          </div>
        </div>

        {selectedSession ? (
          <div className="session-header-card attendance-session-header">
            <div className="stack-sm">
              <h3>
                {selectedSession.schoolClass.code} · {selectedSession.subject.name}
              </h3>
              <p>
                {formatTime(selectedSession.startsAt)} - {formatTime(selectedSession.endsAt)}
              </p>
            </div>
            <div className="attendance-session-meta">
              <StatusPill status={selectedSession.status} />
              {sessionTimer ? <Badge tone={sessionTimer.tone}>{`${sessionTimer.label}: ${sessionTimer.value}`}</Badge> : null}
              {hasUnsavedChanges ? <Badge tone="warning">Perubahan belum disimpan</Badge> : null}
              {selectedSessionId && props.mockState.teacherSessions[selectedSessionId] ? (
                <small>Sinkron lokal: {formatDateTime(props.mockState.teacherSessions[selectedSessionId].updatedAt)}</small>
              ) : null}
            </div>
          </div>
        ) : null}

        <Stepper
          steps={teacherFlowSteps}
          activeValue={activePhase}
          onStepSelect={(value) => {
            patchTeacherSession((current) => ({
              phase: value as 'prepare' | 'marking' | 'review' | 'closed',
              hasUnsaved: current.hasUnsaved
            }));
          }}
        />

        <div className="action-row wrap">
          <Button variant="secondary" onClick={() => applyBulkStatus('HADIR')}>
            Tandai Semua Hadir
          </Button>
          <Button variant="secondary" onClick={() => applyBulkStatus('ALPA')}>
            Tandai Semua Alpa
          </Button>
          {selectedSession?.status === 'SCHEDULED' ? (
            <Button onClick={handleOpenSession}>Buka Sesi</Button>
          ) : null}
          <Button onClick={handleSaveAttendance} disabled={!roster} loading={saving} loadingText="Menyimpan...">
            Simpan Presensi
          </Button>
        </div>

        {loading ? <p>Memuat data presensi...</p> : null}
        {error ? <p className="text-error">{error}</p> : null}
        {!loading && filteredRoster.length === 0 ? (
          <EmptyState title="Roster kosong" description="Belum ada siswa pada sesi ini." />
        ) : null}

        <ul className="attendance-list">
          {filteredRoster.map((item) => (
            <li key={item.studentId} className="attendance-item">
              <div className="attendance-student">
                <Avatar name={item.fullName} />
                <div>
                  <strong>{item.fullName}</strong>
                  <p>NIS: {item.username}</p>
                </div>
              </div>
              <div className="status-group">
                {statuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={item.status === status ? 'status-chip status-chip-active' : 'status-chip'}
                    onClick={() => updateStudentStatus(item.studentId, status)}
                  >
                    {labelForStatus(status)}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="floating-summary" variant="glass">
        <Badge tone="success">Hadir: {counters.HADIR}</Badge>
        <Badge tone="warning">Telat: {counters.TELAT}</Badge>
        <Badge tone="info">Izin: {counters.IZIN}</Badge>
        <Badge tone="info">Sakit: {counters.SAKIT}</Badge>
        <Badge tone="danger">Alpa: {counters.ALPA}</Badge>
        {selectedSession?.status === 'OPEN' ? (
          <Button className="floating-close-btn" variant="destructive" onClick={() => setShowCloseModal(true)}>
            Tutup Sesi
          </Button>
        ) : null}
      </Card>

      <Modal
        open={showCloseModal}
        title="Konfirmasi Tutup Sesi"
        onClose={() => setShowCloseModal(false)}
        preventClose={saving}
        actions={
          <div className="action-row">
            <Button variant="ghost" onClick={() => setShowCloseModal(false)} disabled={saving}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleCloseSession} loading={saving} loadingText="Menutup...">
              Ya, Tutup Sesi
            </Button>
          </div>
        }
      >
        <p>
          Setelah sesi ditutup, input baru tidak diperbolehkan. Anda masih bisa melakukan koreksi beralasan.
        </p>
      </Modal>

      <Modal
        open={showLeaveModal}
        title="Perubahan Belum Disimpan"
        onClose={() => {
          setShowLeaveModal(false);
          setPendingSessionId(null);
        }}
        actions={
          <div className="action-row">
            <Button
              variant="ghost"
              onClick={() => {
                setShowLeaveModal(false);
                setPendingSessionId(null);
              }}
            >
              Tetap di Sesi Ini
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingSessionId) {
                  setSelectedSessionId(pendingSessionId);
                }
                setHasUnsavedChanges(false);
                setShowLeaveModal(false);
                setPendingSessionId(null);
              }}
            >
              Pindah Tanpa Simpan
            </Button>
          </div>
        }
      >
        <p>
          Ada perubahan status siswa yang belum disimpan. Jika tetap pindah sesi, perubahan lokal akan hilang.
        </p>
      </Modal>
    </div>
  );
}
