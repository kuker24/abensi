import { useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, Building2, Calendar, Check, Clock, Copy, CreditCard, DoorOpen, Download, Eye, FileText, Flag, HelpCircle, KeyRound, ListChecks, Plus, QrCode, Radar, RefreshCw, Save, ShieldCheck, Smartphone, Users, Wifi, Zap, Activity, TrendingUp, AlertOctagon, ScanLine } from 'lucide-react';
import { apiDownload, apiFetch, formatDateTime, go, itemsOf, metaOf, monthNow, qs, readStoredUser, today } from '../../api';
import { riskConfirm } from '../../confirm';
import { useForm, useRemote } from '../../hooks';
import { AsyncTable, Avatar, Btn, Card, DataTable, EmptyState, ErrorState, Field, FriendlyEmptyState, HorizontalBarList, LoadingState, PageHead, Pagination, Pill, ProgressRing, QuickActionCard, RoleTaskPanel, SelectInput, SimpleHelpBox, StackedBar, StatCardPremium, StatusPill, StepGuide, TextInput, TrendChart, statusLabel } from '../../ui';

function downloadJsonFile(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadCsvFile(rows, filename) {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const headers = Object.keys(rows[0] || {});
  const csv = [headers.join(','), ...rows.map((row) => headers.map((key) => escape(row[key])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function sanitizeQrResult(value) {
  if (Array.isArray(value)) return value.map(sanitizeQrResult);
  if (!value || typeof value !== 'object') return value;
  const source = value;
  return Object.fromEntries(Object.entries(source).map(([key, item]) => {
    if (key === 'qrCode') return [key, source.qrMasked || '[QR resmi disembunyikan dari pratinjau]'];
    return [key, sanitizeQrResult(item)];
  }));
}

function DashboardMiniList({ state, type }) {
  if (state.loading) return <LoadingState label="Memuat ringkasan…" />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.refresh} />;
  const rows = itemsOf(state.data).slice(0, 8);
  if (!rows.length) return <div className="dashboard-list-empty">Belum ada data terbaru.</div>;
  return <div className="dashboard-mini-list">{rows.map((row, index) => {
    const isAnomaly = type === 'anomaly';
    const status = isAnomaly ? row.type : (row.type || row.event || row.direction || row.result || 'AKTIVITAS');
    const title = isAnomaly ? (row.user?.fullName || row.fullName || row.userId || 'Subjek belum diketahui') : (row.fullName || row.who || row.user?.fullName || row.actorName || row.context || statusLabel(status));
    const meta = isAnomaly
      ? [row.session?.schoolClass?.code, row.session?.subject?.name, formatDateTime(row.createdAt)].filter(Boolean).join(' · ')
      : [row.location, row.context, row.method, formatDateTime(row.at || row.timestamp || row.tappedAt || row.createdAt)].filter(Boolean).join(' · ');
    return <div className="dashboard-mini-row" key={row.id || `${type}-${index}`}><div className="dashboard-mini-main"><StatusPill status={status} /><div><b>{title}</b><span>{meta || 'Data terbaru dari sistem'}</span></div></div><div className="dashboard-mini-side">{isAnomaly ? <StatusPill status={row.status || row.reviewStatus} /> : <span>{formatDateTime(row.at || row.timestamp || row.tappedAt || row.createdAt)}</span>}</div></div>;
  })}</div>;
}

export function AdminDashboard() {
  const dashboard = useRemote(() => apiFetch('/reports/dashboard'), []);
  const trend = useRemote(() => apiFetch('/reports/trend?days=7'), []);
  const flags = useRemote(() => apiFetch('/reconciliation/flags?status=OPEN&page=1&limit=5'), []);
  const live = useRemote(() => apiFetch('/reports/live-monitor?page=1&limit=8'), []);
  const d = dashboard.data || {};
  const coverage = Number(d.attendanceCoveragePercent ?? d.coveragePercent ?? 0) || 0;
  const closed = Number(d.closedSessions ?? 0) || 0;
  const open = Number(d.openSessions ?? 0) || 0;
  const scheduled = Math.max(0, Number(d.scheduledSessions ?? d.sessionsToday ?? 0) - closed - open);
  const openFlags = Number(d.openFlags ?? itemsOf(flags.data).length) || 0;
  const gateScans = Number(d.gateTapCount ?? d.gateLogsToday ?? 0) || 0;

  return <div className="content dashboard-redesign"><PageHead eyebrow="COMMAND CENTER" title="Ringkasan Admin" sub="Pantau operasi sekolah hari ini dari satu layar: sesi, scan, cakupan, dan masalah aktif." actions={<><Btn onClick={() => go('/admin/reports')}><FileText size={14} /> Buka laporan</Btn><Btn variant="primary" onClick={() => go('/admin/anomaly')}><Flag size={14} /> Cek masalah</Btn></>} />
    <section className="dashboard-hero admin-hero">
      <div className="dashboard-hero-copy">
        <div className="eyebrow"><span className="dot" /> PRIORITAS HARI INI</div>
        <h2>Pastikan data hadir lengkap sebelum jam operasional berakhir.</h2>
        <p>Mulai dari masalah aktif, lalu cek sesi berjalan dan aktivitas scan gerbang. Semua tombol di bawah diarahkan ke pekerjaan harian utama.</p>
        <div className="dashboard-hero-actions"><Btn variant="primary" size="lg" onClick={() => go('/admin/anomaly')}><AlertOctagon size={16} /> Tindak {openFlags} masalah</Btn><Btn size="lg" onClick={() => go('/admin/sessions')}><Radar size={16} /> Pantau sesi</Btn></div>
      </div>
      <div className="dashboard-hero-panel">
        <ProgressRing value={coverage} label="Cakupan presensi" sub={`${coverage}% data sudah tercatat`} />
        <div className="hero-kpi-grid"><span><b>{d.sessionsToday ?? 0}</b>Sesi hari ini</span><span><b>{gateScans}</b>Scan gerbang</span><span><b>{openFlags}</b>Masalah aktif</span></div>
      </div>
    </section>

    <RoleTaskPanel title="Aksi cepat admin" tasks={[{ title: 'Cek sesi kelas', desc: 'Lihat kelas yang berjalan, selesai, atau terlewat.', icon: <Radar size={18} />, onClick: () => go('/admin/sessions') }, { title: 'Cek masalah', desc: 'Tindak data yang belum cocok atau perlu alasan.', icon: <Flag size={18} />, tone: 'warn', onClick: () => go('/admin/anomaly') }, { title: 'Buat akun / data', desc: 'Tambah guru, siswa, kelas, mapel, dan pendaftaran.', icon: <Users size={18} />, onClick: () => go('/admin/master-data') }, { title: 'Aktivasi HP Scanner', desc: 'Buat kode aktivasi untuk HP Android gerbang/mushola.', icon: <Smartphone size={18} />, tone: 'ok', onClick: () => go('/admin/devices') }]} />

    {dashboard.loading ? <LoadingState /> : dashboard.error ? <ErrorState error={dashboard.error} onRetry={dashboard.refresh} /> : <><div className="grid g-4">
      <StatCardPremium icon={<Activity size={20} />} label="Sesi Hari Ini" value={d.sessionsToday ?? 0} sub={`${closed} selesai · ${open} berjalan`} />
      <StatCardPremium icon={<TrendingUp size={20} />} label="Cakupan Presensi" value={`${coverage}%`} sub="Presensi yang sudah tercatat" tone="ok" />
      <StatCardPremium icon={<AlertOctagon size={20} />} label="Masalah Aktif" value={openFlags} sub="Perlu tindak lanjut" tone="bad" />
      <StatCardPremium icon={<ScanLine size={20} />} label="Scan Gerbang" value={gateScans} sub="Catatan masuk/keluar" />
    </div><div className="grid g-3 chart-summary"><Card title="Cakupan presensi" sub="Semakin penuh lingkaran, semakin lengkap data hari ini."><ProgressRing value={coverage} label="Presensi tercatat" sub={`${coverage}% dari data yang masuk`} /></Card><Card title="Status sesi hari ini" sub="Perbandingan sesi selesai, berjalan, dan terjadwal."><StackedBar segments={[{ label: 'Selesai', value: closed, tone: 'ok' }, { label: 'Berjalan', value: open, tone: 'info' }, { label: 'Terjadwal', value: scheduled, tone: 'warn' }]} total={Math.max(1, Number(d.sessionsToday ?? 0) || closed + open + scheduled)} /></Card><Card title="Kondisi cepat" sub="Masalah dan scan gerbang hari ini."><HorizontalBarList data={[{ label: 'Masalah aktif', value: openFlags }, { label: 'Scan gerbang', value: gateScans }]} labelKeys={['label']} valueKeys={['value']} /></Card></div></>}

    <div className="grid g-3" style={{ marginTop: 18 }}><Card title="Masalah terbaru" sub="Cocokkan data gerbang dan kelas" actions={<Btn size="sm" onClick={() => go('/admin/anomaly')}>Cek</Btn>}><DashboardMiniList state={flags} type="anomaly" /></Card><Card title="Aktivitas terbaru" sub="Aktivitas gerbang dan sesi" actions={<Btn size="sm" onClick={() => go('/admin/live-monitor')}>Lihat lengkap</Btn>}><DashboardMiniList state={live} type="activity" /></Card></div>{trend.loading ? <LoadingState label="Memuat tren…" /> : trend.error ? <ErrorState error={trend.error} onRetry={trend.refresh} /> : <Card title="Tren 7 hari" sub="Cakupan presensi per hari"><TrendChart data={trend.data} /></Card>}
  </div>;
}

export function SessionsPage({ admin = true }) {
  const [date, setDate] = useState(today());
  const [page, setPage] = useState(1);
  const state = useRemote(() => apiFetch(`${admin ? '/schedules/sessions' : '/attendance/class-sessions'}${qs({ date, page, limit: 100 })}`), [date, page, admin]);
  const [selected, setSelected] = useState(null);
  const detail = useRemote(() => selected ? apiFetch(`/attendance/class-sessions/${selected.id}/summary`) : Promise.resolve(null), [selected?.id]);
  return <div className="content"><PageHead eyebrow="CEK SESI KELAS" title={admin ? 'Cek Sesi Kelas' : 'Sesi saya'} sub="Lihat kelas yang terjadwal, sedang berjalan, selesai, atau terlewat." actions={<><label className="input compact"><Calendar size={14} /><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>{admin && <Btn variant="primary" onClick={() => go('/admin/schedule')}><Plus size={14} /> Tambah jadwal</Btn>}</>} /><Card><AsyncTable state={state} columns={[{ header: 'Waktu', render: (r) => `${formatDateTime(r.startsAt)} — ${new Date(r.endsAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}` }, { header: 'Kelas', render: (r) => r.schoolClass?.code || r.classCode || r.classId }, { header: 'Mapel', render: (r) => r.subject?.name || r.subjectName || r.subjectId }, { header: 'Guru', render: (r) => r.teacher?.fullName || r.teacherName || r.teacherId }, { header: 'Status', render: (r) => <StatusPill status={r.status} /> }]} /> <Pagination meta={metaOf(state.data)} onPage={setPage} /></Card>{itemsOf(state.data).length > 0 && <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>{itemsOf(state.data).slice(0, 8).map((s) => <Btn size="sm" key={s.id} onClick={() => setSelected(s)}><Eye size={13} /> Detail {s.schoolClass?.code}</Btn>)}</div>}{selected && <Card title={`Detail ${selected.schoolClass?.code || ''}`} sub="Ringkasan kelengkapan presensi sesi" actions={<Btn size="sm" variant="ghost" onClick={() => setSelected(null)}>Tutup</Btn>}>{detail.loading ? <LoadingState /> : detail.error ? <ErrorState error={detail.error} /> : <div className="grid g-4"><StatCardPremium icon={<Users size={18} />} label="Terdaftar" value={detail.data?.enrolledCount ?? '—'} sub="Siswa" /><StatCardPremium icon={<Check size={18} />} label="Tercatat" value={detail.data?.recordedCount ?? '—'} sub="Presensi masuk" /><StatCardPremium icon={<Clock size={18} />} label="Status" value={detail.data?.status ?? selected.status} sub="Tahap sesi" /><StatCardPremium icon={<Activity size={18} />} label="Hadir" value={detail.data?.counters?.HADIR ?? 0} sub="Jumlah" tone="ok" /></div>}</Card>}</div>;
}

export function HistoryPage() {
  const [date, setDate] = useState(today());
  const [page, setPage] = useState(1);
  const logs = useRemote(() => apiFetch(`/attendance/gate/logs${qs({ date, page, limit: 50 })}`), [date, page]);
  const prayers = useRemote(() => apiFetch(`/attendance/prayer/logs${qs({ date, page: 1, limit: 50 })}`), [date]);
  return <div className="content"><PageHead eyebrow="RIWAYAT SCAN" title="Riwayat Scan" sub="Catatan scan gerbang dan mushola. Gunakan untuk mengecek jika ada data yang belum sesuai." actions={<><label className="input compact"><Calendar size={14} /><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><Btn onClick={() => { logs.refresh(); prayers.refresh(); }}><RefreshCw size={14} /> Muat ulang</Btn></>} /><div className="grid g-2"><Card title="Log Gerbang" sub="Lapis 1 — scan masuk/keluar"><AsyncTable state={logs} columns={[{ header: 'Waktu', render: (r) => formatDateTime(r.tappedAt) }, { header: 'Nama', render: (r) => r.user?.fullName || r.userId }, { header: 'Peran', render: (r) => <StatusPill status={r.user?.role || '—'} /> }, { header: 'Arah', render: (r) => <StatusPill status={r.direction} /> }, { header: 'Alat', render: (r) => r.deviceId || '—' }]} /><Pagination meta={metaOf(logs.data)} onPage={setPage} /></Card><Card title="Log Mushola" sub="Scan QR Dhuha, Dzuhur, dan Ashar khusus siswa"><AsyncTable state={prayers} columns={[{ header: 'Waktu', render: (r) => formatDateTime(r.scannedAt) }, { header: 'Siswa', render: (r) => r.student?.fullName || r.studentId }, { header: 'Sholat', render: (r) => <StatusPill status={r.prayerType} /> }, { header: 'Sumber', render: (r) => <StatusPill status={r.source} /> }, { header: 'Alat', render: (r) => r.deviceId || '—' }]} /></Card></div></div>;
}

export function AnomalyPage({ notify }) {
  const [status, setStatus] = useState('OPEN');
  const [type, setType] = useState('');
  const [selected, setSelected] = useState(null);
  const state = useRemote(() => apiFetch(`/reconciliation/flags${qs({ status, type, page: 1, limit: 100 })}`), [status, type]);
  return <div className="content"><PageHead eyebrow="CEK MASALAH" title="Masalah yang Perlu Dicek" sub="Daftar data yang belum cocok. Petugas cukup buka, cek, lalu tulis alasan penyelesaian." actions={<><SelectInput value={status} onChange={(e) => setStatus(e.target.value)}><option value="OPEN">Belum selesai</option><option value="RESOLVED">Selesai</option><option value="">SEMUA</option></SelectInput><SelectInput value={type} onChange={(e) => setType(e.target.value)}><option value="">Semua tipe</option><option value="BOLOS_KELAS">Diduga bolos kelas</option><option value="LUPA_TAP_GERBANG">Lupa tap gerbang</option><option value="TIDAK_MENGAJAR">Guru belum mengajar</option><option value="ANOMALI_BUKA_TANPA_GERBANG">Buka sesi tanpa data gerbang</option><option value="ALPA">Alpa</option><option value="BELUM_SCAN_ASHAR">Belum scan Ashar</option></SelectInput></>} /><Card><AsyncTable state={state} columns={[{ header: 'Tanda masalah', render: (r) => <StatusPill status={r.type} /> }, { header: 'Subjek', render: (r) => r.user?.fullName || r.userId }, { header: 'Sesi', render: (r) => r.session?.schoolClass?.code || r.sessionId || '—' }, { header: 'Alur', render: (r) => <StatusPill status={r.reviewStatus || r.status} /> }, { header: 'Prioritas', render: (r) => <StatusPill status={r.priority || 'NORMAL'} /> }, { header: 'Dibuat', render: (r) => formatDateTime(r.createdAt) }]} onRow={(row) => <Btn size="sm" onClick={() => setSelected(row)}><Check size={13} /> Tindak</Btn>} /></Card>{selected && <ResolveFlagModal flag={selected} onClose={() => setSelected(null)} onDone={() => { setSelected(null); state.refresh(); notify('Tanda masalah berhasil diproses.'); }} />}</div>;
}

function ResolveFlagModal({ flag, onClose, onDone }) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  const [workflow, setWorkflow] = useState({
    reviewStatus: flag.reviewStatus || 'OPEN',
    priority: flag.priority || 'NORMAL',
    dueAt: flag.dueAt ? String(flag.dueAt).slice(0, 10) : '',
    followUpNote: flag.followUpNote || ''
  });
  const [loading, setLoading] = useState(false);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [err, setErr] = useState('');
  const setW = (key, value) => setWorkflow((prev) => ({ ...prev, [key]: value }));
  const timeline = [
    { label: 'Dibuat otomatis', at: flag.createdAt, body: statusLabel(flag.type) },
    flag.assignedTo && { label: 'Ditugaskan', at: flag.updatedAt || flag.createdAt, body: flag.assignedTo.fullName },
    flag.followUpNote && { label: 'Catatan tindak lanjut', at: flag.updatedAt || flag.createdAt, body: flag.followUpNote },
    flag.escalationQueue && { label: 'Eskalasi aktif', at: flag.escalationQueue.createdAt, body: flag.escalationQueue.reason },
    flag.resolvedAt && { label: 'Selesai', at: flag.resolvedAt, body: flag.resolvedReason || 'Ditandai selesai' }
  ].filter(Boolean);
  async function act(kind) {
    setLoading(true); setErr('');
    try {
      await apiFetch(`/reconciliation/flags/${flag.id}/${kind}`, { method: 'POST', body: JSON.stringify({ reason }) });
      onDone();
    } catch (error) { setErr(error.message); } finally { setLoading(false); }
  }
  async function saveWorkflow() {
    setWorkflowLoading(true); setErr('');
    try {
      await apiFetch(`/reconciliation/flags/${flag.id}/workflow`, { method: 'PATCH', body: JSON.stringify({ ...workflow, dueAt: workflow.dueAt || null }) });
      onDone();
    } catch (error) { setErr(error.message); } finally { setWorkflowLoading(false); }
  }
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="resolve-flag-title" onClick={onClose}><div className="card pad-lg elev modal" onClick={(e) => e.stopPropagation()}><div className="eyebrow"><span className="dot" /> TINDAK TANDA MASALAH · ALASAN WAJIB</div><h2 id="resolve-flag-title">{statusLabel(flag.type)} · {flag.user?.fullName || flag.userId}</h2><p className="muted">Catat proses tindak lanjut agar petugas lain paham riwayatnya.</p><div className="grid g-3"><Card title="Alur tindak lanjut" sub="Ubah status kerja tanpa menutup masalah"><div className="form-grid"><Field label="Status proses"><SelectInput value={workflow.reviewStatus} onChange={(e) => setW('reviewStatus', e.target.value)}><option value="OPEN">Belum dicek</option><option value="IN_REVIEW">Sedang dicek</option><option value="ESCALATED">Perlu eskalasi</option><option value="RESOLVED">Selesai</option></SelectInput></Field><Field label="Prioritas"><SelectInput value={workflow.priority} onChange={(e) => setW('priority', e.target.value)}><option value="LOW">Rendah</option><option value="NORMAL">Normal</option><option value="HIGH">Tinggi</option><option value="URGENT">Mendesak</option></SelectInput></Field><Field label="Batas tindak lanjut"><TextInput type="date" value={workflow.dueAt} onChange={(e) => setW('dueAt', e.target.value)} /></Field><Field label="Catatan tindak lanjut"><TextInput type="textarea" rows={3} value={workflow.followUpNote} placeholder="Contoh: sudah konfirmasi ke wali kelas, menunggu bukti izin." onChange={(e) => setW('followUpNote', e.target.value)} /></Field><Btn type="button" loading={workflowLoading} onClick={saveWorkflow}><Save size={14} /> Simpan tindak lanjut</Btn></div></Card><Card title="Riwayat singkat" sub="Jejak kejadian dan tindak lanjut"><div className="timeline-lite">{timeline.map((item, idx) => <div className="timeline-item" key={`${item.label}-${idx}`}><div className="timeline-dot" /><div><b>{item.label}</b><p>{item.body}</p><small>{formatDateTime(item.at)}</small></div></div>)}</div></Card></div><Field label="Alasan penyelesaian/eskalasi" hint={`${reason.trim().length}/10+`}><TextInput type="textarea" rows={4} value={reason} placeholder="Tulis alasan minimal 10 karakter" onChange={(e) => setReason(e.target.value)} /></Field>{err && <div className="inline-error"><AlertTriangle size={14} /> {err}</div>}<div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><Btn variant="ghost" onClick={onClose}>Batal</Btn><Btn disabled={reason.trim().length < 10} loading={loading} onClick={() => act('escalate')}>Eskalasi</Btn><Btn variant="primary" disabled={reason.trim().length < 10} loading={loading} onClick={() => act('resolve')}>Selesaikan</Btn></div></div></div>;
}

export function MasterDataPage({ notify }) {
  const [tab, setTab] = useState('student-import');
  return <div className="content"><PageHead eyebrow="DATA SEKOLAH" title="Akun & Data Sekolah" sub="Untuk siswa: import file, sistem otomatis membuat akun, kelas, pendaftaran, dan QR." /><TabBar value={tab} onChange={setTab} options={[["student-import", "Import Siswa"], ["students", "Daftar Siswa"], ["users", "Buat/Edit Akun"], ["classes", "Kelas"], ["enroll", "Daftarkan Manual"], ["subjects", "Mapel"], ["schedule-help", "Cara Pakai"], ["years", "Tahun Ajaran"], ["semesters", "Semester"], ["rooms", "Ruang"], ["import", "Impor Lanjutan"]]} /><SimpleHelpBox title="Urutan paling mudah" items={['Upload CSV siswa di tab Import Siswa.', 'Klik Periksa, lalu Simpan & Siapkan QR.', 'Buka menu Perangkat Absensi → Cetak Kartu untuk cetak kartu per kelas.']} />{tab === 'student-import' && <StudentImportPanel notify={notify} />}{tab === 'users' && <UsersPanel notify={notify} />}{tab === 'years' && <SimpleCreatePanel title="Tahun Ajaran" path="/academic/years" fields={[["code", "Kode"], ["name", "Nama"]]} notify={notify} columns={[{ header: 'Kode', key: 'code' }, { header: 'Nama', key: 'name' }, { header: 'Aktif', render: (r) => <StatusPill status={r.active ? 'ACTIVE' : 'INACTIVE'} /> }]} />}{tab === 'semesters' && <SimpleCreatePanel title="Semester" path="/academic/semesters" fields={[["academicYearId", "ID Tahun Ajaran"], ["code", "Kode"], ["name", "Nama"]]} notify={notify} columns={[{ header: 'Tahun', render: (r) => r.academicYear?.name || r.academicYearId }, { header: 'Kode', key: 'code' }, { header: 'Nama', key: 'name' }]} />}{tab === 'rooms' && <SimpleCreatePanel title="Ruang" path="/academic/rooms" fields={[["code", "Kode"], ["name", "Nama"]]} notify={notify} columns={[{ header: 'Kode', key: 'code' }, { header: 'Nama', key: 'name' }, { header: 'Aktif', render: (r) => <StatusPill status={r.active ? 'ACTIVE' : 'INACTIVE'} /> }]} />}{tab === 'classes' && <SimpleCreatePanel title="Kelas" path="/academic/classes" fields={[["code", "Kode"], ["name", "Nama"], ["yearLabel", "Tahun Ajaran"]]} notify={notify} columns={[{ header: 'Kode', key: 'code' }, { header: 'Nama', key: 'name' }, { header: 'Tahun', key: 'yearLabel' }]} />}{tab === 'subjects' && <SimpleCreatePanel title="Mapel" path="/academic/subjects" fields={[["code", "Kode"], ["name", "Nama"]]} notify={notify} columns={[{ header: 'Kode', key: 'code' }, { header: 'Nama', key: 'name' }]} />}{tab === 'students' && <StudentsPanel />}{tab === 'enroll' && <EnrollPanel notify={notify} />}{tab === 'schedule-help' && <Card title="Cara pakai data sekolah"><StepGuide steps={['Import siswa massal.', 'Cek daftar siswa per kelas.', 'Cetak kartu dari menu Cetak Kartu.', 'Buat jadwal kelas dari menu Jadwal Kelas.']} /></Card>}{tab === 'import' && <ImportPanel notify={notify} />}</div>;
}

function TabBar({ value, onChange, options }) {
  return <div className="tabs">{options.map(([v, label]) => <button key={v} className={`btn sm ${value === v ? 'primary' : 'ghost'}`} onClick={() => onChange(v)}>{label}</button>)}</div>;
}

function UsersPanel({ notify }) {
  const currentUser = readStoredUser();
  const isDeveloper = currentUser?.role === 'DEVELOPER';
  const roleOptions = [['ADMIN_TU', 'Admin/TU'], ['OPERATOR_IT', 'Operator IT'], ['GURU_MAPEL', 'Guru Mapel'], ['GURU_PIKET', 'Guru Piket'], ['SISWA', 'Siswa'], ...(isDeveloper ? [['DEVELOPER', 'Developer']] : [])];
  const state = useRemote(() => apiFetch('/identity/users?page=1&limit=200'), []);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const emptyUserForm = { id: '', username: '', fullName: '', password: '', role: 'SISWA', cardStatus: 'ACTIVE' };
  const [form, set, reset, setForm] = useForm(emptyUserForm);
  const userPresets = [
    { role: 'SISWA', title: 'Buat Akun Siswa', desc: 'Untuk siswa yang akan melihat kehadiran dan punya QR.', icon: <Users size={18} /> },
    { role: 'GURU_MAPEL', title: 'Buat Akun Guru', desc: 'Untuk guru mapel yang mengisi presensi kelas.', icon: <BookOpen size={18} /> },
    { role: 'GURU_PIKET', title: 'Buat Akun Guru Piket', desc: 'Untuk petugas piket yang cek masalah dan catatan piket.', icon: <ListChecks size={18} /> },
    { role: 'OPERATOR_IT', title: 'Buat Akun Operator', desc: 'Untuk pengelola perangkat, kartu, dan sistem.', icon: <ShieldCheck size={18} /> }
  ];
  function applyUserPreset(role) {
    reset({ id: '', username: '', fullName: '', password: '', role, cardStatus: 'ACTIVE' });
  }
  const filteredRows = itemsOf(state.data).filter((user) => (statusFilter === 'ALL' || (statusFilter === 'ACTIVE') === Boolean(user.active)) && (roleFilter === 'ALL' || user.role === roleFilter));
  const filteredState = { ...state, data: { ...(state.data || {}), items: filteredRows, meta: { ...(state.data?.meta || {}), total: filteredRows.length } } };
  async function submit(e) {
    e.preventDefault();
    const password = String(form.password || '').trim();
    if (!form.id && password.length < 8) { notify('Isi kata sandi sementara minimal 8 karakter.', 'warn'); return; }
    if (form.id && password && password.length < 8) { notify('Kata sandi baru minimal 8 karakter.', 'warn'); return; }
    if (form.id) await apiFetch(`/identity/users/${form.id}`, { method: 'PATCH', body: JSON.stringify({ fullName: form.fullName, role: form.role, cardStatus: form.cardStatus, ...(password ? { password } : {}) }) });
    else await apiFetch('/identity/users', { method: 'POST', body: JSON.stringify({ ...form, password }) });
    reset(emptyUserForm);
    state.refresh();
    notify('Pengguna berhasil disimpan.');
  }
  async function deactivate(row) {
    if (!await riskConfirm(`Nonaktifkan ${row.fullName}? Riwayat tetap aman dan akun bisa diaktifkan lagi.`)) return;
    await apiFetch(`/identity/users/${row.id}`, { method: 'DELETE', body: JSON.stringify({ reason: 'Dinonaktifkan dari Master Data.' }) });
    state.refresh();
    notify('Akun dinonaktifkan. Riwayat tetap aman.');
  }
  async function activate(row) {
    if (!await riskConfirm(`Aktifkan kembali ${row.fullName}?`)) return;
    await apiFetch(`/identity/users/${row.id}`, { method: 'PATCH', body: JSON.stringify({ active: true, cardStatus: row.cardStatus === 'INACTIVE' ? 'ACTIVE' : row.cardStatus, reason: 'Diaktifkan kembali dari Master Data.' }) });
    state.refresh();
    notify('Akun diaktifkan kembali.');
  }
  async function permanentDelete(row) {
    if (!await riskConfirm(`Hapus permanen akun "${row.username}" (${row.fullName})? Tindakan ini TIDAK BISA DIBATALKAN dan semua riwayat akun akan tetap ada tapi akun tidak bisa dipakai lagi.`, 'Hapus Permanen')) return;
    const confirmUsername = window.prompt(`Ketik nama akun untuk konfirmasi: ${row.username}`);
    if (confirmUsername === null) return;
    const reason = window.prompt('Tulis alasan hapus permanen minimal 10 karakter:') || '';
    if (reason.trim().length < 10) return notify('Alasan hapus permanen minimal 10 karakter.', 'warn');
    try {
      await apiFetch(`/identity/users/${row.id}/permanent`, { method: 'DELETE', body: JSON.stringify({ confirmUsername, reason }) });
      state.refresh();
      notify('Akun berhasil dihapus permanen.');
    } catch (error) {
      notify(error.message || 'Akun tidak bisa dihapus permanen karena punya riwayat.', 'bad');
    }
  }
  return <div className="grid management-grid"><Card title={form.id ? 'Edit Akun' : 'Buat Akun Baru'} sub="Pilih jenis akun dulu, lalu isi nama. Untuk siswa, lanjutkan ke tab Daftarkan Siswa setelah disimpan."><div className="user-preset-grid">{userPresets.map((preset) => <QuickActionCard key={preset.role} title={preset.title} desc={preset.desc} icon={preset.icon} actionLabel="Pilih" onClick={() => applyUserPreset(preset.role)} tone={form.role === preset.role ? 'ok' : ''} />)}</div><form onSubmit={submit} className="form-grid"><Field label="Nama akun"><TextInput value={form.username} placeholder="contoh: siswa.aisyah" onChange={(e) => set('username', e.target.value)} required disabled={Boolean(form.id)} /></Field><Field label="Nama Lengkap"><TextInput value={form.fullName} placeholder="Nama lengkap sesuai data sekolah" onChange={(e) => set('fullName', e.target.value)} required /></Field><Field label="Kata sandi"><TextInput type="password" value={form.password} placeholder={form.id ? 'Kosongkan jika tidak diganti' : 'Isi minimal 8 karakter'} autoComplete="new-password" onChange={(e) => set('password', e.target.value)} minLength={8} required={!form.id} /></Field><Field label="Peran"><SelectInput value={form.role} onChange={(e) => set('role', e.target.value)}>{roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectInput></Field><Field label="Status Kartu"><SelectInput value={form.cardStatus} onChange={(e) => set('cardStatus', e.target.value)}><option value="ACTIVE">Aktif</option><option value="LOST">Hilang</option><option value="INACTIVE">Nonaktif</option></SelectInput></Field><Btn variant="primary"><Plus size={14} /> {form.id ? 'Simpan Perubahan' : 'Buat Akun'}</Btn>{form.role === 'SISWA' && !form.id && <Btn type="button" onClick={() => notify('Setelah akun tersimpan, buka tab Daftarkan Siswa untuk memilih kelas.', 'warn')}>Info daftar kelas</Btn>}{form.id && <Btn type="button" variant="ghost" onClick={() => reset(emptyUserForm)}>Batal edit</Btn>}</form><SimpleHelpBox title="Tips akun" items={['Nama akun contoh: siswa.nama atau guru.nama.', 'Gunakan kata sandi sementara yang mudah dibagikan secara pribadi, lalu ganti saat produksi.', 'Jangan hapus akun yang sudah punya riwayat. Nonaktifkan saja.']} /></Card><Card title="Daftar Pengguna" sub="Nonaktifkan untuk menjaga riwayat. Hapus permanen hanya untuk akun test yang benar-benar aman." actions={<div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><SelectInput value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="ALL">Semua status</option><option value="ACTIVE">Aktif</option><option value="INACTIVE">Nonaktif</option></SelectInput><SelectInput value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="ALL">Semua peran</option>{roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectInput></div>}><AsyncTable state={filteredState} columns={[{ header: 'Nama', render: (r) => <span className="row"><Avatar name={r.fullName} size="sm" /> {r.fullName}</span> }, { header: 'Nama akun', key: 'username' }, { header: 'Peran', render: (r) => <StatusPill status={r.role} /> }, { header: 'Status', render: (r) => <StatusPill status={r.active ? 'ACTIVE' : 'INACTIVE'} /> }]} onRow={(r) => <div className="row"><Btn size="sm" disabled={r.role === 'DEVELOPER' && !isDeveloper} onClick={() => setForm({ id: r.id, username: r.username, fullName: r.fullName, password: '', role: r.role, cardStatus: r.cardStatus })}>Edit</Btn>{r.active ? <Btn size="sm" variant="danger" disabled={r.role === 'DEVELOPER' && !isDeveloper} onClick={() => deactivate(r)}>Nonaktifkan</Btn> : <Btn size="sm" onClick={() => activate(r)}>Aktifkan Lagi</Btn>}{isDeveloper && <Btn size="sm" variant="danger" onClick={() => permanentDelete(r)}>Hapus Permanen</Btn>}</div>} /></Card></div>;
}

function SimpleCreatePanel({ title, path, fields, columns, notify }) {
  const initial = { id: '', ...Object.fromEntries(fields.map(([key]) => [key, ''])) };
  const [form, set, reset, setForm] = useForm(initial);
  const state = useRemote(() => apiFetch(`${path}?page=1&limit=200`), [path]);
  async function submit(e) {
    e.preventDefault();
    const payload = Object.fromEntries(fields.map(([key]) => [key, form[key]]));
    if (form.id) await apiFetch(`${path}/${form.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    else await apiFetch(path, { method: 'POST', body: JSON.stringify(payload) });
    reset(initial);
    state.refresh();
    notify(`${title} berhasil disimpan.`);
  }
  return <div className="grid management-grid"><Card title={`${form.id ? 'Edit' : 'Tambah'} ${title}`}><form onSubmit={submit} className="form-grid">{fields.map(([key, label]) => <Field key={key} label={label}><TextInput value={form[key]} placeholder={`Isi ${label.toLowerCase()}`} onChange={(e) => set(key, e.target.value)} required /></Field>)}<Btn variant="primary"><Save size={14} /> Simpan</Btn>{form.id && <Btn type="button" variant="ghost" onClick={() => reset(initial)}>Batal edit</Btn>}</form></Card><Card title={`Daftar ${title}`}><AsyncTable state={state} columns={columns} onRow={(r) => <Btn size="sm" onClick={() => setForm({ ...initial, ...Object.fromEntries(fields.map(([key]) => [key, r[key] || ''])), id: r.id })}>Edit</Btn>} /></Card></div>;
}

function StudentsPanel() {
  const classes = useRemote(() => apiFetch('/academic/classes?page=1&limit=200'), []);
  const [classId, setClassId] = useState('');
  const students = useRemote(() => apiFetch(`/academic/students${qs({ classId, page: 1, limit: 200 })}`), [classId]);
  return <Card title="Daftar Siswa" sub="Filter berdasarkan kelas"><div className="row" style={{ marginBottom: 12 }}><SelectInput value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Semua kelas</option>{itemsOf(classes.data).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</SelectInput></div><AsyncTable state={students} columns={[{ header: 'Nama', render: (r) => r.fullName || r.student?.fullName }, { header: 'Nama akun', render: (r) => r.username || r.student?.username }, { header: 'Kelas', render: (r) => r.classCode || r.schoolClass?.code || '—' }, { header: 'Kartu', render: (r) => <StatusPill status={r.cardStatus || r.student?.cardStatus} /> }]} /></Card>;
}

function EnrollPanel({ notify }) {
  const users = useRemote(() => apiFetch('/identity/users?page=1&limit=300'), []);
  const classes = useRemote(() => apiFetch('/academic/classes?page=1&limit=200'), []);
  const [form, set] = useForm({ userId: '', classId: '' });
  async function submit(e) { e.preventDefault(); await apiFetch('/academic/enrollments', { method: 'POST', body: JSON.stringify(form) }); notify('Siswa berhasil didaftarkan ke kelas.'); }
  return <Card title="Pendaftaran Kelas" sub="Daftarkan siswa ke kelas aktif"><form className="form-grid" onSubmit={submit}><Field label="Siswa"><SelectInput value={form.userId} onChange={(e) => set('userId', e.target.value)} required><option value="">Pilih siswa</option>{itemsOf(users.data).filter((u) => u.role === 'SISWA').map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</SelectInput></Field><Field label="Kelas"><SelectInput value={form.classId} onChange={(e) => set('classId', e.target.value)} required><option value="">Pilih kelas</option>{itemsOf(classes.data).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</SelectInput></Field><Btn variant="primary"><Save size={14} /> Daftarkan</Btn></form></Card>;
}

function StudentImportPanel({ notify }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  function formData() { const data = new FormData(); if (file) data.append('file', file); return data; }
  function downloadTemplate() {
    downloadCsvFile([
      { 'Nama Lengkap': 'AHMAD FAUZI', Username: '', 'Kelas/Jabatan': 'X A', Password: '', Role: 'SISWA' },
      { 'Nama Lengkap': 'SITI AISYAH', Username: 'siti.aisyah', 'Kelas/Jabatan': 'X A', Password: 'Rahasia#123', Role: 'SISWA' }
    ], `template-import-siswa-${today()}.csv`);
  }
  function downloadAccounts(rows) {
    const safeRows = (rows || []).map((row) => ({ Nama: row.fullName, Username: row.username, PasswordSementara: row.temporaryPassword || '(tidak diubah)', Kelas: row.classCode, Catatan: row.note }));
    if (safeRows.length) downloadCsvFile(safeRows, `akun-siswa-sementara-${today()}.csv`);
  }
  async function previewImport() {
    setLoading(true);
    setResult(null);
    try { setPreview(await apiFetch('/academic/students/import/file/preview', { method: 'POST', body: formData() })); }
    finally { setLoading(false); }
  }
  async function commitImport() {
    if (!await riskConfirm('Simpan siswa, buat kelas yang belum ada, daftarkan ke kelas, dan siapkan QR?')) return;
    setLoading(true);
    try {
      const data = await apiFetch('/academic/students/import/file/commit', { method: 'POST', body: formData() });
      setResult(data);
      if (data.committed) {
        const qr = await apiFetch('/qr-credentials/bulk-generate', { method: 'POST', body: JSON.stringify({ label: 'QR Absensi SchoolHub', onlyMissing: true }) });
        setResult({ ...data, qr });
        downloadAccounts(data.credentialRows);
        notify(`Import siswa selesai. ${data.result?.createdUsers || 0} akun baru, ${qr.count || 0} QR baru.`);
      } else {
        notify('Import belum disimpan karena masih ada kesalahan.', 'warn');
      }
    } finally { setLoading(false); }
  }
  return <Card title="Import Siswa Massal" sub="Upload CSV sederhana. Username/password boleh kosong, sistem akan membuat otomatis."><div className="form-grid"><Field label="File CSV/XLSX siswa"><TextInput type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setResult(null); }} /></Field><Btn type="button" variant="ghost" onClick={downloadTemplate}><Download size={14} /> Download Template</Btn><Btn type="button" disabled={!file || loading} loading={loading} onClick={previewImport}><Eye size={14} /> Periksa File</Btn><Btn type="button" variant="primary" disabled={!file || !preview || preview.summary?.invalid > 0 || loading} loading={loading} onClick={commitImport}><Save size={14} /> Simpan & Siapkan QR</Btn></div><SimpleHelpBox title="Format paling simpel" items={['Kolom wajib: Nama Lengkap dan Kelas/Jabatan.', 'Username boleh kosong; sistem membuat otomatis.', 'Password boleh kosong; sistem membuat password sementara dan mengunduh daftar akun.']} />{preview && <div style={{ marginTop: 16 }}><div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}><Pill tone="ok">Valid {preview.summary?.valid ?? 0}</Pill><Pill tone="bad">Error {preview.summary?.invalid ?? 0}</Pill><Pill>Akun baru {preview.summary?.newUsers ?? 0}</Pill><Pill>Kelas baru {preview.summary?.newClasses ?? 0}</Pill><Pill>Username otomatis {preview.summary?.generatedUsernames ?? 0}</Pill><Pill>Password otomatis {preview.summary?.generatedPasswords ?? 0}</Pill></div><DataTable rows={preview.rows || []} columns={[{ header: 'Baris', key: 'index' }, { header: 'Nama', key: 'fullName' }, { header: 'Username', key: 'username' }, { header: 'Kelas', key: 'classCode' }, { header: 'Status', render: (r) => r.existingUser ? 'Akun sudah ada' : 'Akun baru' }, { header: 'Kesalahan', render: (r) => r.errors?.join(', ') || 'Aman' }]} /></div>}{result?.committed && <div style={{ marginTop: 16 }}><SimpleHelpBox title="Import selesai" items={[`${result.result?.createdUsers || 0} akun siswa baru dibuat.`, `${result.result?.existingUsers || 0} akun lama dipakai ulang.`, `${result.result?.enrollments || 0} pendaftaran kelas dipastikan.`, `${result.qr?.count || 0} QR baru dibuat untuk yang belum punya.`]} /><Btn type="button" onClick={() => downloadAccounts(result.credentialRows)}><Download size={14} /> Download Ulang Daftar Akun</Btn></div>}</Card>;
}

function ImportPanel({ notify }) {
  const [target, setTarget] = useState('users');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const endpoint = target === 'users' ? '/identity/users/import/file' : '/academic/import/file';
  function formData() { const data = new FormData(); if (file) data.append('file', file); return data; }
  async function previewImport() {
    setLoading(true);
    try { setPreview(await apiFetch(`${endpoint}/preview`, { method: 'POST', body: formData() })); }
    finally { setLoading(false); }
  }
  async function commitImport() {
    if (!await riskConfirm('Simpan data impor yang sudah valid?')) return;
    setLoading(true);
    try {
      const data = await apiFetch(`${endpoint}/commit`, { method: 'POST', body: formData() });
      setPreview(data);
      notify(data.committed === false ? 'Impor belum dijalankan karena masih ada kesalahan.' : 'Impor berhasil disimpan.');
    } finally { setLoading(false); }
  }
  return <Card title="Impor CSV/XLSX" sub="Unggah file, periksa hasilnya, lalu simpan. Kolom file pengguna: username (nama akun), fullName (nama lengkap), role (peran), password (kata sandi). Kolom akademik: type, code, name, yearLabel, username, classCode."><div className="form-grid"><Field label="Target"><SelectInput value={target} onChange={(e) => { setTarget(e.target.value); setFile(null); setPreview(null); }}><option value="users">Pengguna</option><option value="academic">Kelas/Mapel/Pendaftaran</option></SelectInput></Field><Field label="File CSV/XLSX"><TextInput type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }} /></Field><Btn type="button" disabled={!file || loading} loading={loading} onClick={previewImport}><Eye size={14} /> Periksa</Btn><Btn type="button" variant="primary" disabled={!file || !preview || preview.summary?.invalid > 0 || loading} loading={loading} onClick={commitImport}><Save size={14} /> Simpan impor</Btn></div>{preview && <div style={{ marginTop: 16 }}><div className="row" style={{ gap: 8, marginBottom: 10 }}><Pill tone="ok">Valid {preview.summary?.valid ?? 0}</Pill><Pill tone="bad">Kesalahan {preview.summary?.invalid ?? 0}</Pill><Pill>Total {preview.summary?.total ?? 0}</Pill></div><DataTable rows={preview.rows || preview.items || []} columns={[{ header: 'Baris', key: 'index' }, { header: 'Data', render: (r) => r.username || r.code || r.classCode || '—' }, { header: 'Kesalahan', render: (r) => r.errors?.join(', ') || 'Aman' }]} /></div>}</Card>;
}

export function SchedulePage({ notify }) {
  const classes = useRemote(() => apiFetch('/academic/classes?page=1&limit=200'), []);
  const subjects = useRemote(() => apiFetch('/academic/subjects?page=1&limit=200'), []);
  const users = useRemote(() => apiFetch('/identity/users?page=1&limit=300'), []);
  const rooms = useRemote(() => apiFetch('/academic/rooms?page=1&limit=200'), []);
  const [date, setDate] = useState(today());
  const sessions = useRemote(() => apiFetch(`/schedules/sessions${qs({ date, page: 1, limit: 200 })}`), [date]);
  const weekly = useRemote(() => apiFetch('/schedules/weekly?page=1&limit=200'), []);
  const [form, set, reset] = useForm({ classId: '', subjectId: '', teacherId: '', startsAt: `${today()}T07:15`, endsAt: `${today()}T08:45` });
  const [weeklyForm, setWeekly, resetWeekly] = useForm({ classId: '', subjectId: '', teacherId: '', roomId: '', dayOfWeek: '1', startTime: '07:15', endTime: '08:45', effectiveFrom: today(), effectiveTo: '' });
  async function submit(e) { e.preventDefault(); await apiFetch('/schedules/sessions', { method: 'POST', body: JSON.stringify({ ...form }) }); reset({ ...form, startsAt: `${date}T07:15`, endsAt: `${date}T08:45` }); sessions.refresh(); notify('Sesi berhasil dibuat.'); }
  async function submitWeekly(e) { e.preventDefault(); await apiFetch('/schedules/weekly', { method: 'POST', body: JSON.stringify({ ...weeklyForm, dayOfWeek: Number(weeklyForm.dayOfWeek), effectiveTo: weeklyForm.effectiveTo || undefined, roomId: weeklyForm.roomId || undefined }) }); resetWeekly({ classId: '', subjectId: '', teacherId: '', roomId: '', dayOfWeek: '1', startTime: '07:15', endTime: '08:45', effectiveFrom: today(), effectiveTo: '' }); weekly.refresh(); notify('Jadwal mingguan tersimpan.'); }
  async function generate(row) { if (!await riskConfirm(`Buat sesi dari jadwal mingguan ini untuk tanggal ${date}?`, 'Buat Sesi')) return; const result = await apiFetch(`/schedules/weekly/${row.id}/generate`, { method: 'POST', body: JSON.stringify({ from: date, to: date }) }); sessions.refresh(); notify(`${result.generatedCount || 0} sesi dibuat, ${result.skippedCount || 0} dilewati.`); }
  return <div className="content"><PageHead eyebrow="JADWAL KELAS" title="Jadwal Kelas" sub="Buat jadwal mingguan agar sesi kelas bisa dibuat dan dipantau." actions={<label className="input compact"><Calendar size={14} /><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>} /><StepGuide title="Cara paling mudah" steps={['Isi jadwal mingguan untuk kelas, mapel, guru, hari, dan jam.', 'Klik Simpan jadwal.', 'Jika perlu sesi hari ini, klik Buat sesi tanggal ini dari daftar jadwal.', 'Guru akan melihat sesi di menu Isi Presensi Kelas.']} /><div className="grid g-3"><Card title="Buat Sesi Hari Ini"><form className="form-grid" onSubmit={submit}><Field label="Kelas"><SelectInput value={form.classId} onChange={(e) => set('classId', e.target.value)} required><option value="">Pilih</option>{itemsOf(classes.data).map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</SelectInput></Field><Field label="Mapel"><SelectInput value={form.subjectId} onChange={(e) => set('subjectId', e.target.value)} required><option value="">Pilih</option>{itemsOf(subjects.data).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput></Field><Field label="Guru"><SelectInput value={form.teacherId} onChange={(e) => set('teacherId', e.target.value)} required><option value="">Pilih</option>{itemsOf(users.data).filter((u) => u.role === 'GURU_MAPEL').map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</SelectInput></Field><Field label="Mulai"><TextInput type="datetime-local" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></Field><Field label="Selesai"><TextInput type="datetime-local" value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></Field><Btn variant="primary"><Plus size={14} /> Buat sesi</Btn></form></Card><Card title="Sesi Terjadwal"><AsyncTable state={sessions} columns={[{ header: 'Waktu', render: (r) => formatDateTime(r.startsAt) }, { header: 'Kelas', render: (r) => r.schoolClass?.code }, { header: 'Mapel', render: (r) => r.subject?.name }, { header: 'Guru', render: (r) => r.teacher?.fullName }, { header: 'Status', render: (r) => <StatusPill status={r.status} /> }]} /></Card></div><div className="grid g-3" style={{ marginTop: 18 }}><Card title="Jadwal Mingguan"><form className="form-grid" onSubmit={submitWeekly}><Field label="Kelas"><SelectInput value={weeklyForm.classId} onChange={(e) => setWeekly('classId', e.target.value)} required><option value="">Pilih</option>{itemsOf(classes.data).map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</SelectInput></Field><Field label="Mapel"><SelectInput value={weeklyForm.subjectId} onChange={(e) => setWeekly('subjectId', e.target.value)} required><option value="">Pilih</option>{itemsOf(subjects.data).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput></Field><Field label="Guru"><SelectInput value={weeklyForm.teacherId} onChange={(e) => setWeekly('teacherId', e.target.value)} required><option value="">Pilih</option>{itemsOf(users.data).filter((u) => u.role === 'GURU_MAPEL').map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</SelectInput></Field><Field label="Ruang"><SelectInput value={weeklyForm.roomId} onChange={(e) => setWeekly('roomId', e.target.value)}><option value="">Tanpa ruang</option>{itemsOf(rooms.data).map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}</SelectInput></Field><Field label="Hari"><SelectInput value={weeklyForm.dayOfWeek} onChange={(e) => setWeekly('dayOfWeek', e.target.value)}>{['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'].map((h, i) => <option key={i} value={i}>{h}</option>)}</SelectInput></Field><Field label="Jam Mulai"><TextInput type="time" value={weeklyForm.startTime} onChange={(e) => setWeekly('startTime', e.target.value)} /></Field><Field label="Jam Selesai"><TextInput type="time" value={weeklyForm.endTime} onChange={(e) => setWeekly('endTime', e.target.value)} /></Field><Field label="Mulai berlaku"><TextInput type="date" value={weeklyForm.effectiveFrom} onChange={(e) => setWeekly('effectiveFrom', e.target.value)} /></Field><Btn variant="primary">Simpan jadwal</Btn></form></Card><Card title="Daftar Jadwal Mingguan"><AsyncTable state={weekly} columns={[{ header: 'Hari', render: (r) => ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][r.dayOfWeek] }, { header: 'Jam', render: (r) => `${r.startTime}-${r.endTime}` }, { header: 'Kelas', render: (r) => r.schoolClass?.code }, { header: 'Mapel', render: (r) => r.subject?.name }, { header: 'Guru', render: (r) => r.teacher?.fullName }]} onRow={(r) => <Btn size="sm" onClick={() => generate(r)}>Buat sesi tanggal ini</Btn>} /></Card></div></div>;
}
export function DevicesPage({ notify }) {
  const [tab, setTab] = useState('android');
  const options = [['android', 'Aktivasi HP Scanner'], ['qr', 'Cetak Kartu'], ['version', 'Versi Aplikasi HP'], ['cards', 'Kartu RFID'], ['readers', 'Alat Lama'], ['scan', 'Input Manual Cadangan']];
  const pageCopy = tab === 'qr'
    ? { title: 'Cetak Kartu e-Hadir', sub: 'Pilih kelas, sistem melengkapi QR resmi, lalu cetak kartu siap pakai.' }
    : { title: 'Aktivasi HP Scanner', sub: 'Buat kode aktivasi untuk HP Android. Admin cukup pilih tempat HP dipakai, lalu salin kodenya ke aplikasi HP.' };
  return <div className="content"><PageHead eyebrow="PERANGKAT ABSENSI" title={pageCopy.title} sub={pageCopy.sub} /><TabBar value={tab} onChange={setTab} options={options} />{tab === 'android' && <AndroidReaderPanel notify={notify} />}{tab === 'qr' && <QrCredentialPanel notify={notify} />}{tab === 'version' && <MobileVersionPanel notify={notify} />}{tab === 'cards' && <CardsPanel notify={notify} />}{tab === 'readers' && <ReadersPanel notify={notify} />}{tab === 'scan' && <ManualQrScanPanel notify={notify} />}</div>;
}


function QrCredentialPanel({ notify }) {
  const users = useRemote(() => apiFetch('/identity/users?page=1&limit=500'), []);
  const classes = useRemote(() => apiFetch('/academic/classes?page=1&limit=200'), []);
  const [result, setResult] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, set, reset] = useForm({ userId: '', classId: '', label: 'QR Absensi SchoolHub', expiresAt: '', revokeReason: 'Kartu QR dicabut oleh admin karena kartu hilang atau diganti.' });
  const credentials = useRemote(() => form.userId ? apiFetch(`/qr-credentials/users/${form.userId}?page=1&limit=20`) : Promise.resolve({ items: [] }), [form.userId]);
  const readiness = useRemote(() => apiFetch(`/qr-credentials/readiness${qs({ classId: form.classId })}`), [form.classId]);

  const selectedUser = itemsOf(users.data).find((user) => user.id === form.userId);
  const selectedClass = itemsOf(classes.data).find((item) => item.id === form.classId);
  const generatorExportUrl = (extra = {}) => {
    const params = new URLSearchParams({ autoLoad: '1', ...extra });
    if (form.classId && !params.has('classId')) params.set('classId', form.classId);
    return `/id-card-generator/#/export?${params.toString()}`;
  };
  const refreshStatus = () => {
    readiness.refresh();
    credentials.refresh();
  };

  async function preparePrint(autoPdf = true) {
    const generated = await apiFetch('/qr-credentials/bulk-generate', { method: 'POST', body: JSON.stringify({ classId: form.classId || undefined, label: form.label, expiresAt: form.expiresAt || undefined, onlyMissing: true }) });
    setResult(sanitizeQrResult(generated));
    refreshStatus();
    window.open(generatorExportUrl({ autoPdf: autoPdf ? '1' : '0' }), '_blank', 'noopener,noreferrer');
    notify(`${selectedClass ? `Kartu ${selectedClass.code}` : 'Semua kartu'} disiapkan. Generator cetak dibuka.`);
  }

  async function exportCards() {
    const data = await apiFetch(form.classId ? `/qr-credentials/export/class/${form.classId}/cards` : '/qr-credentials/export/cards');
    const scope = form.classId ? selectedClass?.code || 'kelas' : 'semua';
    downloadJsonFile(data, `kartu-qr-ehadir-${scope}-${today()}.json`);
    setResult(sanitizeQrResult(data));
    notify(`Data kartu resmi diunduh (${data.count || 0} kartu).`);
  }

  async function rotateLostCard() {
    if (!form.userId) return notify('Pilih siswa/guru yang kartunya hilang dulu.', 'warn');
    if (!await riskConfirm(`Ganti QR untuk ${selectedUser?.fullName || 'pengguna ini'}? QR lama akan dicabut dan tidak bisa dipakai.`)) return;
    const rotated = await apiFetch(`/qr-credentials/users/${form.userId}/rotate`, { method: 'POST', body: JSON.stringify({ label: form.label, expiresAt: form.expiresAt || undefined, reason: 'Kartu hilang/rusak. QR lama dicabut dari panel cetak kartu.' }) });
    setResult(sanitizeQrResult(rotated));
    refreshStatus();
    window.open(generatorExportUrl({ userId: form.userId, autoPdf: '1' }), '_blank', 'noopener,noreferrer');
    notify('QR baru dibuat. Generator cetak ulang 1 kartu dibuka.');
  }

  async function generate() {
    if (!form.userId) return notify('Pilih pengguna dulu.', 'bad');
    const data = await apiFetch(`/qr-credentials/users/${form.userId}/generate`, { method: 'POST', body: JSON.stringify({ label: form.label, expiresAt: form.expiresAt || undefined }) });
    setResult(sanitizeQrResult(data)); refreshStatus(); notify('Kartu QR dibuat.');
  }
  async function rotate() {
    if (!form.userId) return notify('Pilih pengguna dulu.', 'bad');
    const data = await apiFetch(`/qr-credentials/users/${form.userId}/rotate`, { method: 'POST', body: JSON.stringify({ label: form.label, expiresAt: form.expiresAt || undefined, reason: 'Ganti Kartu QR dari panel admin.' }) });
    setResult(sanitizeQrResult(data)); refreshStatus(); notify('Kartu QR diganti.');
  }
  async function revoke(row) {
    if (!await riskConfirm('Cabut Kartu QR ini? QR lama tidak bisa dipakai scan lagi.')) return;
    await apiFetch(`/qr-credentials/${row.id}/revoke`, { method: 'POST', body: JSON.stringify({ reason: form.revokeReason, status: 'REVOKED' }) });
    refreshStatus(); notify('Kartu QR dicabut.');
  }
  async function bulkReplace() {
    if (!await riskConfirm('Ganti semua QR aktif pada cakupan ini? QR lama akan dicabut. Gunakan hanya jika benar-benar perlu.')) return;
    const data = await apiFetch('/qr-credentials/bulk-generate', { method: 'POST', body: JSON.stringify({ classId: form.classId || undefined, label: form.label, expiresAt: form.expiresAt || undefined }) });
    setResult(sanitizeQrResult(data)); refreshStatus(); notify(data.message || 'Ganti QR selesai.');
  }

  const status = readiness.data || {};
  const classStatus = form.classId ? status.classes?.find((item) => item.id === form.classId) : null;

  return <div className="grid g-3"><Card title="Cetak Kartu e-Hadir" sub="Pilih kelas, lalu klik Cetak. Sistem otomatis melengkapi QR yang belum ada."><div className="user-preset-grid"><QuickActionCard title="Data Siswa" desc="Import atau rapikan akun siswa dulu jika data belum lengkap." icon={<Users size={18} />} actionLabel="Buka Data Siswa" onClick={() => go('/admin/master-data')} /><QuickActionCard title="Cetak Kartu" desc="Cetak semua kartu atau per kelas dengan QR resmi." icon={<CreditCard size={18} />} actionLabel="Cetak Sekarang" onClick={() => preparePrint(true)} tone="ok" /><QuickActionCard title="Kartu Hilang" desc="Cabut QR lama, buat QR baru, lalu cetak ulang satu kartu." icon={<RefreshCw size={18} />} actionLabel="Ganti QR" onClick={rotateLostCard} /></div><div className="form-grid" style={{ marginTop: 16 }}><Field label="Kelas"><SelectInput value={form.classId} onChange={(e) => set('classId', e.target.value)}><option value="">Semua siswa/guru aktif</option>{itemsOf(classes.data).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</SelectInput></Field><Field label="Cari siswa/guru untuk cetak ulang"><SelectInput value={form.userId} onChange={(e) => set('userId', e.target.value)}><option value="">Pilih hanya jika kartu hilang/cetak ulang</option>{itemsOf(users.data).map((u) => <option key={u.id} value={u.id}>{u.fullName} · {statusLabel(u.role)}</option>)}</SelectInput></Field><Btn variant="primary" type="button" onClick={() => preparePrint(true)}><CreditCard size={14} /> Cetak Kartu {selectedClass ? selectedClass.code : 'Semua'}</Btn><Btn type="button" onClick={exportCards}><Download size={14} /> Download Data Kartu</Btn><Btn type="button" variant="ghost" onClick={rotateLostCard}><RefreshCw size={14} /> Kartu Hilang / Ganti QR</Btn><Btn type="button" variant="ghost" onClick={() => window.open(generatorExportUrl({ autoPdf: '0' }), '_blank', 'noopener,noreferrer')}><Eye size={14} /> Buka Preview Generator</Btn></div><SimpleHelpBox title="Alur paling mudah" items={[`Pilih kelas ${selectedClass ? selectedClass.code : 'atau kosongkan untuk semua'}.`, 'Klik Cetak Kartu. QR yang belum ada dibuat otomatis.', 'Generator terbuka dan PDF akan disiapkan. Cetak jika indikator QR fallback = 0.']} /></Card><Card title="Kesiapan Kartu" sub={form.classId ? `Status kelas ${selectedClass?.code || ''}` : 'Status semua akun aktif'} actions={<Btn size="sm" onClick={readiness.refresh}><RefreshCw size={14} /> Cek ulang</Btn>}><div className="grid g-2 cards-grid"><ReadinessStat label="Target" value={status.totalTargetUsers ?? 0} /><ReadinessStat label="QR Resmi" value={status.activeQrCount ?? 0} tone="ok" /><ReadinessStat label="Belum QR" value={status.missingQrCount ?? 0} tone={(status.missingQrCount || 0) > 0 ? 'bad' : 'ok'} /><ReadinessStat label="Siswa Tanpa Kelas" value={status.studentsWithoutClass ?? 0} tone={(status.studentsWithoutClass || 0) > 0 ? 'bad' : 'ok'} /></div>{classStatus && <p className="muted" style={{ marginTop: 12 }}>{classStatus.ready ? 'Kelas ini siap cetak.' : `${classStatus.missingQrCount} siswa di kelas ini belum punya QR aktif.`}</p>}</Card><Card title="Pengaturan Lanjutan" sub="Hanya dipakai untuk kasus khusus seperti rotasi massal atau pencabutan QR." actions={<Btn size="sm" variant="ghost" onClick={() => setShowAdvanced((value) => !value)}>{showAdvanced ? 'Sembunyikan' : 'Tampilkan'}</Btn>}>{showAdvanced ? <div className="form-grid"><Field label="Label QR"><TextInput value={form.label} onChange={(e) => set('label', e.target.value)} /></Field><Field label="Kedaluwarsa opsional"><TextInput type="datetime-local" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} /></Field><Btn type="button" onClick={generate}><Plus size={14} /> Buat untuk Pengguna</Btn><Btn type="button" onClick={rotate}><RefreshCw size={14} /> Ganti QR Pengguna</Btn><Btn type="button" variant="danger" onClick={bulkReplace}>Ganti Semua QR</Btn><Btn type="button" variant="ghost" onClick={() => { reset({ userId: '', classId: '', label: 'QR Absensi SchoolHub', expiresAt: '', revokeReason: 'Kartu QR dicabut oleh admin karena kartu hilang atau diganti.' }); setResult(null); }}>Reset</Btn></div> : <p className="muted">Tombol berisiko disembunyikan agar operator tidak salah mengganti QR massal.</p>}</Card>{form.userId && <Card title="Riwayat QR Pengguna"><AsyncTable state={credentials} columns={[{ header: 'Label', render: (r) => r.label || 'QR Absensi' }, { header: 'Status', render: (r) => <StatusPill status={r.status} /> }, { header: 'Kode Pendek', render: (r) => r.shortCode || '—' }, { header: 'Terbit', render: (r) => formatDateTime(r.issuedAt) }, { header: 'Terakhir Dipakai', render: (r) => formatDateTime(r.lastUsedAt) }]} onRow={(r) => <div className="row"><Btn size="sm" variant="danger" onClick={() => revoke(r)}>Cabut</Btn></div>} /></Card>}<Card title="Hasil Aman" sub="Payload QR asli tidak ditampilkan di layar."><pre className="codeblock">{result ? JSON.stringify(result, null, 2) : 'Belum ada hasil.'}</pre></Card></div>;
}

function ReadinessStat({ label, value, tone = '' }) {
  return <div className={`stat ${tone === 'bad' ? 'danger' : ''}`}><div className="stat-label">{label}</div><div className="stat-num">{value}</div><div className={`stat-delta ${tone === 'ok' ? 'up' : tone === 'bad' ? 'down' : ''}`}>{tone === 'ok' ? 'Aman' : tone === 'bad' ? 'Perlu dicek' : 'Data'}</div></div>;
}

const ANDROID_MODE_LABELS = {
  GATE_IN: 'Gerbang Masuk',
  GATE_OUT: 'Gerbang Keluar',
  MUSHOLA: 'Mushola',
  CHECK_ONLY: 'Coba Dulu / Cek Saja'
};

const ANDROID_READER_PRESETS = [
  { key: 'gate-in', icon: <CreditCard size={26} />, title: 'Gerbang Masuk', desc: 'HP dipakai saat siswa/guru masuk sekolah.', name: 'HP Gerbang Masuk', locationName: 'Gerbang Masuk', allowedModes: ['GATE_IN'] },
  { key: 'gate-out', icon: <DoorOpen size={26} />, title: 'Gerbang Keluar', desc: 'HP dipakai saat siswa/guru keluar/pulang.', name: 'HP Gerbang Keluar', locationName: 'Gerbang Keluar', allowedModes: ['GATE_OUT'] },
  { key: 'gate-both', icon: <RefreshCw size={26} />, title: 'Gerbang Masuk & Keluar', desc: 'Satu HP bisa dipakai untuk masuk dan keluar.', name: 'HP Gerbang Utama', locationName: 'Gerbang Utama', allowedModes: ['GATE_IN', 'GATE_OUT'] },
  { key: 'mushola', icon: <Building2 size={26} />, title: 'Mushola', desc: 'HP khusus scan kehadiran mushola.', name: 'HP Mushola', locationName: 'Mushola', allowedModes: ['MUSHOLA'] },
  { key: 'check-only', icon: <Check size={26} />, title: 'Coba Dulu / Cek Saja', desc: 'Untuk latihan. QR dicek, tapi tidak mencatat hadir.', name: 'HP Uji Coba Scanner', locationName: 'Uji Coba', allowedModes: ['CHECK_ONLY'] }
];

function androidModeLabel(mode) {
  return ANDROID_MODE_LABELS[mode] || statusLabel(mode);
}

function androidModesText(modes = []) {
  return (modes || []).map(androidModeLabel).join(', ') || 'Belum dipilih';
}

function activationCodeOf(result) {
  return result?.provisionToken || String(result?.provisioningQr || '').replace('schoolhub:reader-provision:v1:', '') || '';
}

function formatRemaining(ms) {
  if (ms <= 0) return 'Kode sudah kedaluwarsa';
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes} menit ${String(seconds).padStart(2, '0')} detik lagi`;
}

function AndroidReaderPanel({ notify }) {
  const readers = useRemote(() => apiFetch('/device-readers?page=1&limit=200'), []);
  const [result, setResult] = useState(null);
  const [selectedPreset, setSelectedPreset] = useState('gate-both');
  const [now, setNow] = useState(Date.now());
  const [form, set, reset] = useForm({ name: 'HP Gerbang Utama', locationName: 'Gerbang Utama', allowedModes: ['GATE_IN', 'GATE_OUT'], expiresInMinutes: 15, revokeReason: 'HP scanner dicabut oleh admin.' });

  useEffect(() => {
    if (!result?.expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [result?.expiresAt]);

  function applyPreset(preset) {
    setSelectedPreset(preset.key);
    reset({ name: preset.name, locationName: preset.locationName, allowedModes: preset.allowedModes, expiresInMinutes: 15, revokeReason: 'HP scanner dicabut oleh admin.' });
    setResult(null);
  }

  async function startProvision() {
    if (!form.allowedModes.length) return notify('Pilih tempat HP dipakai dulu.', 'bad');
    const data = await apiFetch('/device-readers/android/provision/start', { method: 'POST', body: JSON.stringify({ name: form.name, locationName: form.locationName, allowedModes: form.allowedModes, expiresInMinutes: Number(form.expiresInMinutes) || 15 }) });
    setResult(data); readers.refresh(); notify('Kode aktivasi HP berhasil dibuat. Salin kode ke aplikasi HP.');
  }

  async function copyActivationCode() {
    const code = activationCodeOf(result);
    if (!code) return notify('Kode aktivasi belum tersedia.', 'bad');
    await navigator.clipboard.writeText(code);
    notify('Kode aktivasi disalin. Tempel di aplikasi HP.', 'ok');
  }

  async function revoke(row) {
    if (!await riskConfirm('Cabut HP scanner ini? HP tersebut tidak bisa scan lagi sampai diaktivasi ulang.')) return;
    await apiFetch(`/device-readers/${row.id}/revoke`, { method: 'POST', body: JSON.stringify({ reason: form.revokeReason }) });
    readers.refresh(); notify('HP scanner dicabut.');
  }

  async function status(row, value) {
    await apiFetch(`/devices/readers/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: value }) });
    readers.refresh(); notify(value === 'ACTIVE' ? 'HP scanner diaktifkan lagi.' : 'HP scanner dinonaktifkan.');
  }

  const activationCode = activationCodeOf(result);
  const remainingMs = result?.expiresAt ? new Date(result.expiresAt).getTime() - now : 0;
  const expired = Boolean(result?.expiresAt && remainingMs <= 0);
  const androidRows = { ...readers, data: { ...(readers.data || {}), items: itemsOf(readers.data).filter((row) => row.type === 'QR_ANDROID') } };

  return <div className="android-activation-page"><div className="activation-hero"><div><Pill tone="ok"><Smartphone size={13} /> Mode mudah</Pill><h2>Aktifkan HP Scanner Android</h2><p>Pilih tempat HP dipakai, klik buat kode, lalu tempel kodenya ke aplikasi HP. Tidak perlu paham mode teknis.</p></div><div className="activation-safe"><ShieldCheck size={20} /><span>Kunci rahasia tidak ditampilkan di web dan tidak masuk aplikasi HP.</span></div></div><div className="wizard-steps"><div className="wizard-step active"><b>1</b><span>Pilih tempat HP dipakai</span></div><div className={`wizard-step ${form.allowedModes.length ? 'active' : ''}`}><b>2</b><span>Buat kode aktivasi</span></div><div className={`wizard-step ${activationCode ? 'active' : ''}`}><b>3</b><span>Tempel kode di aplikasi HP</span></div></div><div className="grid activation-grid"><Card title="1. Pilih tempat HP dipakai" sub="Klik salah satu kartu. Web otomatis mengatur nama, lokasi, dan mode yang benar."><div className="preset-grid">{ANDROID_READER_PRESETS.map((preset) => <button key={preset.key} type="button" className={`preset-card ${selectedPreset === preset.key ? 'selected' : ''}`} onClick={() => applyPreset(preset)}><span className="preset-icon">{preset.icon}</span><b>{preset.title}</b><small>{preset.desc}</small></button>)}</div><div className="simple-summary"><div><span>Nama HP</span><b>{form.name}</b></div><div><span>Lokasi</span><b>{form.locationName}</b></div><div><span>Dipakai untuk</span><b>{androidModesText(form.allowedModes)}</b></div></div></Card><Card title="2. Buat kode aktivasi" sub="Kode ini berlaku sebentar dan hanya untuk mengaktifkan satu HP scanner."><div className="activation-form-simple"><Field label="Nama HP / Lokasi"><TextInput value={form.name} onChange={(e) => set('name', e.target.value)} /></Field><Field label="Tempat HP dipasang"><TextInput value={form.locationName} onChange={(e) => set('locationName', e.target.value)} /></Field><Field label="Kode berlaku berapa menit"><TextInput type="number" min="1" max="60" value={form.expiresInMinutes} onChange={(e) => set('expiresInMinutes', e.target.value)} /></Field><Btn variant="primary" type="button" onClick={startProvision}><QrCode size={16} /> Buat Kode Aktivasi</Btn></div><div className="security-note"><AlertTriangle size={16} /><span>Jangan kirim kode ini ke grup umum. Kode hanya untuk mengaktifkan 1 HP scanner.</span></div></Card>{activationCode && <Card title="3. Masukkan kode di aplikasi HP" sub="Salin kode ini, lalu tempel di kolom Kode Aktivasi dari Admin pada aplikasi Android."><div className={`activation-code-card ${expired ? 'expired' : ''}`}><div className="activation-code-label"><Clock size={15} /> {formatRemaining(remainingMs)}</div><div className="activation-code-value">{activationCode}</div><div className="copy-actions"><Btn type="button" variant="primary" onClick={copyActivationCode} disabled={expired}><Copy size={15} /> Salin Kode</Btn><Btn type="button" onClick={startProvision}><RefreshCw size={15} /> Buat Kode Baru</Btn></div></div><ol className="activation-instructions"><li>Buka aplikasi <b>Absensi MAN 1 Rokan Hulu</b> di HP.</li><li>Isi alamat web jika diminta.</li><li>Tempel kode ini ke kolom <b>Kode Aktivasi dari Admin</b>.</li><li>Tekan <b>Aktifkan HP Ini</b>, lalu mulai scan.</li></ol></Card>}</div><div className="activation-help-grid"><Card title="Kapan pilih Gerbang Masuk?"><p>Untuk HP yang dipakai saat siswa/guru masuk sekolah.</p></Card><Card title="Kapan pilih Mushola?"><p>Untuk HP yang ditempel di area mushola dan dipakai scan kehadiran sholat.</p></Card><Card title="Apa itu Coba Dulu?"><p>Mode latihan. QR dicek ke server, tetapi tidak mencatat hadir. Aman untuk uji coba awal.</p></Card></div><Card title="HP Scanner yang sudah dibuat" sub="Daftar ini sengaja disederhanakan. Detail teknis disembunyikan agar tidak membingungkan operator."><AsyncTable state={androidRows} empty="Belum ada HP scanner Android" columns={[{ header: 'Nama HP', render: (r) => r.name || 'HP Scanner' }, { header: 'Lokasi', render: (r) => r.locationName || r.locationLabel || '—' }, { header: 'Status', render: (r) => <StatusPill status={r.status === 'INACTIVE' && !r.deviceId ? 'PENDING' : r.status} /> }, { header: 'Dipakai untuk', render: (r) => androidModesText(r.allowedModes || []) }, { header: 'Terakhir dipakai', render: (r) => formatDateTime(r.lastSignedScanAt || r.lastSeenAt) }]} onRow={(r) => <div className="row"><Btn size="sm" onClick={() => status(r, r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}>{r.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan lagi'}</Btn><Btn size="sm" variant="danger" onClick={() => revoke(r)}>Cabut</Btn></div>} /></Card></div>;
}

function MobileVersionPanel({ notify }) {
  const state = useRemote(() => apiFetch('/mobile/android-reader/version'), []);
  const [form, setForm] = useState(null);
  useEffect(() => { if (state.data && !form) setForm(state.data); }, [state.data]);
  async function submit(e) { e.preventDefault(); await apiFetch('/mobile/android-reader/version', { method: 'PUT', body: JSON.stringify({ ...form, latestVersionCode: Number(form.latestVersionCode), minSupportedVersionCode: Number(form.minSupportedVersionCode), forceUpdate: Boolean(form.forceUpdate), downloadUrl: form.downloadUrl || undefined, releaseNotes: form.releaseNotes || undefined }) }); state.refresh(); notify('Versi aplikasi HP disimpan.'); }
  if (state.loading || !form) return <LoadingState label="Memuat versi aplikasi HP…" />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.refresh} />;
  return <Card title="Versi Aplikasi HP" sub="Dipakai aplikasi HP untuk cek versi terbaru dan batas versi lama."><form className="form-grid" onSubmit={submit}><Field label="Nama versi terbaru"><TextInput value={form.latestVersionName} onChange={(e) => setForm({ ...form, latestVersionName: e.target.value })} /></Field><Field label="Kode versi terbaru"><TextInput type="number" value={form.latestVersionCode} onChange={(e) => setForm({ ...form, latestVersionCode: e.target.value })} /></Field><Field label="Kode versi minimal"><TextInput type="number" value={form.minSupportedVersionCode} onChange={(e) => setForm({ ...form, minSupportedVersionCode: e.target.value })} /></Field><Field label="Link download opsional"><TextInput value={form.downloadUrl || ''} onChange={(e) => setForm({ ...form, downloadUrl: e.target.value })} /></Field><Field label="Catatan rilis"><TextInput type="textarea" rows={3} value={form.releaseNotes || ''} onChange={(e) => setForm({ ...form, releaseNotes: e.target.value })} /></Field><label className="checkline"><input type="checkbox" checked={Boolean(form.forceUpdate)} onChange={(e) => setForm({ ...form, forceUpdate: e.target.checked })} /> Wajib update</label><Btn variant="primary"><Save size={14} /> Simpan versi</Btn></form></Card>;
}

function CardsPanel({ notify }) {
  const users = useRemote(() => apiFetch('/identity/users?page=1&limit=300'), []);
  const cards = useRemote(() => apiFetch('/devices/cards?page=1&limit=200'), []);
  const [form, set, reset, setForm] = useForm({ id: '', uid: '', userId: '', status: 'ACTIVE', note: '' });
  async function submit(e) {
    e.preventDefault();
    const payload = { uid: form.uid, userId: form.userId || null, status: form.status, note: form.note };
    if (form.id) await apiFetch(`/devices/cards/${form.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    else await apiFetch('/devices/cards', { method: 'POST', body: JSON.stringify({ ...payload, userId: form.userId || undefined }) });
    reset({ id: '', uid: '', userId: '', status: 'ACTIVE', note: '' });
    cards.refresh();
    notify('Kartu disimpan.');
  }
  async function update(row, patch) { await apiFetch(`/devices/cards/${row.id}`, { method: 'PATCH', body: JSON.stringify(patch) }); cards.refresh(); notify('Kartu diperbarui.'); }
  return <div className="grid management-grid"><Card title={form.id ? 'Edit Kartu' : 'Tambah Kartu'}><form onSubmit={submit} className="form-grid"><Field label="UID"><TextInput value={form.uid} placeholder="UID kartu, contoh: 04A1B2C3" onChange={(e) => set('uid', e.target.value)} required minLength={4} /></Field><Field label="Pemilik"><SelectInput value={form.userId} onChange={(e) => set('userId', e.target.value)}><option value="">Stok / belum ditautkan</option>{itemsOf(users.data).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</SelectInput></Field><Field label="Status"><SelectInput value={form.status} onChange={(e) => set('status', e.target.value)}><option value="ACTIVE">Aktif</option><option value="LOST">Hilang</option><option value="INACTIVE">Nonaktif</option></SelectInput></Field><Field label="Catatan"><TextInput value={form.note} placeholder="Catatan opsional tentang kartu" onChange={(e) => set('note', e.target.value)} /></Field><Btn variant="primary">Simpan</Btn>{form.id && <Btn type="button" variant="ghost" onClick={() => reset({ id: '', uid: '', userId: '', status: 'ACTIVE', note: '' })}>Batal edit</Btn>}</form></Card><Card title="Daftar Kartu"><AsyncTable state={cards} columns={[{ header: 'UID', key: 'uid' }, { header: 'Pemilik', render: (r) => r.user?.fullName || 'Stok' }, { header: 'Status', render: (r) => <StatusPill status={r.status} /> }, { header: 'Terakhir Tap', render: (r) => formatDateTime(r.lastTappedAt) }]} onRow={(r) => <div className="row"><Btn size="sm" onClick={() => setForm({ id: r.id, uid: r.uid, userId: r.userId || r.user?.id || '', status: r.status, note: r.note || '' })}>Edit</Btn><Btn size="sm" onClick={() => update(r, { userId: null })}>Lepaskan</Btn><Btn size="sm" onClick={() => update(r, { status: 'ACTIVE' })}>Aktif</Btn><Btn size="sm" variant="danger" onClick={() => update(r, { status: 'LOST' })}>Hilang</Btn></div>} /></Card></div>;
}

function ReadersPanel({ notify }) {
  const readers = useRemote(() => apiFetch('/devices/readers?page=1&limit=200'), []);
  const [form, set, reset] = useForm({ name: '', type: 'GATE', locationLabel: '', locationLat: '', locationLng: '' });
  async function submit(e) { e.preventDefault(); await apiFetch('/devices/readers', { method: 'POST', body: JSON.stringify({ name: form.name, type: form.type, locationLabel: form.locationLabel || undefined, locationLat: Number(form.locationLat) || undefined, locationLng: Number(form.locationLng) || undefined }) }); reset({ name: '', type: 'GATE', locationLabel: '', locationLat: '', locationLng: '' }); readers.refresh(); notify('Alat pembaca ditambahkan.'); }
  async function status(row, value) { await apiFetch(`/devices/readers/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: value }) }); readers.refresh(); }
  async function rotate(row) { await apiFetch(`/devices/readers/${row.id}/rotate-key`, { method: 'POST', body: JSON.stringify({}) }); readers.refresh(); notify('Kunci akses alat pembaca diganti.'); }
  return <div className="grid management-grid"><Card title="Tambah Alat Pembaca"><form onSubmit={submit} className="form-grid"><Field label="Nama"><TextInput value={form.name} placeholder="Contoh: Alat Gerbang Utama" onChange={(e) => set('name', e.target.value)} required /></Field><Field label="Fungsi alat"><SelectInput value={form.type} onChange={(e) => set('type', e.target.value)}><option value="GATE">Gerbang</option><option value="MUSHOLA">Mushola</option><option value="CLASS">Cek kelas</option><option value="MANUAL">Input petugas</option></SelectInput></Field><Field label="Lokasi"><TextInput value={form.locationLabel} placeholder="Contoh: Gerbang utama / Mushola" onChange={(e) => set('locationLabel', e.target.value)} /></Field><Field label="Lintang lokasi"><TextInput value={form.locationLat} placeholder="Contoh: 0.875123" onChange={(e) => set('locationLat', e.target.value)} /></Field><Field label="Bujur lokasi"><TextInput value={form.locationLng} placeholder="Contoh: 100.291234" onChange={(e) => set('locationLng', e.target.value)} /></Field><Btn variant="primary">Simpan</Btn></form></Card><Card title="Daftar Alat Pembaca"><AsyncTable state={readers} columns={[{ header: 'Nama', key: 'name' }, { header: 'Fungsi', render: (r) => <StatusPill status={r.type || 'GATE'} /> }, { header: 'Lokasi', render: (r) => r.locationLabel || '—' }, { header: 'Status', render: (r) => <StatusPill status={r.status} /> }, { header: 'Terakhir aktif', render: (r) => formatDateTime(r.lastSeenAt) }]} onRow={(r) => <div className="row"><Btn size="sm" onClick={() => rotate(r)}><KeyRound size={12} /> Ganti kunci</Btn><Btn size="sm" onClick={() => status(r, r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}>{r.status === 'ACTIVE' ? 'Nonaktif' : 'Aktif'}</Btn></div>} /></Card></div>;
}

