import { useEffect, useMemo, useState } from 'react';
import {
  createSchedule,
  listClasses,
  listSchedules,
  listSubjects,
  listUsers,
  updateSchedule
} from '../lib/api';
import { formatDateTime, formatTime, toIsoDateLocal } from '../lib/format';
import type { SessionItem } from '../types/domain';
import {
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
  useToast
} from '../components/ui';
import { labelForRole } from '../lib/uiLabels';

interface WeekDay {
  isoDate: string;
  label: string;
  short: string;
}

function toWeekStart(value: string) {
  const base = new Date(`${value}T00:00:00`);
  const day = base.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(base);
  weekStart.setDate(base.getDate() + offset);
  return weekStart;
}

function formatIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildWeekDays(anchorDate: string): WeekDay[] {
  const weekStart = toWeekStart(anchorDate);
  const dateFormatter = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' });
  const dayFormatter = new Intl.DateTimeFormat('id-ID', { weekday: 'short' });

  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return {
      isoDate: formatIsoDate(date),
      short: dayFormatter.format(date),
      label: dateFormatter.format(date)
    };
  });
}

function mergeSessionsById(sessionGroups: SessionItem[][]) {
  const dedup = new Map<string, SessionItem>();
  for (const sessions of sessionGroups) {
    for (const item of sessions) {
      dedup.set(item.id, item);
    }
  }
  return Array.from(dedup.values()).sort(
    (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()
  );
}

export function ScheduleManagementPage() {
  const { pushToast } = useToast();
  const [date, setDate] = useState(toIsoDateLocal());
  const [weekAnchorDate, setWeekAnchorDate] = useState(toIsoDateLocal());
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [weekSessions, setWeekSessions] = useState<SessionItem[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [teachers, setTeachers] = useState<Array<{ id: string; fullName: string; role: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [weekLoading, setWeekLoading] = useState(true);
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const [movingSessionId, setMovingSessionId] = useState<string | null>(null);

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [startsAt, setStartsAt] = useState(`${toIsoDateLocal()}T07:30`);
  const [endsAt, setEndsAt] = useState(`${toIsoDateLocal()}T08:15`);

  const weekDays = useMemo(() => buildWeekDays(weekAnchorDate), [weekAnchorDate]);

  const weekBuckets = useMemo(() => {
    return weekDays.map((day) => ({
      ...day,
      sessions: weekSessions
        .filter((session) => session.startsAt.slice(0, 10) === day.isoDate)
        .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
    }));
  }, [weekDays, weekSessions]);

  async function loadReferenceData() {
    try {
      const [classData, subjectData, userData] = await Promise.all([listClasses(), listSubjects(), listUsers()]);
      const teacherData = userData.filter(
        (user: any) => user.role === 'GURU_MAPEL' || user.role === 'GURU_PIKET'
      );

      setClasses(classData);
      setSubjects(subjectData);
      setTeachers(teacherData);

      if (!classId && classData[0]) setClassId(classData[0].id);
      if (!subjectId && subjectData[0]) setSubjectId(subjectData[0].id);
      if (!teacherId && teacherData[0]) setTeacherId(teacherData[0].id);
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memuat referensi jadwal.', 'error');
    }
  }

  async function loadDailySessions() {
    setLoading(true);
    try {
      const sessionData = await listSchedules(date);
      setSessions(sessionData);
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memuat jadwal harian.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadWeekSessions() {
    setWeekLoading(true);
    try {
      const data = await Promise.all(weekDays.map((day) => listSchedules(day.isoDate)));
      setWeekSessions(mergeSessionsById(data));
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memuat kalender mingguan.', 'error');
    } finally {
      setWeekLoading(false);
    }
  }

  useEffect(() => {
    void loadReferenceData();
  }, []);

  useEffect(() => {
    void loadDailySessions();
  }, [date]);

  useEffect(() => {
    void loadWeekSessions();
  }, [weekDays]);

  async function handleCreateSession() {
    if (!classId || !subjectId || !teacherId) {
      pushToast('Lengkapi semua field jadwal.', 'error');
      return;
    }

    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      pushToast('Rentang waktu sesi tidak valid.', 'error');
      return;
    }

    try {
      await createSchedule({
        classId,
        subjectId,
        teacherId,
        startsAt: start.toISOString(),
        endsAt: end.toISOString()
      });
      pushToast('Sesi baru berhasil dibuat.', 'success');
      await Promise.all([loadDailySessions(), loadWeekSessions()]);
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal membuat sesi.', 'error');
    }
  }

  async function moveSessionToDay(session: SessionItem, targetDate: string) {
    const currentStart = new Date(session.startsAt);
    const currentEnd = new Date(session.endsAt);
    const durationMs = currentEnd.getTime() - currentStart.getTime();
    const movedStart = new Date(`${targetDate}T00:00:00`);
    movedStart.setHours(currentStart.getHours(), currentStart.getMinutes(), 0, 0);
    const movedEnd = new Date(movedStart.getTime() + durationMs);

    setMovingSessionId(session.id);
    try {
      await updateSchedule(session.id, {
        startsAt: movedStart.toISOString(),
        endsAt: movedEnd.toISOString()
      });
      pushToast(`Sesi ${session.schoolClass.code} dipindah ke ${targetDate}.`, 'success');
      await Promise.all([loadDailySessions(), loadWeekSessions()]);
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memindahkan sesi.', 'error');
    } finally {
      setMovingSessionId(null);
    }
  }

  function handleDropOnDay(targetDate: string) {
    if (!draggingSessionId) return;
    const dragged = weekSessions.find((item) => item.id === draggingSessionId);
    setDraggingSessionId(null);
    if (!dragged) return;

    if (dragged.status !== 'SCHEDULED') {
      pushToast('Hanya sesi berstatus terjadwal yang dapat dipindah.', 'error');
      return;
    }

    if (dragged.startsAt.slice(0, 10) === targetDate) {
      return;
    }

    void moveSessionToDay(dragged, targetDate);
  }

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Manajemen Jadwal & Sesi</h2>
        <p>Susun sesi harian, pindahkan sesi pada kalender mingguan, dan pantau status operasional kelas.</p>
      </Card>

      <Tabs defaultValue="create">
        <TabsList>
          <TabsTrigger value="create">Buat Sesi</TabsTrigger>
          <TabsTrigger value="list">Daftar Harian</TabsTrigger>
          <TabsTrigger value="calendar">Kalender Mingguan</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <Card>
            <h3>Buat Sesi Baru</h3>
            <div className="grid cols-2">
              <div className="stack-sm">
                <label>Kelas</label>
                <Select
                  value={classId}
                  onChange={setClassId}
                  options={
                    classes.length > 0
                      ? classes.map((item) => ({ label: `${item.code} · ${item.name}`, value: item.id }))
                      : [{ label: 'Belum ada kelas', value: '' }]
                  }
                />

                <label>Mapel</label>
                <Select
                  value={subjectId}
                  onChange={setSubjectId}
                  options={
                    subjects.length > 0
                      ? subjects.map((item) => ({ label: `${item.code} · ${item.name}`, value: item.id }))
                      : [{ label: 'Belum ada mapel', value: '' }]
                  }
                />

                <label>Guru</label>
                <Select
                  value={teacherId}
                  onChange={setTeacherId}
                  options={
                    teachers.length > 0
                      ? teachers.map((item) => ({ label: `${item.fullName} (${labelForRole(item.role)})`, value: item.id }))
                      : [{ label: 'Belum ada guru', value: '' }]
                  }
                />
              </div>

              <div className="stack-sm">
                <label>Mulai</label>
                <Input type="datetime-local" value={startsAt} onChange={setStartsAt} />

                <label>Selesai</label>
                <Input type="datetime-local" value={endsAt} onChange={setEndsAt} />

                <Button onClick={() => void handleCreateSession()}>Simpan Jadwal</Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="list">
          <Card>
            <div className="section-header">
              <h3>Sesi Terjadwal</h3>
              <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>

            {sessions.length === 0 && !loading ? (
              <EmptyState title="Belum ada sesi" description="Tidak ada sesi pada tanggal ini." />
            ) : (
              <Table
                rows={sessions}
                loading={loading}
                title="Daftar Sesi"
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
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <div className="section-header">
              <div>
                <h3>Kalender Mingguan Interaktif</h3>
                <p>Seret kartu sesi ke kolom hari lain untuk menjadwal ulang sesi terjadwal.</p>
              </div>
              <div className="action-row">
                <input
                  className="input"
                  type="date"
                  value={weekAnchorDate}
                  onChange={(event) => setWeekAnchorDate(event.target.value)}
                />
                <Button variant="secondary" onClick={() => void loadWeekSessions()}>
                  Muat Ulang Mingguan
                </Button>
              </div>
            </div>

            {weekLoading ? <p>Memuat kalender mingguan...</p> : null}

            <div className="weekly-calendar-grid">
              {weekBuckets.map((day) => (
                <section
                  key={day.isoDate}
                  className="weekly-day-column"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDropOnDay(day.isoDate)}
                >
                  <header className="weekly-day-header">
                    <strong>{day.short}</strong>
                    <small>{day.label}</small>
                  </header>

                  {day.sessions.length === 0 ? (
                    <div className="weekly-empty-slot">Belum ada sesi. Drop sesi ke sini.</div>
                  ) : (
                    day.sessions.map((session) => {
                      const canDrag = session.status === 'SCHEDULED';
                      return (
                        <article
                          key={session.id}
                          className={canDrag ? 'weekly-session-card' : 'weekly-session-card weekly-session-card-locked'}
                          draggable={canDrag}
                          onDragStart={() => setDraggingSessionId(session.id)}
                          onDragEnd={() => setDraggingSessionId(null)}
                        >
                          <div className="action-row">
                            <StatusPill status={session.status} />
                            {movingSessionId === session.id ? <Badge tone="warning">Memindah...</Badge> : null}
                          </div>
                          <strong>
                            {session.schoolClass.code} · {session.subject.name}
                          </strong>
                          <p>
                            {formatTime(session.startsAt)} - {formatTime(session.endsAt)}
                          </p>
                          <small>{session.teacher.fullName}</small>
                          <small>{canDrag ? 'Seret ke hari lain untuk penjadwalan ulang.' : 'Status ini dikunci.'}</small>
                        </article>
                      );
                    })
                  )}
                </section>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
