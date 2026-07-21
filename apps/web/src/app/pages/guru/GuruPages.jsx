import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, BarChart3, Check, CheckSquare, Clock, MapPin, Save, Users, X, Activity, DoorOpen, CheckCircle2 } from 'lucide-react';
import { apiFetch, formatDateTime, go, itemsOf, monthNow, qs, today } from '../../api';
import { riskConfirm } from '../../confirm';
import { BrowserGeoError, captureBrowserGeolocation } from '../../geolocation';
import { useRemote } from '../../hooks';
import { Avatar, Btn, Card, DataTable, EmptyState, ErrorState, Field, HorizontalBarList, LoadingState, PageHead, Pill, RosterProgress, RoleTaskPanel, SelectInput, SimpleHelpBox, StackedBar, StatCardPremium, StatusDonut, StatusPill, StepGuide, TextInput, statusLabel } from '../../ui';
import { MyAttendancePage } from '../siswa/MyAttendancePage.jsx';

const STATUS = ['HADIR', 'TELAT', 'IZIN', 'SAKIT', 'ALPA'];

function countByStatus(rows) {
  return itemsOf(rows).reduce((acc, row) => {
    const status = row.status || row.attendanceStatus || row.presenceStatus || 'LAINNYA';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

function sessionSegments(rows) {
  const counts = countByStatus(rows);
  return [
    { label: 'Berjalan', value: counts.OPEN || 0, tone: 'ok' },
    { label: 'Terjadwal', value: counts.SCHEDULED || 0, tone: 'warn' },
    { label: 'Selesai', value: counts.CLOSED || 0, tone: 'info' },
    { label: 'Terlewat', value: counts.MISSED || 0, tone: 'bad' }
  ];
}

function GenericTableState({ state }) {
  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.refresh} />;
  const rows = itemsOf(state.data);
  if (!rows.length) return <EmptyState title="Belum ada data" sub="Data akan muncul setelah tersedia." />;
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r).filter((k) => !['id'].includes(k))))).slice(0, 8);
  return <DataTable rows={rows} columns={keys.map((key) => ({ header: key, render: (r) => typeof r[key] === 'object' ? JSON.stringify(r[key]) : String(r[key] ?? '—') }))} />;
}

function scanWarningLabels(eligibility) {
  const reasons = Array.isArray(eligibility?.reasons) ? eligibility.reasons : [];
  const labels = new Set();
  for (const reason of reasons) {
    const text = String(reason || '').toLowerCase();
    if (!text || text.includes('diizinkan manual')) continue;
    if (text.includes('gerbang') && (text.includes('pulang') || text.includes('keluar'))) labels.add('Belum scan pulang');
    else if (text.includes('gerbang') || text.includes('datang') || text.includes('masuk')) labels.add('Belum scan datang');
    else if (text.includes('sholat') || text.includes('salat') || text.includes('dhuha') || text.includes('dzuhur') || text.includes('ashar')) labels.add('Belum scan sholat');
    else labels.add('Perlu verifikasi');
  }
  return Array.from(labels);
}

const ATTENDANCE_FRIENDLY = {
  date: 'Tanggal',
  startsAt: 'Waktu Mulai',
  endsAt: 'Jam Selesai',
  status: 'Status',
  attendanceStatus: 'Status',
  presenceStatus: 'Status',
  subjectName: 'Mata Pelajaran',
  classCode: 'Kelas',
  note: 'Keterangan',
  reason: 'Alasan',
  checkInAt: 'Absen Masuk',
  checkOutAt: 'Absen Keluar',
};

function AttendanceTableState({ state }) {
  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.refresh} />;
  const rows = itemsOf(state.data);
  if (!rows.length) return <EmptyState title="Belum ada data kehadiran" sub="Data akan muncul setelah sesi berjalan dan dicatat." />;
  const STATUS_KEYS = new Set(['status', 'attendanceStatus', 'presenceStatus']);
  const DATE_KEYS = new Set(['startsAt', 'endsAt', 'date', 'checkInAt', 'checkOutAt', 'at']);
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r).filter((k) => !['id'].includes(k) && ATTENDANCE_FRIENDLY[k])))).slice(0, 7);
  if (!keys.length) {
    const allKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r).filter((k) => !['id'].includes(k))))).slice(0, 6);
    return <DataTable rows={rows} columns={allKeys.map((key) => ({ header: key, render: (r) => typeof r[key] === 'object' ? JSON.stringify(r[key]) : String(r[key] ?? '—') }))} />;
  }
  return <DataTable rows={rows} columns={keys.map((key) => ({
    header: ATTENDANCE_FRIENDLY[key] || key,
    render: (r) => {
      const val = r[key];
      if (STATUS_KEYS.has(key) && val) return <StatusPill status={val} />;
      if (DATE_KEYS.has(key) && val) return formatDateTime(val);
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val !== undefined && val !== null ? String(val) : '—';
    }
  }))} />;
}