function ManualQrScanPanel({ notify }) {
  const users = useRemote(() => apiFetch('/identity/users?page=1&limit=300'), []);
  const readers = useRemote(() => apiFetch('/devices/readers?page=1&limit=200'), []);
  const [result, setResult] = useState(null);
  const [form, set, reset] = useForm({ cardUid: '', userId: '', readerId: '', readerType: 'GATE', direction: 'IN', prayerType: 'DHUHA', overrideScope: 'CLASS_ELIGIBILITY', manualReason: 'Input manual oleh petugas karena scan QR perlu diverifikasi.' });
  async function submit(e) {
    e.preventDefault();
    const payload = { ...form, cardUid: form.cardUid || undefined, userId: form.userId || undefined, readerId: form.readerId || undefined, prayerType: undefined, direction: form.readerType === 'GATE' || form.overrideScope === 'ASHAR_CHECKOUT' ? form.direction : undefined, overrideScope: form.readerType === 'MANUAL' ? form.overrideScope : undefined };
    try {
      const data = await apiFetch('/attendance/qr-scan', { method: 'POST', body: JSON.stringify(payload) });
      setResult(data);
      notify(data.message || 'Catatan manual tersimpan.');
    } catch (error) {
      const message = error.message || 'Catatan manual gagal disimpan.';
      setResult({ error: message });
      notify(message, 'bad');
    }
  }
  return <div className="grid g-2"><Card title="Input Manual Cadangan" sub="Admin bisa mencatat scan gerbang, mushola, atau verifikasi kelas secara cadangan dengan alasan."><form className="form-grid" onSubmit={submit}><Field label="Kode QR/kartu"><TextInput value={form.cardUid} placeholder="Kosongkan jika memilih pengguna manual" onChange={(e) => set('cardUid', e.target.value)} /></Field><Field label="Pilih orang"><SelectInput value={form.userId} onChange={(e) => set('userId', e.target.value)}><option value="">Pilih jika tidak pakai UID</option>{itemsOf(users.data).map((u) => <option key={u.id} value={u.id}>{u.fullName} · {statusLabel(u.role)}</option>)}</SelectInput></Field><Field label="Alat pembaca"><SelectInput value={form.readerId} onChange={(e) => set('readerId', e.target.value)}><option value="">Tanpa alat / manual</option>{itemsOf(readers.data).map((r) => <option key={r.id} value={r.id}>{r.name} · {statusLabel(r.type || 'GATE')}</option>)}</SelectInput></Field><Field label="Jenis catatan"><SelectInput value={form.readerType} onChange={(e) => set('readerType', e.target.value)}><option value="GATE">Gerbang</option><option value="MUSHOLA">Mushola</option><option value="CLASS">Verifikasi kelas siswa</option><option value="MANUAL">Pengecualian siswa</option></SelectInput></Field>{form.readerType === 'GATE' && <Field label="Arah"><SelectInput value={form.direction} onChange={(e) => set('direction', e.target.value)}><option value="IN">Masuk</option><option value="OUT">Keluar</option></SelectInput></Field>}{form.readerType === 'MUSHOLA' && <Field label="Sholat"><SelectInput value={form.prayerType} onChange={(e) => set('prayerType', e.target.value)}><option value="DHUHA">Dhuha</option><option value="DZUHUR">Dzuhur</option><option value="ASHAR">Ashar</option></SelectInput></Field>}{form.readerType === 'MANUAL' && <Field label="Jenis pengecualian"><SelectInput value={form.overrideScope} onChange={(e) => set('overrideScope', e.target.value)}><option value="CLASS_ELIGIBILITY">Syarat presensi kelas</option><option value="ASHAR_CHECKOUT">Pulang tanpa scan Ashar</option><option value="ALL">Semua syarat hari ini</option></SelectInput></Field>}<Field label="Alasan input cadangan" hint={`${form.manualReason.trim().length}/10+`}><TextInput type="textarea" rows={3} value={form.manualReason} onChange={(e) => set('manualReason', e.target.value)} /></Field><Btn variant="primary" disabled={!form.cardUid && !form.userId}><Wifi size={14} /> Simpan Catatan</Btn><Btn type="button" variant="ghost" onClick={() => { reset({ cardUid: '', userId: '', readerId: '', readerType: 'GATE', direction: 'IN', prayerType: 'DHUHA', overrideScope: 'CLASS_ELIGIBILITY', manualReason: 'Input manual oleh petugas karena scan QR perlu diverifikasi.' }); setResult(null); }}>Reset</Btn></form></Card><Card title="Hasil terakhir" sub="Status penyimpanan scan"><pre className="codeblock">{result ? JSON.stringify(result, null, 2) : 'Belum ada catatan.'}</pre></Card></div>;
}

