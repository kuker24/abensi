import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiFetch, formatDateTime, go, itemsOf, today } from '../../api';
import { useRemote } from '../../hooks';
import { Btn, Card, DataTable, EmptyState, ErrorState, Field, LoadingState, PageHead, RoleTaskPanel, SelectInput, SimpleHelpBox, StatCardPremium, StatusDonut, StatusPill } from '../../ui';

const BLOCKED_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isSafeFieldKey(key) {
  return typeof key === 'string' && /^[A-Za-z0-9_$-]+$/.test(key) && !BLOCKED_OBJECT_KEYS.has(key);
}

function countByStatus(data) {
  const blockedKeys = BLOCKED_OBJECT_KEYS;
  const counts = new Map();
  for (const row of itemsOf(data)) {
    const status = String(row.status || row.attendanceStatus || row.presenceStatus || row.keterangan || 'LAINNYA');
    if (blockedKeys.has(status)) continue;
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  return Object.fromEntries(counts);
}

function resolveField(row, keys) {
  for (const key of keys) {
    if (key.includes('.')) {
      const parts = key.split('.');
      let v = row;
      for (const part of parts) {
        if (!isSafeFieldKey(part)) return null;
        v = v?.[part]; // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop -- keys come from static UI allowlists and dangerous prototype keys are blocked.
      }
      if (v !== undefined && v !== null && String(v).trim()) return v;
    } else if (isSafeFieldKey(key) && row[key] !== undefined && row[key] !== null && String(row[key]).trim()) {
      return row[key]; // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop -- keys come from static UI allowlists and dangerous prototype keys are blocked.
    }
  }
  return null;
}

function AttendanceTable({ rows }) {
  if (!rows.length) return <EmptyState title="Belum ada riwayat" sub="Data akan muncul setelah guru menutup sesi." />;

  const COLUMNS = [
    {
      header: 'Tanggal / Waktu',
      render: (r) => {
        const ts = r.startsAt || r.date || r.createdAt || r.at;
        return ts ? formatDateTime(ts) : '—';
      }
    },
    {
      header: 'Mata Pelajaran',
      render: (r) => {
        const v = resolveField(r, ['subject.name', 'subjectName', 'session.subject.name', 'mapel']);
        return v || '—';
      }
    },
    {
      header: 'Kelas',
      render: (r) => {
        const v = resolveField(r, ['schoolClass.code', 'classCode', 'session.schoolClass.code', 'kelas']);
        return v || '—';
      }
    },
    {
      header: 'Status',
      render: (r) => {
        const s = r.status || r.attendanceStatus || r.presenceStatus || r.keterangan;
        return s ? <StatusPill status={s} /> : <span style={{ color: 'var(--fg-faint)' }}>—</span>;
      }
    },
    {
      header: 'Keterangan',
      render: (r) => {
        const note = r.note || r.reason || r.keterangan;
        if (!note || typeof note !== 'string') return '—';
        return <span style={{ color: 'var(--fg-muted)', fontSize: '12px' }}>{note}</span>;
      }
    }
  ];

  const hasSubject = rows.some((r) => resolveField(r, ['subject.name', 'subjectName', 'session.subject.name', 'mapel']));
  const hasClass = rows.some((r) => resolveField(r, ['schoolClass.code', 'classCode', 'session.schoolClass.code', 'kelas']));
  const hasNote = rows.some((r) => r.note || r.reason);

  const visibleColumns = COLUMNS.filter((c, i) => {
    if (i === 1) return hasSubject;
    if (i === 2) return hasClass;
    if (i === 4) return hasNote;
    return true;
  });

  return (
    <div className="attendance-table-wrap">
      <DataTable rows={rows} columns={visibleColumns} />
    </div>
  );
}

const STUDENT_STATUS_LABELS = {
  DONE: 'Sudah tercatat',
  PENDING: 'Belum tercatat',
  NOT_REQUIRED: 'Tidak wajib',
  OUTSIDE_WINDOW: 'Belum waktunya'
};

function safeStudentTodayStatus() {
  return {
    date: today(),
    student: { fullName: 'Siswa', className: null },
    summary: { completedCount: 0, pendingCount: 5, overallStatus: 'PERLU_DILENGKAPI' },
    items: [
      { key: 'GATE_IN', label: 'Scan Datang', status: 'PENDING', time: null, description: 'Scan datang di gerbang.' },
      { key: 'CLASS_ATTENDANCE', label: 'Presensi Kelas', status: 'PENDING', time: null, description: 'Tunggu guru mengisi presensi kelas.' },
      { key: 'PRAYER_DHUHA', label: 'Sholat Dhuha', status: 'PENDING', time: null, description: 'Scan Dhuha di mushola.' },
      { key: 'PRAYER_DZUHUR', label: 'Sholat Dzuhur', status: 'PENDING', time: null, description: 'Scan Dzuhur di mushola.' },
      { key: 'PRAYER_ASHAR', label: 'Sholat Ashar', status: 'NOT_REQUIRED', time: null, description: 'Sholat Ashar tidak wajib hari ini.' },
      { key: 'GATE_OUT', label: 'Scan Pulang', status: 'PENDING', time: null, description: 'Scan pulang sebelum keluar sekolah.' }
    ],
    nextActions: ['Scan datang di gerbang.', 'Ikuti presensi kelas dengan guru.', 'Scan Dhuha/Dzuhur di mushola.', 'Scan pulang sebelum keluar sekolah.']
  };
}

function StudentStatusIcon({ status }) {
  if (status === 'DONE') return <CheckCircle2 size={18} />;
  if (status === 'PENDING') return <AlertTriangle size={18} />;
  return <Circle size={18} />;
}

function StudentTodayStatusCard({ item }) {
  const status = item.status || 'PENDING';
  return <article className={`student-status-card ${String(status).toLowerCase()}`}>
    <div className="student-status-icon"><StudentStatusIcon status={status} /></div>
    <div className="student-status-copy">
      <div className="student-status-top"><h3>{item.label}</h3><span>{STUDENT_STATUS_LABELS[status] || status}</span></div>
      <p>{item.description || 'Status belum tersedia.'}</p>
      {item.time && <div className="student-status-time">Jam {item.time}</div>}
    </div>
  </article>;
}

function StudentTodayStatusPanel({ state }) {
  const hasError = Boolean(state.error);
  const data = hasError ? safeStudentTodayStatus() : (state.data || safeStudentTodayStatus());
  const items = itemsOf(data);
  const summary = data.summary || {};
  const nextActions = Array.isArray(data.nextActions) ? data.nextActions : [];

  if (state.loading) return <LoadingState label="Memuat status kehadiran hari ini…" sub="Sistem sedang mengecek scan gerbang, presensi kelas, dan sholat." />;

  return <section className="student-today-panel" aria-label="Status kehadiran hari ini">
    {hasError && <div className="inline-note warn"><AlertTriangle size={14} /> Status otomatis belum bisa dimuat. Checklist aman sementara ditampilkan; tekan Perbarui status untuk mencoba lagi.</div>}
    <div className="student-today-summary grid g-3">
      <StatCardPremium icon={<CheckCircle2 size={18} />} label="Lengkap" value={summary.completedCount || 0} sub="Bagian sudah tercatat" tone="ok" />
      <StatCardPremium icon={<AlertTriangle size={18} />} label="Perlu dilengkapi" value={summary.pendingCount || 0} sub="Bagian belum tercatat" tone={summary.pendingCount ? 'warn' : 'ok'} />
      <StatCardPremium icon={<ShieldCheck size={18} />} label="Status hari ini" value={summary.overallStatus === 'LENGKAP' ? 'Lengkap' : 'Perlu dilengkapi'} sub={data.student?.className ? `Kelas ${data.student.className}` : 'Data pribadi siswa'} tone={summary.overallStatus === 'LENGKAP' ? 'ok' : 'warn'} />
    </div>
    <Card title="Checklist hari ini" sub="Scan gerbang, presensi kelas, sholat, dan kepulangan.">
      <div className="student-status-grid">{items.map((item) => <StudentTodayStatusCard key={item.key} item={item} />)}</div>
    </Card>
    <Card title="Yang perlu kamu lakukan" sub="Ikuti daftar ini agar status hari ini lengkap." actions={<div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><Btn size="sm" onClick={state.refresh}><RefreshCw size={14} /> Perbarui status</Btn><Btn size="sm" onClick={() => document.getElementById('riwayat-kehadiran')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Lihat riwayat saya</Btn></div>}>
      <ul className="student-next-actions">{nextActions.map((action, index) => <li key={`${action}-${index}`}>{action}</li>)}</ul>
    </Card>
  </section>;
}

export function MyAttendancePage({ title = 'Kehadiran Saya', student = false }) {
  const [days, setDays] = useState('60');
  const [status, setStatus] = useState('');
  const data = useRemote(() => apiFetch(`/reports/my-attendance?days=${days}`), [days]);
  const todayStatus = useRemote(() => student ? apiFetch('/students/me/today-status') : Promise.resolve(null), [student]);
  const rows = itemsOf(data.data).filter((row) => !status || row.status === status || row.attendanceStatus === status || row.presenceStatus === status);
  const counts = countByStatus({ items: rows });
  const todayRows = rows.filter((row) => String(row.date || row.startsAt || row.createdAt || '').slice(0, 10) === today());

  return (
    <div className="content dashboard-redesign">
      <PageHead
        eyebrow={student ? 'SISWA · LIHAT SAJA' : 'PRIBADI'}
        title={student ? 'Status Kehadiran Hari Ini' : title}
        sub={student
          ? 'Lihat bagian yang sudah tercatat dan yang masih perlu dilengkapi hari ini.'
          : 'Gabungan data tap gerbang dan presensi kelas.'}
        actions={
          <>
            <Field label="Rentang">
              <SelectInput value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="14">14 hari</option>
                <option value="30">30 hari</option>
                <option value="60">60 hari</option>
                <option value="120">120 hari</option>
              </SelectInput>
            </Field>
            <Field label="Status">
              <SelectInput value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Semua status</option>
                <option value="HADIR">Hadir</option>
                <option value="TELAT">Terlambat</option>
                <option value="IZIN">Izin</option>
                <option value="SAKIT">Sakit</option>
                <option value="ALPA">Alpa</option>
              </SelectInput>
            </Field>
          </>
        }
      />

      {student && <StudentTodayStatusPanel state={todayStatus} />}
      {student && <RoleTaskPanel title="Aksi cepat siswa" tasks={[{ title: 'Lihat data hari ini', desc: 'Cek apakah presensi sudah muncul.', onClick: () => go('/siswa/dashboard') }, { title: 'Baca notifikasi', desc: 'Lihat pesan atau tugas dari sekolah.', onClick: () => go('/siswa/notifikasi') }, { title: 'Minta bantuan', desc: 'Jika data salah, hubungi wali kelas atau guru piket.', onClick: () => go('/siswa/panduan'), tone: 'warn' }]} />}
      {student && <SimpleHelpBox title="Yang perlu dipahami" items={['Data bisa belum final sampai guru menyimpan dan menutup sesi.', 'Siswa hanya melihat data, tidak bisa mengubah presensi.', 'Jika ada kesalahan, hubungi wali kelas atau guru piket.']} />}
      <div className="grid g-3">
        <Card title="Ringkasan kehadiran" sub="Komposisi status dari rentang yang dipilih.">
          {rows.length === 0 ? (
            <EmptyState title="Belum ada data" sub="Data akan muncul setelah sesi berjalan dan guru menutupnya." />
          ) : (
            <StatusDonut counts={counts} title="Status kehadiran" />
          )}
        </Card>

        <Card title="Hari ini" sub="Data bisa berubah sampai guru menutup sesi.">
          <div className="grid g-2">
            <div className="stat">
              <div className="stat-label">Catatan hari ini</div>
              <div className="stat-num">{todayRows.length}</div>
              <div className="stat-delta">
                {todayRows.length === 0 ? 'Belum ada sesi hari ini' : 'Data sudah tercatat'}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Hadir bulan ini</div>
              <div className="stat-num">{counts.HADIR || 0}</div>
              <div className="stat-delta up">dari {rows.length} catatan · {counts.ALPA ? `${counts.ALPA} alpa` : 'tidak ada alpa'}</div>
            </div>
          </div>
          {student && (
            <div style={{ marginTop: 14, padding: 10, borderRadius: 'var(--radius)', background: 'var(--info-soft)', border: '1px solid var(--info)', color: 'var(--info)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              Data di sini hanya untuk melihat. Jika ada kesalahan, hubungi wali kelas.
            </div>
          )}
        </Card>

        <Card title="Statistik" sub="Rekapitulasi status.">
          {rows.length === 0 ? (
            <EmptyState title="Belum ada statistik" sub="Statistik akan muncul setelah data tersedia." />
          ) : (
            <div className="dashboard-mini-list">
              {[['HADIR', 'Hadir'], ['TELAT', 'Terlambat'], ['IZIN', 'Izin'], ['SAKIT', 'Sakit'], ['ALPA', 'Alpa']].map(([s, label]) => (
                <div className="dashboard-mini-row" key={s} style={{ padding: '8px 12px' }}>
                  <div className="dashboard-mini-main">
                    <StatusPill status={s} />
                    <div><b>{label}</b><span>{counts[s] || 0} catatan</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div id="riwayat-kehadiran" style={{ marginTop: 18, scrollMarginTop: 90 }}>
        <Card title="Riwayat kehadiran" sub={`${rows.length} catatan dalam ${days} hari terakhir`}>
          {data.loading ? (
            <LoadingState label="Memuat riwayat kehadiran…" />
          ) : data.error ? (
            <ErrorState error={data.error} onRetry={data.refresh} />
          ) : (
            <AttendanceTable rows={rows} />
          )}
        </Card>
      </div>
    </div>
  );
}