function teacherSessionStatusLabel(status) {
  return ({
    SCHEDULED: 'Belum mulai',
    OPEN: 'Sedang berjalan',
    CLOSED: 'Sudah ditutup',
    MISSED: 'Terlewat'
  })[String(status)] || statusLabel(status);
}

function teacherSessionTone(status) {
  return ({ SCHEDULED: 'warn', OPEN: 'ok', CLOSED: 'info', MISSED: 'bad' })[String(status)] || '';
}

function presensiPath(sessionId) {
  return `/guru/presensi${qs({ sessionId })}`;
}

function sessionClassSubjectTitle(session) {
  const text = (value) => typeof value === 'string' ? value.trim() : '';
  const subjectName = text(session?.subject?.name) || text(session?.subjectName);
  const classCode = text(session?.schoolClass?.code) || text(session?.schoolClass) || text(session?.className);
  if (subjectName && classCode) return `${subjectName} · ${classCode}`;
  return subjectName || classCode || 'Presensi Guru';
}

function TeacherTodaySessionCard({ item }) {
  const rosterCountsKnown = Number.isFinite(item.studentTotal) && Number.isFinite(item.pendingCount);
  const progressTotal = rosterCountsKnown ? Math.max(0, Number(item.studentTotal)) : null;
  const filled = Math.max(0, Number(item.attendanceFilledCount || 0));
  const pending = rosterCountsKnown ? Math.max(0, Number(item.pendingCount)) : null;
  const rosterState = item.rosterState || item.rosterProvenance;
  const warnings = [];
  if (item.status === 'OPEN') warnings.push('Sesi ini belum ditutup.');
  if (item.status === 'SCHEDULED') warnings.push('Presensi belum dimulai.');
  if (item.status === 'MISSED') warnings.push('Sesi ini belum ditutup.');
  if (pending !== null && pending > 0) warnings.push('Masih ada siswa yang belum diabsen.');
  if (rosterState === 'BACKFILLED_UNVERIFIED') warnings.push('Roster hasil pemulihan/perbaikan; data historis tidak sepenuhnya terverifikasi.');

  return <article className={`teacher-session-card ${teacherSessionTone(item.status)}`}>
    <div className="teacher-session-main">
      <div className="teacher-session-copy">
        <div className="teacher-session-kicker"><Clock size={14} /> {item.startTime || '—'}–{item.endTime || '—'} <StatusPill status={item.status} /></div>
        <h3>{item.className || 'Kelas'} · {item.subjectName || 'Mata pelajaran'}</h3>
        <div className="teacher-session-meta"><span>{teacherSessionStatusLabel(item.status)}</span>{rosterCountsKnown ? <><span>{filled}/{progressTotal} siswa</span><span>{pending} belum diabsen</span></> : <span>Jumlah roster belum terverifikasi</span>}</div>
        {rosterCountsKnown && <div className="teacher-session-progress"><RosterProgress current={filled} total={progressTotal} /></div>}
        {warnings.length > 0 && <div className="teacher-session-warnings">{warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}
      </div>
      <div className="teacher-session-actions" aria-label={`Aksi ${item.className || 'kelas'}`}>
        {item.actions?.canStart && <Btn variant="primary" onClick={() => go(presensiPath(item.sessionId))}><CheckSquare size={14} /> Mulai Presensi</Btn>}
        {item.actions?.canContinue && <Btn variant="primary" onClick={() => go(presensiPath(item.sessionId))}><ArrowRight size={14} /> Lanjutkan Presensi</Btn>}
        {item.actions?.canClose && <Btn onClick={() => go(presensiPath(item.sessionId))}><Check size={14} /> Tutup Sesi</Btn>}
        {item.actions?.canViewRecap && <Btn onClick={() => go('/guru/rekap')}><BarChart3 size={14} /> Lihat Rekap</Btn>}
      </div>
    </div>
  </article>;
}

export function TeacherDashboard() {
  const todayState = useRemote(() => apiFetch('/teacher/today'), []);
  const data = todayState.data || {};
  const summary = data.summary || {};
  const rows = itemsOf(data);
  const hasUnclosed = Number(summary.unclosed || 0) > 0;

  return <div className="content dashboard-redesign teacher-today-workspace"><PageHead eyebrow="GURU MAPEL" title="Kelas Saya Hari Ini" sub="Pantau jadwal mengajar dan selesaikan presensi kelas tanpa membuka banyak menu." actions={<Btn variant="primary" onClick={() => go('/guru/presensi')}><CheckSquare size={14} /> Mulai Presensi</Btn>} />
    <RoleTaskPanel title="Aksi cepat guru" tasks={[{ title: 'Isi presensi', desc: 'Buka sesi hari ini dan selesaikan presensi siswa.', icon: <CheckSquare size={18} />, tone: 'ok', onClick: () => go('/guru/presensi') }, { title: 'Perbaiki presensi', desc: 'Koreksi data jika ada kesalahan dengan alasan.', icon: <Save size={18} />, onClick: () => go('/guru/koreksi') }, { title: 'Laporan kelas', desc: 'Lihat rekap kelas yang Anda ajar.', icon: <BarChart3 size={18} />, onClick: () => go('/guru/rekap') }]} />
    {todayState.loading ? <LoadingState /> : todayState.error ? <ErrorState error={todayState.error} onRetry={todayState.refresh} /> : <>
      {hasUnclosed && <div className="inline-note warn"><Clock size={14} /> Ada {summary.unclosed} sesi yang belum ditutup. Selesaikan dari tombol Lanjutkan Presensi atau Tutup Sesi.</div>}
      {Number(summary.unknownRosterSessions || 0) > 0 && <div className="inline-note warn"><AlertTriangle size={14} /> Jumlah roster belum terverifikasi pada {summary.unknownRosterSessions} sesi.</div>}
      {Number(summary.backfilledRosterSessions || 0) > 0 && <div className="inline-note warn"><AlertTriangle size={14} /> Roster hasil pemulihan/perbaikan; data historis tidak sepenuhnya terverifikasi.</div>}
      <div className="grid g-4 teacher-today-kpis"><StatCardPremium icon={<Clock size={18} />} label="Sesi hari ini" value={summary.sessionsToday || 0} sub="Total jadwal mengajar" /><StatCardPremium icon={<Activity size={18} />} label="Sedang berjalan" value={summary.open || 0} sub="Sesi OPEN" tone={summary.open ? 'ok' : ''} /><StatCardPremium icon={<Users size={18} />} label="Belum ditutup" value={summary.unclosed || 0} sub={`${summary.studentsPendingAttendance || 0} siswa belum diabsen`} tone={summary.unclosed ? 'warn' : 'ok'} /><StatCardPremium icon={<CheckCircle2 size={18} />} label="Selesai" value={summary.closed || 0} sub="Sesi sudah ditutup" tone="info" /></div>
      <Card title="Daftar jadwal/sesi hari ini" sub="Pilih aksi sesuai status sesi.">{rows.length ? <div className="teacher-session-list">{rows.map((item) => <TeacherTodaySessionCard key={item.sessionId} item={item} />)}</div> : <EmptyState title="Tidak ada jadwal mengajar hari ini." sub="Jadwal akan tampil otomatis sesuai data yang diatur admin." action={<Btn onClick={() => go('/guru/kehadiran-saya')}>Lihat Kehadiran Saya</Btn>} />}</Card>
      <Card title="Status sesi" sub="Ringkasan sesi hari ini."><StackedBar segments={[{ label: 'Belum mulai', value: summary.scheduled || 0, tone: 'warn' }, { label: 'Sedang berjalan', value: summary.open || 0, tone: 'ok' }, { label: 'Sudah ditutup', value: summary.closed || 0, tone: 'info' }, { label: 'Terlewat', value: summary.missed || 0, tone: 'bad' }]} total={summary.sessionsToday || 0} /></Card>
    </>}
  </div>;
}

export function ClassInputPage({ notify }) {
  const sessions = useRemote(() => apiFetch(`/attendance/class-sessions${qs({ date: today(), page: 1, limit: 50 })}`), []);
  const [sessionId, setSessionId] = useState(() => new URLSearchParams(window.location.search).get('sessionId') || '');
  const [earlyReason, setEarlyReason] = useState('Kelas diakhiri lebih awal atas kondisi yang sudah dicatat.');
  const [nowTick, setNowTick] = useState(Date.now());
  const [actionLoading, setActionLoading] = useState('');
  const [geoStatus, setGeoStatus] = useState({ tone: 'info', message: 'Lokasi browser akan diminta saat absen masuk dan keluar.' });
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const rows = itemsOf(sessions.data);
    const requestedSessionId = new URLSearchParams(window.location.search).get('sessionId') || '';
    if (requestedSessionId && rows.some((s) => s.id === requestedSessionId)) {
      if (sessionId !== requestedSessionId) setSessionId(requestedSessionId);
      return;
    }
    const first = rows.find((s) => s.status === 'OPEN') || rows.find((s) => s.status === 'SCHEDULED') || rows[0];
    if (first && !sessionId) setSessionId(first.id);
  }, [sessions.data, sessionId]);
  const rosterState = useRemote(() => sessionId ? apiFetch(`/attendance/class-sessions/${sessionId}/roster`) : Promise.resolve({ roster: [] }), [sessionId]);
  const [roster, setRoster] = useState([]);
  useEffect(() => {
    if (rosterState.data?.roster) {
      setRoster(rosterState.data.roster.map((row) => ({ ...row, dirty: false, explicitlyConfirmed: false })));
    }
  }, [rosterState.data]);
  const current = itemsOf(sessions.data).find((s) => s.id === sessionId);
  const sessionDetail = rosterState.data?.session || current;
  const teacherPresence = sessionDetail?.teacherPresence || current?.teacherPresence?.find?.((item) => item.teacherId === current?.teacher?.id) || null;
  const presensiTitle = sessionClassSubjectTitle(sessionDetail);
  const endsAt = sessionDetail?.endsAt ? new Date(sessionDetail.endsAt) : null;
  const startsAt = sessionDetail?.startsAt ? new Date(sessionDetail.startsAt) : null;
  const isEarlyCheckout = Boolean(endsAt && nowTick < endsAt.getTime());
  const isOpen = current?.status === 'OPEN' || sessionDetail?.status === 'OPEN';
  const counts = STATUS.reduce((acc, st) => ({ ...acc, [st]: roster.filter((r) => r.status === st).length }), {});
  const completedCount = roster.filter((r) => (r.reviewState && r.reviewState !== 'DEFAULTED') || r.explicitlyConfirmed).length;
  const defaultedCount = Math.max(0, roster.length - completedCount);
  const presentLikeCount = counts.HADIR + counts.TELAT + counts.IZIN + counts.SAKIT;
  const progressPercent = roster.length ? Math.round((completedCount / roster.length) * 100) : 0;
  const setStatus = (studentId, status) => setRoster((prev) => prev.map((r) => {
    if (r.studentId !== studentId) return r;
    return { ...r, status, dirty: true, explicitlyConfirmed: true };
  }));
  async function openSession() {
    if (!sessionId) { notify('Pilih sesi terlebih dahulu.', 'warn'); return; }
    setActionLoading('open');
    setGeoStatus({ tone: 'info', message: 'Meminta izin lokasi akurat dari browser...' });
    try {
      const location = await captureBrowserGeolocation();
      setGeoStatus({ tone: 'ok', message: `Lokasi diterima (akurasi ±${Math.round(location.accuracyMeter)} m).` });
      await apiFetch(`/attendance/class-sessions/${sessionId}/open`, { method: 'POST', body: JSON.stringify(location) });
      sessions.refresh(); rosterState.refresh(); notify('Absen masuk guru tercatat. Silakan isi presensi siswa awal pembelajaran.');
    } catch (error) {
      const message = error instanceof BrowserGeoError ? error.message : (error.message || 'Gagal membuka sesi.');
      setGeoStatus({ tone: 'bad', message });
      notify(message, 'bad');
    } finally { setActionLoading(''); }
  }
  async function saveBatch() {
    if (!sessionId || !roster.length) { notify('Pilih sesi dan pastikan daftar siswa sudah muncul.', 'warn'); return; }
    setActionLoading('save');
    try {
      const items = roster
        .filter((r) => r.dirty || r.explicitlyConfirmed)
        .map((r) => ({ studentId: r.studentId, status: r.status, note: r.note || undefined, updatedAt: r.updatedAt || undefined, confirm: true }));
      const result = await apiFetch(`/attendance/class-sessions/${sessionId}/attendance`, { method: 'PUT', body: JSON.stringify({ items }) });
      rosterState.refresh();
      notify(result.message || 'Presensi siswa awal pembelajaran tersimpan.');
    } catch (error) { notify(error.message || 'Gagal menyimpan presensi.', 'bad'); } finally { setActionLoading(''); }
  }
  async function bulkPresent() {
    if (!sessionId || !roster.length) { notify('Pilih sesi dan pastikan daftar siswa sudah muncul.', 'warn'); return; }
    setActionLoading('bulk-present');
    try {
      const result = await apiFetch(`/attendance/class-sessions/${sessionId}/attendance/bulk-present`, { method: 'POST' });
      rosterState.refresh();
      notify(result.message || 'Semua siswa default dikonfirmasi hadir.');
    } catch (error) { notify(error.message || 'Gagal konfirmasi hadir massal.', 'bad'); } finally { setActionLoading(''); }
  }
  async function bulkAlpa() {
    if (!sessionId || !roster.length) { notify('Pilih sesi dan pastikan daftar siswa sudah muncul.', 'warn'); return; }
    if (!await riskConfirm('Semua siswa yang masih ALPA default akan dikonfirmasi ALPA. Status yang sudah dikonfirmasi tidak diubah.', 'Konfirmasi Alpa')) return;
    setActionLoading('bulk-alpa');
    try {
      const result = await apiFetch(`/attendance/class-sessions/${sessionId}/attendance/bulk-alpa`, { method: 'POST' });
      rosterState.refresh();
      notify(result.message || 'ALPA default dikonfirmasi.');
    } catch (error) { notify(error.message || 'Gagal konfirmasi ALPA.', 'bad'); } finally { setActionLoading(''); }
  }
  async function closeSession() {
    if (!sessionId || !roster.length) { notify('Pilih sesi dan isi presensi terlebih dahulu.', 'warn'); return; }
    if (isEarlyCheckout && earlyReason.trim().length < 10) { notify('Isi alasan keluar lebih awal minimal 10 karakter.', 'warn'); return; }
    let finalizeDefaultAlpa = false;
    if (progressPercent < 100) {
      if (!await riskConfirm(`Masih ada ${defaultedCount} siswa ALPA default yang belum dikonfirmasi. Finalisasi sebagai ALPA dan akhiri kelas?`)) return;
      finalizeDefaultAlpa = true;
    } else if (!await riskConfirm('Absen keluar dan akhiri kelas? Pastikan presensi siswa awal pembelajaran sudah disimpan.')) return;
    setActionLoading('close');
    setGeoStatus({ tone: 'info', message: 'Mengambil lokasi keluar kelas dari browser...' });
    try {
      const location = await captureBrowserGeolocation();
      setGeoStatus({ tone: 'ok', message: `Lokasi keluar diterima (akurasi ±${Math.round(location.accuracyMeter)} m).` });
      await apiFetch(`/attendance/class-sessions/${sessionId}/close`, { method: 'POST', body: JSON.stringify({ ...location, finalizeDefaultAlpa, ...(isEarlyCheckout ? { earlyCheckoutReason: earlyReason } : {}) }) });
      sessions.refresh(); rosterState.refresh(); notify('Absen keluar guru tercatat. Rekonsiliasi akan berjalan otomatis.');
    } catch (error) {
      const message = error instanceof BrowserGeoError ? error.message : (error.message || 'Gagal menutup sesi.');
      setGeoStatus({ tone: 'bad', message });
      notify(message, 'bad');
    } finally { setActionLoading(''); }
  }
  return <div className="content teacher-attendance-flow"><PageHead eyebrow="PRESENSI KELAS" title={presensiTitle} sub="Alur sederhana: Masuk Kelas → Semua Hadir/ubah pengecualian → Simpan → Tutup Sesi." actions={<div className="session-picker-control"><Field label="Pilih sesi"><SelectInput wrapperClassName="session-picker-select" value={sessionId} onChange={(e) => setSessionId(e.target.value)}><option value="">Pilih sesi yang tersedia</option>{itemsOf(sessions.data).map((s) => <option key={s.id} value={s.id}>{sessionClassSubjectTitle(s)} · {statusLabel(s.status)}</option>)}</SelectInput></Field></div>} />
    <StepGuide title="Urutan kerja guru" steps={['Pilih sesi yang benar.', 'Klik Masuk Kelas.', 'Klik Semua Hadir bila mayoritas hadir.', 'Ubah pengecualian: Telat, Izin, Sakit, atau Alpa.', 'Klik Simpan, lalu Tutup Sesi.']} />
    <div className="attendance-checkpoint"><div><span className="eyebrow">CHECKPOINT PRESENSI</span><b>{progressPercent}% selesai</b><small>{completedCount}/{roster.length || 0} siswa sudah dikonfirmasi. {defaultedCount ? `${defaultedCount} masih ALPA default.` : ''} {isOpen ? 'Sesi sedang bisa diisi.' : 'Buka sesi terlebih dahulu untuk mengubah status.'}</small></div><RosterProgress current={completedCount} total={roster.length} /></div>
    <div className="grid g-4"><StatCardPremium icon={<Clock size={18} />} label="Jam Mulai" value={startsAt ? startsAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '—'} sub={teacherPresence?.checkInAt ? `Masuk ${formatDateTime(teacherPresence.checkInAt)}` : 'Guru belum absen masuk'} /><StatCardPremium icon={<DoorOpen size={18} />} label="Jam Selesai" value={endsAt ? endsAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '—'} sub={teacherPresence?.checkOutAt ? `Keluar ${formatDateTime(teacherPresence.checkOutAt)}` : isEarlyCheckout ? 'Belum waktunya keluar' : 'Sudah boleh absen keluar'} tone={isEarlyCheckout ? 'warn' : 'ok'} /><StatCardPremium icon={<Activity size={18} />} label="Status Guru" value={teacherPresence?.status ? statusLabel(teacherPresence.status) : statusLabel(current?.status)} sub="Masuk/keluar kelas" /><StatCardPremium icon={<CheckCircle2 size={18} />} label="Siswa Tercatat" value={roster.length} sub={`${counts.HADIR || 0} hadir · ${counts.ALPA || 0} alpa`} /></div>
    <Card title="Aksi guru" sub="Aksi presensi siswa dipisah dari absen keluar guru agar data awal pembelajaran tidak berubah tanpa sengaja.">
      <div className={`inline-note ${geoStatus.tone}`} style={{ marginBottom: 12 }}><MapPin size={14} /> {geoStatus.message}</div>
      {isOpen && roster.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--fg-dim)', fontWeight: 600 }}>Kelengkapan presensi</span>
            <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {presentLikeCount} / {roster.length} siswa
            </span>
          </div>
          <RosterProgress current={presentLikeCount} total={roster.length} />
        </div>
      )}<div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><Btn variant="primary" loading={actionLoading === 'open'} onClick={openSession} disabled={!sessionId || isOpen || Boolean(actionLoading)}><Check size={14} /> Masuk Kelas</Btn><Btn loading={actionLoading === 'bulk-present'} onClick={bulkPresent} disabled={!isOpen || Boolean(actionLoading)}><Users size={14} /> Semua Hadir</Btn><Btn variant="danger" loading={actionLoading === 'bulk-alpa'} onClick={bulkAlpa} disabled={!isOpen || Boolean(actionLoading)}><X size={14} /> Tandai Alpa</Btn><Btn loading={actionLoading === 'save'} onClick={saveBatch} disabled={!roster.length || !isOpen || Boolean(actionLoading)}><Save size={14} /> Simpan</Btn><Btn variant="primary" loading={actionLoading === 'close'} onClick={closeSession} disabled={!roster.length || !isOpen || Boolean(actionLoading)}>Tutup Sesi <ArrowRight size={14} /></Btn></div>{isEarlyCheckout && isOpen && <Field label="Alasan keluar sebelum jam selesai" hint={`${earlyReason.trim().length}/10+`}><TextInput value={earlyReason} onChange={(e) => setEarlyReason(e.target.value)} placeholder="Wajib diisi jika kelas diakhiri sebelum jam selesai" /></Field>}</Card>
    <div className="grid g-2 chart-summary"><Card title="Presensi siswa" sub="Tandai semua Hadir, lalu ubah siswa yang Telat/Izin/Sakit/Alpa."><StatusDonut counts={counts} title="Status siswa" /></Card><Card title="Ringkasan sebelum Tutup Sesi" sub="Periksa ulang sebelum mengakhiri kelas."><StackedBar segments={STATUS.map((st) => ({ label: statusLabel(st), value: counts[st] || 0, tone: st === 'HADIR' ? 'ok' : st === 'ALPA' ? 'bad' : st === 'TELAT' ? 'warn' : 'info' }))} /></Card></div><div className="dock dock-sticky" aria-label="Ringkasan status presensi"><div className="dock-stats">{STATUS.map((st) => <span className="s" key={st}><span className="k">{statusLabel(st)}</span><span className="v">{counts[st] || 0}</span></span>)}</div>{isOpen && <Btn size="sm" variant="primary" loading={actionLoading === 'save'} onClick={saveBatch} disabled={!roster.length || Boolean(actionLoading)}><Save size={13} /> Simpan</Btn>}</div>{rosterState.loading ? <LoadingState /> : rosterState.error ? <ErrorState error={rosterState.error} /> : <div className="roster">{roster.map((s, i) => {
      const warningLabels = scanWarningLabels(s.eligibility);
      return <div key={s.studentId} className="roster-row"><div className="roster-idx">{String(i + 1).padStart(2, '0')}</div><Avatar name={s.fullName} /><div className="roster-student"><div className="roster-name">{s.fullName}</div><div className="roster-meta">{s.username} · kartu {statusLabel(s.cardStatus)} · {warningLabels.length ? 'Catatan scan perlu dipantau petugas' : 'Tidak ada catatan scan'}</div>{warningLabels.length > 0 && <div className="row-actions" aria-label="Catatan scan siswa">{warningLabels.map((label) => <Pill key={label} tone="warn">{label}</Pill>)}</div>}</div><div className="statuspick">{STATUS.map((st) => <button key={st} className={`${s.status === st ? 'on ' : ''}${st.toLowerCase()}`} disabled={!isOpen || Boolean(actionLoading)} onClick={() => setStatus(s.studentId, st)}>{statusLabel(st)}</button>)}</div></div>;
    })}</div>}</div>;
}