export function SettingsPage({ notify }) {
  const policy = useRemote(() => apiFetch('/access/geofence'), []);
  const attendancePolicy = useRemote(() => apiFetch('/attendance/policy'), []);
  const [form, setForm] = useState(null);
  const [attendanceForm, setAttendanceForm] = useState(null);
  useEffect(() => { if (policy.data && !form) setForm(policy.data); }, [policy.data]);
  useEffect(() => { if (attendancePolicy.data && !attendanceForm) setAttendanceForm(attendancePolicy.data); }, [attendancePolicy.data]);
  async function submit(e) { e.preventDefault(); if (!await riskConfirm('Simpan perubahan lokasi sekolah dan aturan presensi?')) return; await apiFetch('/access/geofence', { method: 'PUT', body: JSON.stringify({ ...form, centerLat: Number(form.centerLat), centerLng: Number(form.centerLng), radiusMeter: Number(form.radiusMeter), arrivalGraceMinutes: Number(form.arrivalGraceMinutes), autoMissedGraceMinutes: Number(form.autoMissedGraceMinutes) }) }); notify('Pengaturan lokasi sekolah tersimpan.'); policy.refresh(); }
  async function submitAttendance(e) { e.preventDefault(); if (!await riskConfirm('Simpan aturan absensi gerbang, mushola, dan kelas?')) return; await apiFetch('/attendance/policy', { method: 'PUT', body: JSON.stringify({ ...attendanceForm, duplicateScanWindowMinutes: Number(attendanceForm.duplicateScanWindowMinutes) || 0 }) }); notify('Aturan absensi tersimpan.'); attendancePolicy.refresh(); }
  return <div className="content"><PageHead eyebrow="ATURAN ABSENSI" title="Aturan Absensi" sub="Atur aturan siswa, guru, mushola, dan HP scanner. Bagian angka/lokasi adalah pengaturan lanjutan." /><SimpleHelpBox title="Pakai pengaturan ini dengan hati-hati" items={['Untuk uji coba, biarkan input QR manual cadangan tetap aktif.', 'Aktifkan aplikasi HP Android sebagai jalur utama jika HP scanner sudah berhasil dipakai.', 'Jangan ubah lokasi sekolah tanpa konfirmasi operator.']} />{policy.loading || !form ? <LoadingState /> : policy.error ? <ErrorState error={policy.error} onRetry={policy.refresh} /> : <Card title="Kebijakan Lokasi"><form className="form-grid" onSubmit={submit}>{[['centerLat', 'Lintang lokasi'], ['centerLng', 'Bujur lokasi'], ['radiusMeter', 'Jarak aman (meter)'], ['arrivalGraceMinutes', 'Toleransi terlambat (menit)'], ['autoMissedGraceMinutes', 'Otomatis ditandai terlewat (menit)']].map(([k, l]) => <Field key={k} label={l}><TextInput type="number" placeholder="Isi angka" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>)}{[['enforceSessionOpen', 'Wajib berada di area sekolah saat buka sesi'], ['requireGateTapForOpen', 'Guru wajib scan gerbang sebelum buka sesi'], ['allowPicketOverride', 'Guru piket boleh memberi pengecualian']].map(([k, l]) => <label className="checkline" key={k}><input type="checkbox" checked={Boolean(form[k])} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} /> {l}</label>)}<Btn variant="primary"><Save size={14} /> Simpan lokasi</Btn></form></Card>}{attendancePolicy.loading || !attendanceForm ? <LoadingState label="Memuat aturan absensi…" /> : attendancePolicy.error ? <ErrorState error={attendancePolicy.error} onRetry={attendancePolicy.refresh} /> : <Card title="Aturan Absensi" sub="Admin bisa menyalakan atau mematikan syarat scan sesuai aturan sekolah."><form className="form-grid" onSubmit={submitAttendance}>{[['requireStudentGateInBeforeClass', 'Siswa wajib scan gerbang sebelum presensi kelas'], ['requireStudentDhuha', 'Siswa wajib scan Dhuha'], ['requireStudentDzuhur', 'Siswa wajib scan Dzuhur'], ['requireStudentAsharForAfternoon', 'Siswa wajib scan Ashar sebelum pulang jika jadwal sampai sore'], ['requireStudentClassEligibility', 'Kunci presensi kelas jika syarat belum lengkap'], ['requireTeacherGateIn', 'Guru wajib scan gerbang masuk'], ['requireTeacherGateOut', 'Guru wajib scan gerbang keluar'], ['requireStaffGateIn', 'Karyawan/TU/operator wajib scan masuk'], ['requireStaffGateOut', 'Karyawan/TU/operator wajib scan keluar'], ['allowManualOverride', 'Admin/Guru piket boleh verifikasi manual dengan alasan'], ['allowStudentAsharCheckoutOverride', 'Petugas boleh memberi pengecualian pulang tanpa scan Ashar'], ['preferOfficialQrReader', 'Jadikan aplikasi HP Android sebagai jalur utama'], ['legacyQrScanEnabled', 'Izinkan input QR manual cadangan']].map(([k, l]) => <label className="checkline" key={k}><input type="checkbox" checked={Boolean(attendanceForm[k])} onChange={(e) => setAttendanceForm({ ...attendanceForm, [k]: e.target.checked })} /> {l}</label>)}{[['dhuhaStartTime', 'Mulai Dhuha'], ['dhuhaEndTime', 'Selesai Dhuha'], ['dzuhurStartTime', 'Mulai Dzuhur'], ['dzuhurEndTime', 'Selesai Dzuhur'], ['asharStartTime', 'Mulai Ashar'], ['asharEndTime', 'Selesai Ashar'], ['asharRequiredClassEndTime', 'Batas disebut jadwal sore']].map(([k, l]) => <Field key={k} label={l}><TextInput type="time" value={attendanceForm[k]} onChange={(e) => setAttendanceForm({ ...attendanceForm, [k]: e.target.value })} /></Field>)}<Field label="Jeda scan ganda (menit)"><TextInput type="number" value={attendanceForm.duplicateScanWindowMinutes} onChange={(e) => setAttendanceForm({ ...attendanceForm, duplicateScanWindowMinutes: e.target.value })} /></Field><Btn variant="primary"><Save size={14} /> Simpan aturan absensi</Btn></form></Card>}</div>;
}

