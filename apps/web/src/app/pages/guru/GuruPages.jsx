import { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, Check, CheckSquare, Clock, MapPin, Save, Users, Wifi, X, Activity, DoorOpen, CheckCircle2 } from 'lucide-react';
import { apiFetch, formatDateTime, go, itemsOf, monthNow, qs, today } from '../../api';
import { riskConfirm } from '../../confirm';
import { BrowserGeoError, captureBrowserGeolocation } from '../../geolocation';
import { useRemote } from '../../hooks';
import { Avatar, Btn, Card, DataTable, EmptyState, ErrorState, Field, HorizontalBarList, LoadingState, PageHead, RosterProgress, RoleTaskPanel, SelectInput, SimpleHelpBox, StackedBar, StatCardPremium, StatusDonut, StatusPill, StepGuide, TextInput, statusLabel } from '../../ui';
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

export function TeacherDashboard() {
  const sessions = useRemote(() => apiFetch(`/attendance/class-sessions${qs({ date: today(), page: 1, limit: 50 })}`), []);
  const mine = useRemote(() => apiFetch('/reports/my-attendance?days=14'), []);
  const rows = itemsOf(sessions.data);
  const next = rows.find((s) => s.status === 'OPEN') || rows.find((s) => s.status === 'SCHEDULED') || rows[0];
  const openCount = rows.filter((s) => s.status === 'OPEN').length;
  const scheduledCount = rows.filter((s) => s.status === 'SCHEDULED').length;

  return <div className="content dashboard-redesign"><PageHead eyebrow="GURU MAPEL" title="Mulai Mengajar" sub="Lihat kelas hari ini, klik Masuk Kelas, isi presensi siswa, lalu Tutup Sesi." actions={<Btn variant="primary" onClick={() => go('/guru/presensi')}><CheckSquare size={14} /> Masuk Kelas</Btn>} />
    <RoleTaskPanel title="Aksi cepat guru" tasks={[{ title: 'Masuk Kelas', desc: 'Buka sesi hari ini dan mulai presensi.', icon: <CheckSquare size={18} />, tone: 'ok', onClick: () => go('/guru/presensi') }, { title: 'Perbaiki presensi', desc: 'Jika ada kesalahan, koreksi dengan alasan.', icon: <Save size={18} />, onClick: () => go('/guru/koreksi') }, { title: 'Ajukan izin', desc: 'Kirim izin/sakit/dinas luar ke Admin/TU.', icon: <Clock size={18} />, onClick: () => go('/guru/izin') }]} />
    {sessions.loading ? <LoadingState /> : sessions.error ? <ErrorState error={sessions.error} /> : <>{next ? <section className="dashboard-hero teacher-hero"><div className="dashboard-hero-copy"><div className="eyebrow"><span className="dot" /> SESI UTAMA · {statusLabel(next.status)}</div><h2>{next.subject?.name || 'Mata pelajaran'} · {next.schoolClass?.code || 'Kelas'}</h2><p>Mulai kelas dari sini. Klik Masuk Kelas, tandai Semua Hadir bila sesuai, ubah pengecualian, lalu Tutup Sesi.</p><div className="row muted dashboard-meta"><span><Clock size={14} /> {formatDateTime(next.startsAt)}</span><span><Users size={14} /> {next.teacher?.fullName || 'Guru mapel'}</span></div><div className="dashboard-hero-actions"><Btn variant="primary" size="lg" onClick={() => go('/guru/presensi')}><ArrowRight size={16} /> Masuk Kelas</Btn><span className="chip"><MapPin size={12} /> Lokasi sekolah siap</span><span className="chip"><Wifi size={12} /> Server online</span></div></div><div className="dashboard-hero-panel compact"><StatusPill status={next.status} /><div className="hero-kpi-grid vertical"><span><b>{openCount}</b>Sesi berjalan</span><span><b>{scheduledCount}</b>Menunggu mulai</span><span><b>{rows.length}</b>Total sesi</span></div></div></section> : <div className="empty" style={{ marginBottom: 18 }}><b>Tidak ada sesi hari ini</b><span>Semua sesi sudah selesai atau belum dijadwalkan.</span></div>}
      <div className="grid g-3 chart-summary"><Card title="Status sesi" sub="Ringkasan sesi hari ini."><StackedBar segments={sessionSegments(sessions.data)} /></Card><Card title="Kehadiran saya (14 hari)" sub="Ringkasan status kehadiran guru."><StatusDonut counts={countByStatus(mine.data)} title="Kehadiran saya" /></Card></div><div className="grid g-3" style={{ marginTop: 18 }}><Card title="Jadwal sesi hari ini">{rows.length ? <DataTable rows={rows} columns={[{ header: 'Waktu', render: (r) => formatDateTime(r.startsAt) }, { header: 'Kelas', render: (r) => r.schoolClass?.code || '—' }, { header: 'Mapel', render: (r) => r.subject?.name || '—' }, { header: 'Status', render: (r) => <StatusPill status={r.status} /> }]} /> : <EmptyState title="Tidak ada sesi" sub="Belum ada sesi terjadwal hari ini." />}</Card><Card title="Riwayat kehadiran saya" sub="14 hari terakhir" actions={<Btn size="sm" onClick={() => go('/guru/kehadiran-saya')}>Lihat semua</Btn>}><AttendanceTableState state={mine} /></Card></div></>}
  </div>;
}