export function CorrectionPage({ notify }) {
  const [sessionId, setSessionId] = useState('');
  const sessions = useRemote(() => apiFetch('/attendance/class-sessions?page=1&limit=100'), []);
  const roster = useRemote(() => sessionId ? apiFetch(`/attendance/class-sessions/${sessionId}/roster`) : Promise.resolve({ roster: [] }), [sessionId]);
  const [studentId, setStudentId] = useState('');
  const [status, setStatus] = useState('SAKIT');
  const [reason, setReason] = useState('Surat/keterangan diterima dan diverifikasi.');
  const [saving, setSaving] = useState(false);
  async function submit(e) { e.preventDefault(); setSaving(true); try { await apiFetch(`/attendance/class-sessions/${sessionId}/attendance/${studentId}`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }); roster.refresh(); notify('Perbaikan tersimpan dan tercatat di riwayat perubahan.'); } catch (error) { notify(error.message || 'Gagal menyimpan koreksi.', 'bad'); } finally { setSaving(false); } }
  return <div className="content"><PageHead eyebrow="PERBAIKI PRESENSI" title="Perbaiki Presensi" sub="Gunakan hanya jika ada data yang salah, dan tulis alasan dengan jelas." /><StepGuide title="Cara koreksi" steps={['Pilih sesi.', 'Pilih siswa.', 'Pilih status baru.', 'Tulis alasan.', 'Klik Simpan koreksi.']} /><Card><form className="form-grid" onSubmit={submit}><Field label="Sesi"><SelectInput value={sessionId} onChange={(e) => { setSessionId(e.target.value); setStudentId(''); }} required><option value="">Pilih sesi</option>{itemsOf(sessions.data).map((s) => <option key={s.id} value={s.id}>{s.schoolClass?.code} · {s.subject?.name} · {statusLabel(s.status)}</option>)}</SelectInput></Field><Field label="Siswa"><SelectInput value={studentId} onChange={(e) => setStudentId(e.target.value)} required><option value="">Pilih siswa</option>{itemsOf(roster.data).map((r) => <option key={r.studentId} value={r.studentId}>{r.fullName} · {statusLabel(r.status)}</option>)}</SelectInput></Field><Field label="Status Baru"><SelectInput value={status} onChange={(e) => setStatus(e.target.value)}>{STATUS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</SelectInput></Field><Field label="Alasan" hint={`${reason.trim().length}/10+`}><TextInput type="textarea" rows={4} value={reason} placeholder="Tulis alasan koreksi dengan jelas" onChange={(e) => setReason(e.target.value)} /></Field><Btn variant="primary" disabled={reason.trim().length < 10 || saving} loading={saving}>Simpan koreksi</Btn></form></Card></div>;
}

