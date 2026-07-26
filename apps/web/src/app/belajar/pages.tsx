import { Check, Flag, Save, ShieldCheck, Users } from 'lucide-react';
import { useDemoWorld } from './world-context';
import type { DemoRole } from './world';

function statusTone(status: string) {
  if (status === 'APPROVED' || status === 'OPEN' || status === 'CLOSED') return 'ok';
  if (status === 'REJECTED') return 'bad';
  if (status === 'PENDING' || status === 'SCHEDULED') return 'warn';
  return '';
}

export function LabScreen({ role, screen }: { role: DemoRole; screen: string }) {
  const { world, dispatch } = useDemoWorld();

  if (screen === 'izin' && (role === 'admin-tu' || role === 'kepala-sekolah')) {
    return (
      <div className="content">
        <div className="page-head"><div><div className="eyebrow">IZIN PERSONEL</div><h1 className="page-title">Antrian izin (latihan)</h1><div className="page-sub">Data mainan. Keputusan hanya mengubah dunia lab di browser ini.</div></div></div>
        <div className="card pad">
          <div className="card-title">{world.leave.applicant}</div>
          <p className="muted">{world.leave.type} · {world.leave.reason}</p>
          <p>Status: <span className={`pill ${statusTone(world.leave.status)}`}>{world.leave.status}</span></p>
          {role === 'admin-tu' && world.leave.status === 'PENDING' && (
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button type="button" className="btn primary" data-demo="approve-leave" onClick={() => dispatch({ type: 'APPROVE_LEAVE', actorRole: 'admin-tu' })}>
                <Check size={14} /> Setujui izin
              </button>
              <button type="button" className="btn danger" onClick={() => dispatch({ type: 'REJECT_LEAVE', actorRole: 'admin-tu' })}>Tolak</button>
            </div>
          )}
          {role === 'kepala-sekolah' && <p className="muted" style={{ marginTop: 12 }}>Kepala memantau saja di lab ini. Keputusan ada di Admin TU.</p>}
        </div>
      </div>
    );
  }

  if (screen === 'izin-saya' && role === 'guru') {
    return (
      <div className="content">
        <div className="page-head"><div><div className="eyebrow">IZIN SAYA</div><h1 className="page-title">Pengajuan izin guru</h1></div></div>
        <div className="card pad">
          <p>Status saat ini: <span className={`pill ${statusTone(world.leave.status)}`}>{world.leave.status}</span></p>
          <p className="muted">{world.leave.reason}</p>
          <button type="button" className="btn primary" style={{ marginTop: 12 }} onClick={() => dispatch({ type: 'SUBMIT_LEAVE', actorRole: 'guru' })}>
            <Save size={14} /> Kirim pengajuan baru
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'presensi' && role === 'guru') {
    return (
      <div className="content">
        <div className="page-head"><div><div className="eyebrow">PRESENSI</div><h1 className="page-title">{world.session.subject} · {world.session.classCode}</h1></div></div>
        <div className="card pad">
          <p>Status sesi: <span className={`pill ${statusTone(world.session.status)}`}>{world.session.status}</span></p>
          <p>Hadir: <b>{world.session.presentCount}</b> / {world.session.totalStudents}</p>
          <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" disabled={world.session.status !== 'SCHEDULED'} onClick={() => dispatch({ type: 'OPEN_SESSION', actorRole: 'guru' })}>Buka sesi</button>
            <button type="button" className="btn" disabled={world.session.status !== 'OPEN'} onClick={() => dispatch({ type: 'MARK_PRESENT', actorRole: 'guru' })}>Tandai 8 siswa hadir</button>
            <button type="button" className="btn ghost" disabled={world.session.status !== 'OPEN'} onClick={() => dispatch({ type: 'CLOSE_SESSION', actorRole: 'guru' })}>Tutup sesi</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'picket' && role === 'guru-piket') {
    return (
      <div className="content">
        <div className="page-head"><div><div className="eyebrow">CATATAN PIKET</div><h1 className="page-title">Buku jaga (latihan)</h1></div></div>
        <div className="card pad">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" onClick={() => dispatch({ type: 'LOG_PICKET', actorRole: 'guru-piket' })}>Catat kejadian</button>
            <button type="button" className="btn" onClick={() => dispatch({ type: 'OPEN_FLAG', actorRole: 'guru-piket' })}><Flag size={14} /> Buka tanda masalah</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'masalah' && (role === 'admin-tu' || role === 'guru-piket')) {
    const openFlags = world.flags.filter((f) => f.open);
    return (
      <div className="content">
        <div className="page-head"><div><div className="eyebrow">CEK MASALAH</div><h1 className="page-title">Antrian masalah</h1></div></div>
        <div className="card pad">
          {openFlags.length === 0 ? <p className="muted">Tidak ada masalah terbuka.</p> : openFlags.map((f) => (
            <div key={f.id} className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span>{f.type} · {f.subject}</span>
              {role === 'admin-tu' && (
                <button type="button" className="btn sm" onClick={() => dispatch({ type: 'RESOLVE_FLAG', actorRole: 'admin-tu' })}>Selesaikan</button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (screen === 'perangkat' && (role === 'operator-it' || role === 'admin-tu')) {
    return (
      <div className="content">
        <div className="page-head"><div><div className="eyebrow">PERANGKAT</div><h1 className="page-title">HP Scanner (latihan)</h1></div></div>
        <div className="card pad" data-demo="operator-devices">
          <p><b>{world.devices.readersOnline}</b> / {world.devices.max} online</p>
          <p className="muted">{world.devices.lastNote}</p>
          {role === 'operator-it' && (
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button type="button" className="btn primary" onClick={() => dispatch({ type: 'SET_READER_ONLINE', actorRole: 'operator-it' })}>Scanner +1 online</button>
              <button type="button" className="btn ghost" onClick={() => dispatch({ type: 'SET_READER_OFFLINE', actorRole: 'operator-it' })}>Scanner −1 offline</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === 'notifikasi') {
    const items = world.notifications[role] || [];
    return (
      <div className="content">
        <div className="page-head"><div><div className="eyebrow">NOTIFIKASI</div><h1 className="page-title">Pesan di dunia latihan</h1></div></div>
        <div className="card pad">
          {items.length === 0 ? <p className="muted">Kosong.</p> : items.map((n) => (
            <div key={n.id} className="belajar-notif-row">{n.unread ? '• ' : ''}{n.text}</div>
          ))}
        </div>
      </div>
    );
  }

  // dashboard default
  if (role === 'siswa') {
    return (
      <div className="content">
        <div className="page-head"><div><div className="eyebrow">SISWA</div><h1 className="page-title">Kehadiran Saya</h1><div className="page-sub">Angka berubah jika guru mengisi presensi di tab/peran Guru.</div></div></div>
        <div className="card pad" data-demo="student-board">
          <p>Sesi {world.session.subject}: <span className={`pill ${statusTone(world.session.status)}`}>{world.session.status}</span></p>
          <p style={{ fontSize: 28, fontWeight: 700 }}>{world.session.presentCount} / {world.session.totalStudents}</p>
          <p className="muted">siswa ditandai hadir di lab</p>
        </div>
        <div className="card pad" style={{ marginTop: 12 }}>
          <div className="card-title">Notifikasi</div>
          {(world.notifications.siswa || []).slice(0, 4).map((n) => <div key={n.id} className="belajar-notif-row">{n.text}</div>)}
        </div>
      </div>
    );
  }

  if (role === 'kepala-sekolah') {
    return (
      <div className="content">
        <div className="page-head"><div><div className="eyebrow">KEPALA SEKOLAH</div><h1 className="page-title">Ringkasan pantauan</h1></div></div>
        <div className="grid g-3">
          <div className="card pad"><small>Staf hadir</small><div style={{ fontSize: 24, fontWeight: 700 }}>{world.stats.staffPresent}</div></div>
          <div className="card pad"><small>Siswa lengkap</small><div style={{ fontSize: 24, fontWeight: 700 }}>{world.stats.studentComplete}</div></div>
          <div className="card pad"><small>Masalah terbuka</small><div style={{ fontSize: 24, fontWeight: 700 }}>{world.stats.openProblems}</div></div>
        </div>
        <div className="card pad" style={{ marginTop: 12 }}>
          <p>Izin personel: <span className={`pill ${statusTone(world.leave.status)}`}>{world.leave.status}</span></p>
          <button type="button" className="btn primary" data-demo="kepala-clarity" style={{ marginTop: 12 }} onClick={() => dispatch({ type: 'KEPALA_REQUEST_CLARITY', actorRole: 'kepala-sekolah' })}>
            <ShieldCheck size={14} /> Minta klarifikasi ke petugas
          </button>
        </div>
      </div>
    );
  }

  if (role === 'guru') {
    return (
      <div className="content">
        <div className="page-head"><div><div className="eyebrow">GURU MAPEL</div><h1 className="page-title">Ringkasan mengajar</h1></div></div>
        <div className="card pad">
          <p>{world.session.subject} · {world.session.classCode}</p>
          <p>Status: <span className={`pill ${statusTone(world.session.status)}`}>{world.session.status}</span></p>
          <p>Izin saya: <span className={`pill ${statusTone(world.leave.status)}`}>{world.leave.status}</span></p>
        </div>
      </div>
    );
  }

  if (role === 'operator-it') {
    return (
      <div className="content">
        <div className="page-head"><div><div className="eyebrow">OPERATOR IT</div><h1 className="page-title">Cek sistem</h1></div></div>
        <div className="card pad" data-demo="operator-devices">
          <p><Users size={16} /> Scanner online: <b>{world.devices.readersOnline}/{world.devices.max}</b></p>
          <p className="muted">{world.devices.lastNote}</p>
        </div>
      </div>
    );
  }

  if (role === 'guru-piket') {
    return (
      <div className="content">
        <div className="page-head"><div><div className="eyebrow">GURU PIKET</div><h1 className="page-title">Tugas piket hari ini</h1></div></div>
        <div className="card pad">
          <p>Masalah terbuka: <b>{world.stats.openProblems}</b></p>
          <p>Scanner: {world.devices.lastNote}</p>
        </div>
      </div>
    );
  }

  // admin-tu dashboard
  return (
    <div className="content">
      <div className="page-head"><div><div className="eyebrow">ADMIN / TU</div><h1 className="page-title">Ringkasan hari ini</h1><div className="page-sub">Simulator SIAB2 — watermark LATIHAN selalu tampil.</div></div></div>
      <div className="grid g-3">
        <div className="card pad"><small>Staf hadir</small><div style={{ fontSize: 24, fontWeight: 700 }}>{world.stats.staffPresent}</div></div>
        <div className="card pad"><small>Siswa lengkap</small><div style={{ fontSize: 24, fontWeight: 700 }}>{world.stats.studentComplete}</div></div>
        <div className="card pad"><small>Masalah terbuka</small><div style={{ fontSize: 24, fontWeight: 700 }}>{world.stats.openProblems}</div></div>
      </div>
      <div className="card pad" style={{ marginTop: 12 }}>
        <div className="card-title">Antrian izin</div>
        <p>{world.leave.applicant}: <span className={`pill ${statusTone(world.leave.status)}`}>{world.leave.status}</span></p>
        <p className="muted">Buka menu Izin Personel untuk memutuskan.</p>
      </div>
    </div>
  );
}