export function ClassInputPage({ notify }) {
  const sessions = useRemote(() => apiFetch(`/attendance/class-sessions${qs({ date: today(), page: 1, limit: 50 })}`), []);
  const [sessionId, setSessionId] = useState('');
  const [earlyReason, setEarlyReason] = useState('Kelas diakhiri lebih awal atas kondisi yang sudah dicatat.');
  const [nowTick, setNowTick] = useState(Date.now());
  const [actionLoading, setActionLoading] = useState('');
  const [geoStatus, setGeoStatus] = useState({ tone: 'info', message: 'Lokasi browser akan diminta saat absen masuk dan keluar.' });
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const first = itemsOf(sessions.data).find((s) => s.status === 'OPEN') || itemsOf(sessions.data).find((s) => s.status === 'SCHEDULED') || itemsOf(sessions.data)[0];
    if (first && !sessionId) setSessionId(first.id);
  }, [sessions.data]);
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
    if (r.eligibility?.locked && ['HADIR', 'TELAT'].includes(status)) return r;
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
      notify(result.message || 'Semua siswa yang memenuhi syarat dikonfirmasi hadir.');
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
  return <div className="content teacher-attendance-flow"><PageHead eyebrow="PRESENSI KELAS" title={current ? `${current.subject?.name} · ${current.schoolClass?.code}` : 'Pilih sesi'} sub="Alur sederhana: Masuk Kelas → Semua Hadir/ubah pengecualian → Simpan → Tutup Sesi." actions={<div className="session-picker-control"><Field label="Pilih sesi"><SelectInput wrapperClassName="session-picker-select" value={sessionId} onChange={(e) => setSessionId(e.target.value)}><option value="">Pilih sesi yang tersedia</option>{itemsOf(sessions.data).map((s) => <option key={s.id} value={s.id}>{s.schoolClass?.code} · {s.subject?.name} · {statusLabel(s.status)}</option>)}</SelectInput></Field></div>} />
    <StepGuide title="Urutan kerja guru" steps={['Pilih sesi yang benar.', 'Klik Masuk Kelas.', 'Klik Semua Hadir bila mayoritas hadir.', 'Ubah pengecualian: Telat, Izin, Sakit, atau Alpa.', 'Klik Simpan, lalu Tutup Sesi.']} />
    <div className="attendance-checkpoint"><div><span className="eyebrow"><span className="dot" /> CHECKPOINT PRESENSI</span><b>{progressPercent}% selesai</b><small>{completedCount}/{roster.length || 0} siswa sudah dikonfirmasi. {defaultedCount ? `${defaultedCount} masih ALPA default.` : ''} {isOpen ? 'Sesi sedang bisa diisi.' : 'Buka sesi terlebih dahulu untuk mengubah status.'}</small></div><RosterProgress current={completedCount} total={roster.length} /></div>
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
    <div className="grid g-2 chart-summary"><Card title="Presensi siswa" sub="Tandai semua Hadir, lalu ubah siswa yang Telat/Izin/Sakit/Alpa."><StatusDonut counts={counts} title="Status siswa" /></Card><Card title="Ringkasan sebelum Tutup Sesi" sub="Periksa ulang sebelum mengakhiri kelas."><StackedBar segments={STATUS.map((st) => ({ label: statusLabel(st), value: counts[st] || 0, tone: st === 'HADIR' ? 'ok' : st === 'ALPA' ? 'bad' : st === 'TELAT' ? 'warn' : 'info' }))} /></Card></div><div className="dock dock-sticky" aria-label="Ringkasan status presensi"><div className="dock-stats">{STATUS.map((st) => <span className="s" key={st}><span className="k">{statusLabel(st)}</span><span className="v">{counts[st] || 0}</span></span>)}</div>{isOpen && <Btn size="sm" variant="primary" loading={actionLoading === 'save'} onClick={saveBatch} disabled={!roster.length || Boolean(actionLoading)}><Save size={13} /> Simpan</Btn>}</div>{rosterState.loading ? <LoadingState /> : rosterState.error ? <ErrorState error={rosterState.error} /> : <div className="roster">{roster.map((s, i) => <div key={s.studentId} className="roster-row"><div className="roster-idx">{String(i + 1).padStart(2, '0')}</div><Avatar name={s.fullName} /><div className="roster-student"><div className="roster-name">{s.fullName}</div><div className="roster-meta">{s.username} · kartu {statusLabel(s.cardStatus)} · {s.eligibility?.locked ? `Terkunci: ${s.eligibility.reasons?.join(', ')}` : 'Syarat scan lengkap/diizinkan'}</div></div><div className="statuspick">{STATUS.map((st) => <button key={st} className={`${s.status === st ? 'on ' : ''}${st.toLowerCase()}`} disabled={!isOpen || Boolean(actionLoading) || (s.eligibility?.locked && ['HADIR', 'TELAT'].includes(st))} title={s.eligibility?.locked && ['HADIR', 'TELAT'].includes(st) ? s.eligibility.reasons?.join(', ') : ''} onClick={() => setStatus(s.studentId, st)}>{statusLabel(st)}</button>)}</div></div>)}</div>}</div>;
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
  const data = useRemote(() => apiFetch(`/reports/teacher-monthly${qs({ month, page: 1, limit: 100 })}`), [month]);
  return <div className="content"><PageHead eyebrow="LAPORAN GURU" title="Laporan Kelas Saya" sub="Ringkasan kelas yang Anda ajar pada bulan yang dipilih." actions={<label className="input compact"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Pilih bulan" /></label>} /><div className="grid g-2"><Card title="Grafik rekap" sub="Perbandingan antar kelas ampuan."><HorizontalBarList data={data.data} /></Card><Card title="Tabel rekap" sub="Data per kelas/sesi bulan yang dipilih"><AttendanceTableState state={data} /></Card></div></div>;
}