export function TeacherLeavePage({ notify }) {
  const leaves = useRemote(() => apiFetch('/teacher-leaves?page=1&limit=50'), []);
  const [type, setType] = useState('IZIN');
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('Ada keperluan yang sudah dikonfirmasi kepada sekolah.');
  const [saving, setSaving] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/teacher-leaves', { method: 'POST', body: JSON.stringify({ type, date: new Date(date).toISOString(), reason }) });
      leaves.refresh();
      notify('Pengajuan berhasil dikirim ke Admin/TU.');
    } catch (error) { notify(error.message || 'Gagal mengirim pengajuan.', 'bad'); } finally { setSaving(false); }
  }
  return <div className="content"><PageHead eyebrow="KETERANGAN GURU" title="Izin, Sakit, dan Dinas Luar" sub="Ajukan keterangan sebelum sesi agar Admin/TU dan guru piket bisa menindaklanjuti." /><SimpleHelpBox title="Cara mengajukan" items={['Pilih jenis izin/sakit/dinas.', 'Pilih tanggal.', 'Tulis alasan singkat dan jelas.', 'Klik Kirim pengajuan.']} /><div className="grid g-2"><Card title="Buat pengajuan"><form className="form-grid" onSubmit={submit}><Field label="Jenis"><SelectInput value={type} onChange={(e) => setType(e.target.value)}><option value="IZIN">Izin</option><option value="SAKIT">Sakit</option><option value="DINAS_LUAR">Dinas luar</option></SelectInput></Field><Field label="Tanggal"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="Alasan" hint={`${reason.trim().length}/10+`}><TextInput type="textarea" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} /></Field><Btn variant="primary" disabled={reason.trim().length < 10 || saving} loading={saving}>Kirim pengajuan</Btn></form></Card><Card title="Riwayat pengajuan" sub="Status pengajuan yang sudah dikirim">{leaves.loading ? <LoadingState /> : leaves.error ? <ErrorState error={leaves.error} onRetry={leaves.refresh} /> : itemsOf(leaves.data).length ? <DataTable rows={itemsOf(leaves.data)} columns={[{ header: 'Tanggal', render: (r) => formatDateTime(r.date) }, { header: 'Jenis', render: (r) => <StatusPill status={r.type} /> }, { header: 'Status', render: (r) => <StatusPill status={r.status} /> }, { header: 'Alasan', render: (r) => <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{r.reason || '—'}</span> }, { header: 'Catatan Admin', render: (r) => <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{r.adminNote || '—'}</span> }]} /> : <EmptyState title="Belum ada pengajuan" sub="Pengajuan yang sudah dikirim akan tampil di sini." />}</Card></div></div>;
}

export function TeacherRecapPage() {
  const [month, setMonth] = useState(monthNow());
  const unavailable = <EmptyState title="Rekap kelas belum tersedia" sub="Laporan bulanan per kelas membutuhkan akses Admin/TU. Gunakan menu Isi Presensi, Perbaiki Presensi, atau Kehadiran Saya untuk melihat data yang tersedia untuk guru." />;
  return <div className="content"><PageHead eyebrow="LAPORAN GURU" title="Laporan Kelas Saya" sub="Ringkasan kelas yang Anda ajar pada bulan yang dipilih." actions={<label className="input compact"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Pilih bulan" /></label>} /><div className="grid g-2"><Card title="Grafik rekap" sub="Perbandingan antar kelas ampuan.">{unavailable}</Card><Card title="Tabel rekap" sub="Data per kelas/sesi bulan yang dipilih">{unavailable}</Card></div></div>;
}