export function ReportsPage({ notify }) {
  const [type, setType] = useState('recap/classes');
  const [format, setFormat] = useState('xlsx');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const state = useRemote(() => apiFetch(`/reports/${type}${qs({ from, to, page: 1, limit: 100 })}`), [type, from, to]);
  const [exporting, setExporting] = useState(false);
  const exportMap = { 'recap/classes': 'recap_classes', 'recap/students': 'recap_students', 'recap/subjects': 'recap_subjects', 'recap/teachers': 'recap_teachers', 'teacher-monthly': 'teacher_monthly', 'audit-coverage': 'audit_coverage' };
  async function exportNow() { setExporting(true); try { await apiDownload(`/reports/export${qs({ reportType: exportMap[type], format, from, to, month: monthNow() })}`); notify('Berkas laporan berhasil diunduh.'); } catch (error) { notify(error.message || 'Unduhan gagal.', 'bad'); } finally { setExporting(false); } }
  return <div className="content"><PageHead eyebrow="LAPORAN" title="Laporan Sekolah" sub="Pilih jenis laporan, tentukan tanggal, lalu cetak atau unduh Excel." actions={<><SelectInput wrapperClassName="select-report-type" aria-label="Pilih jenis laporan" value={type} onChange={(e) => setType(e.target.value)}><option value="recap/classes">Laporan Kelas</option><option value="recap/students">Laporan Siswa</option><option value="recap/subjects">Laporan Mapel</option><option value="recap/teachers">Laporan Guru</option><option value="teacher-monthly">Bulanan Guru</option><option value="audit-coverage">Cek Cakupan</option></SelectInput><label className="input compact"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="input compact"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><SelectInput wrapperClassName="select-report-format" aria-label="Pilih format ekspor" value={format} onChange={(e) => setFormat(e.target.value)}><option value="xlsx">XLSX</option><option value="csv">CSV</option></SelectInput><Btn onClick={() => window.print()}><FileText size={14} /> Cetak</Btn><Btn variant="primary" loading={exporting} disabled={exporting} onClick={exportNow}><Download size={14} /> {exporting ? 'Mengunduh...' : 'Download'}</Btn></>} /><StepGuide title="Cara membuat laporan" steps={['Pilih jenis laporan.', 'Pilih tanggal awal dan akhir.', 'Lihat pratinjau.', 'Klik Cetak atau Download.']} /><div className="print-letterhead"><img src="/logoman1.jpeg" alt="Logo MAN 1 Rokan Hulu" /><div><b>MAN 1 Rokan Hulu</b><span>Laporan e-Hadir · Periode {from} sampai {to}</span></div></div><div className="grid g-2"><Card title="Grafik ringkas" sub="Ditampilkan jika laporan memiliki angka yang bisa dibandingkan."><HorizontalBarList data={state.data} /></Card><Card title="Pratinjau Laporan"><GenericTableState state={state} /></Card></div><div className="print-signature"><div>Mengetahui,<br />Kepala Madrasah</div><div>Petugas,<br />Admin/TU</div></div></div>;
}

