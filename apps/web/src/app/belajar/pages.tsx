import {
  Activity,
  AlertTriangle,
  BookOpen,
  Check,
  CheckSquare,
  CreditCard,
  Flag,
  Radar,
  Save,
  ShieldCheck,
  Users
} from 'lucide-react';
import {
  Btn,
  Card,
  DataTable,
  EmptyState,
  HorizontalBarList,
  PageHead,
  Pill,
  ProgressRing,
  RoleTaskPanel,
  SimpleHelpBox,
  StackedBar,
  StatCardPremium,
  StatusDonut,
  StatusPill,
  TrendChart
} from '../ui';
import { useDemoWorld } from './world-context';
import type { DemoRole, DemoWorld } from './world';
import { labGo, roleScreenPath } from './lab-nav';

function coverage(done: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

function StubPage({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="content">
      <PageHead eyebrow="LAB · RINGKAS" title={title} sub="Menu ini tampil seperti di portal asli agar tidak bingung navigasi." />
      <EmptyState
        title="Halaman ini di lab disederhanakan"
        sub={hint}
        action={<Btn onClick={() => window.history.back()}>Kembali</Btn>}
      />
    </div>
  );
}

function LeaveQueueCard({ world, canDecide }: { world: DemoWorld; canDecide: boolean }) {
  const { dispatch } = useDemoWorld();
  return (
    <Card title="Antrian izin personel" sub={`${world.leave.applicant} · ${world.leave.type}`}>
      <p className="muted">{world.leave.reason}</p>
      <p>Status: <StatusPill status={world.leave.status} /></p>
      {canDecide && world.leave.status === 'PENDING' && (
        <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Btn variant="primary" data-demo="approve-leave" onClick={() => dispatch({ type: 'APPROVE_LEAVE', actorRole: 'admin-tu' })}>
            <Check size={14} /> Setujui izin
          </Btn>
          <Btn variant="danger" onClick={() => dispatch({ type: 'REJECT_LEAVE', actorRole: 'admin-tu' })}>Tolak</Btn>
        </div>
      )}
      {!canDecide && <p className="muted" style={{ marginTop: 12 }}>Mode pantau (read-only) seperti Kepala Sekolah di production.</p>}
    </Card>
  );
}

function AdminDashboard({ world }: { world: DemoWorld }) {
  const staffPct = coverage(world.stats.staffPresent, world.stats.staffTotal);
  const studentPct = coverage(world.stats.studentComplete, world.stats.studentTotal);
  return (
    <div className="content dashboard-redesign">
      <PageHead
        eyebrow="COMMAND CENTER"
        title="Ringkasan Admin"
        sub="Pantau operasi sekolah hari ini. Data lab — watermark LATIHAN selalu tampil."
        actions={
          <>
            <Btn onClick={() => labGo(roleScreenPath('admin-tu', 'masalah'))}><Flag size={14} /> Cek masalah</Btn>
            <Btn variant="primary" onClick={() => labGo(roleScreenPath('admin-tu', 'izin'))}><CheckSquare size={14} /> Izin personel</Btn>
          </>
        }
      />
      <section className="dashboard-hero admin-hero">
        <div className="dashboard-hero-copy">
          <div className="eyebrow">PRIORITAS HARI INI</div>
          <h2>Pastikan data hadir lengkap dan antrian izin bersih</h2>
          <p className="muted">Tindak {world.stats.openProblems} masalah · pantau sesi · setujui izin personel.</p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Btn size="sm" onClick={() => labGo(roleScreenPath('admin-tu', 'masalah'))}>Tindak masalah</Btn>
            <Btn size="sm" variant="ghost" onClick={() => labGo(roleScreenPath('admin-tu', 'perangkat'))}>Pantau scanner</Btn>
          </div>
        </div>
        <div className="dashboard-hero-panel" data-tour="admin-summary">
          <ProgressRing value={studentPct} label="Kelengkapan siswa" sub={`${world.stats.studentComplete}/${world.stats.studentTotal}`} />
          <div className="hero-kpi-grid">
            <div><small>Staf hadir</small><b>{world.stats.staffPresent}</b></div>
            <div><small>Scanner</small><b>{world.devices.readersOnline}/{world.devices.max}</b></div>
            <div><small>Masalah</small><b>{world.stats.openProblems}</b></div>
            <div><small>Izin</small><b>{world.leave.status === 'PENDING' ? 1 : 0}</b></div>
          </div>
        </div>
      </section>
      <RoleTaskPanel
        title="Aksi cepat operasional"
        tasks={[
          { title: 'Aktifkan HP Scanner', desc: 'Cek reader online', icon: <CreditCard size={18} />, onClick: () => labGo(roleScreenPath('admin-tu', 'perangkat')) },
          { title: 'Izin Personel', desc: world.leave.status === 'PENDING' ? '1 menunggu' : 'Antrian bersih', icon: <CheckSquare size={18} />, onClick: () => labGo(roleScreenPath('admin-tu', 'izin')), tone: world.leave.status === 'PENDING' ? 'warn' : '' },
          { title: 'Cek Masalah', desc: `${world.stats.openProblems} terbuka`, icon: <Flag size={18} />, onClick: () => labGo(roleScreenPath('admin-tu', 'masalah')) },
          { title: 'Notifikasi', desc: 'Tugas & pesan', icon: <Activity size={18} />, onClick: () => labGo(roleScreenPath('admin-tu', 'notifikasi')) }
        ]}
      />
      <div className="grid g-4">
        <StatCardPremium icon={<CreditCard size={18} />} label="HP Scanner aktif" value={`${world.devices.readersOnline}/${world.devices.max}`} sub={world.devices.lastNote} tone={world.devices.readersOnline < world.devices.max ? 'warn' : 'ok'} />
        <StatCardPremium icon={<Users size={18} />} label="Kepala/Staf Hadir" value={world.stats.staffPresent} sub={`dari ${world.stats.staffTotal} · ${staffPct}%`} tone="ok" />
        <StatCardPremium icon={<CheckSquare size={18} />} label="Siswa hadir lengkap" value={world.stats.studentComplete} sub={`${studentPct}% dari ${world.stats.studentTotal}`} />
        <StatCardPremium icon={<AlertTriangle size={18} />} label="Belum scan pulang" value={world.stats.notYetOut} tone="warn" />
        <StatCardPremium icon={<BookOpen size={18} />} label="Guru Mengajar" value={world.stats.teachersTeaching} />
        <StatCardPremium icon={<Radar size={18} />} label="Sesi Belum Ditutup" value={world.stats.openSessions} tone={world.stats.openSessions ? 'warn' : ''} />
        <StatCardPremium icon={<Check size={18} />} label="Sholat Dhuha" value={world.stats.prayerDhuha} />
        <StatCardPremium icon={<Check size={18} />} label="Sholat Dzuhur" value={world.stats.prayerDzuhur} />
        <StatCardPremium icon={<Flag size={18} />} label="Masalah Perlu Dicek" value={world.stats.openProblems} tone={world.stats.openProblems ? 'bad' : 'ok'} />
        <StatCardPremium icon={<Activity size={18} />} label="Scan Gerbang" value={world.stats.gateScans} />
      </div>
      <div className="grid g-3 chart-summary" style={{ marginTop: 12 }}>
        <Card title="Cakupan presensi"><ProgressRing value={studentPct} label="Siswa lengkap hari ini" sub="Lab seed" /></Card>
        <Card title="Status sesi hari ini">
          <StackedBar segments={[
            { label: 'Belum mulai', value: world.sessionsToday.filter((s) => s.status === 'SCHEDULED').length, tone: '' },
            { label: 'Berjalan', value: world.sessionsToday.filter((s) => s.status === 'OPEN').length, tone: 'ok' },
            { label: 'Selesai', value: world.sessionsToday.filter((s) => s.status === 'CLOSED').length, tone: 'info' }
          ]} />
        </Card>
        <Card title="Kondisi cepat">
          <HorizontalBarList data={[
            { label: 'Staf hadir', value: world.stats.staffPresent },
            { label: 'Siswa lengkap', value: world.stats.studentComplete },
            { label: 'Scanner online', value: world.devices.readersOnline },
            { label: 'Masalah terbuka', value: world.stats.openProblems }
          ]} />
        </Card>
      </div>
      <div className="grid g-3" style={{ marginTop: 12 }}>
        <Card title="Masalah terbaru">
          {world.flags.filter((f) => f.open).length === 0 ? <p className="muted">Tidak ada masalah terbuka.</p> : world.flags.filter((f) => f.open).map((f) => (
            <div key={f.id} className="belajar-timeline-item"><b>{f.type}</b><small>{f.subject}</small></div>
          ))}
        </Card>
        <Card title="Antrian izin">
          <p>{world.leave.applicant}</p>
          <StatusPill status={world.leave.status} />
          <p className="muted" style={{ marginTop: 8 }}>{world.leave.reason}</p>
        </Card>
        <Card title="Aktivitas terbaru">
          {(world.events.length ? world.events : [{ id: 'seed', summary: 'Dunia lab siap · belum ada aksi', impacts: [] as { role: string }[] }]).slice(0, 4).map((ev) => (
            <div key={ev.id} className="belajar-timeline-item"><b>{ev.summary}</b><small>{ev.impacts.map((i) => i.role).join(' · ') || '—'}</small></div>
          ))}
        </Card>
      </div>
      <Card title="Tren 7 hari" sub="Seed lab (bukan data production)">
        <TrendChart data={world.trend} />
      </Card>
    </div>
  );
}

function PrincipalDashboard({ world }: { world: DemoWorld }) {
  const { dispatch } = useDemoWorld();
  const studentPct = coverage(world.stats.studentComplete, world.stats.studentTotal);
  return (
    <div className="content dashboard-redesign">
      <PageHead
        eyebrow="KEPALA SEKOLAH"
        title="Ringkasan Kepala Sekolah"
        sub="Mode baca saja di production — di lab Anda bisa minta klarifikasi ke petugas."
        actions={<Btn onClick={() => labGo(roleScreenPath('kepala-sekolah', 'izin'))}>Pantau izin</Btn>}
      />
      <section className="dashboard-hero admin-hero">
        <div className="dashboard-hero-copy">
          <div className="eyebrow">PANTAUAN READ-ONLY</div>
          <h2>Melihat kondisi sekolah hari ini tanpa akses perubahan data</h2>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Pill tone="info">Hanya lihat data</Pill>
            <Pill>Tidak ada tombol mutasi (kecuali klarifikasi lab)</Pill>
          </div>
        </div>
        <div className="dashboard-hero-panel" data-tour="principal-summary">
          <ProgressRing value={studentPct} label="Kelengkapan siswa" sub={`${world.stats.studentComplete}/${world.stats.studentTotal}`} />
          <div className="hero-kpi-grid">
            <div><small>Staf</small><b>{world.stats.staffPresent}</b></div>
            <div><small>Masalah</small><b>{world.stats.openProblems}</b></div>
            <div><small>Izin</small><b><StatusPill status={world.leave.status} /></b></div>
            <div><small>Gerbang</small><b>{world.stats.gateScans}</b></div>
          </div>
        </div>
      </section>
      <RoleTaskPanel
        title="Pantauan utama"
        tasks={[
          { title: 'Kehadiran lengkap siswa', desc: `${studentPct}% hari ini`, icon: <CheckSquare size={18} /> },
          { title: 'Sholat siswa', desc: `Dhuha ${world.stats.prayerDhuha}`, icon: <Check size={18} /> },
          { title: 'Kepala/Staf hadir', desc: `${world.stats.staffPresent} staf`, icon: <Users size={18} /> },
          { title: 'Minta klarifikasi', desc: 'Kirim tugas ke TU & piket', icon: <ShieldCheck size={18} />, onClick: () => dispatch({ type: 'KEPALA_REQUEST_CLARITY', actorRole: 'kepala-sekolah' }), actionLabel: 'Kirim' }
        ]}
      />
      <div className="grid g-4">
        <StatCardPremium icon={<Users size={18} />} label="Kepala/Staf Hadir" value={world.stats.staffPresent} tone="ok" />
        <StatCardPremium icon={<CheckSquare size={18} />} label="Siswa hadir lengkap" value={world.stats.studentComplete} />
        <StatCardPremium icon={<AlertTriangle size={18} />} label="Belum scan pulang" value={world.stats.notYetOut} tone="warn" />
        <StatCardPremium icon={<Radar size={18} />} label="Sesi Belum Ditutup" value={world.stats.openSessions} tone="warn" />
        <StatCardPremium icon={<Check size={18} />} label="Sholat Dhuha/Dzuhur" value={`${world.stats.prayerDhuha}/${world.stats.prayerDzuhur}`} />
        <StatCardPremium icon={<Activity size={18} />} label="Scan Gerbang" value={world.stats.gateScans} />
      </div>
      <div className="grid g-3 chart-summary" style={{ marginTop: 12 }}>
        <Card title="Cakupan"><ProgressRing value={studentPct} label="Siswa lengkap" /></Card>
        <Card title="Status sesi">
          <StackedBar segments={[
            { label: 'Berjalan', value: world.stats.openSessions, tone: 'ok' },
            { label: 'Selesai', value: world.stats.closedSessions, tone: 'info' }
          ]} />
        </Card>
        <Card title="Izin personel" actions={<Btn size="sm" data-demo="kepala-clarity" onClick={() => dispatch({ type: 'KEPALA_REQUEST_CLARITY', actorRole: 'kepala-sekolah' })}><ShieldCheck size={14} /> Klarifikasi</Btn>}>
          <p>{world.leave.applicant}</p>
          <StatusPill status={world.leave.status} />
        </Card>
      </div>
      <Card title="Tren 7 hari"><TrendChart data={world.trend} /></Card>
    </div>
  );
}

function OperatorDashboard({ world }: { world: DemoWorld }) {
  const appReady = world.devices.readersOnline > 0;
  return (
    <div className="content">
      <PageHead
        eyebrow="OPERATOR IT"
        title="Cek Sistem"
        sub="Pastikan aplikasi, kartu, dan HP scanner siap dipakai hari ini."
        actions={<Btn variant="primary" onClick={() => labGo(roleScreenPath('operator-it', 'perangkat'))}>Kelola Perangkat</Btn>}
      />
      <RoleTaskPanel
        tasks={[
          { title: 'Aktivasi HP Scanner', desc: world.devices.lastNote, icon: <CreditCard size={18} />, onClick: () => labGo(roleScreenPath('operator-it', 'perangkat')) },
          { title: 'Pantau aktivitas', desc: 'Lab seed audit', icon: <Activity size={18} /> },
          { title: 'Riwayat perubahan', desc: '3 entri demo', icon: <BookOpen size={18} /> }
        ]}
      />
      <div className="grid g-4">
        <StatCardPremium icon={<Activity size={18} />} label="Aplikasi" value={appReady ? 'Siap' : 'Gangguan'} tone={appReady ? 'ok' : 'bad'} />
        <StatCardPremium icon={<CreditCard size={18} />} label="Kartu Aktif" value={world.devices.cardsActive} tone="ok" />
        <StatCardPremium icon={<AlertTriangle size={18} />} label="Kartu Hilang" value={world.devices.cardsLost} tone={world.devices.cardsLost ? 'warn' : ''} />
        <StatCardPremium icon={<Radar size={18} />} label="Alat Aktif" value={`${world.devices.readersOnline}/${world.devices.max}`} />
      </div>
      <div className="grid g-2" style={{ marginTop: 12 }} data-demo="operator-devices">
        <Card title="Status perangkat">
          <HorizontalBarList data={[
            { label: 'Kartu aktif', value: world.devices.cardsActive },
            { label: 'Kartu hilang', value: world.devices.cardsLost },
            { label: 'Alat aktif', value: world.devices.readersOnline }
          ]} />
        </Card>
        <Card title="Perubahan terbaru">
          <DataTable
            rows={world.auditLog}
            columns={[
              { key: 'time', header: 'Waktu' },
              { key: 'action', header: 'Aksi' },
              { key: 'module', header: 'Modul' }
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

function PicketDashboard({ world }: { world: DemoWorld }) {
  const openFlags = world.flags.filter((f) => f.open);
  return (
    <div className="content">
      <PageHead
        eyebrow="GURU PIKET"
        title="Tugas Piket Hari Ini"
        sub="Cek guru/siswa yang perlu dibantu dan catat kejadian lapangan."
        actions={
          <>
            <Btn onClick={() => labGo(roleScreenPath('guru-piket', 'picket'))}>Catatan Piket</Btn>
            <Btn variant="primary" onClick={() => labGo(roleScreenPath('guru-piket', 'masalah'))}>Cek Masalah</Btn>
          </>
        }
      />
      <RoleTaskPanel
        tasks={[
          { title: 'Catat kejadian', desc: 'Buku piket harian', icon: <BookOpen size={18} />, onClick: () => labGo(roleScreenPath('guru-piket', 'picket')) },
          { title: 'Cek masalah', desc: `${openFlags.length} terbuka`, icon: <Flag size={18} />, onClick: () => labGo(roleScreenPath('guru-piket', 'masalah')) },
          { title: 'Cek sesi kelas', desc: `${world.stats.openSessions} berjalan`, icon: <Radar size={18} /> }
        ]}
      />
      <div className="grid g-4">
        <StatCardPremium icon={<Users size={18} />} label="Belum Absen Masuk" value={Math.max(0, world.stats.staffTotal - world.stats.staffPresent)} tone="warn" />
        <StatCardPremium icon={<BookOpen size={18} />} label="Sedang Mengajar" value={world.stats.teachersTeaching} tone="ok" />
        <StatCardPremium icon={<AlertTriangle size={18} />} label="Belum Absen Keluar" value={world.stats.notYetOut} tone="warn" />
        <StatCardPremium icon={<Flag size={18} />} label="Masalah Aktif" value={openFlags.length} tone={openFlags.length ? 'bad' : 'ok'} />
      </div>
      <div className="grid g-3" style={{ marginTop: 12 }}>
        <Card title="Sesi butuh perhatian">
          <DataTable
            rows={world.sessionsToday}
            columns={[
              { key: 'time', header: 'Waktu' },
              { key: 'classCode', header: 'Kelas' },
              { key: 'teacher', header: 'Guru' },
              { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> }
            ]}
          />
        </Card>
        <Card title="Masalah terbuka">
          <DataTable
            rows={openFlags}
            columns={[
              { key: 'type', header: 'Jenis' },
              { key: 'subject', header: 'Nama' },
              { key: 'priority', header: 'Prioritas', render: (row) => <StatusPill status={row.priority || 'NORMAL'} /> }
            ]}
            empty="Tidak ada masalah terbuka."
          />
        </Card>
        <Card title="Catatan piket hari ini">
          <DataTable
            rows={world.picketNotes}
            columns={[
              { key: 'title', header: 'Judul' },
              { key: 'level', header: 'Tingkat' },
              { key: 'officer', header: 'Petugas' }
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

function GuruDashboard({ world }: { world: DemoWorld }) {
  const mine = world.sessionsToday.filter((s) => s.teacher.includes('Budi') || s.id === world.session.id);
  const list = mine.length ? mine : [world.sessionsToday[0]].filter(Boolean);
  const scheduled = list.filter((s) => s.status === 'SCHEDULED').length;
  const open = list.filter((s) => s.status === 'OPEN').length;
  const closed = list.filter((s) => s.status === 'CLOSED').length;
  return (
    <div className="content dashboard-redesign teacher-today-workspace">
      <PageHead
        eyebrow="GURU MAPEL"
        title="Kelas Saya Hari Ini"
        sub="Pantau jadwal mengajar dan selesaikan presensi. Data lab."
        actions={<Btn variant="primary" onClick={() => labGo(roleScreenPath('guru', 'presensi'))}>Mulai Presensi</Btn>}
      />
      <RoleTaskPanel
        title="Aksi cepat guru"
        tasks={[
          { title: 'Isi presensi', desc: `${world.session.subject} · ${world.session.classCode}`, icon: <CheckSquare size={18} />, onClick: () => labGo(roleScreenPath('guru', 'presensi')) },
          { title: 'Izin / Sakit / Dinas', desc: <StatusPill status={world.leave.status} />, icon: <Save size={18} />, onClick: () => labGo(roleScreenPath('guru', 'izin-saya')) },
          { title: 'Notifikasi', desc: 'Pesan lab', icon: <Activity size={18} />, onClick: () => labGo(roleScreenPath('guru', 'notifikasi')) }
        ]}
      />
      <div className="grid g-4 teacher-today-kpis">
        <StatCardPremium icon={<BookOpen size={18} />} label="Sesi hari ini" value={list.length} />
        <StatCardPremium icon={<Radar size={18} />} label="Sedang berjalan" value={open} tone={open ? 'ok' : ''} />
        <StatCardPremium icon={<AlertTriangle size={18} />} label="Belum ditutup" value={open} tone={open ? 'warn' : ''} />
        <StatCardPremium icon={<Check size={18} />} label="Selesai" value={closed} tone="ok" />
      </div>
      <Card title="Daftar jadwal/sesi hari ini" sub="Klik Mulai Presensi untuk workspace kelas">
        {list.length === 0 ? (
          <EmptyState title="Tidak ada jadwal mengajar hari ini." />
        ) : (
          <div className="teacher-session-list">
            {list.map((s) => (
              <div key={s.id} className="card pad" style={{ marginBottom: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <b>{s.subject}</b> · {s.classCode}
                    <div className="muted">{s.time} · {s.teacher}</div>
                  </div>
                  <StatusPill status={s.status} />
                </div>
                {s.id === world.session.id && (
                  <div className="muted" style={{ marginTop: 6 }}>Hadir lab: {world.session.presentCount}/{world.session.totalStudents}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Status sesi">
        <StackedBar segments={[
          { label: 'Belum mulai', value: scheduled || (world.session.status === 'SCHEDULED' ? 1 : 0) },
          { label: 'Sedang berjalan', value: open || (world.session.status === 'OPEN' ? 1 : 0), tone: 'ok' },
          { label: 'Sudah ditutup', value: closed || (world.session.status === 'CLOSED' ? 1 : 0), tone: 'info' }
        ]} />
      </Card>
    </div>
  );
}

function SiswaDashboard({ world }: { world: DemoWorld }) {
  const d = world.studentDay;
  const checks = [
    { key: 'gateIn', label: 'Scan Datang', ok: d.gateIn },
    { key: 'classPresent', label: 'Presensi Kelas', ok: d.classPresent || world.session.presentCount > 0 },
    { key: 'dhuha', label: 'Sholat Dhuha', ok: d.dhuha },
    { key: 'dzuhur', label: 'Sholat Dzuhur', ok: d.dzuhur },
    { key: 'ashar', label: 'Sholat Ashar', ok: d.ashar },
    { key: 'gateOut', label: 'Scan Pulang', ok: d.gateOut }
  ];
  const done = checks.filter((c) => c.ok).length;
  const complete = done === checks.length;
  return (
    <div className="content dashboard-redesign">
      <PageHead
        eyebrow="SISWA · LIHAT SAJA"
        title="Status Kehadiran Hari Ini"
        sub="Lihat bagian yang sudah tercatat. Angka berubah jika guru mengisi presensi di peran Guru."
      />
      <div className="student-today-panel" data-demo="student-board">
        <div className="grid g-3">
          <StatCardPremium icon={<CheckSquare size={18} />} label="Lengkap" value={`${done}/${checks.length}`} tone={complete ? 'ok' : ''} />
          <StatCardPremium icon={<AlertTriangle size={18} />} label="Perlu dilengkapi" value={checks.length - done} tone={complete ? '' : 'warn'} />
          <StatCardPremium icon={<Activity size={18} />} label="Status hari ini" value={complete ? 'Lengkap' : 'Perlu dilengkapi'} tone={complete ? 'ok' : 'warn'} />
        </div>
        <Card title="Checklist hari ini" sub={`Sesi ${world.session.subject}: ${world.session.status}`}>
          <div className="student-status-grid" style={{ display: 'grid', gap: 8 }}>
            {checks.map((c) => (
              <div key={c.key} className="row" style={{ justifyContent: 'space-between' }}>
                <span>{c.label}</span>
                <Pill tone={c.ok ? 'ok' : 'warn'}>{c.ok ? 'Sudah tercatat' : 'Belum tercatat'}</Pill>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 22, fontWeight: 700, marginTop: 12 }}>{world.session.presentCount} / {world.session.totalStudents}</p>
          <p className="muted">teman sekelas ditandai hadir di lab</p>
        </Card>
        <Card title="Yang perlu kamu lakukan">
          <ul style={{ margin: '0 0 0 18px' }}>
            <li>Pastikan scan datang di gerbang (lab: sudah seed).</li>
            <li>Tunggu guru mengisi presensi kelas.</li>
            <li>Baca notifikasi sekolah bila ada pesan baru.</li>
          </ul>
        </Card>
      </div>
      <RoleTaskPanel
        title="Aksi cepat siswa"
        tasks={[
          { title: 'Lihat data hari ini', desc: 'Checklist di atas', icon: <CheckSquare size={18} /> },
          { title: 'Baca notifikasi', desc: `${(world.notifications.siswa || []).length} pesan`, icon: <Activity size={18} />, onClick: () => labGo(roleScreenPath('siswa', 'notifikasi')) },
          { title: 'Minta bantuan', desc: 'Hubungi wali kelas / piket', icon: <Users size={18} /> }
        ]}
      />
      <SimpleHelpBox
        title="Yang perlu dipahami"
        items={[
          'Data belum final sampai guru tutup sesi.',
          'Siswa tidak mengubah absensi sendiri di SIAB2.',
          'Lab ini mainan — production pakai data sekolah asli.'
        ]}
      />
      <div className="grid g-3">
        <Card title="Ringkasan kehadiran">
          <StatusDonut counts={{ HADIR: world.session.presentCount || 12, TELAT: 2, IZIN: 1, ALPA: 1 }} title="Komposisi (seed)" />
        </Card>
        <Card title="Hari ini">
          <div className="stat"><small>Presensi kelas</small><b>{world.session.presentCount}/{world.session.totalStudents}</b></div>
          <div className="stat"><small>Status sesi</small><StatusPill status={world.session.status} /></div>
          <p className="muted" style={{ marginTop: 8 }}>Hanya lihat. Tidak ada tombol ubah data.</p>
        </Card>
        <Card title="Statistik">
          <div className="belajar-timeline-item"><b>HADIR</b><small>{world.session.presentCount || 12}</small></div>
          <div className="belajar-timeline-item"><b>TELAT</b><small>2</small></div>
          <div className="belajar-timeline-item"><b>IZIN</b><small>1</small></div>
          <div className="belajar-timeline-item"><b>ALPA</b><small>1</small></div>
        </Card>
      </div>
      <Card title="Riwayat kehadiran">
        <DataTable
          rows={[
            { id: '1', date: 'Hari ini', subject: world.session.subject, classCode: world.session.classCode, status: world.session.presentCount > 0 ? 'HADIR' : 'BELUM_ABSEN_KELAS', note: 'Lab' },
            { id: '2', date: 'Kemarin', subject: 'Bahasa Arab', classCode: world.session.classCode, status: 'HADIR', note: 'Seed' }
          ]}
          columns={[
            { key: 'date', header: 'Tanggal' },
            { key: 'subject', header: 'Mata Pelajaran' },
            { key: 'classCode', header: 'Kelas' },
            { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
            { key: 'note', header: 'Keterangan' }
          ]}
        />
      </Card>
    </div>
  );
}

export function LabScreen({ role, screen }: { role: DemoRole; screen: string }) {
  const { world, dispatch } = useDemoWorld();

  if (screen.startsWith('stub-')) {
    const labels: Record<string, string> = {
      'stub-sessions': 'Cek Sesi Kelas',
      'stub-live': 'Aktivitas Sekarang',
      'stub-staff': 'Kepala/Staf Hadir',
      'stub-complete': 'Kehadiran Lengkap Siswa',
      'stub-prayer': 'Sholat Siswa',
      'stub-history': 'Riwayat Scan',
      'stub-picket': 'Catatan Piket (menu admin)',
      'stub-master': 'Akun & Data Sekolah',
      'stub-schedule': 'Jadwal Kelas',
      'stub-izin-saya': 'Izin Saya',
      'stub-apk': 'APK Update Center',
      'stub-reports': 'Laporan Sekolah',
      'stub-help': 'Panduan',
      'stub-security': 'Keamanan Akun',
      'stub-settings': 'Aturan Absensi',
      'stub-audit': 'Riwayat Perubahan',
      'stub-koreksi': 'Perbaiki Presensi',
      'stub-rekap': 'Laporan Kelas Saya',
      'stub-hadir': 'Kehadiran Saya'
    };
    return <StubPage title={labels[screen] || 'Menu portal'} hint="Di lab, alur interaktif difokuskan ke izin, presensi, masalah, scanner, dan notifikasi. Menu lain hanya penanda posisi seperti di SIAB2 asli." />;
  }

  if (screen === 'izin' && (role === 'admin-tu' || role === 'kepala-sekolah')) {
    return (
      <div className="content">
        <PageHead
          eyebrow="IZIN PERSONEL"
          title="Antrian izin personel"
          sub="Data mainan. Keputusan hanya mengubah dunia lab di browser ini."
        />
        <LeaveQueueCard world={world} canDecide={role === 'admin-tu'} />
      </div>
    );
  }

  if (screen === 'izin-saya' && role === 'guru') {
    return (
      <div className="content">
        <PageHead eyebrow="PRIBADI" title="Izin / Sakit / Dinas" sub="Pengajuan izin guru (latihan)." />
        <Card title="Status pengajuan" sub={world.leave.applicant}>
          <p>Status saat ini: <StatusPill status={world.leave.status} /></p>
          <p className="muted">{world.leave.reason}</p>
          <Btn variant="primary" style={{ marginTop: 12 }} onClick={() => dispatch({ type: 'SUBMIT_LEAVE', actorRole: 'guru' })}>
            <Save size={14} /> Kirim pengajuan baru
          </Btn>
        </Card>
      </div>
    );
  }

  if (screen === 'presensi' && role === 'guru') {
    return (
      <div className="content teacher-today-workspace">
        <PageHead
          eyebrow="PRESENSI KELAS"
          title={`${world.session.subject} · ${world.session.classCode}`}
          sub="Alur lab: Buka sesi → Tandai hadir → Tutup sesi."
        />
        <Card title="Workspace presensi" sub={`Total siswa ${world.session.totalStudents}`}>
          <p>Status sesi: <StatusPill status={world.session.status} /></p>
          <p>Hadir: <b>{world.session.presentCount}</b> / {world.session.totalStudents}</p>
          <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <Btn variant="primary" disabled={world.session.status !== 'SCHEDULED'} onClick={() => dispatch({ type: 'OPEN_SESSION', actorRole: 'guru' })}>Buka sesi</Btn>
            <Btn disabled={world.session.status !== 'OPEN'} onClick={() => dispatch({ type: 'MARK_PRESENT', actorRole: 'guru' })}>Tandai 8 siswa hadir</Btn>
            <Btn variant="ghost" disabled={world.session.status !== 'OPEN'} onClick={() => dispatch({ type: 'CLOSE_SESSION', actorRole: 'guru' })}>Tutup sesi</Btn>
          </div>
        </Card>
        <Card title="Progres roster">
          <StackedBar
            total={world.session.totalStudents}
            segments={[
              { label: 'Hadir', value: world.session.presentCount, tone: 'ok' },
              { label: 'Belum', value: Math.max(0, world.session.totalStudents - world.session.presentCount), tone: 'warn' }
            ]}
          />
        </Card>
      </div>
    );
  }

  if (screen === 'picket' && role === 'guru-piket') {
    return (
      <div className="content">
        <PageHead eyebrow="KERJA PIKET" title="Catatan Piket" sub="Buku jaga harian (latihan)." />
        <Card title="Catat kejadian">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="primary" onClick={() => dispatch({ type: 'LOG_PICKET', actorRole: 'guru-piket' })}>Catat kejadian</Btn>
            <Btn onClick={() => dispatch({ type: 'OPEN_FLAG', actorRole: 'guru-piket' })}><Flag size={14} /> Buka tanda masalah</Btn>
          </div>
        </Card>
        <Card title="Catatan hari ini">
          <DataTable
            rows={world.picketNotes}
            columns={[
              { key: 'title', header: 'Judul' },
              { key: 'level', header: 'Tingkat' },
              { key: 'officer', header: 'Petugas' }
            ]}
          />
        </Card>
      </div>
    );
  }

  if (screen === 'masalah' && (role === 'admin-tu' || role === 'guru-piket')) {
    const openFlags = world.flags.filter((f) => f.open);
    return (
      <div className="content">
        <PageHead eyebrow="CEK MASALAH" title="Antrian masalah" sub="Rekonsiliasi & tanda operasional (lab)." />
        <Card title={`${openFlags.length} terbuka`}>
          <DataTable
            rows={openFlags}
            columns={[
              { key: 'type', header: 'Jenis' },
              { key: 'subject', header: 'Nama' },
              { key: 'priority', header: 'Prioritas', render: (row) => <StatusPill status={row.priority || 'NORMAL'} /> }
            ]}
            empty="Tidak ada masalah terbuka."
            onRow={role === 'admin-tu' ? (row) => (
              <Btn size="sm" onClick={() => dispatch({ type: 'RESOLVE_FLAG', actorRole: 'admin-tu' })}>Selesaikan</Btn>
            ) : undefined}
          />
        </Card>
      </div>
    );
  }

  if (screen === 'perangkat' && (role === 'operator-it' || role === 'admin-tu')) {
    return (
      <div className="content">
        <PageHead eyebrow="PERANGKAT" title="HP Scanner & Kartu" sub="Status reader latihan." />
        <div className="grid g-4">
          <StatCardPremium icon={<Radar size={18} />} label="Scanner online" value={`${world.devices.readersOnline}/${world.devices.max}`} />
          <StatCardPremium icon={<CreditCard size={18} />} label="Kartu aktif" value={world.devices.cardsActive} />
          <StatCardPremium icon={<AlertTriangle size={18} />} label="Kartu hilang" value={world.devices.cardsLost} tone="warn" />
          <StatCardPremium icon={<Activity size={18} />} label="Catatan" value={world.devices.lastNote} />
        </div>
        <div style={{ marginTop: 12 }} data-demo="operator-devices">
          <Card title="Kontrol lab">
            <p className="muted">{world.devices.lastNote}</p>
            {role === 'operator-it' && (
              <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Btn variant="primary" onClick={() => dispatch({ type: 'SET_READER_ONLINE', actorRole: 'operator-it' })}>Scanner +1 online</Btn>
                <Btn variant="ghost" onClick={() => dispatch({ type: 'SET_READER_OFFLINE', actorRole: 'operator-it' })}>Scanner −1 offline</Btn>
              </div>
            )}
            {role === 'admin-tu' && <p className="muted" style={{ marginTop: 12 }}>Admin memantau. Operator IT yang mengubah status di lab.</p>}
          </Card>
        </div>
      </div>
    );
  }

  if (screen === 'notifikasi') {
    const items = world.notifications[role] || [];
    return (
      <div className="content">
        <PageHead eyebrow="NOTIFIKASI" title="Tugas / Notifikasi" sub="Pesan di dunia latihan (localStorage)." />
        <Card title={`${items.length} pesan`}>
          {items.length === 0 ? (
            <EmptyState title="Belum ada notifikasi" sub="Aksi di peran lain bisa mengirim pesan ke sini." />
          ) : items.map((n) => (
            <div key={n.id} className="belajar-notif-row">{n.unread ? '• ' : ''}{n.text}</div>
          ))}
        </Card>
      </div>
    );
  }

  if (role === 'siswa') return <SiswaDashboard world={world} />;
  if (role === 'kepala-sekolah') return <PrincipalDashboard world={world} />;
  if (role === 'guru') return <GuruDashboard world={world} />;
  if (role === 'operator-it') return <OperatorDashboard world={world} />;
  if (role === 'guru-piket') return <PicketDashboard world={world} />;
  return <AdminDashboard world={world} />;
}
