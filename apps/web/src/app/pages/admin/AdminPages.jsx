import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, Building2, Calendar, Check, CheckSquare, Clock, Copy, CreditCard, DoorOpen, Download, Eye, FileText, Flag, HelpCircle, KeyRound, ListChecks, Plus, QrCode, Radar, RefreshCw, Save, ShieldCheck, Smartphone, Users, Wifi, Zap, Activity, TrendingUp, AlertOctagon, ScanLine } from 'lucide-react';
import { apiDownload, apiFetch, formatDateTime, go, itemsOf, metaOf, qs, readStoredUser, today } from '../../api';
import { BRAND } from '../../branding';
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

export function sanitizeSpreadsheetCell(value) {
  const text = String(value ?? '');
  return /^(?:[\t\r]|\s*[=+\-@])/.test(text) ? `'${text}` : text;
}

export function buildWindowsCsv(rows) {
  const escape = (value) => `"${sanitizeSpreadsheetCell(value).replace(/"/g, '""')}"`;
  const headers = Object.keys(rows[0] || {});
  return `\uFEFFsep=,\r\n${[headers.map(escape).join(','), ...rows.map((row) => headers.map((key) => escape(row[key])).join(','))].join('\r\n')}\r\n`;
}

function downloadCsvFile(rows, filename) {
  const blob = new Blob([buildWindowsCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const ID_CARD_GENERATOR_INTERNAL_BASE = '/admin/master-data/id-card-generator/';
const SCHEDULE_PAGE_LIMIT = 200;
const SCHEDULE_MAX_PAGES = 50;
const SCHEDULE_PAGE_LIMIT_ERROR = 'Data jadwal terlalu banyak untuk dimuat sekaligus. Gunakan filter atau hubungi Operator IT.';

function pagedPath(path, page, limit) {
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  params.set('page', String(page));
  params.set('limit', String(limit));
  return `${pathname}?${params.toString()}`;
}

function uniqueRowsById(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (row?.id === undefined || row?.id === null) return true;
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

async function fetchAllPages(path, limit = SCHEDULE_PAGE_LIMIT) {
  const first = await apiFetch(pagedPath(path, 1, limit));
  const firstMeta = metaOf(first);
  const requestedPages = Number(firstMeta?.totalPages);
  const reportedPages = Number.isFinite(requestedPages) && requestedPages > 0 ? Math.ceil(requestedPages) : 1;
  const reportedTotal = Number(firstMeta?.total);
  const pagesForTotal = Number.isFinite(reportedTotal) && reportedTotal >= 0 ? Math.max(1, Math.ceil(reportedTotal / limit)) : 1;
  const totalPages = Math.max(reportedPages, pagesForTotal);

  if (totalPages > SCHEDULE_MAX_PAGES) throw new Error(SCHEDULE_PAGE_LIMIT_ERROR);

  const pages = totalPages === 1
    ? [first]
    : [first, ...(await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => apiFetch(pagedPath(path, index + 2, limit)))) )];
  const items = uniqueRowsById(pages.flatMap((page) => itemsOf(page)));
  const total = Number.isFinite(reportedTotal) && reportedTotal >= items.length ? reportedTotal : items.length;

  return { items, meta: { page: 1, limit, total, totalPages } };
}

function idCardGeneratorUrl(hashPath = '/', params = {}) {
  const search = new URLSearchParams(params);
  const query = search.toString();
  return `${ID_CARD_GENERATOR_INTERNAL_BASE}#${hashPath}${query ? `?${query}` : ''}`;
}

function openIdCardGenerator(hashPath = '/export', params = {}) {
  window.location.assign(idCardGeneratorUrl(hashPath, params));
}

function openIdCardGeneratorTab(hashPath = '/export', params = {}) {
  window.open(idCardGeneratorUrl(hashPath, params), '_blank', 'noopener,noreferrer');
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

const STUDENT_DAILY_STATUS_OPTIONS = [
  { value: '', label: 'Semua status' },
  { value: 'HADIR_LENGKAP', label: 'Hadir lengkap' },
  { value: 'BELUM_SCAN_DATANG', label: 'Belum scan datang' },
  { value: 'BELUM_SCAN_PULANG', label: 'Belum scan pulang' },
  { value: 'BELUM_ABSEN_KELAS', label: 'Belum diabsen guru' },
  { value: 'BELUM_SCAN_SHOLAT', label: 'Belum scan sholat' },
  { value: 'PERLU_VERIFIKASI', label: 'Perlu verifikasi' }
];

const STUDENT_DAILY_MISSING_OPTIONS = [
  { value: '', label: 'Semua kebutuhan' },
  { value: 'BELUM_SCAN_DATANG', label: 'Belum scan datang' },
  { value: 'BELUM_SCAN_PULANG', label: 'Belum scan pulang' },
  { value: 'BELUM_ABSEN_KELAS', label: 'Belum diabsen guru' },
  { value: 'BELUM_SCAN_SHOLAT', label: 'Belum scan sholat' },
  { value: 'PERLU_VERIFIKASI', label: 'Perlu verifikasi' }
];

function friendlyDailyStatus(value) {
  return STUDENT_DAILY_STATUS_OPTIONS.find((option) => option.value === value)?.label || statusLabel(value);
}

function studentDailySummary(data) {
  return data?.summary || data?.studentCompleteness || {};
}


export function AccountSecurityPage({ notify }) {
  const [username, setUsername] = useState('');
  const [reason, setReason] = useState('Admin membuka kunci login setelah verifikasi pengguna.');
  const [state, setState] = useState({ loading: false, error: '', data: null });
  const lookup = async () => {
    const value = username.trim();
    if (!value) {
      notify?.('Isi username akun yang akan dicek.', 'bad');
      return;
    }
    setState({ loading: true, error: '', data: null });
    try {
      const data = await apiFetch(`/auth/admin/login-lockout${qs({ username: value })}`);
      setState({ loading: false, error: '', data });
    } catch (error) {
      setState({ loading: false, error: error.message || 'Gagal mengecek keamanan akun.', data: null });
    }
  };
  const clearLockout = async () => {
    const value = username.trim();
    if (!value) {
      notify?.('Isi username akun yang akan dibuka.', 'bad');
      return;
    }
    if (!reason.trim() || reason.trim().length < 8) {
      notify?.('Alasan minimal 8 karakter.', 'bad');
      return;
    }
    if (!await riskConfirm('Buka kunci login akun ini? Password tidak diubah dan tindakan dicatat di audit log.', 'Buka kunci login')) return;
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await apiFetch('/auth/admin/login-lockout/clear', {
        method: 'POST',
        body: JSON.stringify({ username: value, reason: reason.trim() })
      });
      setState({ loading: false, error: '', data });
      notify?.('Kunci login berhasil dibuka. Pengguna dapat mencoba login kembali.', 'ok');
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error: error.message || 'Gagal membuka kunci login.' }));
    }
  };
  const lockout = state.data?.after || state.data?.lockout;
  const targetUser = state.data?.user;
  const lockedUntilText = lockout?.lockedUntil ? formatDateTime(lockout.lockedUntil) : '—';
  const bucketRows = lockout?.buckets || [];
  return <div className="content account-security-page"><PageHead eyebrow="KEAMANAN AKUN" title="Buka Kunci Login" sub="Pulihkan akun yang terkena batas percobaan masuk tanpa melihat atau mengubah password." actions={<Btn onClick={lookup} loading={state.loading}><RefreshCw size={14} /> Cek Akun</Btn>} />
    <div className="grid g-2"><Card title="Cari akun" sub="Masukkan username akun sekolah. Fitur ini hanya menghapus lockout login, bukan mengganti password."><div className="form-grid"><Field label="Username"><TextInput value={username} placeholder="contoh: admin.tu" onChange={(event) => setUsername(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') lookup(); }} /></Field><Field label="Alasan tindakan"><TextInput value={reason} onChange={(event) => setReason(event.target.value)} /></Field><Btn variant="primary" loading={state.loading} onClick={lookup}><ShieldCheck size={14} /> Cek Status</Btn><Btn variant="danger" disabled={state.loading || !state.data} onClick={clearLockout}><KeyRound size={14} /> Buka Kunci Login</Btn></div><SimpleHelpBox title="Aturan aman" items={['Tidak ada bypass password: pengguna tetap harus memasukkan password yang benar.', 'Tindakan ini dicatat di audit log beserta alasan operator.', 'Lockout jaringan lama ikut dibersihkan untuk jaringan admin saat ini agar recovery operasional lebih cepat.']} /></Card>
    <Card title="Status login" sub="Ringkasan batas percobaan masuk untuk akun yang dicek.">{state.loading ? <LoadingState label="Mengecek keamanan akun…" /> : state.error ? <ErrorState error={state.error} onRetry={lookup} /> : !state.data ? <FriendlyEmptyState icon={<ShieldCheck size={22} />} title="Belum ada akun dicek" desc="Isi username lalu klik Cek Status." /> : <div className="account-security-status"><div className="grid g-3 cards-grid"><StatCardPremium icon={<Users size={18} />} label="Akun" value={targetUser?.fullName || state.data.username} sub={targetUser ? `${targetUser.username} · ${statusLabel(targetUser.role)}` : 'Username tidak ditemukan'} /><StatCardPremium icon={<AlertTriangle size={18} />} label="Status" value={lockout?.locked ? 'Terkunci' : 'Normal'} sub={lockout?.locked ? `Sampai ${lockedUntilText}` : 'Tidak ada lockout aktif'} tone={lockout?.locked ? 'bad' : 'ok'} /><StatCardPremium icon={<Clock size={18} />} label="Percobaan" value={lockout?.failedCount ?? 0} sub={`Batas ${lockout?.maxFailedAttempts ?? '—'} kali`} /><StatCardPremium icon={<ShieldCheck size={18} />} label="Aksi" value={state.data.ok ? 'Dibuka' : 'Siap'} sub={state.data.ok ? 'Counter sudah direset' : 'Gunakan bila akun terkunci'} tone={state.data.ok ? 'ok' : ''} /></div><DataTable rows={bucketRows} columns={[{ header: 'Bucket', render: (row) => row.bucket === 'account' ? 'Akun' : row.bucket === 'accountCurrentNetwork' ? 'Akun + jaringan saat ini' : 'Jaringan lama (cleanup)' }, { header: 'Percobaan', render: (row) => row.failedCount ?? 0 }, { header: 'Status', render: (row) => <StatusPill status={row.locked ? 'TERKUNCI' : 'NORMAL'} /> }, { header: 'Terkunci sampai', render: (row) => row.lockedUntil ? formatDateTime(row.lockedUntil) : '—' }]} /></div>}</Card></div></div>;
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
  const studentSummary = studentDailySummary(d);

  return <div className="content dashboard-redesign"><PageHead eyebrow="COMMAND CENTER" title="Ringkasan Admin" sub="Pantau operasi sekolah hari ini dari satu layar: sesi, scan, cakupan, dan masalah aktif." actions={<><Btn onClick={() => go('/admin/reports')}><FileText size={14} /> Buka laporan</Btn><Btn variant="primary" onClick={() => go('/admin/anomaly')}><Flag size={14} /> Cek masalah</Btn></>} />
    <section className="dashboard-hero admin-hero">
      <div className="dashboard-hero-copy">
        <div className="eyebrow">PRIORITAS HARI INI</div>
        <h2>Pastikan data hadir lengkap sebelum jam operasional berakhir.</h2>
        <p>Mulai dari masalah aktif, lalu cek sesi berjalan dan aktivitas scan gerbang. Semua tombol di bawah diarahkan ke pekerjaan harian utama.</p>
        <div className="dashboard-hero-actions"><Btn variant="primary" size="lg" onClick={() => go('/admin/anomaly')}><AlertOctagon size={16} /> Tindak {openFlags} masalah</Btn><Btn size="lg" onClick={() => go('/admin/sessions')}><Radar size={16} /> Pantau sesi</Btn></div>
      </div>
      <div className="dashboard-hero-panel" data-tour="admin-summary">
        <ProgressRing value={coverage} label="Cakupan presensi" sub={`${coverage}% data sudah tercatat`} />
        <div className="hero-kpi-grid"><span><b>{d.sessionsToday ?? 0}</b>Sesi hari ini</span><span><b>{gateScans}</b>Scan gerbang</span><span><b>{openFlags}</b>Masalah aktif</span></div>
      </div>
    </section>

    <RoleTaskPanel title="Aksi cepat operasional" tasks={[{ title: 'Aktifkan HP Scanner', desc: 'Buat kode untuk 4 reader target produksi.', icon: <Smartphone size={18} />, tone: 'ok', onClick: () => go('/admin/devices') }, { title: 'Kelengkapan Siswa', desc: 'Cek datang, pulang, kelas, dan sholat siswa.', icon: <CheckSquare size={18} />, tone: 'warn', onClick: () => go('/admin/student-completeness') }, { title: 'Lihat Sesi Guru', desc: 'Pantau guru masuk kelas dan sesi belum ditutup.', icon: <Radar size={18} />, onClick: () => go('/admin/sessions') }, { title: 'Lihat Absensi Sholat', desc: 'Ringkasan Dhuha/Dzuhur dan daftar siswa scan.', icon: <Building2 size={18} />, onClick: () => go('/admin/prayer-attendance') }, { title: 'Kepala/Staf Hadir', desc: 'Datang-pulang kepala, TU, staf, guru, dan siswa di Mode Gerbang.', icon: <Users size={18} />, onClick: () => go('/admin/staff-attendance') }, { title: 'Laporan Hari Ini', desc: 'Unduh laporan resmi harian.', icon: <FileText size={18} />, onClick: () => go('/admin/reports') }, { title: 'Cetak Kartu QR', desc: 'Siapkan kartu dari Master Data.', icon: <CreditCard size={18} />, onClick: () => go('/admin/master-data') }]} />

    {dashboard.loading ? <LoadingState /> : dashboard.error ? <ErrorState error={dashboard.error} onRetry={dashboard.refresh} /> : <><div className="grid g-4">
      <StatCardPremium icon={<Smartphone size={20} />} label="HP Scanner aktif" value={d.androidReaders?.activeCount ?? 0} sub="Maksimal 4 HP reader sekolah" tone={(d.androidReaders?.activeCount ?? 0) > 0 ? 'ok' : 'warn'} onClick={() => go('/admin/devices')} />
      <StatCardPremium icon={<Building2 size={20} />} label="Mode fleksibel" value="Gerbang/Mushola" sub="Dipilih dari aplikasi HP" tone="ok" onClick={() => go('/admin/devices')} />
      <StatCardPremium icon={<Users size={20} />} label="Kepala/Staf Hadir" value={d.staffPresentToday ?? 0} sub="Scan datang hari ini" onClick={() => go('/admin/staff-attendance')} />
      <StatCardPremium icon={<CheckSquare size={20} />} label="Siswa hadir lengkap" value={studentSummary.completeCount ?? d.studentCompleteCount ?? 0} sub="Gerbang, kelas, dan sholat lengkap" tone="ok" onClick={() => go('/admin/student-completeness')} />
      <StatCardPremium icon={<AlertTriangle size={20} />} label="Belum scan pulang" value={studentSummary.missingDepartureCount ?? d.studentMissingDepartureCount ?? 0} sub="Perlu diingatkan sebelum pulang" tone="warn" onClick={() => go('/admin/student-completeness')} />
      <StatCardPremium icon={<CheckSquare size={20} />} label="Guru Mengajar" value={d.teacherTeachingToday ?? d.teacherPresenceCount ?? 0} sub="Masuk kelas hari ini" onClick={() => go('/admin/sessions')} />
      <StatCardPremium icon={<Activity size={20} />} label="Sesi Belum Ditutup" value={d.unclosedSessions ?? open} sub={`${closed} selesai · ${open} berjalan`} tone={(d.unclosedSessions ?? open) > 0 ? 'warn' : 'ok'} />
      <StatCardPremium icon={<Building2 size={20} />} label="Sholat Dhuha/Dzuhur" value={`${d.prayerDhuhaToday ?? 0}/${d.prayerDzuhurToday ?? 0}`} sub="Siswa sudah scan" onClick={() => go('/admin/prayer-attendance')} />
      <StatCardPremium icon={<AlertOctagon size={20} />} label="Masalah Perlu Dicek" value={openFlags} sub="Perlu tindak lanjut" tone={openFlags > 0 ? 'bad' : 'ok'} onClick={() => go('/admin/anomaly')} />
      <StatCardPremium icon={<ScanLine size={20} />} label="Scan Gerbang" value={gateScans} sub="Catatan masuk/pulang" />
    </div><div className="grid g-3 chart-summary"><Card title="Cakupan presensi" sub="Semakin penuh lingkaran, semakin lengkap data hari ini."><ProgressRing value={coverage} label="Presensi tercatat" sub={`${coverage}% dari data yang masuk`} /></Card><Card title="Status sesi hari ini" sub="Perbandingan sesi selesai, berjalan, dan terjadwal."><StackedBar segments={[{ label: 'Selesai', value: closed, tone: 'ok' }, { label: 'Berjalan', value: open, tone: 'info' }, { label: 'Terjadwal', value: scheduled, tone: 'warn' }]} total={Math.max(1, Number(d.sessionsToday ?? 0) || closed + open + scheduled)} /></Card><Card title="Kondisi cepat" sub="Masalah dan scan gerbang hari ini."><HorizontalBarList data={[{ label: 'Masalah aktif', value: openFlags }, { label: 'Scan gerbang', value: gateScans }]} labelKeys={['label']} valueKeys={['value']} /></Card></div></>}

    <div className="grid g-3" style={{ marginTop: 18 }}><Card title="Masalah terbaru" sub="Cocokkan data gerbang dan kelas" actions={<Btn size="sm" onClick={() => go('/admin/anomaly')}>Cek</Btn>}><DashboardMiniList state={flags} type="anomaly" /></Card><Card title="Aktivitas terbaru" sub="Aktivitas gerbang dan sesi" actions={<Btn size="sm" onClick={() => go('/admin/live-monitor')}>Lihat lengkap</Btn>}><DashboardMiniList state={live} type="activity" /></Card></div>{trend.loading ? <LoadingState label="Memuat tren…" /> : trend.error ? <ErrorState error={trend.error} onRetry={trend.refresh} /> : <Card title="Tren 7 hari" sub="Cakupan presensi per hari"><TrendChart data={trend.data} /></Card>}
  </div>;
}

export function PrincipalDashboard() {
  const dashboard = useRemote(() => apiFetch('/reports/dashboard'), []);
  const trend = useRemote(() => apiFetch('/reports/trend?days=7'), []);
  const live = useRemote(() => apiFetch('/reports/live-monitor?page=1&limit=8'), []);
  const d = dashboard.data || {};
  const coverage = Number(d.attendanceCoveragePercent ?? d.coveragePercent ?? 0) || 0;
  const closed = Number(d.closedSessions ?? 0) || 0;
  const open = Number(d.openSessions ?? 0) || 0;
  const scheduled = Math.max(0, Number(d.scheduledSessions ?? d.sessionsToday ?? 0) - closed - open);
  const openFlags = Number(d.openFlags ?? 0) || 0;
  const gateScans = Number(d.gateTapCount ?? d.gateLogsToday ?? 0) || 0;
  const studentSummary = studentDailySummary(d);

  return <div className="content dashboard-redesign"><PageHead eyebrow="KEPALA SEKOLAH" title="Ringkasan Kepala Sekolah" sub="Mode baca saja untuk memantau kehadiran, sesi, scan gerbang, dan laporan utama tanpa mengubah data." actions={<><Btn onClick={() => go('/admin/reports')}><FileText size={14} /> Buka laporan</Btn><Btn variant="primary" onClick={() => go('/admin/live-monitor')}><Activity size={14} /> Aktivitas sekarang</Btn></>} />
    <section className="dashboard-hero admin-hero">
      <div className="dashboard-hero-copy">
        <div className="eyebrow">PANTAUAN READ-ONLY</div>
        <h2>Melihat kondisi sekolah hari ini tanpa akses perubahan data.</h2>
        <p>Gunakan angka ringkas ini untuk mengambil keputusan, lalu teruskan tindak lanjut ke Admin/TU, Operator IT, atau Guru Piket sesuai kewenangan.</p>
        <div className="dashboard-hero-actions"><span className="chip"><ShieldCheck size={12} /> Hanya lihat data</span><span className="chip"><Eye size={12} /> Tidak ada tombol mutasi</span></div>
      </div>
      <div className="dashboard-hero-panel" data-tour="principal-summary">
        <ProgressRing value={coverage} label="Cakupan presensi" sub={`${coverage}% data sudah tercatat`} />
        <div className="hero-kpi-grid"><span><b>{d.sessionsToday ?? 0}</b>Sesi hari ini</span><span><b>{gateScans}</b>Scan gerbang</span><span><b>{openFlags}</b>Masalah aktif</span></div>
      </div>
    </section>

    <RoleTaskPanel title="Pantauan utama" tasks={[{ title: 'Kehadiran lengkap siswa', desc: 'Cek datang, pulang, kelas, dan sholat siswa.', icon: <CheckSquare size={18} />, tone: 'ok', onClick: () => go('/admin/student-completeness') }, { title: 'Sholat siswa', desc: 'Lihat ringkasan Dhuha, Dzuhur, dan Ashar.', icon: <Building2 size={18} />, onClick: () => go('/admin/prayer-attendance') }, { title: 'Kepala/Staf hadir', desc: 'Pantau scan datang-pulang staf dan guru.', icon: <Users size={18} />, onClick: () => go('/admin/staff-attendance') }, { title: 'Laporan sekolah', desc: 'Buka pratinjau laporan dan cetak pratinjau bila perlu.', icon: <FileText size={18} />, onClick: () => go('/admin/reports') }]} />

    {dashboard.loading ? <LoadingState /> : dashboard.error ? <ErrorState error={dashboard.error} onRetry={dashboard.refresh} /> : <><div className="grid g-4">
      <StatCardPremium icon={<Users size={20} />} label="Kepala/Staf Hadir" value={d.staffPresentToday ?? 0} sub="Scan datang hari ini" onClick={() => go('/admin/staff-attendance')} />
      <StatCardPremium icon={<CheckSquare size={20} />} label="Siswa hadir lengkap" value={studentSummary.completeCount ?? d.studentCompleteCount ?? 0} sub="Gerbang, kelas, dan sholat lengkap" tone="ok" onClick={() => go('/admin/student-completeness')} />
      <StatCardPremium icon={<AlertTriangle size={20} />} label="Belum scan pulang" value={studentSummary.missingDepartureCount ?? d.studentMissingDepartureCount ?? 0} sub="Perlu tindak lanjut petugas" tone="warn" onClick={() => go('/admin/student-completeness')} />
      <StatCardPremium icon={<Activity size={20} />} label="Sesi Belum Ditutup" value={d.unclosedSessions ?? open} sub={`${closed} selesai · ${open} berjalan`} tone={(d.unclosedSessions ?? open) > 0 ? 'warn' : 'ok'} />
      <StatCardPremium icon={<Building2 size={20} />} label="Sholat Dhuha/Dzuhur" value={`${d.prayerDhuhaToday ?? 0}/${d.prayerDzuhurToday ?? 0}`} sub="Siswa sudah scan" onClick={() => go('/admin/prayer-attendance')} />
      <StatCardPremium icon={<ScanLine size={20} />} label="Scan Gerbang" value={gateScans} sub="Catatan masuk/pulang" />
    </div><div className="grid g-3 chart-summary"><Card title="Cakupan presensi" sub="Ringkasan kelengkapan hari ini."><ProgressRing value={coverage} label="Presensi tercatat" sub={`${coverage}% dari data yang masuk`} /></Card><Card title="Status sesi hari ini" sub="Selesai, berjalan, dan terjadwal."><StackedBar segments={[{ label: 'Selesai', value: closed, tone: 'ok' }, { label: 'Berjalan', value: open, tone: 'info' }, { label: 'Terjadwal', value: scheduled, tone: 'warn' }]} total={Math.max(1, Number(d.sessionsToday ?? 0) || closed + open + scheduled)} /></Card><Card title="Kondisi cepat" sub="Masalah dan scan gerbang hari ini."><HorizontalBarList data={[{ label: 'Masalah aktif', value: openFlags }, { label: 'Scan gerbang', value: gateScans }]} labelKeys={['label']} valueKeys={['value']} /></Card></div></>}

    <div className="grid g-3" style={{ marginTop: 18 }}><Card title="Aktivitas terbaru" sub="Aktivitas gerbang dan sesi" actions={<Btn size="sm" onClick={() => go('/admin/live-monitor')}>Lihat lengkap</Btn>}><DashboardMiniList state={live} type="activity" /></Card></div>
    {trend.loading ? <LoadingState label="Memuat tren…" /> : trend.error ? <ErrorState error={trend.error} onRetry={trend.refresh} /> : <Card title="Tren 7 hari" sub="Cakupan presensi per hari"><TrendChart data={trend.data} /></Card>}
  </div>;
}

function rosterProvenanceLabel(value) {
  return ({
    VERIFIED: 'Roster terverifikasi',
    BACKFILLED_UNVERIFIED: 'Roster pemulihan · perlu verifikasi',
    LEGACY_ROSTER_MISSING: 'Roster legacy tidak tersedia',
    PENDING: 'Roster belum dibentuk'
  })[value] || 'Roster belum dibentuk';
}

function sessionRosterProvenance(session) {
  return session?.rosterState || session?.rosterProvenance || session?.roster?.state || 'PENDING';
}

function SessionRecoveryPanel({ available, reason, onReasonChange, pending, onRecover }) {
  if (!available) return null;
  return <div className="form-grid" style={{ marginTop: 16 }}><Field label="Alasan pemulihan"><TextInput type="textarea" value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="Jelaskan alasan pemulihan sesi." /></Field><Btn variant="primary" loading={pending} disabled={reason.trim().length < 10} onClick={onRecover}><RefreshCw size={14} /> Pulihkan sesi</Btn></div>;
}

export function SessionsPage({ admin = true, notify }) {
  const [date, setDate] = useState(today());
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [recoveryReason, setRecoveryReason] = useState('');
  const [recoveryPending, setRecoveryPending] = useState(false);
  const mountedRef = useRef(true);
  const recoveryPendingRef = useRef(false);
  const currentRole = readStoredUser()?.role;
  const canRecoverMissed = ['ADMIN_TU', 'DEVELOPER', 'GURU_PIKET'].includes(currentRole);
  const state = useRemote(() => apiFetch(`${admin ? '/schedules/sessions' : '/attendance/class-sessions'}${qs({ date, page, limit: 100 })}`), [date, page, admin]);
  const detail = useRemote(() => selected ? apiFetch(`/attendance/class-sessions/${selected.id}/summary`) : Promise.resolve(null), [selected?.id]);
  const selectedStatus = detail.loading || detail.error ? selected?.status : detail.data?.status || selected?.status;
  const selectedRosterProvenance = sessionRosterProvenance(detail.loading || detail.error ? selected : detail.data || selected);
  const recoveryAvailable = selected?.status === 'MISSED' && canRecoverMissed;

  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => { setRecoveryReason(''); }, [selected?.id]);

  async function recoverSelectedSession() {
    const reason = recoveryReason.trim();
    if (!selected?.id || !recoveryAvailable || recoveryPendingRef.current) return;
    if (reason.length < 10) {
      notify?.('Alasan pemulihan minimal 10 karakter.', 'warn');
      return;
    }
    recoveryPendingRef.current = true;
    setRecoveryPending(true);
    try {
      const confirmed = await riskConfirm('Sesi MISSED akan dipulihkan menjadi OPEN. Roster akan dibentuk dari enrollment efektif dan ditandai perlu verifikasi.', 'Pulihkan sesi');
      if (!confirmed || !mountedRef.current) return;
      const result = await apiFetch(`/attendance/class-sessions/${selected.id}/recover`, { method: 'POST', body: JSON.stringify({ reason }) });
      if (!mountedRef.current) return;
      setSelected(null);
      setRecoveryReason('');
      state.refresh();
      notify?.(result?.message || 'Sesi berhasil dipulihkan.', 'ok');
    } catch (error) {
      if (mountedRef.current) notify?.(error.message || 'Gagal memulihkan sesi.', 'bad');
    } finally {
      recoveryPendingRef.current = false;
      if (mountedRef.current) setRecoveryPending(false);
    }
  }

  return <div className="content"><PageHead eyebrow="CEK SESI KELAS" title={admin ? 'Cek Sesi Kelas' : 'Sesi saya'} sub="Lihat kelas yang terjadwal, sedang berjalan, selesai, atau terlewat." actions={<><label className="input compact"><Calendar size={14} /><input aria-label="Tanggal sesi" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>{admin && <Btn variant="primary" onClick={() => go('/admin/schedule')}><Plus size={14} /> Tambah jadwal</Btn>}</>} /><Card><AsyncTable state={state} columns={[{ header: 'Waktu', render: (r) => `${formatDateTime(r.startsAt)} — ${new Date(r.endsAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}` }, { header: 'Kelas', render: (r) => r.schoolClass?.code || r.classCode || r.classId }, { header: 'Mapel', render: (r) => r.subject?.name || r.subjectName || r.subjectId }, { header: 'Guru', render: (r) => r.teacher?.fullName || r.teacherName || r.teacherId }, { header: 'Roster', render: (r) => rosterProvenanceLabel(sessionRosterProvenance(r)) }, { header: 'Status', render: (r) => <StatusPill status={r.status} /> }]} /> <Pagination meta={metaOf(state.data)} onPage={setPage} /></Card>{itemsOf(state.data).length > 0 && <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>{itemsOf(state.data).slice(0, 8).map((s) => <Btn size="sm" key={s.id} onClick={() => setSelected(s)}><Eye size={13} /> Detail {s.schoolClass?.code}</Btn>)}</div>}{selected && <Card title={`Detail ${selected.schoolClass?.code || ''}`} sub="Ringkasan kelengkapan presensi sesi" actions={<Btn size="sm" variant="ghost" onClick={() => setSelected(null)}>Tutup</Btn>}>{detail.loading ? <LoadingState /> : detail.error ? <><div className="inline-note warn"><AlertTriangle size={14} /> {rosterProvenanceLabel(selectedRosterProvenance)}</div><ErrorState error={detail.error} /><SessionRecoveryPanel available={recoveryAvailable} reason={recoveryReason} onReasonChange={setRecoveryReason} pending={recoveryPending} onRecover={recoverSelectedSession} /></> : <><div className="grid g-4"><StatCardPremium icon={<Users size={18} />} label="Terdaftar" value={detail.data?.enrolledCount ?? '—'} sub={selectedRosterProvenance === 'LEGACY_ROSTER_MISSING' ? 'Roster tidak tersedia' : 'Siswa'} /><StatCardPremium icon={<Check size={18} />} label="Tercatat" value={detail.data?.recordedCount ?? '—'} sub="Presensi masuk" /><StatCardPremium icon={<Clock size={18} />} label="Status" value={selectedStatus} sub="Tahap sesi" /><StatCardPremium icon={<Activity size={18} />} label="Hadir" value={detail.data?.counters?.HADIR ?? 0} sub="Jumlah" tone="ok" /></div><div className="inline-note warn"><AlertTriangle size={14} /> {rosterProvenanceLabel(selectedRosterProvenance)}</div><SessionRecoveryPanel available={recoveryAvailable} reason={recoveryReason} onReasonChange={setRecoveryReason} pending={recoveryPending} onRecover={recoverSelectedSession} /></>}</Card>}</div>;
}