function GenericTableState({ state }) {
  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.refresh} />;
  const rows = itemsOf(state.data);
  if (!rows.length) return <FriendlyEmptyState title="Belum ada data laporan" sub="Coba ubah jenis laporan atau rentang tanggal." />;
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r).filter((k) => !['id'].includes(k))))).slice(0, 8);
  return <DataTable rows={rows} columns={keys.map((key) => ({ header: key, render: (r) => typeof r[key] === 'object' ? JSON.stringify(r[key]) : String(r[key] ?? '—') }))} />;
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [module, setModule] = useState('');
  const audit = useRemote(() => apiFetch(`/audit${qs({ page, limit: 50, module })}`), [page, module]);
  return <div className="content"><PageHead eyebrow="RIWAYAT PERUBAHAN" title="Riwayat Perubahan" sub="Catatan resmi sistem: siapa mengubah apa, kapan, dan alasannya." actions={<><SelectInput value={module} onChange={(e) => setModule(e.target.value)}><option value="">Semua modul</option><option value="attendance">Presensi</option><option value="identity">Pengguna</option><option value="academic">Akademik</option><option value="scheduling">Jadwal</option><option value="device">Perangkat</option><option value="access">Akses lokasi</option><option value="picket">Catatan piket</option></SelectInput><Btn onClick={audit.refresh}><RefreshCw size={14} /> Muat ulang</Btn></>} /><Card><AsyncTable state={audit} columns={[{ header: 'Waktu', render: (r) => formatDateTime(r.createdAt) }, { header: 'Aksi', key: 'action' }, { header: 'Modul', key: 'module' }, { header: 'Pelaku', render: (r) => r.actor?.fullName || r.actorId || 'sistem' }, { header: 'Data', render: (r) => `${r.resource}:${r.resourceId}` }, { header: 'Alasan', render: (r) => r.reason || r.after?.reason || '—' }]} /><Pagination meta={metaOf(audit.data)} onPage={setPage} /></Card></div>;
}

