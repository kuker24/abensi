import { useEffect, useMemo, useState } from 'react';
import { correctAttendance, getSessionRoster, listClassSessions } from '../lib/api';
import { formatDateTime, toIsoDateLocal } from '../lib/format';
import { labelForStatus } from '../lib/uiLabels';
import type { SessionItem, StudentAttendanceStatus } from '../types/domain';
import {
  Button,
  Card,
  EmptyState,
  Select,
  Sheet,
  StatusPill,
  Table,
  Textarea,
  useToast
} from '../components/ui';

const statusOptions: StudentAttendanceStatus[] = ['HADIR', 'TELAT', 'IZIN', 'SAKIT', 'ALPA'];

export function AttendanceHistoryPage() {
  const { pushToast } = useToast();
  const [date, setDate] = useState(toIsoDateLocal());
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCorrection, setShowCorrection] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [status, setStatus] = useState<StudentAttendanceStatus>('HADIR');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [roster, setRoster] = useState<Array<{ studentId: string; fullName: string; status: StudentAttendanceStatus }>>([]);

  async function loadSessions() {
    setLoading(true);
    try {
      const data = await listClassSessions(date);
      setSessions(data);
      if (data.length > 0 && !selectedSessionId) {
        setSelectedSessionId(data[0].id);
      }
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memuat riwayat sesi.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSessions();
  }, [date]);

  useEffect(() => {
    async function loadRoster() {
      if (!selectedSessionId) return;
      try {
        const detail = await getSessionRoster(selectedSessionId);
        setRoster(
          detail.roster.map((item) => ({
            studentId: item.studentId,
            fullName: item.fullName,
            status: item.status
          }))
        );
      } catch {
        setRoster([]);
      }
    }

    void loadRoster();
  }, [selectedSessionId]);

  const selectedSession = useMemo(
    () => sessions.find((item) => item.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );

  async function submitCorrection() {
    if (!selectedSessionId || !studentId) {
      pushToast('Pilih sesi dan siswa terlebih dahulu.', 'error');
      return;
    }
    if (reason.trim().length < 10) {
      pushToast('Alasan koreksi minimal 10 karakter.', 'error');
      return;
    }

    try {
      await correctAttendance(selectedSessionId, studentId, { status, reason, note });
      pushToast('Koreksi presensi berhasil disimpan.', 'success');
      setShowCorrection(false);
      setReason('');
      setNote('');
      await loadSessions();
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal menyimpan koreksi.', 'error');
    }
  }

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Riwayat Absen & Koreksi</h2>
        <p>Tinjau sesi yang sudah berjalan dan lakukan koreksi dengan alasan wajib.</p>
      </Card>

      <Card>
        <div className="toolbar">
          <div className="toolbar-group">
            <label>Tanggal</label>
            <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="toolbar-group">
            <label>Sesi</label>
            <Select
              value={selectedSessionId}
              onChange={setSelectedSessionId}
              options={
                sessions.length > 0
                  ? sessions.map((session) => ({
                      label: `${session.schoolClass.code} · ${session.subject.name}`,
                      value: session.id
                    }))
                  : [{ label: 'Belum ada sesi', value: '' }]
              }
            />
          </div>
          <div className="toolbar-group">
            <Button onClick={() => setShowCorrection(true)} disabled={!selectedSessionId}>
              Koreksi Presensi
            </Button>
          </div>
        </div>

        {!loading && sessions.length === 0 ? (
          <EmptyState title="Belum ada data" description="Tidak ada sesi pada tanggal ini." />
        ) : (
          <Table
            rows={sessions}
            loading={loading}
            title="Riwayat Sesi"
            searchPlaceholder="Cari kelas, mapel, guru"
            searchAccessor={(session) => `${session.schoolClass.code} ${session.subject.name} ${session.teacher.fullName}`}
            columns={[
              {
                key: 'class',
                header: 'Kelas',
                sortable: true,
                accessor: (session) => session.schoolClass.code,
                sortAccessor: (session) => session.schoolClass.code
              },
              {
                key: 'subject',
                header: 'Mapel',
                sortable: true,
                accessor: (session) => session.subject.name,
                sortAccessor: (session) => session.subject.name
              },
              {
                key: 'teacher',
                header: 'Guru',
                sortable: true,
                accessor: (session) => session.teacher.fullName,
                sortAccessor: (session) => session.teacher.fullName
              },
              {
                key: 'startsAt',
                header: 'Mulai',
                sortable: true,
                accessor: (session) => formatDateTime(session.startsAt),
                sortAccessor: (session) => new Date(session.startsAt).getTime()
              },
              {
                key: 'status',
                header: 'Status',
                sortable: true,
                accessor: (session) => <StatusPill status={session.status} />,
                sortAccessor: (session) => session.status
              }
            ]}
          />
        )}
      </Card>

      <Sheet
        open={showCorrection}
        title="Koreksi Presensi"
        onClose={() => setShowCorrection(false)}
        side="right"
      >
        <div className="stack-sm">
          <p>
            Sesi: <strong>{selectedSession?.schoolClass.code ?? '-'} · {selectedSession?.subject.name ?? '-'}</strong>
          </p>

          <label>Siswa</label>
          <Select
            value={studentId}
            onChange={setStudentId}
            options={
              roster.length > 0
                ? [{ label: 'Pilih siswa', value: '' }, ...roster.map((item) => ({ label: item.fullName, value: item.studentId }))]
                : [{ label: 'Tidak ada siswa', value: '' }]
            }
          />

          <label>Status Baru</label>
          <Select
            value={status}
            onChange={(value) => setStatus(value as StudentAttendanceStatus)}
            options={statusOptions.map((item) => ({ label: labelForStatus(item), value: item }))}
          />

          <label>Catatan</label>
          <Textarea value={note} onChange={setNote} rows={2} placeholder="Opsional" />

          <label>Alasan Koreksi (wajib)</label>
          <Textarea
            value={reason}
            onChange={setReason}
            rows={4}
            placeholder="Contoh: Surat sakit diterima setelah sesi ditutup"
          />

          <div className="action-row">
            <Button variant="ghost" onClick={() => setShowCorrection(false)}>
              Batal
            </Button>
            <Button onClick={() => void submitCorrection()}>Simpan Koreksi</Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