export function HistoryPage() {
  const [date, setDate] = useState(today());
  const [page, setPage] = useState(1);
  const logs = useRemote(() => apiFetch(`/attendance/gate/logs${qs({ date, page, limit: 50 })}`), [date, page]);
  const prayers = useRemote(() => apiFetch(`/attendance/prayer/logs${qs({ date, page: 1, limit: 50 })}`), [date]);
  return <div className="content"><PageHead eyebrow="RIWAYAT SCAN" title="Riwayat Scan" sub="Catatan scan gerbang dan mushola. Gunakan untuk mengecek jika ada data yang belum sesuai." actions={<><label className="input compact"><Calendar size={14} /><input aria-label="Tanggal riwayat scan" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><Btn onClick={() => { logs.refresh(); prayers.refresh(); }}><RefreshCw size={14} /> Muat ulang</Btn></>} /><div className="grid g-2"><Card title="Log Gerbang" sub="Lapis 1 — scan masuk/keluar"><AsyncTable state={logs} columns={[{ header: 'Waktu', render: (r) => formatDateTime(r.tappedAt) }, { header: 'Nama', render: (r) => r.user?.fullName || r.userId }, { header: 'Peran', render: (r) => <StatusPill status={r.user?.role || '—'} /> }, { header: 'Mode scan', render: (r) => r.scanModeLabel || androidLastUsedModeText(r.scanMode) }, { header: 'Device', render: (r) => r.deviceName || r.deviceId || '—' }, { header: 'Hasil', render: (r) => r.resultLabel || (r.direction === 'OUT' ? 'Pulang' : 'Datang') }]} /><Pagination meta={metaOf(logs.data)} onPage={setPage} /></Card><Card title="Log Mushola" sub="Scan QR Dhuha, Dzuhur, dan Ashar khusus siswa"><AsyncTable state={prayers} columns={[{ header: 'Waktu', render: (r) => formatDateTime(r.scannedAt) }, { header: 'Nama', render: (r) => r.student?.fullName || r.studentId }, { header: 'Peran', render: (r) => <StatusPill status={r.student?.role || 'SISWA'} /> }, { header: 'Mode scan', render: (r) => r.scanModeLabel || androidLastUsedModeText(r.scanMode) }, { header: 'Device', render: (r) => r.deviceName || r.deviceId || '—' }, { header: 'Hasil', render: (r) => r.resultLabel || 'Sholat' }]} /></Card></div></div>;
}

export function StaffAttendancePage({ notify }) {
  const [date, setDate] = useState(today());
  const canExport = readStoredUser()?.role !== 'KEPALA_SEKOLAH';
  const state = useRemote(() => apiFetch(`/reports/staff-gate-attendance${qs({ from: date, to: date, page: 1, limit: 200 })}`), [date]);
  async function exportReport() {
    await apiDownload(`/reports/export${qs({ reportType: 'staff_gate_attendance', format: 'xlsx', from: date, to: date })}`);
    notify('Laporan Kepala/Staf berhasil diunduh.');
  }
  return <div className="content"><PageHead eyebrow="KEPALA / STAF" title="Datang & Pulang" sub="Tabel sederhana scan Mode Gerbang untuk kepala, TU, dan staf/karyawan." actions={<><label className="input compact"><Calendar size={14} /><input aria-label="Tanggal staf" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><Btn onClick={state.refresh}><RefreshCw size={14} /> Muat ulang</Btn>{canExport && <Btn variant="primary" onClick={exportReport}><Download size={14} /> Export Laporan</Btn>}</>} /><Card title="Kehadiran Kepala/Staf" sub="Scan pertama = Datang. Scan berikutnya setelah jeda aman = Pulang."><AsyncTable state={state} columns={[{ header: 'Nama', render: (r) => r.fullName || r.username }, { header: 'Peran', render: (r) => <StatusPill status={r.role} /> }, { header: 'Datang', render: (r) => formatDateTime(r.datang) }, { header: 'Pulang', render: (r) => formatDateTime(r.pulang) }, { header: 'Status', render: (r) => <StatusPill status={r.status} /> }, { header: 'Keterangan', render: (r) => r.note || '—' }]} empty="Belum ada scan kepala/staf pada tanggal ini." /></Card></div>;
}

export function PrayerAttendancePage({ notify }) {
  const [date, setDate] = useState(today());
  const logs = useRemote(() => apiFetch(`/reports/student-prayer-attendance${qs({ from: date, to: date, page: 1, limit: 200 })}`), [date]);
  const recap = useRemote(() => apiFetch(`/reports/student-worship-recap${qs({ from: date, to: date, page: 1, limit: 200 })}`), [date]);
  const rows = itemsOf(logs.data);
  const dhuha = rows.filter((r) => r.prayerType === 'DHUHA').length;
  const dzuhur = rows.filter((r) => r.prayerType === 'DZUHUR').length;
  async function exportLogs() {
    await apiDownload(`/reports/export${qs({ reportType: 'student_prayer_attendance', format: 'xlsx', from: date, to: date })}`);
    notify('Laporan sholat siswa berhasil diunduh.');
  }
  async function exportRecap() {
    await apiDownload(`/reports/export${qs({ reportType: 'student_worship_recap', format: 'xlsx', from: date, to: date })}`);
    notify('Rekap karakter/ibadah berhasil diunduh.');
  }
  return <div className="content"><PageHead eyebrow="SHOLAT SISWA" title="Absensi Sholat" sub="Pantau scan QR siswa di Mode Mushola untuk Dhuha dan Dzuhur." actions={<><label className="input compact"><Calendar size={14} /><input aria-label="Tanggal sholat" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><Btn onClick={() => { logs.refresh(); recap.refresh(); }}><RefreshCw size={14} /> Muat ulang</Btn><Btn variant="primary" onClick={exportLogs}><Download size={14} /> Export Log</Btn><Btn onClick={exportRecap}><Download size={14} /> Export Rekap</Btn></>} /><div className="grid g-4"><StatCardPremium icon={<Building2 size={18} />} label="Dhuha" value={dhuha} sub="Sudah scan" tone="ok" /><StatCardPremium icon={<Building2 size={18} />} label="Dzuhur" value={dzuhur} sub="Sudah scan" tone="ok" /><StatCardPremium icon={<Users size={18} />} label="Total Scan" value={rows.length} sub="Hari ini" /><StatCardPremium icon={<AlertTriangle size={18} />} label="Belum Scan" value="Lihat rekap" sub="Gunakan export/rekap kelas" tone="warn" /></div><div className="grid g-2" style={{ marginTop: 18 }}><Card title="Log Sholat" sub="Data scan siswa dari Mode Mushola"><AsyncTable state={logs} columns={[{ header: 'Siswa', render: (r) => r.fullName || r.username }, { header: 'Kelas', render: (r) => r.schoolClass || '—' }, { header: 'Sholat', render: (r) => <StatusPill status={r.prayerType} /> }, { header: 'Waktu', render: (r) => formatDateTime(r.scannedAt) }, { header: 'HP', render: (r) => r.reader || '—' }, { header: 'Status', render: (r) => <StatusPill status={r.status} /> }]} empty="Belum ada scan sholat pada tanggal ini." /></Card><Card title="Rekap Ibadah Siswa" sub="Hitungan Dhuha/Dzuhur per siswa"><AsyncTable state={recap} columns={[{ header: 'Siswa', render: (r) => r.fullName || r.username }, { header: 'Kelas', render: (r) => r.schoolClass || '—' }, { header: 'Dhuha', render: (r) => r.dhuhaCount ?? 0 }, { header: 'Dzuhur', render: (r) => r.dzuhurCount ?? 0 }, { header: 'Ringkasan', render: (r) => r.periodSummary || '—' }]} empty="Belum ada rekap ibadah pada tanggal ini." /></Card></div></div>;
}