export function PicketBookPage({ notify }) {
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const notes = useRemote(() => apiFetch(`/picket-notes${qs({ date, category, severity, active: true, page: 1, limit: 100 })}`), [date, category, severity]);
  const [form, set, reset, setForm] = useForm({ id: '', title: '', body: '', category: 'UMUM', severity: 'INFO' });
  async function add(e) {
    e.preventDefault();
    const payload = { date: new Date(date).toISOString(), title: form.title, body: form.body, category: form.category, severity: form.severity };
    if (form.id) await apiFetch(`/picket-notes/${form.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    else await apiFetch('/picket-notes', { method: 'POST', body: JSON.stringify(payload) });
    reset({ id: '', title: '', body: '', category: 'UMUM', severity: 'INFO' });
    notes.refresh();
    notify('Catatan piket tersimpan.');
  }
  async function remove(row) {
    if (!await riskConfirm('Nonaktifkan catatan piket ini?')) return;
    await apiFetch(`/picket-notes/${row.id}`, { method: 'DELETE', body: JSON.stringify({ reason: 'Catatan piket dinonaktifkan dari UI.' }) });
    notes.refresh();
    notify('Catatan piket dinonaktifkan.');
  }
  return <div className="content"><PageHead eyebrow="CATATAN PIKET" title="Catatan Piket" sub="Tulis kejadian penting dengan bahasa singkat agar petugas berikutnya mudah memahami." actions={<><label className="input compact"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><SelectInput value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Semua kategori</option><option value="UMUM">Umum</option><option value="GERBANG">Gerbang</option><option value="KELAS">Kelas</option><option value="DISIPLIN">Disiplin</option></SelectInput><SelectInput value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="">Semua tingkat</option><option value="INFO">Informasi</option><option value="WARN">Perhatian</option><option value="URGENT">Penting</option></SelectInput></>} /><div className="grid g-3"><Card title={form.id ? 'Edit Catatan' : 'Catat Kejadian'} sub="Isi seperti buku catatan biasa: judul, jenis kejadian, tingkat penting, lalu detailnya."><form onSubmit={add} className="form-grid"><Field label="Judul kejadian"><TextInput value={form.title} placeholder="Contoh: Siswa terlambat di gerbang" onChange={(e) => set('title', e.target.value)} required /></Field><Field label="Jenis kejadian"><SelectInput value={form.category} onChange={(e) => set('category', e.target.value)}><option value="UMUM">Umum</option><option value="GERBANG">Gerbang</option><option value="KELAS">Kelas</option><option value="DISIPLIN">Disiplin</option></SelectInput></Field><Field label="Tingkat penting"><SelectInput value={form.severity} onChange={(e) => set('severity', e.target.value)}><option value="INFO">Informasi</option><option value="WARN">Perhatian</option><option value="URGENT">Penting</option></SelectInput></Field><Field label="Catatan"><TextInput type="textarea" rows={5} value={form.body} placeholder="Tuliskan kronologi atau catatan penting" onChange={(e) => set('body', e.target.value)} required /></Field><Btn variant="primary"><Save size={14} /> Simpan</Btn>{form.id && <Btn type="button" variant="ghost" onClick={() => reset({ id: '', title: '', body: '', category: 'UMUM', severity: 'INFO' })}>Batal edit</Btn>}</form></Card><Card title="Catatan Hari Ini"><AsyncTable state={notes} columns={[{ header: 'Waktu', render: (r) => formatDateTime(r.date) }, { header: 'Judul', key: 'title' }, { header: 'Kategori', key: 'category' }, { header: 'Tingkat', render: (r) => <StatusPill status={r.severity} /> }, { header: 'Petugas', render: (r) => r.createdBy?.fullName || '—' }]} onRow={(r) => <div className="row"><Btn size="sm" onClick={() => setForm({ id: r.id, title: r.title, body: r.body, category: r.category, severity: r.severity })}>Edit</Btn><Btn size="sm" variant="danger" onClick={() => remove(r)}>Hapus</Btn></div>} /></Card></div></div>;
}

export function LiveMonitorPage() {
  const [auto, setAuto] = useState(true);
  const state = useRemote(() => apiFetch('/reports/live-monitor?page=1&limit=40'), [auto]);
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => {
      if (!document.hidden) state.refresh();
    }, 12000);
    return () => clearInterval(timer);
  }, [auto]);
  return <div className="content"><PageHead eyebrow="AKTIVITAS SEKARANG" title="Aktivitas Sekarang" sub="Aktivitas scan, sesi kelas, dan perubahan terbaru. Halaman ini otomatis memuat ulang." actions={<Btn onClick={() => setAuto((x) => !x)}><Zap size={14} /> {auto ? 'Jeda' : 'Lanjutkan'}</Btn>} /><Card title="Daftar aktivitas"><AsyncTable state={state} columns={[{ header: 'Waktu', render: (r) => formatDateTime(r.at || r.createdAt || r.tappedAt) }, { header: 'Tipe', render: (r) => <StatusPill status={r.event || r.type || r.direction || r.action} /> }, { header: 'Subjek', render: (r) => r.who || r.fullName || r.user?.fullName || r.actor?.fullName || '—' }, { header: 'Lokasi/Konteks', render: (r) => r.loc || r.deviceId || r.module || '—' }]} /></Card></div>;
}

export function PicketDashboardPage() {
  const dashboard = useRemote(() => apiFetch('/reports/dashboard'), []);
  const flags = useRemote(() => apiFetch('/reconciliation/flags?status=OPEN&page=1&limit=20'), []);
  const notes = useRemote(() => apiFetch(`/picket-notes${qs({ date: today(), active: true, page: 1, limit: 20 })}`), []);
  const sessions = useRemote(() => apiFetch(`/attendance/class-sessions${qs({ date: today(), page: 1, limit: 100 })}`), []);
  const rows = itemsOf(sessions.data);
  const presenceOf = (s) => s.teacherPresence?.find?.((item) => item.teacherId === s.teacher?.id || item.teacherId === s.teacherId) || null;
  const notCheckedIn = rows.filter((s) => s.status === 'SCHEDULED' && !presenceOf(s)?.checkInAt).length;
  const teaching = rows.filter((s) => s.status === 'OPEN' && presenceOf(s)?.checkInAt && !presenceOf(s)?.checkOutAt).length;
  const notCheckedOut = rows.filter((s) => s.status === 'OPEN' && presenceOf(s)?.checkInAt && !presenceOf(s)?.checkOutAt && new Date(s.endsAt).getTime() <= Date.now()).length;
  const missed = rows.filter((s) => s.status === 'MISSED').length;
  return <div className="content"><PageHead eyebrow="GURU PIKET" title="Tugas Piket Hari Ini" sub="Cek guru/siswa yang perlu dibantu, catat kejadian, dan tindak masalah." actions={<><Btn onClick={() => go('/admin/picket')}><ListChecks size={14} /> Catatan Piket</Btn><Btn variant="primary" onClick={() => go('/admin/anomaly')}><Flag size={14} /> Cek Masalah</Btn></>} /><RoleTaskPanel tasks={[{ title: 'Catat kejadian', desc: 'Tulis kejadian penting di buku piket.', icon: <ListChecks size={18} />, onClick: () => go('/admin/picket') }, { title: 'Cek masalah', desc: 'Lihat masalah yang perlu dibantu.', icon: <Flag size={18} />, tone: 'warn', onClick: () => go('/admin/anomaly') }, { title: 'Cek sesi kelas', desc: 'Pantau kelas yang sedang berjalan.', icon: <Radar size={18} />, onClick: () => go('/admin/sessions') }]} /><div className="grid g-4"><StatCardPremium icon={<Clock size={18} />} label="Belum Absen Masuk" value={notCheckedIn} sub="Sesi belum dimulai" tone="warn" /><StatCardPremium icon={<Activity size={18} />} label="Sedang Mengajar" value={teaching} sub="Guru sudah absen masuk" tone="ok" /><StatCardPremium icon={<DoorOpen size={18} />} label="Belum Absen Keluar" value={notCheckedOut} sub="Jam selesai sudah lewat" tone="bad" /><StatCardPremium icon={<AlertOctagon size={18} />} label="Masalah Aktif" value={dashboard.data?.openFlags ?? itemsOf(flags.data).length} sub="Perlu verifikasi" tone="bad" /></div><div className="grid g-3" style={{ marginTop: 18 }}><Card title="Sesi butuh perhatian"><DataTable rows={rows.filter((s) => ['SCHEDULED', 'OPEN', 'MISSED'].includes(s.status)).slice(0, 12)} columns={[{ header: 'Waktu', render: (r) => formatDateTime(r.startsAt) }, { header: 'Kelas', render: (r) => r.schoolClass?.code }, { header: 'Guru', render: (r) => r.teacher?.fullName }, { header: 'Masuk', render: (r) => presenceOf(r)?.checkInAt ? formatDateTime(presenceOf(r).checkInAt) : 'Belum' }, { header: 'Keluar', render: (r) => presenceOf(r)?.checkOutAt ? formatDateTime(presenceOf(r).checkOutAt) : 'Belum' }, { header: 'Status', render: (r) => <StatusPill status={r.status} /> }]} /></Card><Card title="Masalah terbuka"><AsyncTable state={flags} columns={[{ header: 'Jenis', render: (r) => <StatusPill status={r.type} /> }, { header: 'Nama', render: (r) => r.user?.fullName || '—' }, { header: 'Prioritas', render: (r) => <StatusPill status={r.priority || 'NORMAL'} /> }]} /></Card><Card title="Catatan piket hari ini"><AsyncTable state={notes} columns={[{ header: 'Judul', key: 'title' }, { header: 'Tingkat', render: (r) => <StatusPill status={r.severity} /> }, { header: 'Petugas', render: (r) => r.createdBy?.fullName || '—' }]} /></Card></div></div>;
}


export function ItDashboardPage() {
  const ready = useRemote(() => apiFetch('/health/ready'), []);
  const cards = useRemote(() => apiFetch('/devices/cards?page=1&limit=300'), []);
  const readers = useRemote(() => apiFetch('/devices/readers?page=1&limit=100'), []);
  const audit = useRemote(() => apiFetch('/audit?page=1&limit=8'), []);
  const cardRows = itemsOf(cards.data);
  const readerRows = itemsOf(readers.data);
  return <div className="content"><PageHead eyebrow="OPERATOR IT" title="Cek Sistem" sub="Pastikan aplikasi, kartu, dan HP scanner siap dipakai hari ini." actions={<><Btn onClick={() => ready.refresh()}><RefreshCw size={14} /> Cek ulang</Btn><Btn variant="primary" onClick={() => go('/admin/devices')}><CreditCard size={14} /> Kelola Perangkat</Btn></>} /><RoleTaskPanel tasks={[{ title: 'Aktivasi HP Scanner', desc: 'Buat kode aktivasi HP gerbang/mushola.', icon: <Smartphone size={18} />, tone: 'ok', onClick: () => go('/admin/devices') }, { title: 'Pantau aktivitas', desc: 'Lihat scan dan aktivitas terbaru.', icon: <Eye size={18} />, onClick: () => go('/admin/live-monitor') }, { title: 'Riwayat perubahan', desc: 'Cek catatan jika ada masalah teknis.', icon: <FileText size={18} />, onClick: () => go('/admin/audit') }]} /><div className="grid g-4"><StatCardPremium icon={<ShieldCheck size={18} />} label="Aplikasi" value={ready.error ? 'Gangguan' : 'Siap'} sub={ready.error || 'Aplikasi normal'} tone={ready.error ? 'bad' : 'ok'} /><StatCardPremium icon={<CreditCard size={18} />} label="Kartu Aktif" value={cardRows.filter((c) => c.status === 'ACTIVE').length} sub={`${cardRows.length} total kartu`} /><StatCardPremium icon={<AlertTriangle size={18} />} label="Kartu Hilang" value={cardRows.filter((c) => c.status === 'LOST').length} sub="Perlu ditindak" tone="bad" /><StatCardPremium icon={<Wifi size={18} />} label="Alat Aktif" value={readerRows.filter((r) => r.status === 'ACTIVE').length} sub={`${readerRows.length} total alat`} /></div><div className="grid g-2" style={{ marginTop: 18 }}><Card title="Status perangkat"><HorizontalBarList data={[{ label: 'Kartu aktif', value: cardRows.filter((c) => c.status === 'ACTIVE').length }, { label: 'Kartu hilang', value: cardRows.filter((c) => c.status === 'LOST').length }, { label: 'Alat aktif', value: readerRows.filter((r) => r.status === 'ACTIVE').length }]} labelKeys={['label']} valueKeys={['value']} /></Card><Card title="Perubahan terbaru"><AsyncTable state={audit} columns={[{ header: 'Waktu', render: (r) => formatDateTime(r.createdAt) }, { header: 'Aksi', key: 'action' }, { header: 'Modul', key: 'module' }]} /></Card></div></div>;
}

export function TeacherLeavesPage({ notify }) {
  const [status, setStatus] = useState('PENDING');
  const leaves = useRemote(() => apiFetch(`/teacher-leaves${qs({ status, page: 1, limit: 100 })}`), [status]);
  const [note, setNote] = useState('Sudah diperiksa oleh Admin/TU.');
  async function review(row, nextStatus) {
    await apiFetch(`/teacher-leaves/${row.id}/review`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus, adminNote: note }) });
    leaves.refresh();
    notify(nextStatus === 'APPROVED' ? 'Pengajuan disetujui.' : 'Pengajuan diperbarui.');
  }
  return <div className="content"><PageHead eyebrow="PENGAJUAN GURU" title="Izin, Sakit, dan Dinas Luar" sub="Admin/TU memeriksa keterangan guru sebelum sesi dianggap alpa." actions={<SelectInput value={status} onChange={(e) => setStatus(e.target.value)}><option value="PENDING">Menunggu</option><option value="APPROVED">Disetujui</option><option value="REJECTED">Ditolak</option><option value="CANCELLED">Dibatalkan</option></SelectInput>} /><Card title="Catatan review"><Field label="Catatan Admin/TU"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field></Card><Card title="Daftar pengajuan"><AsyncTable state={leaves} columns={[{ header: 'Tanggal', render: (r) => formatDateTime(r.date) }, { header: 'Guru', render: (r) => r.teacher?.fullName || '—' }, { header: 'Jenis', render: (r) => <StatusPill status={r.type} /> }, { header: 'Status', render: (r) => <StatusPill status={r.status} /> }, { header: 'Alasan', key: 'reason' }]} onRow={(r) => <div className="row"><Btn size="sm" onClick={() => review(r, 'APPROVED')}>Setujui</Btn><Btn size="sm" variant="danger" onClick={() => review(r, 'REJECTED')}>Tolak</Btn></div>} /></Card></div>;
}

export function NotificationsPage() {
  const notifications = useRemote(() => apiFetch('/notifications?page=1&limit=50'), []);
  async function read(row) { await apiFetch(`/notifications/${row.id}/read`, { method: 'PATCH', body: JSON.stringify({}) }); notifications.refresh(); }
  return <div className="content"><PageHead eyebrow="TUGAS SAYA" title="Tugas / Notifikasi" sub="Lihat pemberitahuan penting. Tandai dibaca jika sudah selesai diperiksa." actions={<Btn onClick={notifications.refresh}><RefreshCw size={14} /> Muat ulang</Btn>} /><SimpleHelpBox title="Cara pakai" items={['Baca notifikasi dari atas.', 'Jika perlu tindakan, buka menu terkait.', 'Klik Tandai dibaca setelah selesai.']} /><Card title={`Belum dibaca: ${notifications.data?.unreadCount ?? 0}`}><AsyncTable state={notifications} columns={[{ header: 'Waktu', render: (r) => formatDateTime(r.createdAt) }, { header: 'Judul', key: 'title' }, { header: 'Isi', key: 'body' }, { header: 'Status', render: (r) => r.readAt ? 'Sudah dibaca' : 'Belum dibaca' }]} onRow={(r) => !r.readAt && <Btn size="sm" onClick={() => read(r)}>Tandai dibaca</Btn>} /></Card></div>;
}

function CleanupPanel({ notify }) {
  const [options, setOptions] = useState({ inactiveTestUsers: true, inactiveUserCards: true, readNotifications: true, staleTutorialStates: true, olderThanDays: '30' });
  const [reason, setReason] = useState('Membersihkan data test dan data sementara yang aman dibersihkan.');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const invalidatePreview = () => { setPreview(null); setResult(null); };
  const setOpt = (key, value) => { setOptions((prev) => ({ ...prev, [key]: value })); invalidatePreview(); };
  useEffect(() => { setPreview(null); setResult(null); }, [reason]);
  async function loadPreview() {
    setLoading(true); setResult(null);
    try {
      const data = await apiFetch(`/system-cleanup/preview${qs({ ...options, olderThanDays: options.olderThanDays })}`);
      setPreview(data);
      notify('Pratinjau data aman siap diperiksa.');
    } finally { setLoading(false); }
  }
  async function runCleanup() {
    if (!preview) return notify('Lihat pratinjau dulu sebelum membersihkan data.', 'warn');
    if (reason.trim().length < 10) return notify('Alasan membersihkan data minimal 10 karakter.', 'warn');
    if (!await riskConfirm('Bersihkan data sesuai pratinjau? Data penting seperti presensi dan riwayat perubahan tidak akan dibersihkan.')) return;
    setLoading(true);
    try {
      const data = await apiFetch('/system-cleanup/run', { method: 'POST', body: JSON.stringify({ ...options, olderThanDays: Number(options.olderThanDays) || 30, reason }) });
      setResult(data);
      await loadPreview();
      notify('Data aman selesai dibersihkan.');
    } finally { setLoading(false); }
  }
  const categories = preview?.categories || {};
  return <div className="grid g-3"><Card title="Bersihkan Data Aman" sub="Lihat pratinjau dulu, baru jalankan. Presensi, riwayat perubahan, sesi, dan catatan piket tetap dilindungi."><div className="form-grid">{[['inactiveTestUsers', 'Bersihkan akun test nonaktif yang aman'], ['inactiveUserCards', 'Bersihkan kartu akun nonaktif'], ['readNotifications', 'Bersihkan notifikasi lama yang sudah dibaca'], ['staleTutorialStates', 'Bersihkan status tutorial akun nonaktif']].map(([key, label]) => <label className="checkline" key={key}><input type="checkbox" checked={Boolean(options[key])} onChange={(e) => setOpt(key, e.target.checked)} /> {label}</label>)}<Field label="Notifikasi lebih lama dari (hari)"><TextInput type="number" min="1" value={options.olderThanDays} onChange={(e) => setOpt('olderThanDays', e.target.value)} /></Field><Field label="Alasan perubahan" hint={`${reason.trim().length}/10+`}><TextInput type="textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field><Btn type="button" loading={loading} onClick={loadPreview}><Eye size={14} /> Lihat Pratinjau</Btn><Btn type="button" variant="primary" loading={loading} disabled={!preview || reason.trim().length < 10} onClick={runCleanup}><Zap size={14} /> Bersihkan Data</Btn></div></Card><Card title="Ringkasan Pratinjau" sub="Jumlah dan contoh data yang aman dibersihkan.">{preview ? <div className="cleanup-preview">{Object.entries(categories).map(([key, item]) => <div className="cleanup-card" key={key}><div className="row" style={{ justifyContent: 'space-between' }}><b>{key}</b><Pill tone={item.count > 0 ? 'warn' : 'ok'}>{item.count}</Pill></div><p>{item.reason}</p><small>Contoh: {(item.sample || []).slice(0, 3).map((x) => x.username || x.uid || x.title || x.id).join(', ') || 'Tidak ada'}</small>{item.skipped?.length > 0 && <small className="bad-text">Dilewati: {item.skipped.map((x) => x.username).join(', ')}</small>}</div>)}</div> : <EmptyState title="Belum ada pratinjau" sub="Klik Lihat Pratinjau untuk melihat data yang aman dibersihkan." />}</Card><Card title="Data yang Dilindungi" sub="Kategori ini tidak dibersihkan otomatis."><div className="grid g-2">{(preview?.protectedData || ['Riwayat perubahan resmi', 'Presensi siswa', 'Sesi kelas']).map((item) => <div className="checkline" key={item}><Check size={14} /> {item}</div>)}</div>{result && <pre className="codeblock" style={{ marginTop: 14 }}>{JSON.stringify(result.executed, null, 2)}</pre>}</Card></div>;
}

export function DeveloperControlPage({ notify }) {
  const [tab, setTab] = useState('tutorial');
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('Developer mengaktifkan ulang tutorial agar pengguna memahami alur kerja terbaru.');
  const users = useRemote(() => apiFetch(`/tutorials/users${qs({ role, search, page: 1, limit: 100 })}`), [role, search]);
  const health = useRemote(() => apiFetch('/health/detail').catch(() => apiFetch('/health/ready')), []);
  async function activateUser(row) {
    if (!await riskConfirm(`Aktifkan tutorial lagi untuk ${row.fullName}?`)) return;
    await apiFetch(`/tutorials/users/${row.id}/activate`, { method: 'POST', body: JSON.stringify({ reason }) });
    users.refresh();
    notify(`Tutorial akan tampil lagi untuk ${row.fullName}.`);
  }
  async function activateRole() {
    if (!role) return notify('Pilih peran terlebih dahulu.', 'warn');
    if (!await riskConfirm(`Aktifkan tutorial untuk semua pengguna aktif dengan peran ${statusLabel(role)}?`)) return;
    const result = await apiFetch('/tutorials/roles/activate', { method: 'POST', body: JSON.stringify({ role, reason }) });
    users.refresh();
    notify(`Tutorial diaktifkan untuk ${result.activatedCount || 0} akun ${statusLabel(role)}.`);
  }
  const roleChoices = [['', 'Semua peran'], ['ADMIN_TU', 'Admin/TU'], ['OPERATOR_IT', 'Operator IT'], ['GURU_PIKET', 'Guru Piket'], ['GURU_MAPEL', 'Guru Mapel'], ['SISWA', 'Siswa'], ['DEVELOPER', 'Developer']];
  return <div className="content"><PageHead eyebrow="DEVELOPER" title="Pusat Kontrol Developer" sub="Kontrol tutorial, bersihkan data aman, dan cek kesehatan sistem." /><TabBar value={tab} onChange={setTab} options={[["tutorial", "Kontrol Tutorial"], ["cleanup", "Bersihkan Data"], ["health", "Kesehatan Sistem"]]} /><RoleTaskPanel tasks={[{ title: 'Cek kesehatan sistem', desc: 'Pastikan aplikasi dan database siap.', icon: <ShieldCheck size={18} />, onClick: () => setTab('health') }, { title: 'Aktifkan tutorial', desc: 'Bantu pengguna yang masih bingung.', icon: <BookOpen size={18} />, onClick: () => setTab('tutorial') }, { title: 'Bersihkan data aman', desc: 'Lihat pratinjau sebelum membersihkan data sementara.', icon: <Zap size={18} />, tone: 'warn', onClick: () => setTab('cleanup') }, { title: 'Riwayat perubahan', desc: 'Telusuri aksi penting.', icon: <FileText size={18} />, onClick: () => go('/admin/audit') }]} /><div className="smart-help"><b>Prinsip aman:</b><span>Nonaktifkan akun untuk data bersejarah.</span><span>Hapus permanen hanya untuk akun test kosong.</span><span>Bersihkan data selalu lihat pratinjau dulu.</span></div>{tab === 'tutorial' && <div className="grid g-3"><Card title="Kontrol Tutorial" sub="Aktifkan tutorial ulang tanpa mengubah data absensi." actions={<><Btn onClick={() => users.refresh()}><RefreshCw size={14} /> Muat ulang</Btn><Btn variant="primary" onClick={activateRole}><Zap size={14} /> Aktifkan per peran</Btn></>}><div className="form-grid"><Field label="Cari pengguna"><TextInput value={search} placeholder="Nama atau nama akun" onChange={(e) => setSearch(e.target.value)} /></Field><Field label="Filter peran"><SelectInput value={role} onChange={(e) => setRole(e.target.value)}>{roleChoices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectInput></Field><Field label="Alasan perubahan" hint={`${reason.trim().length}/10+`}><TextInput type="textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div><AsyncTable state={users} columns={[{ header: 'Pengguna', render: (r) => <span className="row"><Avatar name={r.fullName} size="sm" /> {r.fullName}</span> }, { header: 'Nama akun', key: 'username' }, { header: 'Peran', render: (r) => <StatusPill status={r.role} /> }, { header: 'Status tutorial', render: (r) => r.tutorial?.shouldShow ? <StatusPill status="PENDING" /> : r.tutorial?.completedAt ? <StatusPill status="RESOLVED" /> : <StatusPill status="IN_REVIEW" /> }, { header: 'Terakhir tampil', render: (r) => formatDateTime(r.tutorial?.lastSeenAt) }]} onRow={(r) => <Btn size="sm" disabled={reason.trim().length < 10} onClick={() => activateUser(r)}><BookOpen size={13} /> Aktifkan Tutorial Lagi</Btn>} /></Card></div>}{tab === 'cleanup' && <CleanupPanel notify={notify} />}{tab === 'health' && <Card title="Kesehatan Sistem" sub="Ringkasan status aplikasi agar siap dipakai.">{health.loading ? <LoadingState /> : health.error ? <ErrorState error={health.error} onRetry={health.refresh} /> : <pre className="codeblock">{JSON.stringify(health.data, null, 2)}</pre>}</Card>}</div>;
}

export function HelpPage({ role = 'ADMIN_TU' }) {
  const configs = {
    DEVELOPER: {
      title: 'Panduan Developer',
      tasks: [
        { title: 'Cek kesehatan sistem', desc: 'Pastikan API dan database siap.', icon: <ShieldCheck size={18} />, onClick: () => go('/admin/developer-control') },
        { title: 'Aktifkan tutorial', desc: 'Bantu pengguna yang masih bingung.', icon: <BookOpen size={18} />, onClick: () => go('/admin/developer-control') },
        { title: 'Riwayat perubahan', desc: 'Telusuri aksi penting.', icon: <FileText size={18} />, onClick: () => go('/admin/audit') }
      ],
      steps: ['Gunakan akun developer hanya untuk kontrol sistem.', 'Cek kesehatan sistem sebelum perubahan besar.', 'Pantau Riwayat Perubahan setelah perubahan.']
    },
    OPERATOR_IT: {
      title: 'Panduan Operator IT',
      tasks: [
        { title: 'Cek sistem', desc: 'Lihat aplikasi, kartu, dan alat pembaca.', icon: <ShieldCheck size={18} />, onClick: () => go('/admin/it-dashboard') },
        { title: 'HP scanner & kartu', desc: 'Aktivasi HP dan kelola kartu.', icon: <Smartphone size={18} />, onClick: () => go('/admin/devices') },
        { title: 'Aktivitas sekarang', desc: 'Pantau scan terbaru.', icon: <Eye size={18} />, onClick: () => go('/admin/live-monitor') }
      ],
      steps: ['Awal hari cek Cek Sistem.', 'Pastikan HP scanner aktif.', 'Jika ada kendala, lihat Riwayat Perubahan.']
    },
    GURU_PIKET: {
      title: 'Panduan Guru Piket',
      tasks: [
        { title: 'Tugas piket hari ini', desc: 'Lihat sesi dan masalah.', icon: <ListChecks size={18} />, onClick: () => go('/admin/picket-dashboard') },
        { title: 'Catatan piket', desc: 'Tulis kejadian penting.', icon: <BookOpen size={18} />, onClick: () => go('/admin/picket') },
        { title: 'Cek masalah', desc: 'Tindak masalah terbuka.', icon: <Flag size={18} />, onClick: () => go('/admin/anomaly') }
      ],
      steps: ['Buka Tugas Piket Hari Ini.', 'Catat kejadian di Catatan Piket.', 'Bantu tindak Masalah yang Perlu Dicek.']
    },
    GURU_MAPEL: {
      title: 'Panduan Guru',
      tasks: [
        { title: 'Isi presensi kelas', desc: 'Absen masuk, tandai siswa, simpan.', icon: <Check size={18} />, onClick: () => go('/guru/presensi') },
        { title: 'Perbaiki presensi', desc: 'Koreksi dengan alasan.', icon: <Save size={18} />, onClick: () => go('/guru/koreksi') },
        { title: 'Ajukan izin', desc: 'Izin/sakit/dinas luar.', icon: <Calendar size={18} />, onClick: () => go('/guru/izin') }
      ],
      steps: ['Pilih sesi kelas.', 'Klik Absen Masuk.', 'Tandai siswa dan Simpan.', 'Klik Absen Keluar saat selesai.']
    },
    SISWA: {
      title: 'Panduan Siswa',
      tasks: [
        { title: 'Lihat kehadiran', desc: 'Cek status hadir/telat/izin/alpa.', icon: <Eye size={18} />, onClick: () => go('/siswa/dashboard') },
        { title: 'Notifikasi', desc: 'Baca pemberitahuan dari sekolah.', icon: <HelpCircle size={18} />, onClick: () => go('/siswa/notifikasi') }
      ],
      steps: ['Buka Kehadiran Saya.', 'Pilih rentang hari jika perlu.', 'Jika data salah, hubungi wali kelas/guru piket.']
    },
    ADMIN_TU: {
      title: 'Panduan Admin/TU',
      tasks: [
        { title: 'Ringkasan hari ini', desc: 'Mulai dari kondisi hari ini.', icon: <Eye size={18} />, onClick: () => go('/admin/dashboard') },
        { title: 'Akun & data sekolah', desc: 'Buat akun guru/siswa dan kelas.', icon: <Users size={18} />, onClick: () => go('/admin/master-data') },
        { title: 'Laporan sekolah', desc: 'Cetak atau unduh rekap.', icon: <Download size={18} />, onClick: () => go('/admin/reports') }
      ],
      steps: ['Cek Ringkasan Hari Ini.', 'Tindak Masalah yang Perlu Dicek.', 'Kelola akun/jadwal jika ada perubahan.', 'Unduh laporan sesuai kebutuhan.']
    }
  };
  const config = configs[role] || configs.ADMIN_TU;
  return <div className="content"><PageHead eyebrow="PANDUAN" title={config.title} sub="Panduan singkat berbasis tugas harian. Klik kartu untuk langsung membuka menu." /><RoleTaskPanel title="Menu penting untuk Anda" tasks={config.tasks} /><Card title="Checklist harian"><StepGuide steps={config.steps} /></Card><SimpleHelpBox title="Butuh bantuan?" items={['Gunakan tombol cari menu di atas jika tidak menemukan menu.', 'Klik ikon buku di kanan atas untuk membuka tutorial kapan saja.', 'Jika akses ditolak, berarti menu tersebut bukan untuk peran akun Anda.']} /></div>;
}
