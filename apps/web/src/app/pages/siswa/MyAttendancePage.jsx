import { useState } from 'react';
import { CalendarCheck, HelpCircle, ShieldCheck } from 'lucide-react';
import { apiFetch, formatDateTime, go, itemsOf } from '../../api';
import { useRemote } from '../../hooks';
import { Btn, Card, DataTable, EmptyState, ErrorState, Field, LoadingState, PageHead, RoleTaskPanel, SelectInput, SimpleHelpBox, StatusDonut, StatusPill } from '../../ui';

function countByStatus(data) {
  return itemsOf(data).reduce((acc, row) => {
    const status = row.status || row.attendanceStatus || row.presenceStatus || row.keterangan || 'LAINNYA';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

function resolveField(row, keys) {
  for (const key of keys) {
    if (key.includes('.')) {
      const parts = key.split('.');
      let v = row;
      for (const part of parts) v = v?.[part];
      if (v !== undefined && v !== null && String(v).trim()) return v;
    } else if (row[key] !== undefined && row[key] !== null && String(row[key]).trim()) {
      return row[key];
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

export function MyAttendancePage({ title = 'Kehadiran Saya', student = false }) {
  const [days, setDays] = useState('60');
  const [status, setStatus] = useState('');
  const data = useRemote(() => apiFetch(`/reports/my-attendance?days=${days}`), [days]);
  const rows = itemsOf(data.data).filter((row) => !status || row.status === status || row.attendanceStatus === status || row.presenceStatus === status);
  const counts = countByStatus({ items: rows });
  const todayRows = rows.filter((row) => String(row.date || row.startsAt || row.createdAt || '').slice(0, 10) === new Date().toISOString().slice(0, 10));
  const presentRate = rows.length ? Math.round(((counts.HADIR || 0) / rows.length) * 100) : 0;

  return (
    <div className="content dashboard-redesign">
      <PageHead
        eyebrow={student ? 'SISWA · LIHAT SAJA' : 'PRIBADI'}
        title={title}
        sub={student
          ? 'Siswa hanya bisa melihat, tidak bisa input atau koreksi. Jika data hari ini belum muncul, kemungkinan guru belum menutup sesi.'
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

      {student && <section className="dashboard-hero student-hero"><div className="dashboard-hero-copy"><div className="eyebrow"><span className="dot" /> MODE PANTAU SISWA</div><h2>Cek kehadiran tanpa mengubah data.</h2><p>Data bisa berubah sampai guru menyimpan dan menutup sesi. Jika ada perbedaan, gunakan jalur bantuan sekolah.</p><div className="dashboard-hero-actions"><Btn variant="primary" size="lg" onClick={() => go('/siswa/notifikasi')}><CalendarCheck size={16} /> Buka notifikasi</Btn><Btn size="lg" onClick={() => go('/siswa/panduan')}><HelpCircle size={16} /> Panduan bantuan</Btn></div></div><div className="dashboard-hero-panel compact"><div className="hero-kpi-grid vertical"><span><b>{todayRows.length}</b>Catatan hari ini</span><span><b>{counts.HADIR || 0}</b>Hadir</span><span><b>{presentRate}%</b>Rasio hadir</span></div><span className="chip"><ShieldCheck size={12} /> Hanya lihat data</span></div></section>}
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

      <div style={{ marginTop: 18 }}>
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
