import { useEffect, useMemo, useState } from 'react';
import {
  downloadReport,
  getAuditCoverage,
  getRecapClasses,
  getRecapStudents,
  getRecapSubjects,
  getRecapTeachers,
  getTeacherMonthly,
  getTrend,
  listClasses,
  listSubjects,
  listUsers
} from '../lib/api';
import { formatDateTime } from '../lib/format';
import type {
  AuditCoverageResponse,
  BasicUser,
  ClassRecapResponse,
  StudentRecapResponse,
  SubjectRecapResponse,
  TeacherMonthlyResponse,
  TeacherRecapResponse,
  TrendItem
} from '../types/domain';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Select,
  StatCard,
  StatusPill,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast
} from '../components/ui';
import { labelForRole } from '../lib/uiLabels';

type ReportTab = 'classes' | 'students' | 'subjects' | 'teachers' | 'teacherMonthly' | 'auditCoverage';
const reportTabLabelMap: Record<ReportTab, string> = {
  classes: 'Rekap Kelas',
  students: 'Rekap Siswa',
  subjects: 'Rekap Mapel',
  teachers: 'Rekap Guru',
  teacherMonthly: 'Bulanan Guru',
  auditCoverage: 'Audit Cakupan'
};

export function ReportsPage() {
  const { pushToast } = useToast();

  const [activeTab, setActiveTab] = useState<ReportTab>('classes');
  const [loadingTrend, setLoadingTrend] = useState(true);
  const [loadingReport, setLoadingReport] = useState(true);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);

  const [trend, setTrend] = useState<TrendItem[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [users, setUsers] = useState<BasicUser[]>([]);

  const [classRecap, setClassRecap] = useState<ClassRecapResponse | null>(null);
  const [studentRecap, setStudentRecap] = useState<StudentRecapResponse | null>(null);
  const [subjectRecap, setSubjectRecap] = useState<SubjectRecapResponse | null>(null);
  const [teacherRecap, setTeacherRecap] = useState<TeacherRecapResponse | null>(null);
  const [teacherMonthly, setTeacherMonthly] = useState<TeacherMonthlyResponse | null>(null);
  const [auditCoverage, setAuditCoverage] = useState<AuditCoverageResponse | null>(null);

  const [from, setFrom] = useState(() => new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [studentId, setStudentId] = useState('');

  const teacherOptions = useMemo(
    () => users.filter((user) => user.role === 'GURU_MAPEL' || user.role === 'GURU_PIKET'),
    [users]
  );
  const studentOptions = useMemo(() => users.filter((user) => user.role === 'SISWA'), [users]);

  const trendSummary = useMemo(() => {
    const sessions = trend.reduce((total, item) => total + item.sessions, 0);
    const closed = trend.reduce((total, item) => total + item.closed, 0);
    const anomalies = trend.reduce((total, item) => total + item.anomalies, 0);
    const coverage = sessions === 0 ? 0 : Number(((closed / sessions) * 100).toFixed(2));

    return { sessions, closed, anomalies, coverage };
  }, [trend]);

  async function loadReferenceData() {
    try {
      const [classData, subjectData, userData] = await Promise.all([listClasses(), listSubjects(), listUsers()]);

      setClasses(classData);
      setSubjects(subjectData);
      setUsers(userData);

      if (!classId && classData[0]) setClassId(classData[0].id);
      if (!subjectId && subjectData[0]) setSubjectId(subjectData[0].id);
      if (!teacherId && userData.find((user) => user.role === 'GURU_MAPEL' || user.role === 'GURU_PIKET')) {
        const firstTeacher = userData.find((user) => user.role === 'GURU_MAPEL' || user.role === 'GURU_PIKET');
        if (firstTeacher) setTeacherId(firstTeacher.id);
      }
      if (!studentId && userData.find((user) => user.role === 'SISWA')) {
        const firstStudent = userData.find((user) => user.role === 'SISWA');
        if (firstStudent) setStudentId(firstStudent.id);
      }
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memuat data referensi laporan.', 'error');
    }
  }

  async function loadTrendData() {
    setLoadingTrend(true);
    try {
      const data = await getTrend(14);
      setTrend(data.items);
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memuat tren laporan.', 'error');
    } finally {
      setLoadingTrend(false);
    }
  }

  async function loadActiveReport() {
    setLoadingReport(true);

    try {
      if (activeTab === 'classes') {
        const data = await getRecapClasses({
          from,
          to,
          classId: classId || undefined,
          subjectId: subjectId || undefined,
          teacherId: teacherId || undefined,
          page: 1,
          limit: 200
        });
        setClassRecap(data);
      }

      if (activeTab === 'students') {
        const data = await getRecapStudents({
          from,
          to,
          classId: classId || undefined,
          subjectId: subjectId || undefined,
          teacherId: teacherId || undefined,
          studentId: studentId || undefined,
          page: 1,
          limit: 200
        });
        setStudentRecap(data);
      }

      if (activeTab === 'subjects') {
        const data = await getRecapSubjects({
          from,
          to,
          classId: classId || undefined,
          subjectId: subjectId || undefined,
          teacherId: teacherId || undefined,
          page: 1,
          limit: 200
        });
        setSubjectRecap(data);
      }

      if (activeTab === 'teachers') {
        const data = await getRecapTeachers({
          from,
          to,
          classId: classId || undefined,
          subjectId: subjectId || undefined,
          teacherId: teacherId || undefined,
          page: 1,
          limit: 200
        });
        setTeacherRecap(data);
      }

      if (activeTab === 'teacherMonthly') {
        const data = await getTeacherMonthly({
          month,
          teacherId: teacherId || undefined,
          page: 1,
          limit: 200
        });
        setTeacherMonthly(data);
      }

      if (activeTab === 'auditCoverage') {
        const data = await getAuditCoverage({
          from,
          to,
          classId: classId || undefined,
          subjectId: subjectId || undefined,
          teacherId: teacherId || undefined,
          page: 1,
          limit: 200
        });
        setAuditCoverage(data);
      }
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memuat data laporan.', 'error');
    } finally {
      setLoadingReport(false);
    }
  }

  async function handleExport(format: 'csv' | 'xlsx') {
    setExporting(format);

    try {
      const reportTypeMap: Record<ReportTab, 'recap_classes' | 'recap_students' | 'recap_subjects' | 'recap_teachers' | 'teacher_monthly' | 'audit_coverage'> = {
        classes: 'recap_classes',
        students: 'recap_students',
        subjects: 'recap_subjects',
        teachers: 'recap_teachers',
        teacherMonthly: 'teacher_monthly',
        auditCoverage: 'audit_coverage'
      };

      const result = await downloadReport({
        reportType: reportTypeMap[activeTab],
        format,
        from,
        to,
        classId: classId || undefined,
        subjectId: subjectId || undefined,
        teacherId: teacherId || undefined,
        studentId: activeTab === 'students' ? studentId || undefined : undefined,
        month: activeTab === 'teacherMonthly' ? month : undefined
      });

      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      pushToast(`Ekspor ${format.toUpperCase()} selesai.`, 'success');
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? `Gagal mengekspor ${format.toUpperCase()}.`, 'error');
    } finally {
      setExporting(null);
    }
  }

  useEffect(() => {
    void loadReferenceData();
    void loadTrendData();
  }, []);

  useEffect(() => {
    void loadActiveReport();
  }, [activeTab]);

  function renderSummary() {
    if (activeTab === 'classes' && classRecap) {
      return (
        <section className="grid cols-4">
          <StatCard label="Kelas" value={classRecap.summary.classCount} />
          <StatCard label="Sesi" value={classRecap.summary.sessionCount} />
          <StatCard label="Sesi Selesai" value={classRecap.summary.closedSessionCount} tone="success" />
          <StatCard label="Rekaman Presensi" value={classRecap.summary.attendanceRecords} />
        </section>
      );
    }

    if (activeTab === 'students' && studentRecap) {
      return (
        <section className="grid cols-4">
          <StatCard label="Siswa" value={studentRecap.summary.studentCount} />
          <StatCard label="Rekaman" value={studentRecap.summary.attendanceRecords} />
          <StatCard label="Rentang" value={`${studentRecap.range.from.slice(0, 10)} s/d ${studentRecap.range.to.slice(0, 10)}`} />
          <StatCard label="Jumlah Data" value={studentRecap.meta.total} />
        </section>
      );
    }

    if (activeTab === 'subjects' && subjectRecap) {
      return (
        <section className="grid cols-4">
          <StatCard label="Mapel" value={subjectRecap.summary.subjectCount} />
          <StatCard label="Sesi" value={subjectRecap.summary.sessionCount} />
          <StatCard label="Rentang" value={`${subjectRecap.range.from.slice(0, 10)} s/d ${subjectRecap.range.to.slice(0, 10)}`} />
          <StatCard label="Jumlah Data" value={subjectRecap.meta.total} />
        </section>
      );
    }

    if (activeTab === 'teachers' && teacherRecap) {
      return (
        <section className="grid cols-4">
          <StatCard label="Guru" value={teacherRecap.summary.teacherCount} />
          <StatCard label="Sesi" value={teacherRecap.summary.sessionCount} />
          <StatCard label="Sesi Selesai" value={teacherRecap.summary.closedSessionCount} tone="success" />
          <StatCard label="Jumlah Data" value={teacherRecap.meta.total} />
        </section>
      );
    }

    if (activeTab === 'teacherMonthly' && teacherMonthly) {
      return (
        <section className="grid cols-4">
          <StatCard label="Bulan" value={teacherMonthly.summary.month} />
          <StatCard label="Guru" value={teacherMonthly.summary.teacherCount} />
          <StatCard label="Sesi" value={teacherMonthly.summary.sessionCount} />
          <StatCard label="Sesi Selesai" value={teacherMonthly.summary.closedSessionCount} tone="success" />
        </section>
      );
    }

    if (activeTab === 'auditCoverage' && auditCoverage) {
      return (
        <section className="grid cols-4">
          <StatCard label="Sesi" value={auditCoverage.summary.sessionCount} />
          <StatCard label="Cakupan Penuh" value={auditCoverage.summary.fullyCoveredCount} tone="success" />
          <StatCard label="Rata-rata Cakupan" value={`${auditCoverage.summary.averageCoveragePercent}%`} />
          <StatCard label="Aksi Belum Lengkap" value={auditCoverage.summary.missingActionCount} tone="warning" />
        </section>
      );
    }

    return null;
  }

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Laporan Rekap</h2>
        <p>Rekap kelas, siswa, mapel, guru, dan audit cakupan sesi dengan ekspor CSV/XLSX dari satu panel.</p>
      </Card>

      <section className="grid cols-4">
        <StatCard label="Sesi (14 Hari)" value={trendSummary.sessions} />
        <StatCard label="Sesi Selesai" value={trendSummary.closed} tone="success" />
        <StatCard label="Anomali" value={trendSummary.anomalies} tone="warning" />
        <StatCard label="Cakupan" value={`${trendSummary.coverage}%`} />
      </section>

      <Card>
        <h3>Tren 14 Hari</h3>
        {loadingTrend ? (
          <EmptyState title="Memuat tren..." description="Menunggu data tren dari server." />
        ) : trend.length === 0 ? (
          <EmptyState title="Tren belum tersedia" description="Data tren akan muncul setelah ada sesi berjalan." />
        ) : (
          <ul className="trend-list">
            {trend.map((item) => (
              <li key={item.date}>
                <div>
                  <strong>{item.date}</strong>
                  <p>
                    Sesi {item.sessions} · Selesai {item.closed} · Anomali {item.anomalies}
                  </p>
                </div>
                <div className="trend-bar-wrap">
                  <div className="trend-bar" style={{ width: `${Math.min(item.coveragePercent, 100)}%` }} />
                  <span>{item.coveragePercent}%</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="toolbar">
          {activeTab === 'teacherMonthly' ? (
            <>
              <div className="toolbar-group">
                <label>Bulan</label>
                <input className="input" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div className="toolbar-group">
                <label>Dari</label>
                <input className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </div>

              <div className="toolbar-group">
                <label>Sampai</label>
                <input className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </div>
            </>
          )}

          <div className="toolbar-group">
            <label>Kelas</label>
            <Select
              value={classId}
              onChange={setClassId}
              options={[
                { label: 'Semua Kelas', value: '' },
                ...classes.map((item) => ({ label: `${item.code} · ${item.name}`, value: item.id }))
              ]}
            />
          </div>

          <div className="toolbar-group">
            <label>Mapel</label>
            <Select
              value={subjectId}
              onChange={setSubjectId}
              options={[
                { label: 'Semua Mapel', value: '' },
                ...subjects.map((item) => ({ label: `${item.code} · ${item.name}`, value: item.id }))
              ]}
            />
          </div>

          <div className="toolbar-group">
            <label>Guru</label>
                <Select
                  value={teacherId}
                  onChange={setTeacherId}
                  options={[
                    { label: 'Semua Guru', value: '' },
                    ...teacherOptions.map((item) => ({ label: `${item.fullName} (${labelForRole(item.role)})`, value: item.id }))
                  ]}
                />
              </div>

          {activeTab === 'students' ? (
            <div className="toolbar-group">
              <label>Siswa</label>
              <Select
                value={studentId}
                onChange={setStudentId}
                options={[
                  { label: 'Semua Siswa', value: '' },
                  ...studentOptions.map((item) => ({ label: item.fullName, value: item.id }))
                ]}
              />
            </div>
          ) : null}
        </div>

        <div className="action-row wrap" style={{ marginBottom: '0.75rem' }}>
          <Button onClick={() => void loadActiveReport()} disabled={loadingReport}>
            {loadingReport ? 'Memuat...' : 'Terapkan Filter'}
          </Button>
          <Button variant="secondary" onClick={() => void handleExport('csv')} disabled={exporting !== null}>
            {exporting === 'csv' ? 'Mengekspor CSV...' : 'Ekspor CSV'}
          </Button>
          <Button variant="secondary" onClick={() => void handleExport('xlsx')} disabled={exporting !== null}>
            {exporting === 'xlsx' ? 'Mengekspor XLSX...' : 'Ekspor XLSX'}
          </Button>
          <Badge tone="info">Tab aktif: {reportTabLabelMap[activeTab]}</Badge>
        </div>
      </Card>

      {renderSummary()}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ReportTab)} defaultValue="classes">
        <TabsList>
          <TabsTrigger value="classes">Rekap Kelas</TabsTrigger>
          <TabsTrigger value="students">Rekap Siswa</TabsTrigger>
          <TabsTrigger value="subjects">Rekap Mapel</TabsTrigger>
          <TabsTrigger value="teachers">Rekap Guru</TabsTrigger>
          <TabsTrigger value="teacherMonthly">Bulanan Guru</TabsTrigger>
          <TabsTrigger value="auditCoverage">Audit Cakupan</TabsTrigger>
        </TabsList>

        <TabsContent value="classes">
          <Card>
            <Table
              rows={(classRecap?.items ?? []).map((item) => ({ ...item, id: item.classId }))}
              loading={loadingReport}
              title="Rekap Kelas"
              searchPlaceholder="Cari kelas"
              searchAccessor={(row) => `${row.classCode} ${row.className}`}
              columns={[
                {
                  key: 'class',
                  header: 'Kelas',
                  sortable: true,
                  accessor: (row) => `${row.classCode} · ${row.className}`,
                  sortAccessor: (row) => row.classCode
                },
                {
                  key: 'sessions',
                  header: 'Sesi',
                  sortable: true,
                  accessor: (row) => row.sessionCount,
                  sortAccessor: (row) => row.sessionCount
                },
                {
                  key: 'closed',
                  header: 'Selesai',
                  sortable: true,
                  accessor: (row) => row.closedSessions,
                  sortAccessor: (row) => row.closedSessions
                },
                {
                  key: 'coverage',
                  header: 'Cakupan',
                  sortable: true,
                  accessor: (row) => `${row.attendanceCoveragePercent}%`,
                  sortAccessor: (row) => row.attendanceCoveragePercent
                },
                {
                  key: 'mix',
                  header: 'Guru/Mapel',
                  accessor: (row) => `${row.uniqueTeacherCount} guru · ${row.uniqueSubjectCount} mapel`
                },
                {
                  key: 'counters',
                  header: 'Status',
                  accessor: (row) =>
                    `H ${row.counters.HADIR} · T ${row.counters.TELAT} · I ${row.counters.IZIN} · S ${row.counters.SAKIT} · A ${row.counters.ALPA}`
                }
              ]}
            />
          </Card>
        </TabsContent>

        <TabsContent value="students">
          <Card>
            <Table
              rows={(studentRecap?.items ?? []).map((item) => ({ ...item, id: item.studentId }))}
              loading={loadingReport}
              title="Rekap Siswa"
              searchPlaceholder="Cari siswa"
              searchAccessor={(row) => `${row.fullName} ${row.username} ${row.classCodes.join(' ')}`}
              columns={[
                {
                  key: 'student',
                  header: 'Siswa',
                  sortable: true,
                  accessor: (row) => `${row.fullName} (${row.username})`,
                  sortAccessor: (row) => row.fullName
                },
                {
                  key: 'classes',
                  header: 'Kelas',
                  accessor: (row) => row.classCodes.join(', ') || '-'
                },
                {
                  key: 'records',
                  header: 'Rekaman',
                  sortable: true,
                  accessor: (row) => row.attendanceCount,
                  sortAccessor: (row) => row.attendanceCount
                },
                {
                  key: 'presentPercent',
                  header: 'Persentase Hadir',
                  sortable: true,
                  accessor: (row) => `${row.presentPercent}%`,
                  sortAccessor: (row) => row.presentPercent
                },
                {
                  key: 'status',
                  header: 'Status',
                  accessor: (row) =>
                    `H ${row.counters.HADIR} · T ${row.counters.TELAT} · I ${row.counters.IZIN} · S ${row.counters.SAKIT} · A ${row.counters.ALPA}`
                },
                {
                  key: 'latest',
                  header: 'Terakhir',
                  accessor: (row) => (row.latestAt ? formatDateTime(row.latestAt) : '-')
                }
              ]}
            />
          </Card>
        </TabsContent>

        <TabsContent value="subjects">
          <Card>
            <Table
              rows={(subjectRecap?.items ?? []).map((item) => ({ ...item, id: item.subjectId }))}
              loading={loadingReport}
              title="Rekap Mapel"
              searchPlaceholder="Cari mapel"
              searchAccessor={(row) => `${row.subjectCode} ${row.subjectName}`}
              columns={[
                {
                  key: 'subject',
                  header: 'Mapel',
                  sortable: true,
                  accessor: (row) => `${row.subjectCode} · ${row.subjectName}`,
                  sortAccessor: (row) => row.subjectCode
                },
                {
                  key: 'sessions',
                  header: 'Sesi',
                  sortable: true,
                  accessor: (row) => row.sessionCount,
                  sortAccessor: (row) => row.sessionCount
                },
                {
                  key: 'coverage',
                  header: 'Cakupan',
                  sortable: true,
                  accessor: (row) => `${row.attendanceCoveragePercent}%`,
                  sortAccessor: (row) => row.attendanceCoveragePercent
                },
                {
                  key: 'presence',
                  header: 'Kehadiran',
                  sortable: true,
                  accessor: (row) => `${row.presencePercent}%`,
                  sortAccessor: (row) => row.presencePercent
                },
                {
                  key: 'mix',
                  header: 'Kelas/Guru',
                  accessor: (row) => `${row.classCount} kelas · ${row.teacherCount} guru`
                },
                {
                  key: 'status',
                  header: 'Status',
                  accessor: (row) =>
                    `H ${row.counters.HADIR} · T ${row.counters.TELAT} · I ${row.counters.IZIN} · S ${row.counters.SAKIT} · A ${row.counters.ALPA}`
                }
              ]}
            />
          </Card>
        </TabsContent>

        <TabsContent value="teachers">
          <Card>
            <Table
              rows={(teacherRecap?.items ?? []).map((item) => ({ ...item, id: item.teacherId }))}
              loading={loadingReport}
              title="Rekap Guru"
              searchPlaceholder="Cari guru"
              searchAccessor={(row) => `${row.fullName} ${row.username}`}
              columns={[
                {
                  key: 'teacher',
                  header: 'Guru',
                  sortable: true,
                  accessor: (row) => `${row.fullName} (${row.username})`,
                  sortAccessor: (row) => row.fullName
                },
                {
                  key: 'sessions',
                  header: 'Sesi',
                  sortable: true,
                  accessor: (row) => `${row.closedSessionCount}/${row.sessionCount}`,
                  sortAccessor: (row) => row.sessionCount
                },
                {
                  key: 'coverage',
                  header: 'Cakupan',
                  sortable: true,
                  accessor: (row) => `${row.sessionCoveragePercent}%`,
                  sortAccessor: (row) => row.sessionCoveragePercent
                },
                {
                  key: 'presence',
                  header: 'Kehadiran',
                  sortable: true,
                  accessor: (row) => `${row.presencePercent}%`,
                  sortAccessor: (row) => row.presencePercent
                },
                {
                  key: 'mix',
                  header: 'Kelas/Mapel',
                  accessor: (row) => `${row.classCount} kelas · ${row.subjectCount} mapel`
                },
                {
                  key: 'status',
                  header: 'Ringkasan Status',
                  accessor: (row) =>
                    `H ${row.counters.HADIR} · T ${row.counters.TELAT} · E ${row.counters.EXCUSED_ABSENCE} · A ${row.counters.ALPA_MENGAJAR}`
                }
              ]}
            />
          </Card>
        </TabsContent>

        <TabsContent value="teacherMonthly">
          <Card>
            <Table
              rows={(teacherMonthly?.items ?? []).map((item) => ({ ...item, id: item.teacherId }))}
              loading={loadingReport}
              title="Laporan Bulanan Guru"
              searchPlaceholder="Cari guru"
              searchAccessor={(row) => `${row.fullName} ${row.username} ${row.month}`}
              columns={[
                {
                  key: 'teacher',
                  header: 'Guru',
                  sortable: true,
                  accessor: (row) => `${row.fullName} (${row.username})`,
                  sortAccessor: (row) => row.fullName
                },
                {
                  key: 'month',
                  header: 'Bulan',
                  sortable: true,
                  accessor: (row) => row.month,
                  sortAccessor: (row) => row.month
                },
                {
                  key: 'sessions',
                  header: 'Sesi',
                  sortable: true,
                  accessor: (row) => `${row.closedSessionCount}/${row.sessionCount}`,
                  sortAccessor: (row) => row.sessionCount
                },
                {
                  key: 'coverage',
                  header: 'Cakupan',
                  sortable: true,
                  accessor: (row) => `${row.sessionCoveragePercent}%`,
                  sortAccessor: (row) => row.sessionCoveragePercent
                },
                {
                  key: 'presence',
                  header: 'Kehadiran',
                  sortable: true,
                  accessor: (row) => `${row.presencePercent}%`,
                  sortAccessor: (row) => row.presencePercent
                },
                {
                  key: 'status',
                  header: 'Ringkasan Status',
                  accessor: (row) =>
                    `H ${row.counters.HADIR} · T ${row.counters.TELAT} · E ${row.counters.EXCUSED_ABSENCE} · A ${row.counters.ALPA_MENGAJAR}`
                }
              ]}
            />
          </Card>
        </TabsContent>

        <TabsContent value="auditCoverage">
          <Card>
            <Table
              rows={(auditCoverage?.items ?? []).map((item) => ({ ...item, id: item.sessionId }))}
              loading={loadingReport}
              title="Audit Cakupan Sesi"
              searchPlaceholder="Cari sesi, kelas, mapel, guru"
              searchAccessor={(row) =>
                `${row.classCode} ${row.subjectCode} ${row.subjectName} ${row.teacherName} ${row.status} ${row.missingActions.join(' ')}`
              }
              columns={[
                {
                  key: 'session',
                  header: 'Sesi',
                  accessor: (row) => `${row.classCode} · ${row.subjectCode} · ${row.subjectName}`
                },
                {
                  key: 'teacher',
                  header: 'Guru',
                  sortable: true,
                  accessor: (row) => row.teacherName,
                  sortAccessor: (row) => row.teacherName
                },
                {
                  key: 'status',
                  header: 'Status',
                  sortable: true,
                  accessor: (row) => <StatusPill status={row.status} />,
                  sortAccessor: (row) => row.status
                },
                {
                  key: 'startsAt',
                  header: 'Mulai',
                  sortable: true,
                  accessor: (row) => formatDateTime(row.startsAt),
                  sortAccessor: (row) => new Date(row.startsAt).getTime()
                },
                {
                  key: 'coverage',
                  header: 'Cakupan',
                  sortable: true,
                  accessor: (row) =>
                    row.coveragePercent >= 100 ? (
                      <Badge tone="success">{row.coveragePercent}%</Badge>
                    ) : row.coveragePercent >= 50 ? (
                      <Badge tone="warning">{row.coveragePercent}%</Badge>
                    ) : (
                      <Badge tone="danger">{row.coveragePercent}%</Badge>
                    ),
                  sortAccessor: (row) => row.coveragePercent
                },
                {
                  key: 'missing',
                  header: 'Aksi yang Belum Lengkap',
                  accessor: (row) => (row.missingActions.length > 0 ? row.missingActions.join(', ') : '-')
                }
              ]}
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