export function StudentDailyCompletenessPage({ notify }) {
  const [date, setDate] = useState(today());
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('');
  const [missingRequirement, setMissingRequirement] = useState('');
  const currentRole = readStoredUser()?.role;
  const canFetchClasses = currentRole === 'ADMIN_TU' || currentRole === 'OPERATOR_IT' || currentRole === 'DEVELOPER';
  const classes = useRemote(() => canFetchClasses ? apiFetch('/academic/classes?page=1&limit=200') : Promise.resolve({ items: [] }), [canFetchClasses]);
  const state = useRemote(() => apiFetch(`/reports/student-daily-completeness${qs({ from: date, to: date, classId, status, missingRequirement, page: 1, limit: 200 })}`), [date, classId, status, missingRequirement]);
  const summary = studentDailySummary(state.data);
  async function exportReport() {
    await apiDownload(buildOfficialReportExportPath('student-daily-completeness', 'xlsx', { from: date, to: date, classId, status, missingRequirement }));
    notify('Rekap Kehadiran Lengkap Siswa berhasil diunduh.');
  }
  return <div className="content"><PageHead eyebrow="KELENGKAPAN SISWA" title="Kehadiran Lengkap Siswa" sub="Siswa hadir lengkap jika sudah scan datang, scan pulang, diabsen guru, dan scan sholat saat wajib." actions={<><label className="input compact"><Calendar size={14} /><input aria-label="Tanggal kelengkapan siswa" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><SelectInput aria-label="Filter kelas" value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Semua kelas</option>{itemsOf(classes.data).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</SelectInput><SelectInput aria-label="Filter status akhir" value={status} onChange={(e) => setStatus(e.target.value)}>{STUDENT_DAILY_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectInput><SelectInput aria-label="Filter kebutuhan kurang" value={missingRequirement} onChange={(e) => setMissingRequirement(e.target.value)}>{STUDENT_DAILY_MISSING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectInput><Btn onClick={state.refresh}><RefreshCw size={14} /> Muat ulang</Btn><Btn variant="primary" onClick={exportReport}><Download size={14} /> Export</Btn></>} />
    <div className="grid g-4"><StatCardPremium icon={<CheckSquare size={18} />} label="Siswa hadir lengkap" value={summary.completeCount ?? 0} sub="Semua syarat selesai" tone="ok" /><StatCardPremium icon={<AlertTriangle size={18} />} label="Belum scan datang" value={summary.missingArrivalCount ?? 0} sub="Cek Mode Gerbang pagi" tone="warn" /><StatCardPremium icon={<DoorOpen size={18} />} label="Belum scan pulang" value={summary.missingDepartureCount ?? 0} sub="Cek Mode Gerbang pulang" tone="warn" /><StatCardPremium icon={<Users size={18} />} label="Belum absen kelas" value={summary.missingClassAttendanceCount ?? 0} sub="Belum diabsen guru" tone="warn" /><StatCardPremium icon={<Building2 size={18} />} label="Belum scan sholat" value={summary.missingPrayerCount ?? 0} sub="Cek Mode Mushola" tone="warn" /><StatCardPremium icon={<Flag size={18} />} label="Perlu verifikasi" value={summary.needsVerificationCount ?? 0} sub="Butuh cek petugas" tone="bad" /></div>
    <Card title="Rekap Harian Siswa" sub="Gerbang, kelas, dan sholat tetap menjadi bukti terpisah. Scan gerbang tidak otomatis mengisi presensi kelas."><AsyncTable state={state} empty="Belum ada data siswa pada filter ini." columns={[{ header: 'Nama', render: (r) => r.fullName || r.username }, { header: 'Kelas', render: (r) => r.schoolClass || '—' }, { header: 'Datang gerbang', render: (r) => r.gateArrivalAt ? formatDateTime(r.gateArrivalAt) : 'Belum scan datang' }, { header: 'Pulang gerbang', render: (r) => r.gateDepartureAt ? formatDateTime(r.gateDepartureAt) : 'Belum scan pulang' }, { header: 'Absensi kelas', render: (r) => r.classAttendanceLabel || 'Belum diabsen guru' }, { header: 'Sholat', render: (r) => r.prayerAttendanceLabel || 'Belum scan sholat' }, { header: 'Status akhir', render: (r) => <StatusPill status={r.finalStatus} /> }, { header: 'Keterangan', render: (r) => r.note || friendlyDailyStatus(r.finalStatus) }]} /></Card>
  </div>;
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
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="resolve-flag-title" onClick={onClose}><div className="card pad-lg elev modal" onClick={(e) => e.stopPropagation()}><div className="eyebrow">TINDAK TANDA MASALAH · ALASAN WAJIB</div><h2 id="resolve-flag-title">{statusLabel(flag.type)} · {flag.user?.fullName || flag.userId}</h2><p className="muted">Catat proses tindak lanjut agar petugas lain paham riwayatnya.</p><div className="grid g-3"><Card title="Alur tindak lanjut" sub="Ubah status kerja tanpa menutup masalah"><div className="form-grid"><Field label="Status proses"><SelectInput value={workflow.reviewStatus} onChange={(e) => setW('reviewStatus', e.target.value)}><option value="OPEN">Belum dicek</option><option value="IN_REVIEW">Sedang dicek</option><option value="ESCALATED">Perlu eskalasi</option><option value="RESOLVED">Selesai</option></SelectInput></Field><Field label="Prioritas"><SelectInput value={workflow.priority} onChange={(e) => setW('priority', e.target.value)}><option value="LOW">Rendah</option><option value="NORMAL">Normal</option><option value="HIGH">Tinggi</option><option value="URGENT">Mendesak</option></SelectInput></Field><Field label="Batas tindak lanjut"><TextInput type="date" value={workflow.dueAt} onChange={(e) => setW('dueAt', e.target.value)} /></Field><Field label="Catatan tindak lanjut"><TextInput type="textarea" rows={3} value={workflow.followUpNote} placeholder="Contoh: sudah konfirmasi ke wali kelas, menunggu bukti izin." onChange={(e) => setW('followUpNote', e.target.value)} /></Field><Btn type="button" loading={workflowLoading} onClick={saveWorkflow}><Save size={14} /> Simpan tindak lanjut</Btn></div></Card><Card title="Riwayat singkat" sub="Jejak kejadian dan tindak lanjut"><div className="timeline-lite">{timeline.map((item, idx) => <div className="timeline-item" key={`${item.label}-${idx}`}><div><b>{item.label}</b><p>{item.body}</p><small>{formatDateTime(item.at)}</small></div></div>)}</div></Card></div><Field label="Alasan penyelesaian/eskalasi" hint={`${reason.trim().length}/10+`}><TextInput type="textarea" rows={4} value={reason} placeholder="Tulis alasan minimal 10 karakter" onChange={(e) => setReason(e.target.value)} /></Field>{err && <div className="inline-error"><AlertTriangle size={14} /> {err}</div>}<div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><Btn variant="ghost" onClick={onClose}>Batal</Btn><Btn disabled={reason.trim().length < 10} loading={loading} onClick={() => act('escalate')}>Eskalasi</Btn><Btn variant="primary" disabled={reason.trim().length < 10} loading={loading} onClick={() => act('resolve')}>Selesaikan</Btn></div></div></div>;
}

const MASTER_DATA_TAB_GROUPS = [
  { label: 'Siswa', tabs: [['student-import', 'Import Data'], ['students', 'Daftar Siswa'], ['enroll', 'Daftarkan Manual']] },
  { label: 'Akun', tabs: [['users', 'Buat/Edit Akun'], ['account-slips', 'Lembar Akun Login']] },
  { label: 'Akademik', tabs: [['classes', 'Kelas'], ['subjects', 'Mapel'], ['years', 'Tahun Ajaran'], ['semesters', 'Semester'], ['rooms', 'Ruang']] },
  { label: 'Bantuan & Lanjutan', tabs: [['schedule-help', 'Cara Pakai'], ['import', 'Impor Lanjutan']] }
];

const MASTER_DATA_TABS = MASTER_DATA_TAB_GROUPS.flatMap((group) => group.tabs);
const MASTER_DATA_TAB_VALUES = new Set(MASTER_DATA_TABS.map(([value]) => value));

const MASTER_DATA_HELP = {
  'student-import': { title: 'Urutan aman import sekolah', items: ['Upload CSV/XLSX siswa/guru/tendik, lalu Preview dulu.', 'Commit import hanya setelah valid; password dibuat otomatis dan tampil sekali.', 'QR dibuat manual setelah review data, lalu generator kartu mengambil dari database.'] },
  students: { title: 'Cek daftar siswa', items: ['Gunakan filter kelas untuk verifikasi anggota kelas.', 'Jika siswa belum muncul, cek akun siswa dan pendaftaran kelas.'] },
  users: { title: 'Kelola akun aman', items: ['Buat akun dengan password sementara, lalu minta pengguna mengganti password.', 'Nonaktifkan akun yang tidak dipakai; jangan hapus jika sudah punya riwayat.'] },
  'account-slips': { title: 'Lembar akun login', items: ['Generate password awal dari endpoint khusus, bukan dari flow buat/edit akun.', 'Password hanya tampil sekali di layar cetak dan tidak disimpan di browser.'] },
  classes: { title: 'Data kelas', items: ['Buat kelas setelah label tahun ajaran disepakati.', 'Gunakan kode singkat yang sama dengan jadwal dan kartu.'] },
  subjects: { title: 'Data mapel', items: ['Isi kode mapel yang mudah dikenali.', 'Nama mapel dipakai di jadwal dan laporan.'] },
  years: { title: 'Tahun ajaran', items: ['Buat tahun ajaran aktif sebelum membuat semester.', 'Kode contoh: 2026/2027.'] },
  semesters: { title: 'Semester', items: ['Pilih tahun ajaran dari daftar, bukan mengetik ID database.', 'Nama semester dipakai untuk pendaftaran dan jadwal.'] },
  rooms: { title: 'Ruang kelas', items: ['Definisikan kode ruang yang dipakai oleh jadwal.', 'Contoh kode: R-A1 atau LAB-1.'] },
  enroll: { title: 'Pendaftaran manual', items: ['Pilih siswa, kelas, dan tanggal mulai berlaku.', 'Gunakan untuk siswa pindahan atau transfer kelas.'] },
  'schedule-help': { title: 'Cara pakai', items: ['Mulai dari import siswa, cek daftar siswa, cetak kartu, lalu buat jadwal kelas.'] },
  import: { title: 'Impor lanjutan', items: ['Gunakan hanya untuk CSV/XLSX pengguna atau akademik yang sudah disiapkan operator.', 'Selalu periksa pratinjau sebelum menyimpan.'] }
};

function readMasterDataTabFromUrl() {
  const raw = new URLSearchParams(window.location.search).get('tab') || 'student-import';
  return MASTER_DATA_TAB_VALUES.has(raw) ? raw : 'student-import';
}

export function MasterDataPage({ notify }) {
  const [tab, setTab] = useState(readMasterDataTabFromUrl);
  useEffect(() => {
    const handlePop = () => setTab(readMasterDataTabFromUrl());
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);
  function selectTab(nextTab) {
    if (!MASTER_DATA_TAB_VALUES.has(nextTab)) nextTab = 'student-import';
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', nextTab);
    window.history.pushState({}, '', `${url.pathname}?${url.searchParams.toString()}`);
  }
  const user = readStoredUser();
  const canOpenGenerator = ['ADMIN_TU', 'DEVELOPER', 'OPERATOR_IT'].includes(user?.role);
  return <div className="content master-data-page"><PageHead eyebrow="DATA SEKOLAH" title="Akun & Data Sekolah" sub="Kelola siswa, akun, kelas, mapel, tahun ajaran, semester, dan ruang tanpa membuka ID internal." />{canOpenGenerator && <IdCardGeneratorEntryCard />}<TabBar value={tab} onChange={selectTab} groups={MASTER_DATA_TAB_GROUPS} /><ContextualMasterDataHelp tab={tab} />
    <section id={`master-data-panel-${tab}`} role="tabpanel" aria-labelledby={`master-data-tab-${tab}`} className="master-data-panel">
      {tab === 'student-import' && <StudentImportPanel notify={notify} />}
      {tab === 'users' && <UsersPanel notify={notify} />}
      {tab === 'account-slips' && <AccountLoginSlipPanel notify={notify} />}
      {tab === 'years' && <SimpleCreatePanel title="Tahun Ajaran" path="/academic/years" fields={[{ key: 'code', label: 'Kode', placeholder: 'contoh: 2026/2027', hint: 'Kode ringkas untuk laporan.' }, { key: 'name', label: 'Nama', placeholder: 'contoh: Tahun Ajaran 2026/2027' }, { key: 'startsAt', label: 'Mulai Tahun Ajaran', type: 'date' }, { key: 'endsAt', label: 'Selesai Tahun Ajaran', type: 'date' }]} notify={notify} empty={{ title: 'Belum ada tahun ajaran.', sub: 'Buat tahun ajaran sebelum membuat semester.' }} columns={[{ header: 'Kode', key: 'code' }, { header: 'Nama', key: 'name' }, { header: 'Periode', render: (r) => `${dateInputValue(r.startsAt) || '—'} s.d. ${dateInputValue(r.endsAt) || '—'}` }, { header: 'Aktif', render: (r) => <StatusPill status={r.active ? 'ACTIVE' : 'INACTIVE'} /> }]} />}
      {tab === 'semesters' && <SemesterPanel notify={notify} />}
      {tab === 'rooms' && <SimpleCreatePanel title="Ruang" path="/academic/rooms" fields={[{ key: 'code', label: 'Kode Ruang', placeholder: 'contoh: R-A1 atau LAB-1' }, { key: 'name', label: 'Nama Ruang', placeholder: 'contoh: Ruang Kelas X A' }]} notify={notify} empty={{ title: 'Belum ada ruang kelas.', sub: 'Tambahkan ruang agar jadwal bisa memakai lokasi yang jelas.' }} columns={[{ header: 'Kode', key: 'code' }, { header: 'Nama', key: 'name' }, { header: 'Aktif', render: (r) => <StatusPill status={r.active ? 'ACTIVE' : 'INACTIVE'} /> }]} />}
      {tab === 'classes' && <SimpleCreatePanel title="Kelas" path="/academic/classes" fields={[{ key: 'code', label: 'Kode Kelas', placeholder: 'contoh: X-A' }, { key: 'name', label: 'Nama Kelas', placeholder: 'contoh: Kelas X A' }, { key: 'yearLabel', label: 'Label Tahun Ajaran', placeholder: 'contoh: 2026/2027', hint: 'API kelas saat ini memakai label tahun ajaran, bukan relasi ID.' }]} notify={notify} empty={{ title: 'Belum ada kelas.', sub: 'Isi formulir di sebelah kiri untuk menambahkan kelas.' }} columns={[{ header: 'Kode', key: 'code' }, { header: 'Nama', key: 'name' }, { header: 'Tahun', key: 'yearLabel' }]} />}
      {tab === 'subjects' && <SimpleCreatePanel title="Mapel" path="/academic/subjects" fields={[{ key: 'code', label: 'Kode Mapel', placeholder: 'contoh: MTK' }, { key: 'name', label: 'Nama Mapel', placeholder: 'contoh: Matematika' }]} notify={notify} empty={{ title: 'Belum ada mata pelajaran.', sub: 'Tambahkan kode dan nama mapel untuk jadwal kelas.' }} columns={[{ header: 'Kode', key: 'code' }, { header: 'Nama', key: 'name' }]} />}
      {tab === 'students' && <StudentsPanel />}
      {tab === 'enroll' && <EnrollPanel notify={notify} />}
      {tab === 'schedule-help' && <Card title="Cara pakai data sekolah"><StepGuide steps={['Import siswa massal.', 'Cek daftar siswa per kelas.', 'Cetak kartu dari tombol Kartu di Daftar Pengguna.', 'Buat jadwal kelas dari menu Jadwal Kelas.']} /></Card>}
      {tab === 'import' && <ImportPanel notify={notify} />}
    </section>
  </div>;
}

function IdCardGeneratorEntryCard() {
  return <Card title="Generator Kartu Tanda Pengenal" sub="Buat dan cetak kartu tanda pengenal siswa/operator dari data sekolah." actions={<Pill tone="ok">Internal</Pill>}><div className="user-preset-grid master-data-account-presets"><QuickActionCard title="Buka Generator" desc="Akses dilindungi server-side. Gunakan perangkat tepercaya dan tekan Hapus Data Lokal setelah selesai." icon={<CreditCard size={18} />} actionLabel="Buka Generator" onClick={() => openIdCardGenerator('/export')} tone="ok" /><QuickActionCard title="Cetak dari data akun" desc="Gunakan tombol Kartu di Daftar Pengguna untuk membuka generator dengan data resmi satu akun." icon={<ShieldCheck size={18} />} actionLabel="Lihat Daftar Pengguna" onClick={() => { const url = new URL(window.location.href); url.searchParams.set('tab', 'users'); window.history.pushState({}, '', `${url.pathname}?${url.searchParams.toString()}`); window.dispatchEvent(new PopStateEvent('popstate')); }} /></div></Card>;
}

export function IdCardGeneratorAccessPage() {
  useEffect(() => {
    window.location.replace(idCardGeneratorUrl('/export'));
  }, []);
  return <div className="content"><Card title="Membuka Generator Kartu Tanda Pengenal" sub="Akses generator dilindungi server-side untuk operator internal."><LoadingState label="Mengalihkan ke generator…" /></Card></div>;
}

function ContextualMasterDataHelp({ tab }) {
  const help = MASTER_DATA_HELP[tab] || MASTER_DATA_HELP['student-import'];
  return <div className="master-data-help" role="note"><b>{help.title}</b><ul>{help.items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>;
}

function TabBar({ value, onChange, groups, options }) {
  if (!groups) return <div className="tabs">{(options || []).map(([v, label]) => <button key={v} className={`btn sm ${value === v ? 'primary' : 'ghost'}`} onClick={() => onChange(v)}>{label}</button>)}</div>;
  const tabs = groups.flatMap((group) => group.tabs);
  function move(delta) {
    const focusedTab = document.activeElement?.id?.replace('master-data-tab-', '');
    const baseValue = MASTER_DATA_TAB_VALUES.has(focusedTab) ? focusedTab : value;
    const index = tabs.findIndex(([tab]) => tab === baseValue);
    const nextIndex = (index + delta + tabs.length) % tabs.length;
    onChange(tabs[nextIndex][0]);
    window.requestAnimationFrame(() => document.getElementById(`master-data-tab-${tabs[nextIndex][0]}`)?.focus());
  }
  function onKeyDown(event) {
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    if (event.key === 'Home') { event.preventDefault(); onChange(tabs[0][0]); window.requestAnimationFrame(() => document.getElementById(`master-data-tab-${tabs[0][0]}`)?.focus()); }
    if (event.key === 'End') { event.preventDefault(); onChange(tabs[tabs.length - 1][0]); window.requestAnimationFrame(() => document.getElementById(`master-data-tab-${tabs[tabs.length - 1][0]}`)?.focus()); }
  }
  return <div className="master-data-tabs-wrap" aria-label="Navigasi data sekolah"><div className="master-data-tab-fade" aria-hidden="true" /><div className="tabs master-data-tabs" role="tablist" aria-label="Tab Master Data" onKeyDown={onKeyDown}>{groups.map((group) => <div className="master-data-tab-group" key={group.label}><span className="master-data-tab-group-label">{group.label}</span>{group.tabs.map(([v, label]) => <button id={`master-data-tab-${v}`} type="button" role="tab" aria-label={v === 'student-import' ? 'Import Data Sekolah' : undefined} aria-selected={value === v} aria-controls={`master-data-panel-${v}`} tabIndex={value === v ? 0 : -1} key={v} className={`btn sm ${value === v ? 'primary' : 'ghost'}`} onClick={() => onChange(v)}>{label}</button>)}</div>)}</div></div>;
}

function UsersPanel({ notify }) {
  const currentUser = readStoredUser();
  const isDeveloper = currentUser?.role === 'DEVELOPER';
  const roleOptions = [['ADMIN_TU', 'Admin/TU'], ['KEPALA_SEKOLAH', 'Kepala Sekolah'], ['OPERATOR_IT', 'Operator IT'], ['GURU_MAPEL', 'Guru Mapel'], ['GURU_PIKET', 'Guru Piket'], ['SISWA', 'Siswa'], ...(isDeveloper ? [['DEVELOPER', 'Developer']] : [])];
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const statusQuery = statusFilter === 'ALL' ? 'all' : statusFilter === 'ARCHIVED' ? 'archived' : statusFilter === 'INACTIVE' ? 'inactive' : 'active';
  const [page, setPage] = useState(1);
  const state = useRemote(() => apiFetch(`/identity/users${qs({ page, limit: 200, status: statusQuery })}`), [statusQuery, page]);
  useEffect(() => { setPage(1); }, [statusQuery]);
  const deletePinStatus = useRemote(() => apiFetch('/identity/accounts/delete-pin/status'), []);
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [deletePreview, setDeletePreview] = useState(null);
  const [deleteWorking, setDeleteWorking] = useState(false);
  const [deleteResult, setDeleteResult] = useState(null);
  const [deleteForm, setDeleteForm] = useState({ reason: '', pin: '', confirmText: '', mode: 'auto', understood: false });
  const [pinForm, setPinForm] = useState({ currentPassword: '', pin: '', confirmPin: '', reason: 'Menyiapkan PIN hapus akun.' });
  const [pinWorking, setPinWorking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const emptyUserForm = { id: '', username: '', fullName: '', password: '', role: 'SISWA', cardStatus: 'ACTIVE' };
  const [form, set, reset, setForm] = useForm(emptyUserForm);
  const userPresets = [
    { role: 'SISWA', title: 'Buat Akun Siswa', desc: 'Untuk siswa yang akan melihat kehadiran dan punya QR.', icon: <Users size={18} /> },
    { role: 'GURU_MAPEL', title: 'Buat Akun Guru', desc: 'Untuk guru mapel yang mengisi presensi kelas.', icon: <BookOpen size={18} /> },
    { role: 'GURU_PIKET', title: 'Buat Akun Guru Piket', desc: 'Untuk petugas piket yang cek masalah dan catatan piket.', icon: <ListChecks size={18} /> },
    { role: 'OPERATOR_IT', title: 'Buat Akun Operator', desc: 'Untuk pengelola perangkat, kartu, dan sistem.', icon: <ShieldCheck size={18} /> }
  ];
  function applyUserPreset(role) {
    setForm((prev) => ({ ...emptyUserForm, username: prev.id ? '' : prev.username, fullName: prev.id ? '' : prev.fullName, role }));
    setFormError('');
  }
  const allRows = itemsOf(state.data);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredRows = allRows.filter((user) => {
    const archived = Boolean(user.archivedAt);
    const statusMatches = statusFilter === 'ALL'
      || (statusFilter === 'ACTIVE' && Boolean(user.active) && !archived)
      || (statusFilter === 'INACTIVE' && !user.active && !archived)
      || (statusFilter === 'ARCHIVED' && archived);
    const roleMatches = roleFilter === 'ALL' || user.role === roleFilter;
    const searchMatches = !normalizedSearch || `${user.fullName || ''} ${user.username || ''}`.toLowerCase().includes(normalizedSearch);
    return statusMatches && roleMatches && searchMatches;
  });
  const selectableRows = filteredRows.filter((user) => !user.archivedAt && ['SISWA', 'GURU_MAPEL', 'GURU_PIKET', 'KEPALA_SEKOLAH'].includes(user.role));
  const selectedSet = new Set(selectedIds);
  const selectedRows = filteredRows.filter((user) => selectedSet.has(user.id));
  const filteredState = { ...state, data: { ...(state.data || {}), items: filteredRows } };
  async function submit(e) {
    e.preventDefault();
    const password = String(form.password || '').trim();
    if (!form.id && password.length < 8) { setFormError('Isi kata sandi sementara minimal 8 karakter.'); notify('Isi kata sandi sementara minimal 8 karakter.', 'warn'); return; }
    if (form.id && password && password.length < 8) { setFormError('Kata sandi baru minimal 8 karakter.'); notify('Kata sandi baru minimal 8 karakter.', 'warn'); return; }
    setSubmitting(true);
    setFormError('');
    try {
      if (form.id) await apiFetch(`/identity/users/${form.id}`, { method: 'PATCH', body: JSON.stringify({ fullName: form.fullName, role: form.role, cardStatus: form.cardStatus, ...(password ? { password } : {}) }) });
      else await apiFetch('/identity/users', { method: 'POST', body: JSON.stringify({ ...form, password }) });
      reset(emptyUserForm);
      state.refresh();
      notify(`${form.fullName || form.username} berhasil disimpan.`);
    } catch (error) {
      const message = error.message || 'Pengguna belum bisa disimpan.';
      setFormError(message);
      notify(message, 'bad');
    } finally {
      setSubmitting(false);
    }
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
  function toggleSelectUser(userId) {
    setSelectedIds((prev) => prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]);
  }
  function toggleSelectAllVisible() {
    const ids = selectableRows.map((user) => user.id);
    setSelectedIds((prev) => ids.every((id) => prev.includes(id)) ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]);
  }
  async function openDeletePreview(userIds) {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return notify('Pilih minimal satu akun untuk dihapus/diarsipkan.', 'warn');
    if (ids.length > 50) return notify('Maksimal 50 akun per batch.', 'warn');
    setDeleteWorking(true);
    setDeleteResult(null);
    try {
      const preview = await apiFetch('/identity/accounts/delete-preview', { method: 'POST', body: JSON.stringify({ userIds: ids }) });
      setDeletePreview(preview);
      setDeleteForm({ reason: '', pin: '', confirmText: '', mode: 'auto', understood: false });
    } catch (error) {
      notify(error.message || 'Preview hapus akun gagal.', 'bad');
    } finally {
      setDeleteWorking(false);
    }
  }
  function closeDeleteModal() {
    setDeletePreview(null);
    setDeleteForm({ reason: '', pin: '', confirmText: '', mode: 'auto', understood: false });
  }
  async function executeAccountDelete() {
    if (!deletePreview?.items?.length) return;
    if (deleteForm.reason.trim().length < 10) return notify('Alasan minimal 10 karakter.', 'warn');
    if (!deleteForm.pin.trim()) return notify('PIN wajib diisi.', 'warn');
    if (deleteForm.confirmText.trim() !== 'HAPUS AKUN') return notify('Ketik HAPUS AKUN untuk konfirmasi.', 'warn');
    if (!deleteForm.understood) return notify('Centang pernyataan pemahaman risiko.', 'warn');
    setDeleteWorking(true);
    try {
      const result = await apiFetch('/identity/accounts/delete', { method: 'POST', body: JSON.stringify({ userIds: deletePreview.items.map((item) => item.userId), reason: deleteForm.reason.trim(), pin: deleteForm.pin, confirmText: deleteForm.confirmText.trim(), mode: deleteForm.mode }) });
      setDeleteResult(result);
      setSelectedIds([]);
      closeDeleteModal();
      state.refresh();
      notify(`Hapus akun selesai. Hard delete: ${result.hardDeletedCount}, arsip: ${result.archivedCount}.`);
    } catch (error) {
      notify(error.message || 'Hapus akun gagal.', 'bad');
    } finally {
      setDeleteWorking(false);
      setDeleteForm((prev) => ({ ...prev, pin: '', confirmText: '', understood: false }));
    }
  }
  async function configureDeletePin(event) {
    event.preventDefault();
    if (pinForm.pin !== pinForm.confirmPin) return notify('Konfirmasi PIN tidak sama.', 'warn');
    setPinWorking(true);
    try {
      await apiFetch('/identity/accounts/delete-pin', { method: 'POST', body: JSON.stringify(pinForm) });
      setPinForm({ currentPassword: '', pin: '', confirmPin: '', reason: 'Menyiapkan PIN hapus akun.' });
      deletePinStatus.refresh();
      notify('PIN hapus akun berhasil disimpan.');
    } catch (error) {
      notify(error.message || 'PIN hapus akun gagal disimpan.', 'bad');
    } finally {
      setPinWorking(false);
    }
  }
  async function downloadUserCard(row) {
    if (!row.active) return notify('Aktifkan akun dulu sebelum membuat kartu.', 'warn');
    const data = await apiFetch(`/qr-credentials/export/users/${row.id}/card`);
    if (!data.count) {
      await apiFetch(`/qr-credentials/users/${row.id}/generate`, { method: 'POST', body: JSON.stringify({ label: 'QR SIAB2' }) });
    }
    const params = new URLSearchParams({ autoLoad: '1', userId: row.id, autoPdf: '1' });
    openIdCardGeneratorTab('/export', Object.fromEntries(params.entries()));
    notify(`Generator kartu ${row.fullName} dibuka. QR lama tidak diganti jika sudah ada.`);
  }
  const userEmpty = allRows.length ? { title: 'Tidak ada pengguna yang sesuai dengan filter.', sub: 'Ubah status, peran, atau kata kunci pencarian.' } : { title: 'Belum ada pengguna tambahan.', sub: 'Gunakan formulir di sebelah kiri untuk membuat akun guru, siswa, piket, atau operator.' };
  const allVisibleSelected = selectableRows.length > 0 && selectableRows.every((user) => selectedSet.has(user.id));
  const selectedCount = selectedIds.length;
  return (
    <div className="master-data-user-layout">
      <div className="master-data-form-panel">
        <Card title={form.id ? 'Edit Akun' : 'Buat Akun Baru'} sub="Pilih jenis akun dulu, lalu isi nama. Untuk siswa, lanjutkan ke tab Daftarkan Manual setelah disimpan.">
          <div className="user-preset-grid master-data-account-presets">
            {userPresets.map((preset) => <QuickActionCard key={preset.role} title={preset.title} desc={preset.desc} icon={preset.icon} actionLabel="Pilih" onClick={() => applyUserPreset(preset.role)} tone={form.role === preset.role ? 'ok' : ''} />)}
          </div>
          <form onSubmit={submit} className="form-grid">
            <Field label="Nama akun" hint="wajib"><TextInput value={form.username} placeholder="contoh: siswa.aisyah" onChange={(e) => set('username', e.target.value)} required disabled={Boolean(form.id) || submitting} /></Field>
            <Field label="Nama Lengkap" hint="wajib"><TextInput value={form.fullName} placeholder="Nama lengkap sesuai data sekolah" onChange={(e) => set('fullName', e.target.value)} required disabled={submitting} /></Field>
            <Field label="Kata sandi" hint={form.id ? 'opsional saat edit' : 'minimal 8 karakter'}><TextInput type="password" value={form.password} placeholder={form.id ? 'Kosongkan jika tidak diganti' : 'Isi password sementara'} autoComplete="new-password" onChange={(e) => set('password', e.target.value)} minLength={8} required={!form.id} disabled={submitting} /></Field>
            <Field label="Peran"><SelectInput value={form.role} onChange={(e) => set('role', e.target.value)} disabled={submitting}>{roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectInput></Field>
            <Field label="Status Kartu"><SelectInput value={form.cardStatus} onChange={(e) => set('cardStatus', e.target.value)} disabled={submitting}><option value="ACTIVE">Aktif</option><option value="LOST">Hilang</option><option value="INACTIVE">Nonaktif</option></SelectInput></Field>
            {formError && <div className="inline-error" role="alert"><AlertTriangle size={14} /> {formError}</div>}
            <Btn variant="primary" loading={submitting}><Plus size={14} /> {form.id ? 'Simpan Perubahan' : 'Buat Akun'}</Btn>
            {form.role === 'SISWA' && !form.id && <Btn type="button" disabled={submitting} onClick={() => notify('Setelah akun tersimpan, buka tab Daftarkan Manual untuk memilih kelas.', 'warn')}>Info daftar kelas</Btn>}
            {form.id && <Btn type="button" variant="ghost" disabled={submitting} onClick={() => { reset(emptyUserForm); setFormError(''); }}>Batal edit</Btn>}
          </form>
        </Card>

        <Card title="PIN Hapus Akun" sub="PIN disimpan sebagai hash di server. Tidak disimpan di browser, audit, atau log." actions={<Pill tone={deletePinStatus.data?.configured ? 'ok' : 'warn'}>{deletePinStatus.data?.configured ? 'Sudah diatur' : 'Belum diatur'}</Pill>}>
          <form onSubmit={configureDeletePin} className="form-grid">
            <Field label="Password admin" hint="reauth"><TextInput type="password" value={pinForm.currentPassword} autoComplete="current-password" onChange={(e) => setPinForm((prev) => ({ ...prev, currentPassword: e.target.value }))} required disabled={pinWorking} /></Field>
            <Field label="PIN baru" hint="4-12 digit"><TextInput type="password" inputMode="numeric" value={pinForm.pin} autoComplete="off" onChange={(e) => setPinForm((prev) => ({ ...prev, pin: e.target.value.replace(/\D/g, '').slice(0, 12) }))} minLength={4} maxLength={12} required disabled={pinWorking} /></Field>
            <Field label="Ulangi PIN"><TextInput type="password" inputMode="numeric" value={pinForm.confirmPin} autoComplete="off" onChange={(e) => setPinForm((prev) => ({ ...prev, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 12) }))} minLength={4} maxLength={12} required disabled={pinWorking} /></Field>
            <Field label="Alasan"><TextInput value={pinForm.reason} onChange={(e) => setPinForm((prev) => ({ ...prev, reason: e.target.value }))} minLength={10} required disabled={pinWorking} /></Field>
            <Btn variant="primary" loading={pinWorking}><KeyRound size={14} /> Simpan/Rotasi PIN</Btn>
          </form>
        </Card>
      </div>

      <div className="master-data-list-panel">
        <Card title="Daftar Pengguna" sub="Default hanya akun aktif. Gunakan Hapus Akun untuk hard delete akun kosong atau arsipkan akun historis agar tidak tampil di daftar aktif. Nonaktifkan saja agar data tetap aman." actions={<div className="row"><Btn size="sm" disabled={!selectedCount || deleteWorking} onClick={() => openDeletePreview(selectedIds)}><AlertTriangle size={12} /> Hapus Terpilih ({selectedCount})</Btn><Btn size="sm" variant="ghost" onClick={() => { state.refresh(); deletePinStatus.refresh(); }}><RefreshCw size={12} /> Refresh</Btn></div>}>
          <div className="master-data-toolbar" role="search" aria-label="Filter daftar pengguna">
            <Field label="Cari nama atau username"><TextInput value={search} placeholder="contoh: admin.tu atau Aisyah" onChange={(e) => setSearch(e.target.value)} /></Field>
            <Field label="Status akun"><SelectInput value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setSelectedIds([]); }}><option value="ACTIVE">Aktif</option><option value="INACTIVE">Nonaktif</option><option value="ARCHIVED">Dihapus/Diarsipkan</option><option value="ALL">Semua status</option></SelectInput></Field>
            <Field label="Peran"><SelectInput value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="ALL">Semua peran</option>{roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectInput></Field>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" aria-label="Pilih semua akun terlihat" checked={allVisibleSelected} onChange={toggleSelectAllVisible} disabled={!selectableRows.length} /> Pilih semua target terlihat</label>
            <span className="muted">{selectedCount} akun dipilih · bulk maksimal 50</span>
          </div>
          <div className="master-data-table-region user-table-region">
            <AsyncTable state={filteredState} empty={userEmpty} columns={[
              { header: 'Pilih', render: (r) => <input type="checkbox" aria-label={`Pilih ${r.fullName}`} checked={selectedSet.has(r.id)} disabled={Boolean(r.archivedAt) || !['SISWA', 'GURU_MAPEL', 'GURU_PIKET', 'KEPALA_SEKOLAH'].includes(r.role)} onChange={() => toggleSelectUser(r.id)} /> },
              { header: 'Nama', render: (r) => <span className="row master-data-user-cell"><Avatar name={r.fullName} size="sm" /> <span>{r.fullName}</span></span> },
              { header: 'Nama akun', render: (r) => <span className="mono" title={r.username}>{r.username}</span> },
              { header: 'Peran', render: (r) => <StatusPill status={r.role} /> },
              { header: 'Status', render: (r) => r.archivedAt ? <Pill tone="warn">Diarsipkan</Pill> : <StatusPill status={r.active ? 'ACTIVE' : 'INACTIVE'} /> }
            ]} onRow={(r) => <div className="row master-data-action-row"><Btn size="sm" disabled={r.role === 'DEVELOPER' && !isDeveloper} onClick={() => setForm({ id: r.id, username: r.username, fullName: r.fullName, password: '', role: r.role, cardStatus: r.cardStatus })}>Edit</Btn><Btn size="sm" disabled={!r.active || Boolean(r.archivedAt)} onClick={() => downloadUserCard(r)}><CreditCard size={12} /> Kartu</Btn>{r.active ? <Btn size="sm" variant="danger" disabled={Boolean(r.archivedAt) || r.role === 'DEVELOPER' && !isDeveloper} onClick={() => deactivate(r)}>Nonaktifkan</Btn> : !r.archivedAt && <Btn size="sm" onClick={() => activate(r)}>Aktifkan Lagi</Btn>}<Btn size="sm" variant="danger" disabled={Boolean(r.archivedAt) || !['SISWA', 'GURU_MAPEL', 'GURU_PIKET', 'KEPALA_SEKOLAH'].includes(r.role)} onClick={() => openDeletePreview([r.id])}>Hapus Akun</Btn>{isDeveloper && <Btn size="sm" variant="danger" onClick={() => permanentDelete(r)}>Hapus Permanen</Btn>}</div>} />
          </div>
          <Pagination meta={metaOf(state.data)} onPage={setPage} />
          {(state.data?.meta?.totalPages || 1) > 1 && (search || roleFilter !== 'ALL') && <p className="muted">Pencarian dan filter peran hanya berlaku pada halaman ini. Pindah halaman jika akun yang dicari belum terlihat.</p>}
        </Card>
        {deleteResult && <Card title="Ringkasan hapus akun" sub="PIN tidak ditampilkan atau disimpan di layar ini."><div className="row"><Pill tone="ok">Hard delete: {deleteResult.hardDeletedCount}</Pill><Pill tone="warn">Diarsipkan: {deleteResult.archivedCount}</Pill><Pill>Ditolak: {deleteResult.rejectedCount}</Pill></div></Card>}
      </div>

      {deletePreview && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="account-delete-title">
        <div className="modal-card account-delete-modal">
          <h2 id="account-delete-title">Konfirmasi Hapus Akun</h2>
          <p className="muted">Preview ini belum mengubah data. Akun dengan riwayat akan diarsipkan agar hilang dari daftar aktif namun data laporan tetap aman.</p>
          <div className="row"><Pill>Target: {deletePreview.requestedCount}</Pill><Pill tone="ok">Hard delete: {deletePreview.summary?.hardDeleteCount || 0}</Pill><Pill tone="warn">Arsip: {deletePreview.summary?.archiveCount || 0}</Pill><Pill tone={deletePreview.summary?.rejectedCount ? 'bad' : ''}>Ditolak: {deletePreview.summary?.rejectedCount || 0}</Pill></div>
          <div className="account-delete-preview-list">
            {deletePreview.items.map((item) => <div key={item.userId} className="account-delete-preview-row"><div><b>{item.fullName}</b><span className="mono">{item.username}</span></div><StatusPill status={item.role} /><Pill tone={item.action === 'HARD_DELETE' ? 'ok' : item.action === 'ARCHIVE' ? 'warn' : 'bad'}>{item.action}</Pill>{item.dependencyReasons?.length > 0 && <small>{item.dependencyReasons.slice(0, 3).join(' · ')}</small>}{item.warnings?.map((warning) => <small key={warning} className="warn-text">{warning}</small>)}{item.rejectReasons?.map((reason) => <small key={reason} className="bad-text">{reason}</small>)}</div>)}
          </div>
          <div className="form-grid">
            <Field label="Mode"><SelectInput value={deleteForm.mode} onChange={(e) => setDeleteForm((prev) => ({ ...prev, mode: e.target.value }))}><option value="auto">Auto: hard delete jika aman, selain itu arsip</option><option value="archive-only">Archive-only</option><option value="hard-delete-only-if-safe">Hard delete hanya jika semua aman</option></SelectInput></Field>
            <Field label="Alasan" hint="minimal 10 karakter"><TextInput value={deleteForm.reason} onChange={(e) => setDeleteForm((prev) => ({ ...prev, reason: e.target.value }))} minLength={10} required /></Field>
            <Field label="PIN konfirmasi"><TextInput type="password" inputMode="numeric" autoComplete="off" value={deleteForm.pin} onChange={(e) => setDeleteForm((prev) => ({ ...prev, pin: e.target.value.replace(/\D/g, '').slice(0, 12) }))} required /></Field>
            <Field label="Ketik HAPUS AKUN"><TextInput value={deleteForm.confirmText} onChange={(e) => setDeleteForm((prev) => ({ ...prev, confirmText: e.target.value }))} required /></Field>
          </div>
          <label className="row" style={{ gap: 8, margin: '12px 0' }}><input type="checkbox" checked={deleteForm.understood} onChange={(e) => setDeleteForm((prev) => ({ ...prev, understood: e.target.checked }))} /> Saya paham tindakan ini tidak boleh dilakukan sembarangan.</label>
          <div className="row" style={{ justifyContent: 'flex-end' }}><Btn type="button" variant="ghost" disabled={deleteWorking} onClick={closeDeleteModal}>Batal</Btn><Btn type="button" variant="danger" loading={deleteWorking} disabled={Boolean(deletePreview.summary?.rejectedCount)} onClick={executeAccountDelete}>Konfirmasi Hapus Akun</Btn></div>
        </div>
      </div>}
    </div>
  );
}


const ACCOUNT_SLIP_ALLOWED_ROLES = new Set(['SISWA', 'GURU_MAPEL', 'GURU_PIKET', 'KEPALA_SEKOLAH']);
const ACCOUNT_SLIP_LOGIN_URL = 'https://absensi.man1rokanhulu.cloud';

function AccountLoginSlipPanel({ notify }) {
  const currentUser = readStoredUser();
  const canGenerate = ['ADMIN_TU', 'DEVELOPER'].includes(currentUser?.role);
  const users = useRemote(() => apiFetch('/identity/users?page=1&limit=200'), []);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState([]);
  const [reason, setReason] = useState('Cetak lembar akun login awal.');
  const [revokeSessions, setRevokeSessions] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [slipResult, setSlipResult] = useState(null);
  const normalizedSearch = search.trim().toLowerCase();
  const eligibleUsers = itemsOf(users.data).filter((user) => user.active && ACCOUNT_SLIP_ALLOWED_ROLES.has(user.role));
  const filteredUsers = eligibleUsers.filter((user) => {
    const roleMatches = roleFilter === 'ALL' || user.role === roleFilter;
    const searchMatches = !normalizedSearch || `${user.fullName || ''} ${user.username || ''}`.toLowerCase().includes(normalizedSearch);
    return roleMatches && searchMatches;
  });
  const selectedSet = new Set(selectedIds);
  const selectedCount = selectedIds.length;
  const selectedPreview = eligibleUsers.filter((user) => selectedSet.has(user.id));

  function toggleUser(userId) {
    setSlipResult(null);
    setSelectedIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : current.length >= 50 ? current : [...current, userId]);
  }

  function clearSlips() {
    setSlipResult(null);
    setSelectedIds([]);
  }

  async function generateSlips() {
    if (!canGenerate) return notify('Lembar akun login hanya boleh dibuat Admin TU atau Developer.', 'bad');
    if (!selectedCount) return notify('Pilih minimal satu pengguna.', 'warn');
    if (selectedCount > 50) return notify('Maksimal 50 pengguna per batch.', 'warn');
    if (reason.trim().length < 10) return notify('Alasan wajib minimal 10 karakter.', 'warn');
    const ok = await riskConfirm(`Generate password awal untuk ${selectedCount} akun? Password hanya tampil sekali di layar ini. Cetak lalu hapus dari layar.`, 'Generate Lembar Akun');
    if (!ok) return;
    setGenerating(true);
    try {
      const data = await apiFetch('/identity/account-slips/generate', {
        method: 'POST',
        body: JSON.stringify({ userIds: selectedIds, reason: reason.trim(), revokeSessions })
      });
      setSlipResult(data);
      notify(`${data.slips?.length || 0} lembar akun siap dicetak. Hapus dari layar setelah selesai.`, 'ok');
    } catch (error) {
      notify(error.message || 'Lembar akun belum bisa dibuat.', 'bad');
    } finally {
      setGenerating(false);
    }
  }

  function printSlips() {
    window.print();
  }

  if (!canGenerate) {
    return <Card title="Lembar Akun Login" sub="Fitur ini hanya untuk Admin TU dan Developer." actions={<Pill tone="bad">Terbatas</Pill>}><SimpleHelpBox title="Akses ditolak" items={['Operator IT tidak dapat generate password awal.', 'Minta Admin TU/Developer membuat lembar akun jika diperlukan.']} /></Card>;
  }

  return <div className="account-slip-workspace"><Card title="Lembar Akun Login" sub="Generate password awal untuk akun existing. Password tidak masuk QR, localStorage, audit, atau database plaintext." actions={<Pill tone="warn">Sekali tampil</Pill>}><SimpleHelpBox title="Aturan aman" items={['Hanya pilih akun aktif SISWA, GURU_MAPEL, GURU_PIKET, atau KEPALA_SEKOLAH.', 'Password awal tampil di slip dan disarankan diganti setelah login.', 'Cetak/simpan PDF via browser print, lalu klik Hapus dari layar.']} /><div className="master-data-toolbar compact"><Field label="Cari nama/username"><TextInput value={search} placeholder="contoh: siswa.test" onChange={(e) => setSearch(e.target.value)} /></Field><Field label="Peran"><SelectInput value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="ALL">Semua target</option><option value="SISWA">Siswa</option><option value="GURU_MAPEL">Guru Mapel</option><option value="GURU_PIKET">Guru Piket</option><option value="KEPALA_SEKOLAH">Kepala Sekolah</option></SelectInput></Field><Field label="Alasan"><TextInput value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div><label className="account-slip-checkbox"><input type="checkbox" checked={revokeSessions} onChange={(event) => setRevokeSessions(event.target.checked)} /> Cabut sesi aktif setelah password awal digenerate</label><div className="master-data-table-region account-slip-user-list"><DataTable rows={filteredUsers} columns={[{ header: 'Pilih', render: (r) => <input aria-label={`Pilih ${r.fullName}`} type="checkbox" checked={selectedSet.has(r.id)} onChange={() => toggleUser(r.id)} /> }, { header: 'Nama', render: (r) => <span className="row master-data-user-cell"><Avatar name={r.fullName} size="sm" /> <span>{r.fullName}</span></span> }, { header: 'Username', render: (r) => <span className="mono">{r.username}</span> }, { header: 'Peran', render: (r) => <StatusPill status={r.role} /> }]} /></div><div className="row account-slip-actions"><Pill>{selectedCount}/50 dipilih</Pill><Btn type="button" variant="primary" loading={generating} disabled={!selectedCount || generating} onClick={generateSlips}><KeyRound size={14} /> Generate Lembar Akun</Btn><Btn type="button" variant="ghost" disabled={!selectedCount && !slipResult} onClick={clearSlips}>Hapus dari layar</Btn></div>{selectedPreview.length > 0 && <p className="muted">Dipilih: {selectedPreview.slice(0, 4).map((user) => user.fullName).join(', ')}{selectedPreview.length > 4 ? ` +${selectedPreview.length - 4} lainnya` : ''}</p>}</Card>{slipResult?.slips?.length > 0 && <Card title="Preview Cetak" sub="Gunakan print browser untuk PDF. Jangan bagikan file mentah ke kanal publik." actions={<div className="row"><Btn size="sm" onClick={printSlips}><FileText size={14} /> Cetak / Simpan PDF</Btn><Btn size="sm" variant="ghost" onClick={clearSlips}>Hapus dari layar</Btn></div>}><div className="account-slip-print-area" data-testid="account-slip-print-area">{slipResult.slips.map((slip) => <article className="account-login-slip" key={slip.userId}><div className="account-login-slip__header"><strong>LEMBAR AKUN LOGIN</strong><span>{statusLabel(slip.role)}</span></div><dl><div><dt>Nama</dt><dd>{slip.fullName}</dd></div><div><dt>Username</dt><dd className="mono">{slip.username}</dd></div><div><dt>Password awal</dt><dd className="mono account-login-slip__password">{slip.initialPassword}</dd></div><div><dt>URL Login</dt><dd>{ACCOUNT_SLIP_LOGIN_URL}</dd></div></dl><p>Disarankan ganti password setelah login. Jangan tempel password pada kartu/QR.</p></article>)}</div></Card>}</div>;
}

function normalizeField(field) {
  if (Array.isArray(field)) return { key: field[0], label: field[1], required: true };
  return { required: true, ...field };
}

function SimpleCreatePanel({ title, path, fields, columns, notify, empty }) {
  const fieldSpecs = fields.map(normalizeField);
  const initial = { id: '', ...Object.fromEntries(fieldSpecs.map(({ key }) => [key, ''])) };
  const [form, set, reset, setForm] = useForm(initial);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const state = useRemote(() => apiFetch(`${path}?page=1&limit=200`), [path]);
  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError('');
    const payload = Object.fromEntries(fieldSpecs.filter((field) => !(form.id && field.omitOnEdit)).map(({ key }) => [key, form[key]]));
    try {
      if (form.id) await apiFetch(`${path}/${form.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await apiFetch(path, { method: 'POST', body: JSON.stringify(payload) });
      reset(initial);
      state.refresh();
      notify(`${title} ${payload.name || payload.code || ''} berhasil disimpan.`.replace(/\s+/g, ' ').trim());
    } catch (error) {
      const message = error.message || `${title} belum bisa disimpan.`;
      setFormError(message);
      notify(message, 'bad');
    } finally {
      setSubmitting(false);
    }
  }
  function editRow(row) {
    setForm({ ...initial, ...Object.fromEntries(fieldSpecs.map(({ key, type }) => [key, type === 'date' ? dateInputValue(row[key]) : row[key] || ''])), id: row.id });
    setFormError('');
  }
  return <div className="master-data-layout"><div className="master-data-form-panel"><Card title={`${form.id ? 'Edit' : 'Tambah'} ${title}`}><form onSubmit={submit} className="form-grid">{fieldSpecs.map((field) => <Field key={field.key} label={field.label} hint={field.hint || (field.required ? 'wajib' : undefined)}>{field.type === 'select' ? <SelectInput value={form[field.key]} onChange={(e) => set(field.key, e.target.value)} required={field.required !== false} disabled={submitting || field.disabled || (Boolean(form.id) && field.disableOnEdit)}><option value="">{field.placeholder || `Pilih ${String(field.label).toLowerCase()}`}</option>{(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectInput> : <TextInput type={field.type} value={form[field.key]} placeholder={field.placeholder || `Isi ${String(field.label).toLowerCase()}`} onChange={(e) => set(field.key, e.target.value)} required={field.required !== false} disabled={submitting || field.disabled || (Boolean(form.id) && field.disableOnEdit)} />}</Field>)}{formError && <div className="inline-error" role="alert"><AlertTriangle size={14} /> {formError}</div>}<Btn type="submit" variant="primary" loading={submitting} disabled={submitting}><Save size={14} /> Simpan</Btn>{form.id && <Btn type="button" variant="ghost" disabled={submitting} onClick={() => { reset(initial); setFormError(''); }}>Batal edit</Btn>}</form></Card></div><div className="master-data-list-panel"><Card title={`Daftar ${title}`}><div className="master-data-table-region"><AsyncTable state={state} empty={empty} columns={columns} onRow={(r) => <Btn type="button" size="sm" onClick={() => editRow(r)}>Edit</Btn>} /></div></Card></div></div>;
}

function SemesterPanel({ notify }) {
  const years = useRemote(() => apiFetch('/academic/years?page=1&limit=100'), []);
  const yearOptions = itemsOf(years.data).map((year) => ({ value: year.id, label: `${year.name || year.code}${year.code ? ` · ${year.code}` : ''} · ${year.active ? 'aktif' : 'nonaktif'}` }));
  return <SimpleCreatePanel title="Semester" path="/academic/semesters" fields={[{ key: 'academicYearId', label: 'Tahun Ajaran', type: 'select', placeholder: years.loading ? 'Memuat tahun ajaran…' : 'Pilih tahun ajaran', options: yearOptions, disabled: years.loading, disableOnEdit: true, omitOnEdit: true, hint: 'pilih dari daftar' }, { key: 'code', label: 'Kode Semester', placeholder: 'contoh: GANJIL' }, { key: 'name', label: 'Nama Semester', placeholder: 'contoh: Semester Ganjil' }, { key: 'startsAt', label: 'Mulai Semester', type: 'date', hint: 'wajib; harus berada dalam tahun ajaran' }, { key: 'endsAt', label: 'Selesai Semester', type: 'date', hint: 'wajib; server memvalidasi batas periode' }]} notify={notify} empty={{ title: 'Belum ada semester untuk tahun ajaran yang dipilih.', sub: 'Pilih tahun ajaran lalu tambahkan semester.' }} columns={[{ header: 'Tahun', render: (r) => r.academicYear?.name || r.academicYear?.code || '—' }, { header: 'Kode', key: 'code' }, { header: 'Nama', key: 'name' }, { header: 'Periode', render: (r) => `${dateInputValue(r.startsAt) || '—'} s.d. ${dateInputValue(r.endsAt) || '—'}` }]} />;
}

function StudentsPanel() {
  const classes = useRemote(() => apiFetch('/academic/classes?page=1&limit=200'), []);
  const [classId, setClassId] = useState('');
  const students = useRemote(() => apiFetch(`/academic/students${qs({ classId, page: 1, limit: 200 })}`), [classId]);
  const empty = classId
    ? { title: 'Belum ada siswa di kelas yang dipilih.', sub: 'Ubah filter kelas atau daftarkan siswa secara manual.' }
    : { title: 'Belum ada siswa.', sub: 'Import siswa atau buat akun siswa lalu daftarkan ke kelas.' };
  return <Card title="Daftar Siswa" sub="Filter dan verifikasi keanggotaan kelas."><div className="master-data-toolbar compact"><Field label="Filter kelas"><SelectInput value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Semua kelas</option>{itemsOf(classes.data).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</SelectInput></Field></div><div className="master-data-table-region"><AsyncTable state={students} empty={empty} columns={[{ header: 'Nama', render: (r) => r.fullName || r.student?.fullName }, { header: 'Nama akun', render: (r) => r.username || r.student?.username }, { header: 'Kelas', render: (r) => r.classCode || r.schoolClass?.code || '—' }, { header: 'Kartu', render: (r) => <StatusPill status={r.cardStatus || r.student?.cardStatus} /> }]} /></div></Card>;
}

function EnrollPanel({ notify }) {
  const users = useRemote(() => apiFetch('/identity/users?page=1&limit=300'), []);
  const classes = useRemote(() => apiFetch('/academic/classes?page=1&limit=200'), []);
  const years = useRemote(() => apiFetch('/academic/years?page=1&limit=100'), []);
  const semesters = useRemote(() => apiFetch('/academic/semesters?page=1&limit=100'), []);
  const [form, set] = useForm({ userId: '', classId: '', academicYearId: '', semesterId: '', effectiveFrom: today() });
  const history = useRemote(() => form.userId ? apiFetch(`/academic/students/${form.userId}/enrollments`) : Promise.resolve([]), [form.userId]);
  async function submit(e) {
    e.preventDefault();
    await apiFetch('/academic/enrollments/transfer', { method: 'POST', body: JSON.stringify({ ...form, academicYearId: form.academicYearId || undefined, semesterId: form.semesterId || undefined }) });
    history.refresh();
    notify('Pendaftaran/transfer siswa berhasil disimpan.');
  }
  return <div className="grid g-2"><Card title="Pendaftaran / Transfer Kelas" sub="Riwayat lama ditutup otomatis dan periode baru dibuat sesuai tanggal berlaku."><form className="form-grid" onSubmit={submit}><Field label="Siswa"><SelectInput value={form.userId} onChange={(e) => set('userId', e.target.value)} required><option value="">Pilih siswa</option>{itemsOf(users.data).filter((u) => u.role === 'SISWA').map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</SelectInput></Field><Field label="Kelas"><SelectInput value={form.classId} onChange={(e) => set('classId', e.target.value)} required><option value="">Pilih kelas</option>{itemsOf(classes.data).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</SelectInput></Field><Field label="Tahun Ajaran"><SelectInput value={form.academicYearId} onChange={(e) => set('academicYearId', e.target.value)}><option value="">Gunakan tahun aktif</option>{itemsOf(years.data).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</SelectInput></Field><Field label="Semester"><SelectInput value={form.semesterId} onChange={(e) => set('semesterId', e.target.value)}><option value="">Gunakan semester aktif</option>{itemsOf(semesters.data).filter((s) => !form.academicYearId || s.academicYearId === form.academicYearId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput></Field><Field label="Mulai berlaku"><TextInput type="date" value={form.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)} required /></Field><Btn variant="primary"><Save size={14} /> Simpan transfer</Btn></form></Card><Card title="Riwayat Kelas Siswa" sub="Riwayat memakai periode efektif, bukan kelas aktif saat ini.">{history.loading ? <LoadingState /> : history.error ? <ErrorState error={history.error} onRetry={history.refresh} /> : <DataTable rows={itemsOf(history.data)} columns={[{ header: 'Mulai', render: (r) => formatDateTime(r.effectiveFrom) }, { header: 'Selesai', render: (r) => r.effectiveTo ? formatDateTime(r.effectiveTo) : 'Aktif' }, { header: 'Kelas', render: (r) => r.schoolClass?.code || r.classId }, { header: 'Tahun', render: (r) => r.academicYear?.name || '—' }, { header: 'Semester', render: (r) => r.semester?.name || '—' }]} />}</Card></div>;
}

function StudentImportPanel({ notify }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ source: 'student-class', academicYear: '2026/2027', updateExisting: true, resetPasswordForExisting: false, reason: 'Import data sekolah awal SIAB2.', confirmText: '' });
  const isStudentImport = form.source === 'student-class';
  const summary = preview?.summary || result?.summary || {};
  const rows = preview?.rows || result?.rows || [];
  const resultCounts = result?.result || result || {};
  function set(key, value) { setForm((current) => ({ ...current, [key]: value })); }
  function formData() {
    const data = new FormData();
    if (file) data.append('file', file);
    data.append('source', form.source);
    data.append('academicYear', form.academicYear);
    data.append('updateExisting', String(Boolean(form.updateExisting)));
    data.append('resetPasswordForExisting', String(Boolean(form.resetPasswordForExisting)));
    data.append('reason', form.reason);
    data.append('confirmText', form.confirmText);
    return data;
  }
  function downloadTemplate() {
    const template = isStudentImport
      ? [{ username: 'siswa.0001', fullName: 'NAMA SISWA CONTOH', nis: '1234567890', nkd: '0001', classCode: 'XII A', className: 'XII A', yearLabel: '2026/2027', role: 'SISWA' }]
      : [{ NIP: '198001012006041001', 'NAMA LENGKAP': 'NAMA GURU CONTOH', 'TIPE USER': 'guru', 'TANGGAL LAHIR': '1980-01-01' }];
    downloadCsvFile(template, `template-import-data-sekolah-${today()}.csv`);
  }
  function downloadSlips(slips) {
    const safeRows = (slips || []).map((row) => ({ Nama: row.fullName, Username: row.username, PasswordAwal: row.initialPassword || row.temporaryPassword, Role: row.role || 'SISWA', Kelas: row.classCode || '' }));
    if (safeRows.length) downloadCsvFile(safeRows, `lembar-akun-import-${today()}.csv`);
  }
  async function previewImport() {
    setLoading(true);
    setResult(null);
    try {
      const endpoint = isStudentImport ? '/academic/students/import/file/preview' : '/identity/school-import/file/preview';
      const data = await apiFetch(endpoint, { method: 'POST', body: formData() });
      setPreview(data);
      notify(`${data.summary?.valid || 0} baris valid, ${data.summary?.invalid || 0} perlu diperbaiki.`, data.summary?.invalid ? 'warn' : 'ok');
    } finally { setLoading(false); }
  }
  async function commitImport() {
    if (!preview) return notify('Preview file dulu sebelum commit.', 'warn');
    if (preview.summary?.invalid > 0) return notify('Masih ada baris invalid. Perbaiki file dulu.', 'warn');
    if (form.confirmText !== 'IMPORT DATA SEKOLAH') return notify('Ketik IMPORT DATA SEKOLAH untuk konfirmasi.', 'warn');
    if (!await riskConfirm('Commit import data sekolah? Password awal akan tampil sekali dan QR tetap dibuat manual setelah review.', 'Commit Import')) return;
    setLoading(true);
    try {
      const endpoint = isStudentImport ? '/academic/students/import/file/commit' : '/identity/school-import/file/commit';
      const data = await apiFetch(endpoint, { method: 'POST', body: formData() });
      const credentials = data.credentialRows || data.slips || [];
      if (data.committed) {
        downloadSlips(credentials);
        const { credentialRows: _credentialRows, slips: _slips, ...sanitizedData } = data;
        setResult(sanitizedData);
        const counts = data.result || data;
        notify(`Import selesai: ${counts.createdUsers ?? counts.createdCount ?? 0} akun baru, ${counts.existingUsers ?? counts.updatedCount ?? 0} existing, QR belum dibuat.`, 'ok');
      } else {
        setResult(data);
        notify('Import belum disimpan karena masih ada kesalahan.', 'warn');
      }
    } finally { setLoading(false); }
  }
  return <Card title="Import Data Sekolah SIAB2" sub="Upload CSV/XLSX siswa, guru, dan tenaga kependidikan. Password sumber diabaikan; SIAB2 membuat password awal 14 karakter dan QR dibuat manual setelah review."><div className="import-upload-grid"><Field label="Jenis sumber"><SelectInput value={form.source} onChange={(e) => { set('source', e.target.value); setPreview(null); setResult(null); }}><option value="student-class">File kelas siswa XLSX/CSV</option><option value="staff">File guru & tenaga kependidikan</option><option value="legacy-siab1">CSV SIAB1 lama untuk referensi</option></SelectInput></Field><Field label="Tahun ajaran"><TextInput value={form.academicYear} onChange={(e) => set('academicYear', e.target.value)} placeholder="2026/2027" /></Field><Field label="File CSV/XLSX"><TextInput type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setResult(null); }} /></Field><div className="import-action-row"><Btn type="button" variant="ghost" onClick={downloadTemplate}><Download size={14} /> Template</Btn><Btn type="button" disabled={!file || loading} loading={loading} onClick={previewImport}><Eye size={14} /> Preview</Btn><Btn type="button" variant="primary" disabled={!file || !preview || preview.summary?.invalid > 0 || loading} loading={loading} onClick={commitImport}><Save size={14} /> Commit Import</Btn></div></div><div className="form-grid" style={{ marginTop: 12 }}>{!isStudentImport && <><label className="checkline"><input type="checkbox" checked={Boolean(form.updateExisting)} onChange={(e) => set('updateExisting', e.target.checked)} /> Update data akun existing tanpa reset password</label><label className="checkline"><input type="checkbox" checked={Boolean(form.resetPasswordForExisting)} onChange={(e) => set('resetPasswordForExisting', e.target.checked)} /> Reset password existing juga</label></>}<Field label="Alasan commit" hint="minimal 10 karakter"><TextInput value={form.reason} onChange={(e) => set('reason', e.target.value)} /></Field><Field label="Ketik IMPORT DATA SEKOLAH"><TextInput value={form.confirmText} onChange={(e) => set('confirmText', e.target.value)} /></Field></div><SimpleHelpBox title="Aturan aman import" items={["Kolom Password dari SIAB1/file lama diabaikan total.", "Password awal dibuat server-side format mudah diingat 14 karakter dan hanya tampil sekali.", isStudentImport ? "Akun siswa existing tidak direset melalui jalur import ini." : "Akun existing direset hanya jika opsi reset dipilih.", "QR tidak dibuat otomatis; generate QR manual setelah data direview."]} />{(preview || result) && <div style={{ marginTop: 16 }}><div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}><Pill tone="ok">Valid {summary.valid ?? 0}</Pill><Pill tone={summary.invalid ? 'bad' : 'ok'}>Invalid {summary.invalid ?? 0}</Pill><Pill>Total {summary.total ?? 0}</Pill><Pill>Buat {summary.actions?.create ?? summary.newUsers ?? resultCounts.createdUsers ?? resultCounts.createdCount ?? 0}</Pill><Pill>Update {summary.actions?.update ?? summary.existingUsers ?? resultCounts.existingUsers ?? resultCounts.updatedCount ?? 0}</Pill><Pill>Skip {summary.actions?.skip ?? resultCounts.skippedCount ?? 0}</Pill><Pill>Password baru {summary.generatedPasswordCount ?? summary.generatedPasswords ?? result?.credentialRows?.length ?? result?.slips?.length ?? 0}</Pill><Pill>QR manual</Pill></div><DataTable rows={rows.slice(0, 200)} columns={[{ header: 'Baris', key: 'index' }, { header: 'Nama', key: 'fullName' }, { header: 'Username', key: 'username' }, { header: 'NKD', render: (r) => r.nkd || '—' }, { header: 'Role', render: (r) => <StatusPill status={r.role} /> }, { header: 'Kelas/NIP', render: (r) => r.classCode || r.nip || '—' }, { header: 'Aksi', render: (r) => <Pill tone={r.action === 'invalid' ? 'bad' : r.action === 'create' ? 'ok' : r.action === 'update' ? 'warn' : ''}>{r.action || '—'}</Pill> }, { header: 'Catatan', render: (r) => [...(r.errors || []), ...(r.warnings || [])].slice(0, 2).join(' · ') || 'Aman' }]} />{rows.length > 200 && <p className="muted">Menampilkan 200 baris pertama dari {rows.length} baris.</p>}</div>}{result?.committed && <div style={{ marginTop: 16 }}><SimpleHelpBox title="Import selesai" items={[`${resultCounts.createdUsers ?? resultCounts.createdCount ?? 0} akun baru dibuat.`, `${resultCounts.existingUsers ?? resultCounts.updatedCount ?? 0} akun existing diproses.`, `${resultCounts.enrollments ?? resultCounts.enrollmentsCreated ?? 0} enrollment dibuat, ${resultCounts.enrollmentsUpdated ?? 0} dipindah kelas.`, 'Lembar akun sudah diunduh sekali. Password awal tidak disimpan di halaman ini.', 'Lanjut generate QR manual setelah review data.']} /></div>}</Card>;
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
  return <Card title="Impor CSV/XLSX" sub="Unggah file, periksa hasilnya, lalu simpan. Kolom file pengguna: username (nama akun), fullName (nama lengkap), role (peran), password (kata sandi). Kolom akademik: type, code, name, yearLabel, username, classCode."><div className="import-upload-grid import-upload-grid-advanced"><Field label="Target"><SelectInput value={target} onChange={(e) => { setTarget(e.target.value); setFile(null); setPreview(null); }}><option value="users">Pengguna</option><option value="academic">Kelas/Mapel/Pendaftaran</option></SelectInput></Field><Field label="File CSV/XLSX"><TextInput type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }} /></Field><div className="import-action-row"><Btn type="button" disabled={!file || loading} loading={loading} onClick={previewImport}><Eye size={14} /> Periksa</Btn><Btn type="button" variant="primary" disabled={!file || !preview || preview.summary?.invalid > 0 || loading} loading={loading} onClick={commitImport}><Save size={14} /> Simpan impor</Btn></div></div>{preview && <div style={{ marginTop: 16 }}><div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}><Pill tone="ok">Valid {preview.summary?.valid ?? 0}</Pill><Pill tone="bad">Kesalahan {preview.summary?.invalid ?? 0}</Pill><Pill>Total {preview.summary?.total ?? 0}</Pill></div><DataTable rows={preview.rows || preview.items || []} columns={[{ header: 'Baris', key: 'index' }, { header: 'Data', render: (r) => r.username || r.code || r.classCode || '—' }, { header: 'Kesalahan', render: (r) => r.errors?.join(', ') || 'Aman' }]} /></div>}</Card>;
}

const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidDateInputLiteral(value) {
  const match = String(value).match(DATE_INPUT_PATTERN);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime())
    && parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() + 1 === month
    && parsed.getUTCDate() === day;
}

function dateInputValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' && DATE_INPUT_PATTERN.test(value)) return isValidDateInputLiteral(value) ? value : '';
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(parsed);
  const valueFor = (type) => parts.find((part) => part.type === type)?.value || '';
  const year = valueFor('year');
  const month = valueFor('month');
  const day = valueFor('day');
  return year && month && day ? `${year}-${month}-${day}` : '';
}

function localDateFromDateTime(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/);
  return match && isValidDateInputLiteral(match[1]) ? match[1] : '';
}

function localTimeFromDateTime(value, fallback) {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)$/);
  return match ? match[1] : fallback;
}

function sessionAssignmentDateError(assignment, startsAt, endsAt, pageDate) {
  if (!assignment) return '';
  const scheduleDate = dateInputValue(pageDate);
  const startsOn = localDateFromDateTime(startsAt);
  const endsOn = localDateFromDateTime(endsAt);
  const effectiveFrom = dateInputValue(assignment.effectiveFrom);
  const effectiveTo = dateInputValue(assignment.effectiveTo);
  if (!scheduleDate || !startsOn || !endsOn) return 'Tanggal dan waktu sesi harus valid.';
  if ((effectiveFrom && scheduleDate < effectiveFrom) || (effectiveTo && scheduleDate > effectiveTo)) return 'Tanggal jadwal di luar masa berlaku penugasan.';
  if ((effectiveFrom && (startsOn < effectiveFrom || endsOn < effectiveFrom)) || (effectiveTo && (startsOn > effectiveTo || endsOn > effectiveTo))) return 'Waktu sesi di luar masa berlaku penugasan.';
  if (startsOn !== endsOn) return 'Mulai dan selesai sesi harus pada tanggal yang sama.';
  if (startsOn !== scheduleDate || endsOn !== scheduleDate) return 'Waktu sesi harus sesuai tanggal jadwal.';
  return '';
}

function teachingAssignmentLabel(assignment) {
  if (!assignment) return 'Pilih penugasan mengajar';
  const teacher = assignment.teacher?.fullName || assignment.teacherId;
  const subject = assignment.subject?.name || assignment.subjectId;
  const schoolClass = assignment.schoolClass?.code || assignment.classId;
  const academicYear = assignment.academicYear?.code || assignment.academicYear?.name || assignment.academicYearId;
  const semester = assignment.semester?.name || assignment.semester?.code || assignment.semesterId;
  return [teacher, subject, schoolClass, academicYear, semester].filter(Boolean).join(' · ');
}

function TeachingAssignmentSummary({ assignment, empty = 'Pilih penugasan aktif untuk mengisi data kelas, mapel, guru, dan periode secara otomatis.' }) {
  if (!assignment) return <SimpleHelpBox title="Sumber jadwal" items={[empty]} />;
  const period = `${dateInputValue(assignment.effectiveFrom) || '—'}${assignment.effectiveTo ? ` s.d. ${dateInputValue(assignment.effectiveTo)}` : ' s.d. akhir penugasan'}`;
  return <SimpleHelpBox title="Data dari penugasan" items={[]}><div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><Pill tone="info">{assignment.teacher?.fullName || assignment.teacherId}</Pill><Pill>{assignment.subject?.name || assignment.subjectId}</Pill><Pill>{assignment.schoolClass?.code || assignment.classId}</Pill><Pill>{assignment.academicYear?.code || assignment.academicYear?.name || assignment.academicYearId} · {assignment.semester?.name || assignment.semester?.code || assignment.semesterId}</Pill><Pill tone="ok">{period}</Pill></div></SimpleHelpBox>;
}

function weeklyGenerationBlocker(schedule) {
  if (!schedule.academicYearId || !schedule.semesterId || !schedule.teachingAssignmentId || !schedule.effectiveTo) return 'Perlu dilengkapi';
  if (schedule.active === false) return 'Jadwal nonaktif';
  if (schedule.teachingAssignment?.active === false) return 'Penugasan nonaktif';
  return '';
}

function WeeklyGenerateAction({ schedule, onGenerate, loading, pending }) {
  const blocker = weeklyGenerationBlocker(schedule);
  if (!blocker) return <Btn type="button" size="sm" loading={loading} disabled={pending} onClick={() => onGenerate(schedule)}>Buat sesi tanggal ini</Btn>;
  const legacy = blocker === 'Perlu dilengkapi';
  return <div><Btn type="button" size="sm" disabled aria-label={blocker}>{blocker}</Btn><small className="muted" style={{ display: 'block', marginTop: 4 }}>{legacy ? 'Periode atau penugasan belum lengkap.' : 'Lengkapi atau aktifkan data sebelum membuat sesi.'}</small></div>;
}

export function SchedulePage({ notify }) {
  const classes = useRemote(() => fetchAllPages('/academic/classes'), []);
  const subjects = useRemote(() => fetchAllPages('/academic/subjects'), []);
  const users = useRemote(() => fetchAllPages('/identity/users'), []);
  const rooms = useRemote(() => fetchAllPages('/academic/rooms'), []);
  const academicYears = useRemote(() => fetchAllPages('/academic/years'), []);
  const semesters = useRemote(() => fetchAllPages('/academic/semesters'), []);
  const assignments = useRemote(() => fetchAllPages('/schedules/assignments'), []);
  const [date, setDate] = useState(today());
  const sessions = useRemote(() => apiFetch(`/schedules/sessions${qs({ date, page: 1, limit: 200 })}`), [date]);
  const weekly = useRemote(() => fetchAllPages('/schedules/weekly'), []);
  const assignmentInitial = { id: '', teacherId: '', subjectId: '', classId: '', academicYearId: '', semesterId: '', effectiveFrom: today(), effectiveTo: '', active: true };
  const [assignmentForm, setAssignment, resetAssignment, replaceAssignment] = useForm(assignmentInitial);
  const [sessionForm, setSession, resetSession, replaceSession] = useForm({ teachingAssignmentId: '', startsAt: `${today()}T07:15`, endsAt: `${today()}T08:45` });
  const [weeklyForm, setWeekly, resetWeekly, replaceWeekly] = useForm({ teachingAssignmentId: '', roomId: '', dayOfWeek: '1', startTime: '07:15', endTime: '08:45', effectiveFrom: today(), effectiveTo: '' });
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [sessionSaving, setSessionSaving] = useState(false);
  const [weeklySaving, setWeeklySaving] = useState(false);
  const [generatingId, setGeneratingId] = useState('');
  const generatingRef = useRef(false);
  const mountedRef = useRef(true);
  const [assignmentError, setAssignmentError] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [weeklyError, setWeeklyError] = useState('');
  const activeAssignments = itemsOf(assignments.data).filter((assignment) => assignment.active === true && assignment.teacher?.active === true && assignment.teacher?.role === 'GURU_MAPEL');
  const selectedSessionAssignment = activeAssignments.find((assignment) => assignment.id === sessionForm.teachingAssignmentId);
  const selectedWeeklyAssignment = activeAssignments.find((assignment) => assignment.id === weeklyForm.teachingAssignmentId);
  const selectedAssignmentSemesters = itemsOf(semesters.data).filter((semester) => semester.academicYearId === assignmentForm.academicYearId);
  const assignmentLoaders = [classes, subjects, users, academicYears, semesters];
  const assignmentLoaderError = assignmentLoaders.find((state) => state.error)?.error || '';
  const assignmentLoaderPending = assignmentLoaders.some((state) => state.loading);
  const assignmentFormUnavailable = Boolean(assignmentLoaderError || assignmentLoaderPending);
  const sessionLoaderError = assignments.error || '';
  const sessionFormUnavailable = Boolean(sessionLoaderError || assignments.loading);
  const weeklyLoaders = [assignments, rooms];
  const weeklyLoaderError = weeklyLoaders.find((state) => state.error)?.error || '';
  const weeklyLoaderPending = weeklyLoaders.some((state) => state.loading);
  const weeklyFormUnavailable = Boolean(weeklyLoaderError || weeklyLoaderPending);
  const assignmentReferenced = Boolean(assignmentForm.id && ((Number(itemsOf(assignments.data).find((assignment) => assignment.id === assignmentForm.id)?._count?.weeklySchedules) || 0) > 0 || (Number(itemsOf(assignments.data).find((assignment) => assignment.id === assignmentForm.id)?._count?.sessions) || 0) > 0 || (Number(itemsOf(assignments.data).find((assignment) => assignment.id === assignmentForm.id)?._count?.substitutionSourceSessions) || 0) > 0));
  const sessionDateError = sessionAssignmentDateError(selectedSessionAssignment, sessionForm.startsAt, sessionForm.endsAt, date);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generatingRef.current = false;
    };
  }, []);

  function changeAssignmentAcademicYear(academicYearId) {
    replaceAssignment((current) => ({ ...current, academicYearId, semesterId: '' }));
  }

  function changeScheduleDate(nextDate) {
    setDate(nextDate);
    setSessionError('');
    if (!selectedSessionAssignment) return;
    const eventDate = dateInputValue(nextDate);
    if (!eventDate) return;
    replaceSession((current) => ({
      ...current,
      startsAt: `${eventDate}T${localTimeFromDateTime(current.startsAt, '07:15')}`,
      endsAt: `${eventDate}T${localTimeFromDateTime(current.endsAt, '08:45')}`
    }));
  }

  function selectSessionAssignment(teachingAssignmentId) {
    const eventDate = dateInputValue(date);
    replaceSession((current) => ({
      ...current,
      teachingAssignmentId,
      startsAt: `${eventDate}T${localTimeFromDateTime(current.startsAt, '07:15')}`,
      endsAt: `${eventDate}T${localTimeFromDateTime(current.endsAt, '08:45')}`
    }));
    setSessionError('');
  }

  function selectWeeklyAssignment(teachingAssignmentId) {
    const assignment = activeAssignments.find((item) => item.id === teachingAssignmentId);
    replaceWeekly((current) => ({
      ...current,
      teachingAssignmentId,
      effectiveFrom: dateInputValue(assignment?.effectiveFrom),
      effectiveTo: dateInputValue(assignment?.effectiveTo)
    }));
    setWeeklyError('');
  }

  function editAssignment(assignment) {
    resetAssignment({
      id: assignment.id,
      teacherId: assignment.teacherId,
      subjectId: assignment.subjectId,
      classId: assignment.classId,
      academicYearId: assignment.academicYearId,
      semesterId: assignment.semesterId,
      effectiveFrom: dateInputValue(assignment.effectiveFrom),
      effectiveTo: dateInputValue(assignment.effectiveTo),
      active: Boolean(assignment.active)
    });
    setAssignmentError('');
  }

  async function submitAssignment(event) {
    event.preventDefault();
    if (assignmentSaving) return;
    const payload = {
      teacherId: assignmentForm.teacherId,
      subjectId: assignmentForm.subjectId,
      classId: assignmentForm.classId,
      academicYearId: assignmentForm.academicYearId,
      semesterId: assignmentForm.semesterId,
      effectiveFrom: assignmentForm.effectiveFrom,
      ...(assignmentForm.effectiveTo ? { effectiveTo: assignmentForm.effectiveTo } : {}),
      active: Boolean(assignmentForm.active)
    };
    setAssignmentSaving(true);
    setAssignmentError('');
    try {
      await apiFetch(assignmentForm.id ? `/schedules/assignments/${assignmentForm.id}` : '/schedules/assignments', { method: assignmentForm.id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      resetAssignment({ ...assignmentInitial, effectiveFrom: today() });
      assignments.refresh();
      notify?.(assignmentForm.id ? 'Penugasan mengajar diperbarui.' : 'Penugasan mengajar tersimpan.', 'ok');
    } catch (error) {
      const message = error.message || 'Penugasan mengajar belum bisa disimpan.';
      setAssignmentError(message);
      notify?.(message, 'bad');
    } finally {
      setAssignmentSaving(false);
    }
  }

  async function submitSession(event) {
    event.preventDefault();
    const validationError = sessionAssignmentDateError(selectedSessionAssignment, sessionForm.startsAt, sessionForm.endsAt, date);
    if (sessionSaving || !selectedSessionAssignment || validationError) return;
    const payload = {
      teachingAssignmentId: selectedSessionAssignment.id,
      classId: selectedSessionAssignment.classId,
      subjectId: selectedSessionAssignment.subjectId,
      teacherId: selectedSessionAssignment.teacherId,
      academicYearId: selectedSessionAssignment.academicYearId,
      semesterId: selectedSessionAssignment.semesterId,
      startsAt: sessionForm.startsAt,
      endsAt: sessionForm.endsAt
    };
    setSessionSaving(true);
    setSessionError('');
    try {
      await apiFetch('/schedules/sessions', { method: 'POST', body: JSON.stringify(payload) });
      resetSession({ teachingAssignmentId: '', startsAt: `${date}T07:15`, endsAt: `${date}T08:45` });
      sessions.refresh();
      notify?.('Sesi berhasil dibuat.', 'ok');
    } catch (error) {
      const message = error.message || 'Sesi belum bisa dibuat.';
      setSessionError(message);
      notify?.(message, 'bad');
    } finally {
      setSessionSaving(false);
    }
  }

  async function submitWeekly(event) {
    event.preventDefault();
    if (weeklySaving || !selectedWeeklyAssignment) return;
    const payload = {
      teachingAssignmentId: selectedWeeklyAssignment.id,
      classId: selectedWeeklyAssignment.classId,
      subjectId: selectedWeeklyAssignment.subjectId,
      teacherId: selectedWeeklyAssignment.teacherId,
      academicYearId: selectedWeeklyAssignment.academicYearId,
      semesterId: selectedWeeklyAssignment.semesterId,
      ...(weeklyForm.roomId ? { roomId: weeklyForm.roomId } : {}),
      dayOfWeek: Number(weeklyForm.dayOfWeek),
      startTime: weeklyForm.startTime,
      endTime: weeklyForm.endTime,
      effectiveFrom: weeklyForm.effectiveFrom,
      ...(weeklyForm.effectiveTo ? { effectiveTo: weeklyForm.effectiveTo } : {})
    };
    setWeeklySaving(true);
    setWeeklyError('');
    try {
      await apiFetch('/schedules/weekly', { method: 'POST', body: JSON.stringify(payload) });
      resetWeekly({ teachingAssignmentId: '', roomId: '', dayOfWeek: '1', startTime: '07:15', endTime: '08:45', effectiveFrom: today(), effectiveTo: '' });
      weekly.refresh();
      notify?.('Jadwal mingguan tersimpan.', 'ok');
    } catch (error) {
      const message = error.message || 'Jadwal mingguan belum bisa disimpan.';
      setWeeklyError(message);
      notify?.(message, 'bad');
    } finally {
      setWeeklySaving(false);
    }
  }

  async function generate(schedule) {
    if (generatingRef.current || weeklyGenerationBlocker(schedule)) return;
    generatingRef.current = true;
    setGeneratingId(schedule.id);
    try {
      const confirmed = await riskConfirm(`Buat sesi dari jadwal mingguan ini untuk tanggal ${date}?`, 'Buat Sesi');
      if (!mountedRef.current || !confirmed) return;
      const result = await apiFetch(`/schedules/weekly/${schedule.id}/generate`, { method: 'POST', body: JSON.stringify({ from: date, to: date }) });
      if (!mountedRef.current) return;
      sessions.refresh();
      notify?.(`${result.generatedCount || 0} sesi dibuat, ${result.skippedCount || 0} dilewati.`, 'ok');
    } catch (error) {
      if (mountedRef.current) notify?.(error.message || 'Sesi dari jadwal belum bisa dibuat.', 'bad');
    } finally {
      generatingRef.current = false;
      if (mountedRef.current) setGeneratingId('');
    }
  }

  return <div className="content"><PageHead eyebrow="JADWAL KELAS" title="Jadwal Kelas" sub="Tetapkan penugasan guru terlebih dahulu, lalu buat sesi atau jadwal dari penugasan tersebut." actions={<label className="input compact"><Calendar size={14} /><input aria-label="Tanggal jadwal" type="date" value={date} onChange={(event) => changeScheduleDate(event.target.value)} /></label>} /><StepGuide title="Urutan aman" steps={['Buat penugasan guru, mapel, kelas, dan periode resmi.', 'Pilih penugasan aktif saat membuat sesi atau jadwal mingguan.', 'Gunakan Buat sesi hanya untuk jadwal mingguan yang sudah lengkap.', 'Guru melihat sesi yang sesuai dengan penugasan resminya.']} />
    <section aria-label="Penugasan mengajar" className="grid g-3" style={{ marginTop: 18 }}><Card title={assignmentForm.id ? 'Edit Penugasan Mengajar' : 'Penugasan Mengajar'} sub="Tetapkan satu guru aktif untuk mapel, kelas, dan periode akademik. Jadwal hanya dapat dibuat dari data ini."><form className="form-grid" onSubmit={submitAssignment}>{assignmentLoaderError && <div className="inline-error" role="alert"><AlertTriangle size={14} /> Data pilihan penugasan belum lengkap: {assignmentLoaderError}</div>}{assignmentLoaderPending && <p className="muted" role="status">Memuat seluruh data pilihan penugasan…</p>}<Field label="Guru Pengajar"><SelectInput value={assignmentForm.teacherId} onChange={(event) => setAssignment('teacherId', event.target.value)} required disabled={assignmentSaving || assignmentReferenced || assignmentFormUnavailable}><option value="">Pilih guru aktif</option>{itemsOf(users.data).filter((user) => user.role === 'GURU_MAPEL' && user.active === true).map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}</SelectInput></Field><Field label="Bidang Studi"><SelectInput value={assignmentForm.subjectId} onChange={(event) => setAssignment('subjectId', event.target.value)} required disabled={assignmentSaving || assignmentReferenced || assignmentFormUnavailable}><option value="">Pilih bidang studi</option>{itemsOf(subjects.data).map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</SelectInput></Field><Field label="Kelas"><SelectInput value={assignmentForm.classId} onChange={(event) => setAssignment('classId', event.target.value)} required disabled={assignmentSaving || assignmentReferenced || assignmentFormUnavailable}><option value="">Pilih kelas</option>{itemsOf(classes.data).map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.code} · {schoolClass.name}</option>)}</SelectInput></Field><Field label="Tahun Ajaran"><SelectInput value={assignmentForm.academicYearId} onChange={(event) => changeAssignmentAcademicYear(event.target.value)} required disabled={assignmentSaving || assignmentReferenced || assignmentFormUnavailable}><option value="">Pilih tahun ajaran</option>{itemsOf(academicYears.data).map((academicYear) => <option key={academicYear.id} value={academicYear.id}>{academicYear.code || academicYear.name}{academicYear.active === false ? ' · nonaktif' : ''}</option>)}</SelectInput></Field><Field label="Semester"><SelectInput value={assignmentForm.semesterId} onChange={(event) => setAssignment('semesterId', event.target.value)} required disabled={assignmentSaving || assignmentReferenced || assignmentFormUnavailable || !assignmentForm.academicYearId}><option value="">{assignmentForm.academicYearId ? 'Pilih semester' : 'Pilih tahun ajaran dulu'}</option>{selectedAssignmentSemesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.name || semester.code}{semester.active === false ? ' · nonaktif' : ''}</option>)}</SelectInput></Field><Field label="Mulai Penugasan"><TextInput type="date" value={assignmentForm.effectiveFrom} onChange={(event) => setAssignment('effectiveFrom', event.target.value)} required disabled={assignmentSaving || assignmentReferenced || assignmentFormUnavailable} /></Field><Field label="Selesai Penugasan" hint="opsional"><TextInput type="date" value={assignmentForm.effectiveTo} onChange={(event) => setAssignment('effectiveTo', event.target.value)} disabled={assignmentSaving || assignmentReferenced || assignmentFormUnavailable} /></Field>{assignmentReferenced && <p className="muted" role="note">Buat assignment baru untuk perubahan tuple/periode, lalu nonaktifkan lama.</p>}<label className="checkline"><input aria-label="Penugasan aktif" type="checkbox" checked={Boolean(assignmentForm.active)} onChange={(event) => setAssignment('active', event.target.checked)} disabled={assignmentSaving} /> Aktifkan penugasan</label>{assignmentError && <div className="inline-error" role="alert"><AlertTriangle size={14} /> {assignmentError}</div>}<div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><Btn type="submit" variant="primary" loading={assignmentSaving} disabled={assignmentSaving || assignmentFormUnavailable}><Save size={14} /> {assignmentForm.id ? 'Simpan perubahan' : 'Simpan penugasan'}</Btn>{assignmentForm.id && <Btn type="button" variant="ghost" disabled={assignmentSaving} onClick={() => { resetAssignment({ ...assignmentInitial, effectiveFrom: today() }); setAssignmentError(''); }}>Batal edit</Btn>}</div></form></Card><Card title="Daftar Penugasan" sub="Edit penugasan bila periode atau statusnya berubah."><AsyncTable state={assignments} empty={{ title: 'Belum ada penugasan mengajar.', sub: 'Buat penugasan resmi sebelum membuat jadwal kelas.' }} columns={[{ header: 'Guru', render: (assignment) => assignment.teacher?.fullName || assignment.teacherId }, { header: 'Mapel / Kelas', render: (assignment) => `${assignment.subject?.name || assignment.subjectId} · ${assignment.schoolClass?.code || assignment.classId}` }, { header: 'Periode', render: (assignment) => `${assignment.academicYear?.code || assignment.academicYear?.name || assignment.academicYearId} · ${assignment.semester?.name || assignment.semester?.code || assignment.semesterId}` }, { header: 'Berlaku', render: (assignment) => `${dateInputValue(assignment.effectiveFrom)}${assignment.effectiveTo ? ` s.d. ${dateInputValue(assignment.effectiveTo)}` : ''}` }, { header: 'Status', render: (assignment) => <StatusPill status={assignment.active ? 'ACTIVE' : 'INACTIVE'} /> }]} onRow={(assignment) => <Btn type="button" size="sm" onClick={() => editAssignment(assignment)}>Edit</Btn>} /></Card></section>
    <div className="grid g-3" style={{ marginTop: 18 }}><Card title="Buat Sesi Langsung" sub="Gunakan penugasan aktif sebagai sumber data. Kelas, mapel, guru, dan periode tidak dapat dipilih terpisah."><form className="form-grid" onSubmit={submitSession}>{sessionLoaderError && <div className="inline-error" role="alert"><AlertTriangle size={14} /> Data penugasan belum lengkap: {sessionLoaderError}</div>}{assignments.loading && <p className="muted" role="status">Memuat seluruh penugasan aktif…</p>}<Field label="Penugasan untuk sesi"><SelectInput value={sessionForm.teachingAssignmentId} onChange={(event) => selectSessionAssignment(event.target.value)} required disabled={sessionSaving || sessionFormUnavailable}><option value="">Pilih penugasan aktif</option>{activeAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{teachingAssignmentLabel(assignment)}</option>)}</SelectInput></Field><TeachingAssignmentSummary assignment={selectedSessionAssignment} /><Field label="Mulai sesi"><TextInput type="datetime-local" value={sessionForm.startsAt} onChange={(event) => { setSession('startsAt', event.target.value); setSessionError(''); }} required disabled={sessionSaving || sessionFormUnavailable || !selectedSessionAssignment} /></Field><Field label="Selesai sesi"><TextInput type="datetime-local" value={sessionForm.endsAt} onChange={(event) => { setSession('endsAt', event.target.value); setSessionError(''); }} required disabled={sessionSaving || sessionFormUnavailable || !selectedSessionAssignment} /></Field>{sessionDateError && <div className="inline-error" role="alert"><AlertTriangle size={14} /> {sessionDateError}</div>}{sessionError && sessionError !== sessionDateError && <div className="inline-error" role="alert"><AlertTriangle size={14} /> {sessionError}</div>}<Btn type="submit" variant="primary" loading={sessionSaving} disabled={sessionSaving || sessionFormUnavailable || !selectedSessionAssignment || Boolean(sessionDateError)}><Plus size={14} /> Buat sesi</Btn></form></Card><Card title="Sesi Terjadwal"><AsyncTable state={sessions} columns={[{ header: 'Waktu', render: (session) => formatDateTime(session.startsAt) }, { header: 'Kelas', render: (session) => session.schoolClass?.code }, { header: 'Mapel', render: (session) => session.subject?.name }, { header: 'Guru', render: (session) => session.teacher?.fullName }, { header: 'Status', render: (session) => <StatusPill status={session.status} /> }]} /></Card></div>
    <div className="grid g-3" style={{ marginTop: 18 }}><Card title="Jadwal Mingguan" sub="Pilih penugasan aktif, lalu tentukan hari, jam, ruang, dan masa berlaku jadwal."><form className="form-grid" onSubmit={submitWeekly}>{weeklyLoaderError && <div className="inline-error" role="alert"><AlertTriangle size={14} /> Data penugasan atau ruang belum lengkap: {weeklyLoaderError}</div>}{weeklyLoaderPending && <p className="muted" role="status">Memuat seluruh data jadwal…</p>}<Field label="Penugasan untuk jadwal"><SelectInput value={weeklyForm.teachingAssignmentId} onChange={(event) => selectWeeklyAssignment(event.target.value)} required disabled={weeklySaving || weeklyFormUnavailable}><option value="">Pilih penugasan aktif</option>{activeAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{teachingAssignmentLabel(assignment)}</option>)}</SelectInput></Field><TeachingAssignmentSummary assignment={selectedWeeklyAssignment} empty="Pilih penugasan aktif. Periode jadwal akan diisi dari masa berlaku penugasan." /><Field label="Ruang"><SelectInput value={weeklyForm.roomId} onChange={(event) => setWeekly('roomId', event.target.value)} disabled={weeklySaving || weeklyFormUnavailable || !selectedWeeklyAssignment}><option value="">Tanpa ruang</option>{itemsOf(rooms.data).map((room) => <option key={room.id} value={room.id}>{room.code}</option>)}</SelectInput></Field><Field label="Hari"><SelectInput value={weeklyForm.dayOfWeek} onChange={(event) => setWeekly('dayOfWeek', event.target.value)} required disabled={weeklySaving || weeklyFormUnavailable || !selectedWeeklyAssignment}>{['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((day, index) => <option key={index} value={index}>{day}</option>)}</SelectInput></Field><Field label="Jam Mulai"><TextInput type="time" value={weeklyForm.startTime} onChange={(event) => setWeekly('startTime', event.target.value)} required disabled={weeklySaving || weeklyFormUnavailable || !selectedWeeklyAssignment} /></Field><Field label="Jam Selesai"><TextInput type="time" value={weeklyForm.endTime} onChange={(event) => setWeekly('endTime', event.target.value)} required disabled={weeklySaving || weeklyFormUnavailable || !selectedWeeklyAssignment} /></Field><Field label="Mulai berlaku"><TextInput type="date" value={weeklyForm.effectiveFrom} min={dateInputValue(selectedWeeklyAssignment?.effectiveFrom) || undefined} max={dateInputValue(selectedWeeklyAssignment?.effectiveTo) || undefined} onChange={(event) => setWeekly('effectiveFrom', event.target.value)} required disabled={weeklySaving || weeklyFormUnavailable || !selectedWeeklyAssignment} /></Field><Field label="Selesai berlaku" hint="opsional"><TextInput type="date" value={weeklyForm.effectiveTo} min={weeklyForm.effectiveFrom || dateInputValue(selectedWeeklyAssignment?.effectiveFrom) || undefined} max={dateInputValue(selectedWeeklyAssignment?.effectiveTo) || undefined} onChange={(event) => setWeekly('effectiveTo', event.target.value)} disabled={weeklySaving || weeklyFormUnavailable || !selectedWeeklyAssignment} /></Field>{weeklyError && <div className="inline-error" role="alert"><AlertTriangle size={14} /> {weeklyError}</div>}<Btn type="submit" variant="primary" loading={weeklySaving} disabled={weeklySaving || weeklyFormUnavailable || !selectedWeeklyAssignment}><Save size={14} /> Simpan jadwal</Btn></form></Card><Card title="Daftar Jadwal Mingguan" sub="Jadwal lama tanpa periode atau penugasan tidak dapat menghasilkan sesi sampai dilengkapi."><AsyncTable state={weekly} columns={[{ header: 'Hari', render: (schedule) => ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][schedule.dayOfWeek] }, { header: 'Jam', render: (schedule) => `${schedule.startTime}-${schedule.endTime}` }, { header: 'Kelas', render: (schedule) => schedule.schoolClass?.code || schedule.classId }, { header: 'Mapel', render: (schedule) => schedule.subject?.name || schedule.subjectId }, { header: 'Guru', render: (schedule) => schedule.teacher?.fullName || schedule.teacherId }, { header: 'Periode', render: (schedule) => schedule.academicYearId && schedule.semesterId ? `${schedule.academicYear?.code || schedule.academicYear?.name || schedule.academicYearId} · ${schedule.semester?.name || schedule.semester?.code || schedule.semesterId}` : 'Perlu dilengkapi' }, { header: 'Penugasan', render: (schedule) => { const blocker = weeklyGenerationBlocker(schedule); return blocker ? <Pill tone="warn">{blocker}</Pill> : <Pill tone="ok">Lengkap</Pill>; } }]} onRow={(schedule) => <WeeklyGenerateAction schedule={schedule} loading={generatingId === schedule.id} pending={Boolean(generatingId)} onGenerate={generate} />} /></Card></div></div>;
}
export function DevicesPage({ notify }) {
  const [tab, setTab] = useState('android');
  const options = [['android', 'Aktivasi 4 HP Reader'], ['qr', 'Cetak Kartu'], ['apk', 'APK Update Center'], ['version', 'Versi Manual'], ['cards', 'Kartu RFID'], ['scan', 'Input Manual Cadangan']];
  const pageCopy = tab === 'qr'
    ? { title: 'Cetak Kartu SIAB2', sub: 'Pilih kelas, sistem melengkapi QR resmi, lalu cetak kartu siap pakai.' }
    : { title: 'Aktivasi 4 HP Reader', sub: 'Fokus ke 4 reader produksi resmi; alat lama disembunyikan agar operator tidak salah pilih.' };
  return <div className="content"><PageHead eyebrow="PERANGKAT ABSENSI" title={pageCopy.title} sub={pageCopy.sub} /><TabBar value={tab} onChange={setTab} options={options} />{tab === 'android' && <AndroidReaderPanel notify={notify} />}{tab === 'qr' && <QrCredentialPanel notify={notify} />}{tab === 'apk' && <AndroidApkUpdatePanel notify={notify} />}{tab === 'version' && <MobileVersionPanel notify={notify} />}{tab === 'cards' && <CardsPanel notify={notify} />}{tab === 'scan' && <ManualQrScanPanel notify={notify} />}</div>;
}

export function AndroidApkUpdatePage({ notify }) {
  return <div className="content"><PageHead eyebrow="APK UPDATE CENTER" title="APK Update Center" sub="Upload, publish, dan pantau rilis APK HP Scanner. Tes di 1 HP dulu sebelum rollout production." actions={<Btn onClick={() => go('/admin/devices')}><Smartphone size={14} /> HP Scanner & Kartu</Btn>} /><AndroidApkUpdatePanel notify={notify} /></div>;
}


function QrCredentialPanel({ notify }) {
  const users = useRemote(() => apiFetch('/identity/users?page=1&limit=500'), []);
  const classes = useRemote(() => apiFetch('/academic/classes?page=1&limit=200'), []);
  const [result, setResult] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, set, reset] = useForm({ userId: '', classId: '', label: 'QR SIAB2', expiresAt: '', revokeReason: 'Kartu QR dicabut oleh admin karena kartu hilang atau diganti.' });
  const credentials = useRemote(() => form.userId ? apiFetch(`/qr-credentials/users/${form.userId}?page=1&limit=20`) : Promise.resolve({ items: [] }), [form.userId]);
  const readiness = useRemote(() => apiFetch(`/qr-credentials/readiness${qs({ classId: form.classId })}`), [form.classId]);

  const selectedUser = itemsOf(users.data).find((user) => user.id === form.userId);
  const selectedClass = itemsOf(classes.data).find((item) => item.id === form.classId);
  const generatorExportUrl = (extra = {}) => {
    const params = new URLSearchParams({ autoLoad: '1', ...extra });
    if (form.classId && !params.has('classId')) params.set('classId', form.classId);
    return idCardGeneratorUrl('/export', Object.fromEntries(params.entries()));
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

  return <div className="grid g-3"><Card title="Cetak Kartu SIAB2" sub="Pilih kelas, lalu klik Cetak. QR siswa dibuat long-lived sampai tamat/keluar atau dicabut."><div className="user-preset-grid"><QuickActionCard title="Data Siswa" desc="Import atau rapikan akun siswa dulu jika data belum lengkap." icon={<Users size={18} />} actionLabel="Buka Data Siswa" onClick={() => go('/admin/master-data')} /><QuickActionCard title="Cetak Kartu" desc="Cetak semua kartu atau per kelas dengan QR resmi." icon={<CreditCard size={18} />} actionLabel="Cetak Sekarang" onClick={() => preparePrint(true)} tone="ok" /><QuickActionCard title="Kartu Hilang" desc="Cabut QR lama, buat QR baru, lalu cetak ulang satu kartu." icon={<RefreshCw size={18} />} actionLabel="Ganti QR" onClick={rotateLostCard} /></div><div className="form-grid" style={{ marginTop: 16 }}><Field label="Kelas"><SelectInput value={form.classId} onChange={(e) => set('classId', e.target.value)}><option value="">Semua siswa/guru aktif</option>{itemsOf(classes.data).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</SelectInput></Field><Field label="Cari siswa/guru untuk cetak ulang"><SelectInput value={form.userId} onChange={(e) => set('userId', e.target.value)}><option value="">Pilih hanya jika kartu hilang/cetak ulang</option>{itemsOf(users.data).map((u) => <option key={u.id} value={u.id}>{u.fullName} · {statusLabel(u.role)}</option>)}</SelectInput></Field><Btn variant="primary" type="button" onClick={() => preparePrint(true)}><CreditCard size={14} /> Cetak Kartu {selectedClass ? selectedClass.code : 'Semua'}</Btn><Btn type="button" onClick={exportCards}><Download size={14} /> Download Data Kartu</Btn><Btn type="button" variant="ghost" onClick={rotateLostCard}><RefreshCw size={14} /> Kartu Hilang / Ganti QR</Btn><Btn type="button" variant="ghost" onClick={() => window.open(generatorExportUrl({ autoPdf: '0' }), '_blank', 'noopener,noreferrer')}><Eye size={14} /> Buka Preview Generator</Btn></div><SimpleHelpBox title="Alur paling mudah" items={[`Pilih kelas ${selectedClass ? selectedClass.code : 'atau kosongkan untuk semua'}.`, 'Klik Cetak Kartu. QR yang belum ada dibuat otomatis.', 'QR siswa tidak kedaluwarsa; naik kelas cukup update rombel di sistem.', 'Generator terbuka dan PDF akan disiapkan. Cetak jika indikator QR fallback = 0.']} /></Card><Card title="Kesiapan Kartu" sub={form.classId ? `Status kelas ${selectedClass?.code || ''}` : 'Status semua akun aktif'} actions={<Btn size="sm" onClick={readiness.refresh}><RefreshCw size={14} /> Cek ulang</Btn>}><div className="grid g-2 cards-grid"><ReadinessStat label="Target" value={status.totalTargetUsers ?? 0} /><ReadinessStat label="QR Resmi" value={status.activeQrCount ?? 0} tone="ok" /><ReadinessStat label="Belum QR" value={status.missingQrCount ?? 0} tone={(status.missingQrCount || 0) > 0 ? 'bad' : 'ok'} /><ReadinessStat label="Tanpa rombel" value={status.studentsWithoutClass ?? 0} /></div>{classStatus && <p className="muted" style={{ marginTop: 12 }}>{classStatus.ready ? 'Kelas ini siap cetak.' : `${classStatus.missingQrCount} siswa di kelas ini belum punya QR aktif.`}</p>}</Card><Card title="Pengaturan Lanjutan" sub="Hanya dipakai untuk kasus khusus seperti rotasi massal atau pencabutan QR. Kedaluwarsa hanya berlaku untuk non-siswa." actions={<Btn size="sm" variant="ghost" onClick={() => setShowAdvanced((value) => !value)}>{showAdvanced ? 'Sembunyikan' : 'Tampilkan'}</Btn>}>{showAdvanced ? <div className="form-grid"><Field label="Label QR"><TextInput value={form.label} onChange={(e) => set('label', e.target.value)} /></Field><Field label="Kedaluwarsa opsional (non-siswa)"><TextInput type="datetime-local" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} /></Field><Btn type="button" onClick={generate}><Plus size={14} /> Buat untuk Pengguna</Btn><Btn type="button" onClick={rotate}><RefreshCw size={14} /> Ganti QR Pengguna</Btn><Btn type="button" variant="danger" onClick={bulkReplace}>Ganti Semua QR</Btn><Btn type="button" variant="ghost" onClick={() => { reset({ userId: '', classId: '', label: 'QR SIAB2', expiresAt: '', revokeReason: 'Kartu QR dicabut oleh admin karena kartu hilang atau diganti.' }); setResult(null); }}>Reset</Btn></div> : <p className="muted">Tombol berisiko disembunyikan agar operator tidak salah mengganti QR massal.</p>}</Card>{form.userId && <Card title="Riwayat QR Pengguna"><AsyncTable state={credentials} columns={[{ header: 'Label', render: (r) => r.label || 'QR Absensi' }, { header: 'Status', render: (r) => <StatusPill status={r.status} /> }, { header: 'Kode Pendek', render: (r) => r.shortCode || '—' }, { header: 'Terbit', render: (r) => formatDateTime(r.issuedAt) }, { header: 'Terakhir Dipakai', render: (r) => formatDateTime(r.lastUsedAt) }]} onRow={(r) => <div className="row"><Btn size="sm" variant="danger" onClick={() => revoke(r)}>Cabut</Btn></div>} /></Card>}<Card title="Hasil Aman" sub="Payload QR asli tidak ditampilkan di layar."><pre className="codeblock">{result ? JSON.stringify(result, null, 2) : 'Belum ada hasil.'}</pre></Card></div>;
}

function ReadinessStat({ label, value, tone = '' }) {
  return <div className={`stat ${tone === 'bad' ? 'danger' : ''}`}><div className="stat-label">{label}</div><div className="stat-num">{value}</div><div className={`stat-delta ${tone === 'ok' ? 'up' : tone === 'bad' ? 'down' : ''}`}>{tone === 'ok' ? 'Aman' : tone === 'bad' ? 'Perlu dicek' : 'Data'}</div></div>;
}

const ANDROID_MODE_LABELS = {
  GERBANG: 'Gerbang',
  GATE_IN: 'Gerbang',
  GATE_OUT: 'Gerbang',
  MUSHOLA: 'Mushola',
  CHECK_ONLY: 'Cek Identitas'
};

const CHECK_ONLY_ANDROID_MODES = ['CHECK_ONLY'];
const GATE_PRAYER_ANDROID_MODES = ['GATE_IN', 'GATE_OUT', 'MUSHOLA'];

const ANDROID_READER_PRESETS = [
  { key: 'dev-identity', icon: <ShieldCheck size={26} />, title: 'READER_DEV_TEST_01', shortTitle: 'Dev Test Identitas', desc: 'Cek kartu/identitas; tidak mencatat absensi.', name: 'READER_DEV_TEST_01', locationName: 'Dev Test Identitas', allowedModes: CHECK_ONLY_ANDROID_MODES, tone: 'safe' },
  { key: 'dev-gate-prayer', icon: <Smartphone size={26} />, title: 'READER_IDENTITY_01', shortTitle: 'Dev Test Gerbang & Mushola', desc: 'Uji Scan Gerbang Datang, Pulang, dan Mushola tanpa mencatat absensi.', name: 'READER_IDENTITY_01', locationName: 'Dev Test Gerbang & Mushola', allowedModes: GATE_PRAYER_ANDROID_MODES, tone: 'safe' },
  { key: 'gate-prayer-1', icon: <DoorOpen size={26} />, title: 'READER_GATE_PRAYER_01', shortTitle: 'Gerbang/Mushola 01', desc: 'Reader live UAT utama setelah approval.', name: 'READER_GATE_PRAYER_01', locationName: 'PR127 Gate Prayer 01', allowedModes: GATE_PRAYER_ANDROID_MODES, tone: 'live' },
  { key: 'gate-prayer-2', icon: <Building2 size={26} />, title: 'READER_GATE_PRAYER_02', shortTitle: 'Gerbang/Mushola 02', desc: 'Reader live UAT kedua setelah approval.', name: 'READER_GATE_PRAYER_02', locationName: 'PR127 Gate Prayer 02', allowedModes: GATE_PRAYER_ANDROID_MODES, tone: 'live' }
];

function presetForReader(reader) {
  const key = String(reader?.deviceId || reader?.name || '').trim();
  return ANDROID_READER_PRESETS.find((preset) => preset.name === key) || null;
}

function androidModeLabel(mode) {
  return ANDROID_MODE_LABELS[mode] || statusLabel(mode);
}

function androidModesText(modes = []) {
  const normalized = modes || [];
  const hasGerbang = normalized.includes('GERBANG') || normalized.includes('GATE_IN') || normalized.includes('GATE_OUT');
  const hasMushola = normalized.includes('MUSHOLA');
  if (hasGerbang && hasMushola) return 'Gerbang & Mushola';
  if (hasGerbang) return 'Gerbang';
  if (hasMushola) return 'Mushola';
  return normalized.map(androidModeLabel).join(', ') || 'Gerbang & Mushola';
}

function androidLastUsedModeText(mode) {
  if (!mode) return 'Belum pernah scan';
  return androidModeLabel(mode);
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

function isPendingAndroidReader(reader) {
  return reader?.type === 'QR_ANDROID' && !reader?.deviceId && reader?.status !== 'REVOKED';
}

function AndroidReaderStatusBadge({ reader }) {
  if (isPendingAndroidReader(reader)) return <Pill tone="warn">Menunggu aktivasi HP</Pill>;
  return <StatusPill status={reader?.status === 'INACTIVE' && !reader?.deviceId ? 'PENDING' : reader?.status} />;
}

function androidMonitorStatus(reader) {
  if (reader?.monitoringStatus) return reader.monitoringStatus;
  if (isPendingAndroidReader(reader)) return 'PENDING';
  if (reader?.status === 'REVOKED') return 'REVOKED';
  if (reader?.status !== 'ACTIVE') return 'INACTIVE';
  const heartbeat = reader?.lastHeartbeatAt ? new Date(reader.lastHeartbeatAt).getTime() : 0;
  return heartbeat && Date.now() - heartbeat <= 2 * 60_000 ? 'ONLINE' : 'OFFLINE';
}

function androidMonitorTone(status) {
  if (status === 'ONLINE') return 'ok';
  if (status === 'PENDING' || status === 'INACTIVE') return 'warn';
  if (status === 'OFFLINE') return 'bad';
  return '';
}

function androidMonitorLabel(status) {
  return ({ ONLINE: 'Online', OFFLINE: 'Offline', PENDING: 'Menunggu aktivasi', INACTIVE: 'Nonaktif', REVOKED: 'Dicabut' })[status] || statusLabel(status);
}

function androidWarningText(reader) {
  const warnings = new Set(reader?.monitorWarnings || reader?.statusWarnings || []);
  if ((reader?.pendingQueueCount || 0) > 0) warnings.add('OFFLINE_QUEUE_PENDING');
  if (reader?.batteryLevel != null && Number(reader.batteryLevel) <= 20) warnings.add('LOW_BATTERY');
  if (reader?.networkStatus === 'OFFLINE') warnings.add('NETWORK_OFFLINE');
  return [...warnings].map((warning) => ({
    OFFLINE_QUEUE_PENDING: 'Ada antrean offline',
    HEARTBEAT_OFFLINE: 'Heartbeat terputus',
    LOW_BATTERY: 'Baterai rendah',
    NETWORK_OFFLINE: 'Jaringan offline'
  })[warning] || statusLabel(warning)).join(' · ');
}

function AndroidReaderPanel({ notify }) {
  const readers = useRemote(() => apiFetch('/device-readers?page=1&limit=200'), []);
  const [result, setResult] = useState(null);
  const [selectedPreset, setSelectedPreset] = useState('dev-test');
  const [now, setNow] = useState(Date.now());
  const [form, set, reset] = useForm({ name: 'READER_DEV_TEST_01', locationName: 'PR127 Developer Test', allowedModes: CHECK_ONLY_ANDROID_MODES, expiresInMinutes: 15, revokeReason: 'HP reader dicabut oleh admin.' });

  useEffect(() => {
    if (!result?.expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [result?.expiresAt]);

  function applyPreset(preset) {
    setSelectedPreset(preset.key);
    reset({ name: preset.name, locationName: preset.locationName, allowedModes: preset.allowedModes, expiresInMinutes: 15, revokeReason: 'HP reader dicabut oleh admin.' });
    setResult(null);
  }

  async function startProvision() {
    const selected = ANDROID_READER_PRESETS.find((preset) => preset.key === selectedPreset) || ANDROID_READER_PRESETS[0];
    const target = androidItems.find((row) => row.id === selected.readerId || row.deviceId === selected.name || row.name === selected.name);
    if (!target) return notify(`Reader target ${selected.name} belum ada di daftar perangkat.`, 'warn');
    const data = await apiFetch(`/device-readers/${target.id}/android/provision-code`, { method: 'POST', body: JSON.stringify({ expiresInMinutes: Number(form.expiresInMinutes) || 15 }) });
    setResult(data); readers.refresh(); notify('Kode aktivasi HP berhasil dibuat. Salin kode ke aplikasi HP.');
  }

  async function copyActivationCode() {
    const code = activationCodeOf(result);
    if (!code) return notify('Kode aktivasi belum tersedia.', 'bad');
    await navigator.clipboard.writeText(code);
    notify('Kode aktivasi disalin. Tempel di aplikasi HP.', 'ok');
  }

  async function revoke(row) {
    if (!await riskConfirm('Cabut HP reader ini? HP tersebut tidak bisa scan lagi sampai diaktivasi ulang.')) return;
    await apiFetch(`/device-readers/${row.id}/revoke`, { method: 'POST', body: JSON.stringify({ reason: form.revokeReason }) });
    readers.refresh(); notify('HP reader dicabut.');
  }

  async function replacePendingProvision(row) {
    const preset = presetForReader(row);
    if (preset) applyPreset(preset);
    if (!await riskConfirm('Buat kode aktivasi baru untuk HP target ini? Kode lama otomatis tidak dipakai setelah kode baru dibuat.')) return;
    const data = await apiFetch(`/device-readers/${row.id}/android/provision-code`, { method: 'POST', body: JSON.stringify({ expiresInMinutes: Number(form.expiresInMinutes) || 15 }) });
    setResult(data); readers.refresh(); notify('Kode aktivasi baru dibuat. Salin kode ke aplikasi HP.');
  }

  async function status(row, value) {
    await apiFetch(`/devices/readers/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: value }) });
    readers.refresh(); notify(value === 'ACTIVE' ? 'HP reader diaktifkan lagi.' : 'HP reader dinonaktifkan.');
  }

  const activationCode = activationCodeOf(result);
  const remainingMs = result?.expiresAt ? new Date(result.expiresAt).getTime() - now : 0;
  const expired = Boolean(result?.expiresAt && remainingMs <= 0);
  const androidItems = itemsOf(readers.data).filter((row) => row.type === 'QR_ANDROID');
  const targetAndroidItems = androidItems.filter((row) => presetForReader(row));
  const activeAndroidCount = androidItems.filter((row) => row.status === 'ACTIVE').length;
  const targetActiveCount = targetAndroidItems.filter((row) => row.status === 'ACTIVE').length;
  const onlineAndroidCount = targetAndroidItems.filter((row) => androidMonitorStatus(row) === 'ONLINE').length;
  const offlineAndroidCount = targetAndroidItems.filter((row) => androidMonitorStatus(row) === 'OFFLINE').length;
  const pendingQueueTotal = targetAndroidItems.reduce((sum, row) => sum + (Number(row.pendingQueueCount) || 0), 0);
  const MAX_ACTIVE_ANDROID_READERS = 4;
  const limitReached = activeAndroidCount > MAX_ACTIVE_ANDROID_READERS;
  const selectedScannerName = ANDROID_READER_PRESETS.find((preset) => preset.key === selectedPreset)?.title || form.name || 'Reader target';
  const selectedTarget = androidItems.find((row) => row.deviceId === form.name || row.name === form.name);
  const targetRows = { ...readers, data: { ...(readers.data || {}), items: targetAndroidItems } };

  function renderAndroidReaderActions(r) {
    if (r.status === 'REVOKED') return <span className="muted">Sudah dicabut</span>;
    if (isPendingAndroidReader(r)) return <div className="row"><Btn size="sm" onClick={() => replacePendingProvision(r)}>Buat kode baru</Btn><Btn size="sm" variant="danger" onClick={() => revoke(r)}>Cabut</Btn></div>;
    return <div className="row"><Btn size="sm" onClick={() => replacePendingProvision(r)}><QrCode size={12} /> Kode Aktivasi</Btn><Btn size="sm" onClick={() => status(r, r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}>{r.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan lagi'}</Btn><Btn size="sm" variant="danger" onClick={() => revoke(r)}>Cabut</Btn></div>;
  }

  return <div className="android-activation-page">
    <div className="activation-hero activation-hero-clean">
      <div>
        <Pill tone="ok"><ShieldCheck size={13} /> 4 reader resmi</Pill>
        <h2>Aktivasi Android Reader</h2>
        <p>Pilih salah satu dari 4 reader produksi. Operator cukup membuat <b>Kode Aktivasi</b>, lalu memasukkannya di APK resmi. API key dan signing secret tidak ditampilkan di web.</p>
      </div>
      <div className="activation-safe"><ShieldCheck size={20} /><span>Live scan tetap dikunci SOP: tunggu heartbeat/seen semua HP dan approval UAT terpisah.</span></div>
    </div>

    <div className="grid g-4 reader-monitor-summary">
      <StatCardPremium icon={<Smartphone size={18} />} label="Target aktif" value={`${targetActiveCount}/${MAX_ACTIVE_ANDROID_READERS}`} sub="Hanya 4 mapping resmi" tone={targetActiveCount === MAX_ACTIVE_ANDROID_READERS ? 'ok' : 'warn'} />
      <StatCardPremium icon={<Wifi size={18} />} label="HP online" value={`${onlineAndroidCount}/${targetActiveCount}`} sub="Heartbeat ±2 menit terakhir" tone={onlineAndroidCount === targetActiveCount && targetActiveCount > 0 ? 'ok' : 'warn'} />
      <StatCardPremium icon={<AlertTriangle size={18} />} label="HP offline" value={offlineAndroidCount} sub="Perlu cek internet/aplikasi" tone={offlineAndroidCount > 0 ? 'bad' : 'ok'} />
      <StatCardPremium icon={<ListChecks size={18} />} label="Antrean offline" value={pendingQueueTotal} sub="Scan tersimpan di HP" tone={pendingQueueTotal > 0 ? 'warn' : 'ok'} />
    </div>

    <div className="wizard-steps activation-steps-clean">
      <div className="wizard-step active"><b>1</b><span>Pilih reader resmi</span></div>
      <div className="wizard-step active"><b>2</b><span>Buat kode singkat</span></div>
      <div className={`wizard-step ${activationCode ? 'active' : ''}`}><b>3</b><span>Tempel di APK</span></div>
      <div className="wizard-step"><b>4</b><span>Cek heartbeat</span></div>
    </div>

    <div className="grid activation-grid-clean">
      <Card title="1. Pilih reader target" sub="Tidak ada pilihan bebas. Mapping mode dikunci oleh server agar operator tidak salah memilih HP.">
        <div className="target-reader-grid">
          {ANDROID_READER_PRESETS.map((preset) => {
            const row = androidItems.find((item) => item.deviceId === preset.name || item.name === preset.name);
            const monitor = row ? androidMonitorStatus(row) : 'PENDING';
            return <button key={preset.key} type="button" className={`target-reader-card ${preset.tone} ${selectedPreset === preset.key ? 'selected' : ''}`} onClick={() => applyPreset(preset)}>
              <span className="preset-icon">{preset.icon}</span>
              <span className="target-reader-copy"><b>{preset.shortTitle}</b><code>{preset.title}</code><small>{preset.desc}</small></span>
              <span className="target-reader-meta"><Pill tone={androidMonitorTone(monitor)}>{row ? androidMonitorLabel(monitor) : 'Belum ada row'}</Pill><em>{androidModesText(preset.allowedModes)}</em></span>
            </button>;
          })}
        </div>
        <div className="simple-summary selected-reader-summary">
          <div><span>Reader dipilih</span><b>{form.name}</b></div>
          <div><span>Lokasi</span><b>{form.locationName}</b></div>
          <div><span>Mode server</span><b>{androidModesText(form.allowedModes)}</b></div>
          <div><span>Status row</span><b>{selectedTarget ? androidMonitorLabel(androidMonitorStatus(selectedTarget)) : 'Belum ada di database'}</b></div>
        </div>
      </Card>

      <Card title="2. Buat kode aktivasi" sub="Kode berlaku singkat dan hanya untuk 1 HP. Tidak ada API key/signing secret yang perlu ditempel manual.">
        <div className="activation-form-simple">
          <Field label="Reader target"><TextInput value={form.name} onChange={(e) => set('name', e.target.value)} disabled /></Field>
          <Field label="Kode berlaku berapa menit"><TextInput type="number" min="1" max="60" value={form.expiresInMinutes} onChange={(e) => set('expiresInMinutes', e.target.value)} /></Field>
          <Btn variant="primary" type="button" disabled={limitReached || !selectedTarget} onClick={startProvision}><QrCode size={16} /> Buat Kode Aktivasi</Btn>
        </div>
        <div className="security-note"><AlertTriangle size={16} /><span>Kode hanya untuk operator yang memegang HP. Jangan screenshot/share ke grup umum.</span></div>
      </Card>

      {activationCode && <Card title="3. Masukkan kode di aplikasi HP" sub="Salin kode ini, lalu tempel di kolom Kode Aktivasi dari Admin pada aplikasi Android.">
        <div className={`activation-code-card ${expired ? 'expired' : ''}`}><div className="activation-code-label"><Clock size={15} /> {formatRemaining(remainingMs)}</div><div className="activation-code-value">{activationCode}</div><div className="copy-actions"><Btn type="button" variant="primary" onClick={copyActivationCode} disabled={expired}><Copy size={15} /> Salin Kode</Btn><Btn type="button" onClick={startProvision}><RefreshCw size={15} /> Buat Kode Baru</Btn></div></div>
        <ol className="activation-instructions"><li>Buka aplikasi <b>{BRAND.androidReaderLabel}</b> di HP untuk <b>{selectedScannerName}</b>.</li><li>Isi alamat web production jika diminta.</li><li>Tempel kode ke kolom <b>Kode Aktivasi dari Admin</b>; jangan screenshot/share.</li><li>Tekan <b>Aktifkan HP Ini</b>, lalu tunggu heartbeat/seen sebelum live scan.</li></ol>
      </Card>}
    </div>

    <Card title="Daftar 4 Reader Android Resmi" sub="Tabel ini hanya menampilkan 4 reader target PR128. Panel alat lama tidak ditampilkan di halaman operator agar tidak rancu.">
      <div className="android-reader-table target-reader-table"><AsyncTable state={targetRows} empty="4 reader target belum ditemukan di database" columns={[{ header: 'Reader', render: (r) => <div className="reader-monitor-cell"><b>{presetForReader(r)?.shortTitle || r.name || 'Reader'}</b><small>{r.deviceId || r.name || '—'}</small></div> }, { header: 'Mode', render: (r) => androidModesText(r.allowedModes) }, { header: 'Status HP', render: (r) => <div className="reader-monitor-cell"><Pill tone={androidMonitorTone(androidMonitorStatus(r))}>{androidMonitorLabel(androidMonitorStatus(r))}</Pill><AndroidReaderStatusBadge reader={r} /></div> }, { header: 'Antrean', render: (r) => <span className={(r.pendingQueueCount || 0) > 0 ? 'reader-queue-warn' : ''}>{r.pendingQueueCount ?? 0}</span> }, { header: 'Heartbeat / Flush', render: (r) => <div className="reader-monitor-cell"><span>{formatDateTime(r.lastHeartbeatAt || r.lastSeenAt)}</span><small>Flush: {formatDateTime(r.lastQueueFlushAt)}</small></div> }, { header: 'Versi', render: (r) => r.appVersion ? `${r.appVersion}${r.appVersionCode ? ` (${r.appVersionCode})` : ''}` : '—' }, { header: 'Baterai/Jaringan', render: (r) => <div className="reader-monitor-cell"><span>{r.batteryLevel == null ? 'Baterai —' : `${r.batteryLevel}%`}</span><small>{r.networkStatus || 'Jaringan —'}</small></div> }, { header: 'Peringatan', render: (r) => androidWarningText(r) || 'Aman' }]} onRow={(r) => renderAndroidReaderActions(r)} /></div>
    </Card>
  </div>;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '—';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function shortHash(hash) {
  const normalized = String(hash || '');
  return normalized.length > 16 ? `${normalized.slice(0, 12)}…${normalized.slice(-8)}` : normalized || '—';
}

function AndroidApkUpdatePanel({ notify }) {
  const releases = useRemote(() => apiFetch('/admin/android-apk-releases?page=1&limit=50'), []);
  const latest = itemsOf(releases.data).filter((item) => item.isPublished).sort((a, b) => Number(b.versionCode) - Number(a.versionCode))[0] || null;
  const [file, setFile] = useState(null);
  const [form, set, reset] = useForm({ versionName: '1.2.0', versionCode: '4', minSupportedVersionCode: '1', forceUpdate: false, releaseNotes: 'Update APK HP Scanner.' });
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({ minSupportedVersionCode: '', forceUpdate: false, releaseNotes: '' });

  async function createRelease(event) {
    event.preventDefault();
    if (!file) return notify('Pilih file APK terlebih dahulu.', 'warn');
    if (!String(file.name || '').toLowerCase().endsWith('.apk')) return notify('File harus berekstensi .apk.', 'bad');
    if (latest && Number(form.versionCode) <= Number(latest.versionCode)) return notify('Version code harus lebih tinggi dari latest published.', 'warn');
    const data = new FormData();
    data.append('apk', file);
    data.append('versionName', form.versionName);
    data.append('versionCode', String(form.versionCode));
    data.append('minSupportedVersionCode', String(form.minSupportedVersionCode || 1));
    data.append('forceUpdate', String(Boolean(form.forceUpdate)));
    data.append('releaseNotes', form.releaseNotes || '');
    setBusy(true);
    try {
      await apiFetch('/admin/android-apk-releases', { method: 'POST', body: data });
      reset({ versionName: '1.2.0', versionCode: String(Math.max(4, Number(form.versionCode) + 1)), minSupportedVersionCode: '1', forceUpdate: false, releaseNotes: 'Update APK HP Scanner.' });
      setFile(null);
      releases.refresh();
      notify('Release APK berhasil dibuat. Publish setelah dites di 1 HP.', 'ok');
    } finally { setBusy(false); }
  }

  async function publish(row) {
    await apiFetch(`/admin/android-apk-releases/${row.id}/publish`, { method: 'POST', body: JSON.stringify({}) });
    releases.refresh(); notify(`APK v${row.versionName} dipublish. Tes fisik tetap wajib sebelum rollout.`, 'ok');
  }

  async function unpublish(row) {
    if (!await riskConfirm(`Unpublish APK v${row.versionName}? Android lama tidak akan melihat rilis ini lagi.`)) return;
    await apiFetch(`/admin/android-apk-releases/${row.id}/unpublish`, { method: 'POST', body: JSON.stringify({}) });
    releases.refresh(); notify('Release APK di-unpublish.');
  }

  async function saveEdit(row) {
    await apiFetch(`/admin/android-apk-releases/${row.id}`, { method: 'PATCH', body: JSON.stringify({ ...editForm, minSupportedVersionCode: Number(editForm.minSupportedVersionCode), forceUpdate: Boolean(editForm.forceUpdate) }) });
    setEditId(''); releases.refresh(); notify('Metadata release APK disimpan.');
  }

  async function download(row) {
    await apiDownload(`/mobile/android-reader/releases/${row.id}/download`, row.apkFileName || `android-reader-v${row.versionCode}.apk`);
    notify('APK diunduh untuk test install.');
  }

  function startEdit(row) {
    setEditId(row.id);
    setEditForm({ minSupportedVersionCode: String(row.minSupportedVersionCode || 1), forceUpdate: Boolean(row.forceUpdate), releaseNotes: row.releaseNotes || '' });
  }

  return <div className="apk-update-center"><div className="grid g-3"><Card title="Latest Published APK" sub="Dipakai endpoint versi Android reader."><div className="grid g-2 cards-grid"><ReadinessStat label="Version name" value={latest?.versionName || 'Belum ada'} tone={latest ? 'ok' : 'bad'} /><ReadinessStat label="Version code" value={latest?.versionCode ?? '—'} tone={latest ? 'ok' : ''} /><ReadinessStat label="Minimum" value={latest?.minSupportedVersionCode ?? '—'} /><ReadinessStat label="Force update" value={latest?.forceUpdate ? 'Ya' : 'Tidak'} tone={latest?.forceUpdate ? 'warn' : 'ok'} /></div>{latest && <SimpleHelpBox title="Metadata aman" items={[`Ukuran ${formatBytes(latest.apkSizeBytes)}`, `SHA256 ${shortHash(latest.apkSha256)}`, `Published ${formatDateTime(latest.publishedAt)}`]} />}</Card><Card title="Safety rollout" sub="Jangan langsung sebar APK ke HP production."><SimpleHelpBox title="Wajib sebelum rollout" items={['Upload APK debug/release yang sudah dibuild dari source resmi.', 'Publish hanya setelah test install di 1 HP.', 'Android akan memverifikasi SHA256 sebelum membuka installer.', 'Tidak ada silent install; operator tetap konfirmasi installer Android.']} /></Card><Card title="Endpoint Android" sub="Android reader membaca metadata ini."><pre className="codeblock">GET /api/v1/mobile/android-reader/version{latest ? `\nDownload: ${latest.downloadUrl}` : ''}</pre></Card></div><Card title="Upload APK Release" sub="Hash dihitung server. Jangan upload signing key/keystore."><form className="form-grid" onSubmit={createRelease}><Field label="File APK"><TextInput type="file" accept=".apk,application/vnd.android.package-archive" onChange={(event) => setFile(event.target.files?.[0] || null)} /></Field><Field label="Version name"><TextInput value={form.versionName} onChange={(event) => set('versionName', event.target.value)} required /></Field><Field label="Version code"><TextInput type="number" min="1" value={form.versionCode} onChange={(event) => set('versionCode', event.target.value)} required /></Field><Field label="Min supported version"><TextInput type="number" min="1" value={form.minSupportedVersionCode} onChange={(event) => set('minSupportedVersionCode', event.target.value)} required /></Field><label className="checkline"><input type="checkbox" checked={Boolean(form.forceUpdate)} onChange={(event) => set('forceUpdate', event.target.checked)} /> Paksa update untuk versi lama</label><Field label="Release notes"><TextInput type="textarea" rows={3} value={form.releaseNotes} onChange={(event) => set('releaseNotes', event.target.value)} /></Field>{latest && Number(form.versionCode) <= Number(latest.versionCode) && <div className="inline-error"><AlertTriangle size={14} /> Version code tidak lebih tinggi dari latest published.</div>}<Btn variant="primary" loading={busy} disabled={!file}><Download size={14} /> Upload Release</Btn></form></Card><Card title="Daftar APK Release" sub="Publish/unpublish rilis. Hanya release published tertinggi yang menjadi latest."><AsyncTable state={releases} empty="Belum ada release APK." columns={[{ header: 'Versi', render: (row) => <div><b>{row.versionName}</b><br /><span className="muted">code {row.versionCode}</span></div> }, { header: 'Minimum', render: (row) => row.minSupportedVersionCode }, { header: 'Status', render: (row) => <StatusPill status={row.isPublished ? 'PUBLISHED' : 'DRAFT'} /> }, { header: 'Force', render: (row) => row.forceUpdate ? <Pill tone="warn">Force update</Pill> : 'Opsional' }, { header: 'APK', render: (row) => <div><span>{formatBytes(row.apkSizeBytes)}</span><br /><span className="mono">{shortHash(row.apkSha256)}</span></div> }, { header: 'Published', render: (row) => formatDateTime(row.publishedAt) }]} onRow={(row) => <div className="row">{editId === row.id ? <><TextInput type="number" min="1" value={editForm.minSupportedVersionCode} onChange={(event) => setEditForm({ ...editForm, minSupportedVersionCode: event.target.value })} /><label className="checkline"><input type="checkbox" checked={Boolean(editForm.forceUpdate)} onChange={(event) => setEditForm({ ...editForm, forceUpdate: event.target.checked })} /> Force</label><Btn size="sm" onClick={() => saveEdit(row)}>Simpan</Btn><Btn size="sm" variant="ghost" onClick={() => setEditId('')}>Batal</Btn></> : <><Btn size="sm" onClick={() => download(row)}>Download test</Btn>{row.isPublished ? <Btn size="sm" variant="danger" onClick={() => unpublish(row)}>Unpublish</Btn> : <Btn size="sm" variant="primary" onClick={() => publish(row)}>Publish</Btn>}<Btn size="sm" onClick={() => startEdit(row)}>Edit</Btn></>}</div>} /></Card></div>;
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
  const [activationCode, setActivationCode] = useState(null);
  async function submit(e) { e.preventDefault(); await apiFetch('/devices/readers', { method: 'POST', body: JSON.stringify({ name: form.name, type: form.type, locationLabel: form.locationLabel || undefined, locationLat: Number(form.locationLat) || undefined, locationLng: Number(form.locationLng) || undefined }) }); reset({ name: '', type: 'GATE', locationLabel: '', locationLat: '', locationLng: '' }); readers.refresh(); notify('Alat pembaca ditambahkan.'); }
  async function status(row, value) { await apiFetch(`/devices/readers/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: value }) }); readers.refresh(); }
  async function rotate(row) { await apiFetch(`/devices/readers/${row.id}/rotate-key`, { method: 'POST', body: JSON.stringify({}) }); readers.refresh(); notify('Kunci akses alat pembaca diganti.'); }
  async function issueActivationCode(row) {
    const result = await apiFetch(`/device-readers/${row.id}/android/provision-code`, { method: 'POST', body: JSON.stringify({ expiresInMinutes: 15 }) });
    setActivationCode({ readerName: row.name, code: result.provisioningQr || result.provisionToken, expiresAt: result.expiresAt, allowedModes: result.item?.allowedModes || [] });
    readers.refresh();
    notify('Kode aktivasi dibuat. Tampilkan sekali saja ke operator HP.');
  }
  return <div className="grid management-grid"><Card title="Tambah Alat Pembaca"><form onSubmit={submit} className="form-grid"><Field label="Nama"><TextInput value={form.name} placeholder="Contoh: Alat Gerbang Utama" onChange={(e) => set('name', e.target.value)} required /></Field><Field label="Fungsi alat"><SelectInput value={form.type} onChange={(e) => set('type', e.target.value)}><option value="GATE">Gerbang</option><option value="MUSHOLA">Mushola</option><option value="CLASS">Cek kelas</option><option value="MANUAL">Input petugas</option></SelectInput></Field><Field label="Lokasi"><TextInput value={form.locationLabel} placeholder="Contoh: Gerbang utama / Mushola" onChange={(e) => set('locationLabel', e.target.value)} /></Field><Field label="Lintang lokasi"><TextInput value={form.locationLat} placeholder="Contoh: 0.875123" onChange={(e) => set('locationLat', e.target.value)} /></Field><Field label="Bujur lokasi"><TextInput value={form.locationLng} placeholder="Contoh: 100.291234" onChange={(e) => set('locationLng', e.target.value)} /></Field><Btn variant="primary">Simpan</Btn></form></Card>{activationCode && <Card title="Kode Aktivasi HP Android" sub="Rahasia operasional: input langsung di APK, jangan screenshot/share di chat/log."><div className="stack"><Pill>{activationCode.readerName}</Pill><pre className="codeblock">{activationCode.code}</pre><p className="muted">Kedaluwarsa: {formatDateTime(activationCode.expiresAt)} · Mode: {activationCode.allowedModes.join(', ') || '—'}</p><Btn size="sm" variant="ghost" onClick={() => setActivationCode(null)}>Tutup setelah dipakai</Btn></div></Card>}<Card title="Daftar Alat Pembaca"><AsyncTable state={readers} columns={[{ header: 'Nama', key: 'name' }, { header: 'Fungsi', render: (r) => <StatusPill status={r.type || 'GATE'} /> }, { header: 'Lokasi', render: (r) => r.locationLabel || '—' }, { header: 'Status', render: (r) => <StatusPill status={r.status} /> }, { header: 'Terakhir aktif', render: (r) => formatDateTime(r.lastSeenAt) }]} onRow={(r) => <div className="row">{r.type === 'QR_ANDROID' && <Btn size="sm" onClick={() => issueActivationCode(r)}><Smartphone size={12} /> Kode Aktivasi</Btn>}<Btn size="sm" onClick={() => rotate(r)}><KeyRound size={12} /> Ganti kunci</Btn><Btn size="sm" onClick={() => status(r, r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}>{r.status === 'ACTIVE' ? 'Nonaktif' : 'Aktif'}</Btn></div>} /></Card></div>;
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

function SettingCheckRow({ checked, onChange, title, helper }) {
  return <label className="setting-check-row"><input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} /><span><b>{title}</b>{helper && <small>{helper}</small>}</span></label>;
}

export function SettingsPage({ notify }) {
  const policy = useRemote(() => apiFetch('/access/geofence'), []);
  const attendancePolicy = useRemote(() => apiFetch('/attendance/policy'), []);
  const [form, setForm] = useState(null);
  const [attendanceForm, setAttendanceForm] = useState(null);
  const [attendanceStepUpPassword, setAttendanceStepUpPassword] = useState('');
  useEffect(() => { if (policy.data && !form) setForm(policy.data); }, [policy.data]);
  useEffect(() => { if (attendancePolicy.data && !attendanceForm) setAttendanceForm(attendancePolicy.data); }, [attendancePolicy.data]);
  async function submit(e) { e.preventDefault(); if (!await riskConfirm('Simpan perubahan lokasi sekolah dan aturan presensi?')) return; await apiFetch('/access/geofence', { method: 'PUT', body: JSON.stringify({ centerLat: Number(form.centerLat), centerLng: Number(form.centerLng), radiusMeter: Number(form.radiusMeter), enforceSessionOpen: form.enforceSessionOpen, arrivalGraceMinutes: Number(form.arrivalGraceMinutes), autoMissedGraceMinutes: Number(form.autoMissedGraceMinutes), requireGateTapForOpen: form.requireGateTapForOpen, allowPicketOverride: form.allowPicketOverride }) }); notify('Pengaturan lokasi sekolah tersimpan.'); policy.refresh(); }
  async function submitAttendance(e) { e.preventDefault(); if (!await riskConfirm('Simpan aturan absensi gerbang, mushola, dan kelas?')) return; try { await apiFetch('/attendance/policy', { method: 'PUT', body: JSON.stringify({ requireStudentGateInBeforeClass: attendanceForm.requireStudentGateInBeforeClass, requireStudentDhuha: attendanceForm.requireStudentDhuha, requireStudentDzuhur: attendanceForm.requireStudentDzuhur, requireStudentAsharForAfternoon: attendanceForm.requireStudentAsharForAfternoon, requireStudentClassEligibility: attendanceForm.requireStudentClassEligibility, requireTeacherGateIn: attendanceForm.requireTeacherGateIn, requireTeacherGateOut: attendanceForm.requireTeacherGateOut, requireStaffGateIn: attendanceForm.requireStaffGateIn, requireStaffGateOut: attendanceForm.requireStaffGateOut, allowManualOverride: attendanceForm.allowManualOverride, allowStudentAsharCheckoutOverride: attendanceForm.allowStudentAsharCheckoutOverride, dhuhaStartTime: attendanceForm.dhuhaStartTime, dhuhaEndTime: attendanceForm.dhuhaEndTime, dzuhurStartTime: attendanceForm.dzuhurStartTime, dzuhurEndTime: attendanceForm.dzuhurEndTime, asharStartTime: attendanceForm.asharStartTime, asharEndTime: attendanceForm.asharEndTime, asharRequiredClassEndTime: attendanceForm.asharRequiredClassEndTime, duplicateScanWindowMinutes: Number(attendanceForm.duplicateScanWindowMinutes) || 0, preferOfficialQrReader: attendanceForm.preferOfficialQrReader, legacyQrScanEnabled: attendanceForm.legacyQrScanEnabled, stepUpPassword: attendanceStepUpPassword }) }); setAttendanceStepUpPassword(''); notify('Aturan absensi tersimpan.'); attendancePolicy.refresh(); } catch (error) { notify(error.message || 'Aturan absensi gagal disimpan.', 'bad'); } }
  const setPolicyFlag = (key, value) => setForm({ ...form, [key]: value });
  const setAttendanceFlag = (key, value) => setAttendanceForm({ ...attendanceForm, [key]: value });
  const locationFlags = [
    ['enforceSessionOpen', 'Wajib berada di area sekolah saat buka sesi', 'Guru membuka sesi dari area sekolah yang sudah ditentukan.'],
    ['requireGateTapForOpen', 'Guru wajib scan gerbang sebelum buka sesi', 'Mencegah sesi dibuka sebelum guru hadir di sekolah.'],
    ['allowPicketOverride', 'Guru piket boleh memberi pengecualian', 'Dipakai untuk kasus jaringan, izin, atau kondisi khusus.']
  ];
  const groupedRules = [
    ['Aturan Siswa', [
      ['requireStudentGateInBeforeClass', 'Siswa wajib scan gerbang sebelum presensi kelas', 'Presensi kelas dikunci sampai siswa tercatat datang.'],
      ['requireStudentDhuha', 'Siswa wajib scan Dhuha', 'Aktifkan jika sekolah mewajibkan scan ibadah Dhuha.'],
      ['requireStudentDzuhur', 'Siswa wajib scan Dzuhur', 'Aktifkan jika sekolah mewajibkan scan Dzuhur.'],
      ['requireStudentAsharForAfternoon', 'Siswa wajib scan Ashar sebelum pulang jika jadwal sampai sore', 'Berlaku untuk siswa dengan jadwal melewati batas sore.'],
      ['requireStudentClassEligibility', 'Kunci presensi kelas jika syarat belum lengkap', 'Guru tidak bisa menandai hadir kelas sebelum syarat terpenuhi.']
    ]],
    ['Aturan Guru', [
      ['requireTeacherGateIn', 'Guru wajib scan gerbang masuk', 'Mencatat kedatangan guru sebelum aktivitas mengajar.'],
      ['requireTeacherGateOut', 'Guru wajib scan gerbang keluar', 'Mencatat kepulangan guru saat meninggalkan sekolah.']
    ]],
    ['Aturan Staff/TU', [
      ['requireStaffGateIn', 'Karyawan/TU/operator wajib scan masuk', 'Mencatat kehadiran staff dan operator.'],
      ['requireStaffGateOut', 'Karyawan/TU/operator wajib scan keluar', 'Mencatat kepulangan staff dan operator.']
    ]],
    ['Input Manual Cadangan', [
      ['allowManualOverride', 'Admin/Guru piket boleh verifikasi manual dengan alasan', 'Tetap wajib menulis alasan agar audit jelas.'],
      ['allowStudentAsharCheckoutOverride', 'Petugas boleh memberi pengecualian pulang tanpa scan Ashar', 'Hanya untuk kondisi yang sudah diverifikasi.'],
      ['preferOfficialQrReader', 'Jadikan aplikasi HP Android sebagai jalur utama', 'Dorong operator memakai HP scanner resmi.'],
      ['legacyQrScanEnabled', 'Izinkan input QR manual cadangan', 'Biarkan aktif selama masa transisi dan uji coba.']
    ]]
  ];
  const prayerTimes = [['dhuhaStartTime', 'Mulai Dhuha'], ['dhuhaEndTime', 'Selesai Dhuha'], ['dzuhurStartTime', 'Mulai Dzuhur'], ['dzuhurEndTime', 'Selesai Dzuhur'], ['asharStartTime', 'Mulai Ashar'], ['asharEndTime', 'Selesai Ashar'], ['asharRequiredClassEndTime', 'Batas disebut jadwal sore']];
  return <div className="content"><PageHead eyebrow="ATURAN ABSENSI" title="Aturan Absensi" sub="Atur aturan siswa, guru, mushola, dan HP scanner. Bagian angka/lokasi adalah pengaturan lanjutan." /><SimpleHelpBox title="Pakai pengaturan ini dengan hati-hati" items={['Untuk uji coba, biarkan input QR manual cadangan tetap aktif.', 'Aktifkan aplikasi HP Android sebagai jalur utama jika HP scanner sudah berhasil dipakai.', 'Jangan ubah lokasi sekolah tanpa konfirmasi operator.']} />{policy.loading || !form ? <LoadingState /> : policy.error ? <ErrorState error={policy.error} onRetry={policy.refresh} /> : <Card title="Kebijakan Lokasi" sub="Koordinat dan radius sekolah untuk validasi buka sesi."><form className="settings-form" onSubmit={submit}><div className="policy-field-grid">{[['centerLat', 'Lintang lokasi'], ['centerLng', 'Bujur lokasi'], ['radiusMeter', 'Jarak aman (meter)'], ['arrivalGraceMinutes', 'Toleransi terlambat (menit)'], ['autoMissedGraceMinutes', 'Otomatis ditandai terlewat (menit)']].map(([k, l]) => <Field key={k} label={l}><TextInput type="number" placeholder="Isi angka" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>)}</div><section className="policy-section"><h3>Kebijakan Lokasi</h3><div className="setting-list">{locationFlags.map(([key, title, helper]) => <SettingCheckRow key={key} checked={form[key]} title={title} helper={helper} onChange={(value) => setPolicyFlag(key, value)} />)}</div></section><div className="policy-save-row"><Btn variant="primary"><Save size={14} /> Simpan lokasi</Btn></div></form></Card>}{attendancePolicy.loading || !attendanceForm ? <LoadingState label="Memuat aturan absensi…" /> : attendancePolicy.error ? <ErrorState error={attendancePolicy.error} onRetry={attendancePolicy.refresh} /> : <Card title="Aturan Absensi" sub="Admin bisa menyalakan atau mematikan syarat scan sesuai aturan sekolah."><form className="settings-form" onSubmit={submitAttendance}>{groupedRules.map(([sectionTitle, rows]) => <section className="policy-section" key={sectionTitle}><h3>{sectionTitle}</h3><div className="setting-list">{rows.map(([key, title, helper]) => <SettingCheckRow key={key} checked={attendanceForm[key]} title={title} helper={helper} onChange={(value) => setAttendanceFlag(key, value)} />)}</div></section>)}<section className="policy-section"><h3>Pengaturan Sholat</h3><div className="policy-time-grid">{prayerTimes.map(([k, l]) => <Field key={k} label={l}><TextInput type="time" value={attendanceForm[k]} onChange={(e) => setAttendanceForm({ ...attendanceForm, [k]: e.target.value })} /></Field>)}<Field label="Jeda scan ganda (menit)"><TextInput type="number" value={attendanceForm.duplicateScanWindowMinutes} onChange={(e) => setAttendanceForm({ ...attendanceForm, duplicateScanWindowMinutes: e.target.value })} /></Field></div></section><Field label="Konfirmasi kata sandi" hint="Wajib untuk menyimpan aturan sensitif"><TextInput type="password" autoComplete="current-password" value={attendanceStepUpPassword} onChange={(e) => setAttendanceStepUpPassword(e.target.value)} required /></Field><div className="policy-save-row"><Btn variant="primary"><Save size={14} /> Simpan aturan absensi</Btn></div></form></Card>}</div>;
}

export const REPORT_FORMAT_OPTIONS = [
  { value: 'csv', label: 'CSV Data (.csv)' },
  { value: 'xlsx', label: 'Excel Resmi (.xlsx)' },
  { value: 'pdf', label: 'PDF Resmi (.pdf)' },
  { value: 'docx', label: 'Word Resmi (.docx)' }
];

const REPORT_EXPORT_TYPES = {
  'recap/classes': 'recap_classes',
  'recap/students': 'recap_students',
  'recap/subjects': 'recap_subjects',
  'recap/teachers': 'recap_teachers',
  'teacher-monthly': 'teacher_monthly',
  'staff-gate-attendance': 'staff_gate_attendance',
  'teacher-session-activity': 'teacher_session_activity',
  'student-prayer-attendance': 'student_prayer_attendance',
  'student-worship-recap': 'student_worship_recap',
  'student-daily-completeness': 'student_daily_complete_attendance',
  'missing-arrival-scan': 'missing_arrival_scan',
  'missing-departure-scan': 'missing_departure_scan',
  'class-present-no-gate-scan': 'class_present_no_gate_scan',
  'gate-scan-no-class-attendance': 'gate_scan_no_class_attendance',
  'prayer-recap': 'prayer_recap',
  'audit-coverage': 'audit_coverage'
};

const REPORT_DATE_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC'
});

export function formatReportDisplayDate(value) {
  const [year, month, day] = String(value || '').slice(0, 10).split('-').map((part) => Number(part));
  if (!year || !month || !day) return value || '—';
  return REPORT_DATE_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatReportPeriod(from, to) {
  const fromLabel = formatReportDisplayDate(from);
  const toLabel = formatReportDisplayDate(to);
  return fromLabel === toLabel ? fromLabel : `${fromLabel} sampai ${toLabel}`;
}

function monthFromDate(value) {
  return /^\d{4}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 7) : today().slice(0, 7);
}

export function buildOfficialReportExportPath(type, format, filters = {}) {
  const params = {
    reportType: REPORT_EXPORT_TYPES[type] || type.replace('/', '_'),
    format
  };
  if (type === 'teacher-monthly') {
    params.month = filters.month || monthFromDate(filters.from);
  } else {
    params.from = filters.from;
    params.to = filters.to;
  }
  ['classId', 'subjectId', 'teacherId', 'studentId', 'status', 'missingRequirement'].forEach((key) => {
    if (filters[key]) params[key] = filters[key];
  });
  return `/reports/export${qs(params)}`;
}

function buildReportPreviewPath(type, filters = {}) {
  if (type === 'teacher-monthly') {
    return `/reports/${type}${qs({ month: filters.month || monthFromDate(filters.from), page: 1, limit: 100 })}`;
  }
  const dailyCompletenessTypes = new Set(['student-daily-completeness', 'missing-arrival-scan', 'missing-departure-scan', 'class-present-no-gate-scan', 'gate-scan-no-class-attendance']);
  if (dailyCompletenessTypes.has(type)) {
    const missingRequirement = type === 'missing-arrival-scan' ? 'BELUM_SCAN_DATANG' : type === 'missing-departure-scan' ? 'BELUM_SCAN_PULANG' : filters.missingRequirement;
    return `/reports/student-daily-completeness${qs({ from: filters.from, to: filters.to, missingRequirement, page: 1, limit: 100 })}`;
  }
  if (type === 'prayer-recap') return `/reports/student-worship-recap${qs({ from: filters.from, to: filters.to, page: 1, limit: 100 })}`;
  return `/reports/${type}${qs({ from: filters.from, to: filters.to, page: 1, limit: 100 })}`;
}

export function ReportsPage({ notify }) {
  const [type, setType] = useState('recap/classes');
  const [format, setFormat] = useState('xlsx');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const previewPath = buildReportPreviewPath(type, { from, to });
  const state = useRemote(() => apiFetch(previewPath), [previewPath]);
  const [exporting, setExporting] = useState(false);
  const canExport = readStoredUser()?.role !== 'KEPALA_SEKOLAH';
  const periodLabel = formatReportPeriod(from, to);
  async function exportNow() {
    setExporting(true);
    try {
      await apiDownload(buildOfficialReportExportPath(type, format, { from, to }));
      notify('Laporan resmi berhasil diunduh.');
    } catch {
      notify('Laporan belum bisa diunduh. Coba persempit periode atau hubungi admin.', 'bad');
    } finally {
      setExporting(false);
    }
  }
  return <div className="content"><PageHead eyebrow="LAPORAN" title="Laporan Sekolah" sub={canExport ? 'Pilih jenis laporan, tentukan tanggal, lalu cetak atau unduh dokumen resmi.' : 'Pilih jenis laporan dan tanggal untuk pratinjau baca saja.'} actions={<><SelectInput wrapperClassName="select-report-type" aria-label="Pilih jenis laporan" value={type} onChange={(e) => setType(e.target.value)}><option value="recap/classes">Laporan Kelas</option><option value="recap/students">Laporan Siswa</option><option value="recap/subjects">Laporan Mapel</option><option value="recap/teachers">Laporan Guru</option><option value="teacher-monthly">Bulanan Guru</option><option value="staff-gate-attendance">Kepala/Staf Datang-Pulang</option><option value="teacher-session-activity">Guru Masuk Mengajar</option><option value="student-daily-completeness">Rekap Kehadiran Lengkap Siswa</option><option value="missing-arrival-scan">Belum Scan Datang</option><option value="missing-departure-scan">Belum Scan Pulang</option><option value="class-present-no-gate-scan">Hadir Kelas Tanpa Scan Gerbang</option><option value="gate-scan-no-class-attendance">Scan Gerbang Tanpa Absensi Kelas</option><option value="student-prayer-attendance">Sholat Siswa</option><option value="student-worship-recap">Rekap Ibadah Siswa</option><option value="prayer-recap">Rekap Sholat Siswa</option><option value="audit-coverage">Cek Cakupan</option></SelectInput><label className="input compact"><input aria-label="Tanggal awal laporan" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="input compact"><input aria-label="Tanggal akhir laporan" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>{canExport && <SelectInput wrapperClassName="select-report-format" aria-label="Pilih format ekspor" value={format} onChange={(e) => setFormat(e.target.value)}>{REPORT_FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectInput>}<Btn onClick={() => window.print()}><FileText size={14} /> Cetak Pratinjau / Cetak</Btn>{canExport && <Btn variant="primary" loading={exporting} disabled={exporting} onClick={exportNow}><Download size={14} /> {exporting ? 'Mengunduh...' : 'Unduh Laporan'}</Btn>}</>} /><StepGuide title="Cara membuat laporan" steps={canExport ? ['Pilih jenis laporan.', 'Pilih tanggal awal dan akhir.', 'Lihat pratinjau.', 'Pilih Excel Resmi (.xlsx), PDF Resmi (.pdf), Word Resmi (.docx), atau CSV Data (.csv).', 'Klik Unduh Laporan untuk mengambil dokumen resmi dari server.'] : ['Pilih jenis laporan.', 'Pilih tanggal awal dan akhir.', 'Lihat pratinjau baca saja.', 'Gunakan Cetak Pratinjau bila perlu.', 'Minta Admin/TU jika membutuhkan file resmi.']} /><div className="print-letterhead"><img src="/logoman1.jpeg" alt="Logo MAN 1 Rokan Hulu" /><div><b>{BRAND.institution}</b><span>{BRAND.fullName} · Periode {periodLabel}</span></div></div><div className="grid g-2"><Card title="Grafik ringkas" sub="Ditampilkan jika laporan memiliki angka yang bisa dibandingkan."><HorizontalBarList data={state.data} /></Card><Card title="Pratinjau Laporan"><GenericTableState state={state} /></Card></div><div className="print-signature"><div>Mengetahui,<br />Kepala Madrasah</div><div>Petugas,<br />Admin/TU</div></div></div>;
}

const REPORT_PREVIEW_LABELS = {
  fullName: 'Nama',
  username: 'Nama akun',
  schoolClass: 'Kelas',
  date: 'Tanggal',
  gateArrivalAt: 'Datang gerbang',
  gateDepartureAt: 'Pulang gerbang',
  classAttendanceLabel: 'Absensi kelas',
  prayerAttendanceLabel: 'Sholat',
  finalStatus: 'Status akhir',
  finalStatusLabel: 'Status akhir',
  note: 'Keterangan'
};

function reportPreviewValue(row, key) {
  const value = row[key];
  if (key === 'finalStatus') return friendlyDailyStatus(value);
  if (key === 'gateArrivalAt' || key === 'gateDepartureAt') return value ? formatDateTime(value) : '—';
  if (Array.isArray(value)) return value.map((item) => statusLabel(item)).join(', ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value !== undefined && value !== null ? String(value) : '—';
}

function GenericTableState({ state }) {
  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.refresh} />;
  const rows = itemsOf(state.data);
  if (!rows.length) return <FriendlyEmptyState title="Belum ada data laporan" sub="Coba ubah jenis laporan atau rentang tanggal." />;
  const hiddenKeys = new Set(['id', 'studentId', 'userId', 'classId', 'classAttendanceSummary', 'prayerAttendanceSummary', 'missingRequirementCodes', 'missingRequirements']);
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r).filter((k) => !hiddenKeys.has(k))))).slice(0, 8);
  return <DataTable rows={rows} columns={keys.map((key) => ({ header: REPORT_PREVIEW_LABELS[key] || key, render: (r) => reportPreviewValue(r, key) }))} />;
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [module, setModule] = useState('');
  const audit = useRemote(() => apiFetch(`/audit${qs({ page, limit: 50, module })}`), [page, module]);
  return <div className="content"><PageHead eyebrow="RIWAYAT PERUBAHAN" title="Riwayat Perubahan" sub="Catatan resmi sistem: siapa mengubah apa, kapan, dan alasannya." actions={<><SelectInput value={module} onChange={(e) => setModule(e.target.value)}><option value="">Semua modul</option><option value="attendance">Presensi</option><option value="identity">Pengguna</option><option value="academic">Akademik</option><option value="scheduling">Jadwal</option><option value="device">Perangkat</option><option value="access">Akses lokasi</option><option value="picket">Catatan piket</option></SelectInput><Btn onClick={audit.refresh}><RefreshCw size={14} /> Muat ulang</Btn></>} /><Card><AsyncTable state={audit} empty={{ title: 'Belum ada riwayat perubahan', sub: 'Setelah admin mengubah data, catatan akan muncul di sini.' }} columns={[{ header: 'Waktu', render: (r) => formatDateTime(r.createdAt) }, { header: 'Aksi', key: 'action' }, { header: 'Modul', key: 'module' }, { header: 'Pelaku', render: (r) => r.actor?.fullName || r.actorId || 'sistem' }, { header: 'Data', render: (r) => `${r.resource}:${r.resourceId}` }, { header: 'Alasan', render: (r) => r.reason || r.after?.reason || '—' }]} /><Pagination meta={metaOf(audit.data)} onPage={setPage} /></Card></div>;
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
  return <div className="content"><PageHead eyebrow="CATATAN PIKET" title="Catatan Piket" sub="Tulis kejadian penting dengan bahasa singkat agar petugas berikutnya mudah memahami." actions={<><label className="input compact"><input aria-label="Tanggal catatan piket" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><SelectInput aria-label="Filter kategori catatan" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Semua kategori</option><option value="UMUM">Umum</option><option value="GERBANG">Gerbang</option><option value="KELAS">Kelas</option><option value="DISIPLIN">Disiplin</option></SelectInput><SelectInput aria-label="Filter tingkat catatan" value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="">Semua tingkat</option><option value="INFO">Informasi</option><option value="WARN">Perhatian</option><option value="URGENT">Penting</option></SelectInput></>} /><div className="grid g-3"><Card title={form.id ? 'Edit Catatan' : 'Catat Kejadian'} sub="Isi seperti buku catatan biasa: judul, jenis kejadian, tingkat penting, lalu detailnya."><form onSubmit={add} className="form-grid"><Field label="Judul kejadian"><TextInput value={form.title} placeholder="Contoh: Siswa terlambat di gerbang" onChange={(e) => set('title', e.target.value)} required /></Field><Field label="Jenis kejadian"><SelectInput value={form.category} onChange={(e) => set('category', e.target.value)}><option value="UMUM">Umum</option><option value="GERBANG">Gerbang</option><option value="KELAS">Kelas</option><option value="DISIPLIN">Disiplin</option></SelectInput></Field><Field label="Tingkat penting"><SelectInput value={form.severity} onChange={(e) => set('severity', e.target.value)}><option value="INFO">Informasi</option><option value="WARN">Perhatian</option><option value="URGENT">Penting</option></SelectInput></Field><Field label="Catatan"><TextInput type="textarea" rows={5} value={form.body} placeholder="Tuliskan kronologi atau catatan penting" onChange={(e) => set('body', e.target.value)} required /></Field><Btn variant="primary"><Save size={14} /> Simpan</Btn>{form.id && <Btn type="button" variant="ghost" onClick={() => reset({ id: '', title: '', body: '', category: 'UMUM', severity: 'INFO' })}>Batal edit</Btn>}</form></Card><Card title="Catatan Hari Ini"><AsyncTable state={notes} columns={[{ header: 'Waktu', render: (r) => formatDateTime(r.date) }, { header: 'Judul', key: 'title' }, { header: 'Kategori', key: 'category' }, { header: 'Tingkat', render: (r) => <StatusPill status={r.severity} /> }, { header: 'Petugas', render: (r) => r.createdBy?.fullName || '—' }]} onRow={(r) => <div className="row"><Btn size="sm" onClick={() => setForm({ id: r.id, title: r.title, body: r.body, category: r.category, severity: r.severity })}>Edit</Btn><Btn size="sm" variant="danger" onClick={() => remove(r)}>Hapus</Btn></div>} /></Card></div></div>;
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
  return <div className="content"><PageHead eyebrow="AKTIVITAS SEKARANG" title="Aktivitas Sekarang" sub="Aktivitas scan, sesi kelas, dan perubahan terbaru. Halaman ini otomatis memuat ulang." actions={<Btn onClick={() => setAuto((x) => !x)}><Zap size={14} /> {auto ? 'Jeda' : 'Lanjutkan'}</Btn>} /><Card title="Daftar aktivitas"><AsyncTable state={state} columns={[{ header: 'Waktu', render: (r) => formatDateTime(r.timestamp) }, { header: 'Tipe', render: (r) => <StatusPill status={r.type} /> }, { header: 'Subjek', render: (r) => r.title || r.actorName || '—' }, { header: 'Lokasi/Konteks', render: (r) => [r.location, r.context].filter(Boolean).join(' · ') || '—' }]} /></Card></div>;
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
  async function read(row) { await apiFetch(`/notifications/${row.id}/read`, { method: 'PATCH', body: JSON.stringify({}) }); notifications.refresh(); window.dispatchEvent(new Event('schoolhub_notifications_refresh')); }
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
  const roleChoices = [['', 'Semua peran'], ['ADMIN_TU', 'Admin/TU'], ['KEPALA_SEKOLAH', 'Kepala Sekolah'], ['OPERATOR_IT', 'Operator IT'], ['GURU_PIKET', 'Guru Piket'], ['GURU_MAPEL', 'Guru Mapel'], ['SISWA', 'Siswa'], ['DEVELOPER', 'Developer']];
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
    KEPALA_SEKOLAH: {
      title: 'Panduan Kepala Sekolah',
      tasks: [
        { title: 'Ringkasan Kepala Sekolah', desc: 'Pantau kondisi hari ini dalam mode baca saja.', icon: <Eye size={18} />, onClick: () => go('/admin/principal-dashboard') },
        { title: 'Kehadiran lengkap siswa', desc: 'Cek kelengkapan gerbang, kelas, dan sholat.', icon: <CheckSquare size={18} />, onClick: () => go('/admin/student-completeness') },
        { title: 'Laporan sekolah', desc: 'Buka pratinjau laporan.', icon: <FileText size={18} />, onClick: () => go('/admin/reports') }
      ],
      steps: ['Buka Ringkasan Kepala Sekolah.', 'Cek indikator yang perlu perhatian.', 'Koordinasikan tindak lanjut ke Admin/TU, Operator IT, atau Guru Piket.']
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
