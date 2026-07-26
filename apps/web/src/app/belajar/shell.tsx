import { useState } from 'react';
import { BookOpen, Home, Menu, RefreshCw, Sparkles } from 'lucide-react';
import { BRAND } from '../branding';
import { DEMO_ROLES, type DemoRole } from './world';
import { useDemoWorld } from './world-context';
import { labGo, navForRole, roleHomePath, roleScreenPath } from './lab-nav';
import { DemoCoach } from './coach';
import { ImpactPanel } from './impact-panel';
import { LabScreen } from './pages';

export function RoleShell({
  role,
  screen,
  presentMode
}: {
  role: DemoRole;
  screen: string;
  presentMode: boolean;
}) {
  const { world, lastEvent, clearLastEvent, resetWorld } = useDemoWorld();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [coachKey, setCoachKey] = useState(0);
  const meta = DEMO_ROLES.find((r) => r.id === role)!;
  const nav = navForRole(role);
  const unread = (world.notifications[role] || []).filter((n) => n.unread).length;

  return (
    <div className="belajar-lab siab2-shell" data-theme="dark">
      <div className="belajar-watermark" aria-hidden="true">LATIHAN</div>
      {sidebarOpen && <button type="button" className="belajar-scrim" aria-label="Tutup menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={`belajar-sidebar${sidebarOpen ? ' open' : ''}`} data-demo="sidebar">
        <div className="belajar-brand">
          <b>{BRAND.compactName} Lab</b>
          <small>{meta.label}</small>
        </div>
        <nav className="belajar-nav">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`belajar-nav-item${screen === item.screen ? ' active' : ''}`}
              data-demo={item.demoAttr}
              onClick={() => {
                labGo(roleScreenPath(role, item.screen));
                setSidebarOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="belajar-role-switch" data-demo="role-switch">
          <small>Ganti peran (dunia sama)</small>
          <div className="belajar-role-chips">
            {DEMO_ROLES.map((r) => (
              <button key={r.id} type="button" className={`belajar-chip${r.id === role ? ' on' : ''}`} onClick={() => labGo(roleHomePath(r.id))}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </aside>
      <div className="belajar-main">
        <header className="belajar-topbar">
          <button type="button" className="btn icon ghost hide-desktop" aria-label="Menu" onClick={() => setSidebarOpen(true)}><Menu size={18} /></button>
          <span className="pill warn">LATIHAN · data mainan</span>
          <span className="chip hide-sm"><Sparkles size={12} /> Dampak lintas peran aktif</span>
          <span className="chip">Notif {unread}</span>
          <div className="belajar-top-actions">
            <button type="button" className="btn sm ghost" onClick={() => setCoachKey((k) => k + 1)} data-demo="tutorial-button"><BookOpen size={14} /> Tutorial</button>
            <button type="button" className="btn sm ghost" onClick={() => { if (window.confirm('Reset dunia latihan ke awal?')) resetWorld(); }}><RefreshCw size={14} /> Reset dunia</button>
            <button type="button" className="btn sm" onClick={() => labGo('/belajar')}><Home size={14} /> Hub</button>
          </div>
        </header>
        <div className="belajar-page" data-demo="impact-dock">
          <p className="belajar-analogy-line">{meta.analogy}</p>
          <LabScreen role={role} screen={screen} />
          {world.events[0] && (
            <div className="card pad belajar-timeline">
              <div className="card-title">Jejak dampak terbaru</div>
              {world.events.slice(0, 5).map((ev) => (
                <div key={ev.id} className="belajar-timeline-item">
                  <b>{ev.summary}</b>
                  <small>{ev.impacts.map((i) => i.role).join(' · ')}</small>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <DemoCoach role={role} presentMode={presentMode} forceOpenKey={coachKey} />
      {lastEvent && <ImpactPanel event={lastEvent} onClose={clearLastEvent} />}
    </div>
  );
}

export function BelajarClosedPage() {
  return (
    <div className="belajar-lab belajar-closed" data-theme="dark">
      <div className="card pad" style={{ maxWidth: 480, margin: '10vh auto' }}>
        <h1>Lab Belajar ditutup</h1>
        <p className="muted">Mode latihan interaktif sudah dinonaktifkan. Gunakan SIAB2 production untuk operasional.</p>
        <button type="button" className="btn primary" onClick={() => { window.history.pushState({}, '', '/siab2/login'); window.dispatchEvent(new PopStateEvent('popstate')); }}>Ke login SIAB2</button>
      </div>
    </div>
  );
}

export function BelajarHub({ presentMode }: { presentMode: boolean }) {
  const { resetWorld, world } = useDemoWorld();
  return (
    <div className={`belajar-lab belajar-hub${presentMode ? ' present' : ''}`} data-theme="dark">
      <div className="belajar-hub-inner">
        <span className="pill warn">LATIHAN · tidak mengubah absensi sekolah</span>
        <h1>Lab Belajar {BRAND.compactName}</h1>
        <p className="belajar-hub-lead">
          Pilih peran. Tutorial jalan otomatis (bisa jeda). Satu keputusan bisa memunculkan <b>menu ajaib dampak</b> ke peran lain — seperti remote TV yang mengganti banyak layar.
        </p>
        <div className="belajar-hub-grid">
          {DEMO_ROLES.map((r) => (
            <button key={r.id} type="button" className="belajar-hub-card" onClick={() => labGo(roleHomePath(r.id))}>
              <b>{r.label}</b>
              <span>{r.analogy}</span>
              <small>/belajar/{r.id}</small>
            </button>
          ))}
        </div>
        <div className="belajar-hub-help card pad">
          <div className="card-title">Cara presentasi 3 menit</div>
          <ol>
            <li>Buka <b>Admin / TU</b> → ikuti tutorial → Setujui izin.</li>
            <li>Di menu ajaib, klik <b>Lihat sebagai Guru</b>.</li>
            <li>Buka <b>Guru</b> → Presensi → Buka sesi → Tandai hadir → cek <b>Siswa</b>.</li>
          </ol>
          <p className="muted">Event di dunia ini: {world.events.length}. Tab browser sama = dunia sama. Laptop berbeda = dunia terpisah.</p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn ghost" onClick={() => resetWorld()}><RefreshCw size={14} /> Reset dunia latihan</button>
            <button type="button" className="btn ghost" onClick={() => labGo('/belajar?present=1')}>Mode presentasi</button>
          </div>
        </div>
      </div>
    </div>
  );
}
