import { useMemo, useState } from 'react';
import { BookOpen, ChevronRight, Home, Menu, RefreshCw, Sparkles, X } from 'lucide-react';
import { BRAND } from '../branding';
import { Avatar, IconBtn, Pill } from '../ui';
import { DEMO_ROLES, type DemoRole } from './world';
import { useDemoWorld } from './world-context';
import {
  groupNav,
  labGo,
  navForRole,
  pageContext,
  roleHomePath,
  rolePersona,
  roleScreenPath
} from './lab-nav';
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
  const nav = useMemo(() => navForRole(role), [role]);
  const grouped = useMemo(() => groupNav(nav), [nav]);
  const persona = rolePersona(role);
  const ctx = pageContext(role, screen, nav);
  const unread = (world.notifications[role] || []).filter((n) => n.unread).length;

  return (
    <div className="app siab2-shell belajar-lab" data-theme="dark" data-siab2-shell="pass3" data-role={role}>
      <div className="siab2-shell-grid" aria-hidden="true" />
      <div className="belajar-watermark" aria-hidden="true">LATIHAN</div>
      <div
        className={`side-backdrop siab2-shell-backdrop${sidebarOpen ? ' side-open siab2-shell-backdrop-open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`side siab2-sidebar${sidebarOpen ? ' side-open siab2-sidebar-open' : ''}`}
        aria-label="Navigasi utama"
        data-demo="sidebar"
        data-role={role}
      >
        <div className="siab2-sidebar-aura" aria-hidden="true" />
        <div className="brand siab2-sidebar-brand">
          <div className="brand-mark siab2-sidebar-brand-mark">
            <img className="brand-logo" src="/logoman1.jpeg" alt="Logo MAN 1 Rokan Hulu" />
          </div>
          <div className="brand-text siab2-sidebar-brand-text">
            <div className="siab2-sidebar-kicker">Lab Belajar · Portal SIAB2</div>
            <div className="brand-name siab2-sidebar-brand-name">{BRAND.shortName}</div>
            <div className="brand-sub siab2-sidebar-brand-sub">{BRAND.institution}</div>
          </div>
          <button className="btn icon ghost hamburger siab2-sidebar-close" aria-label="Tutup navigasi" onClick={() => setSidebarOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <nav className="nav-body siab2-sidebar-nav" aria-label="Menu navigasi">
          {grouped.map(({ section, items }) => (
            <div key={section} className="nav-block siab2-sidebar-nav-block">
              <div className="nav-section siab2-sidebar-nav-section" aria-hidden="true"><span>{section}</span></div>
              {items.map((item) => {
                const active = screen === item.screen;
                const Ico = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`nav-item siab2-sidebar-nav-item${active ? ' active siab2-sidebar-nav-item-active' : ''}${item.wired ? '' : ' belajar-nav-stub'}`}
                    data-demo={item.demoAttr}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      labGo(roleScreenPath(role, item.screen));
                      setSidebarOpen(false);
                    }}
                  >
                    <span className="siab2-sidebar-nav-icon"><Ico size={16} aria-hidden="true" strokeWidth={2} /></span>
                    <span className="siab2-sidebar-nav-label">{item.label}</span>
                  </button>
                );
              })}
            </div>
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
        <div className="side-foot siab2-sidebar-footer">
          <div className="side-user siab2-sidebar-user-card">
            <Avatar name={persona.fullName} size="sm" />
            <div className="side-user-info">
              <div className="side-user-name">{persona.fullName}</div>
              <div className="side-user-role">{persona.roleLabel} · LATIHAN</div>
            </div>
            <IconBtn label="Kembali ke hub lab" onClick={() => labGo('/belajar')}><Home size={15} /></IconBtn>
          </div>
        </div>
      </aside>
      <main className="main siab2-shell-main" id="main-content" tabIndex={-1}>
        <div className="topbar siab2-topbar" data-tour="topbar">
          <button className="btn icon ghost hamburger siab2-topbar-menu" aria-label="Buka menu navigasi" onClick={() => setSidebarOpen(true)}>
            <Menu size={18} />
          </button>
          <div className="crumb siab2-topbar-crumb" aria-label="Jejak halaman">
            <span className="row siab2-topbar-crumb-item"><span>{persona.area}</span><ChevronRight size={12} aria-hidden="true" /></span>
            <span className="row siab2-topbar-crumb-item"><span className="now">{ctx.title}</span></span>
          </div>
          <div className="siab2-topbar-page-context">
            <span>{ctx.area}</span>
            <strong>{ctx.title}</strong>
          </div>
          <div className="top-spacer" />
          <Pill tone="warn">LATIHAN · data mainan</Pill>
          <span className="chip hide-sm"><Sparkles size={12} /> Dampak lintas peran</span>
          <div className={`system-ribbon top-status siab2-topbar-status online`} aria-live="polite">
            <span className="connection-lamp" aria-hidden="true" />
            <span>{persona.roleLabel} · lab</span>
          </div>
          <IconBtn label="Lihat tutorial" data-demo="tutorial-button" onClick={() => setCoachKey((k) => k + 1)}><BookOpen size={16} /></IconBtn>
          <span className="notif-wrapper">
            <IconBtn label="Notifikasi lab" onClick={() => labGo(roleScreenPath(role, 'notifikasi'))}>
              <span className="belajar-bell-wrap">
                <Sparkles size={16} />
                {unread > 0 && <span className="notif-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
              </span>
            </IconBtn>
          </span>
          <div className="siab2-topbar-user">
            <button type="button" className="siab2-topbar-user-trigger" aria-label="Profil lab">
              <Avatar name={persona.fullName} size="sm" />
              <span className="siab2-topbar-user-copy"><strong>{persona.fullName}</strong><em>{persona.roleLabel}</em></span>
            </button>
          </div>
          <div className="belajar-top-actions hide-sm">
            <button type="button" className="btn sm ghost" onClick={() => { if (window.confirm('Reset dunia latihan ke awal?')) resetWorld(); }}>
              <RefreshCw size={14} /> Reset
            </button>
            <button type="button" className="btn sm" onClick={() => labGo('/belajar')}><Home size={14} /> Hub</button>
          </div>
        </div>
        <div className="siab2-shell-page-wrap" data-demo="impact-dock">
          <p className="belajar-analogy-line">{meta.analogy}</p>
          <LabScreen role={role} screen={screen} />
          {world.events[0] && (
            <div className="content" style={{ paddingTop: 0 }}>
              <div className="card siab2-content-card pad belajar-timeline">
                <div className="card-title siab2-content-card-title">Jejak dampak terbaru</div>
                {world.events.slice(0, 5).map((ev) => (
                  <div key={ev.id} className="belajar-timeline-item">
                    <b>{ev.summary}</b>
                    <small>{ev.impacts.map((i) => i.role).join(' · ')}</small>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <DemoCoach role={role} presentMode={presentMode} forceOpenKey={coachKey} />
      {lastEvent && <ImpactPanel event={lastEvent} onClose={clearLastEvent} />}
    </div>
  );
}

export function BelajarClosedPage() {
  return (
    <div className="belajar-lab belajar-closed" data-theme="dark">
      <div className="card pad siab2-content-card" style={{ maxWidth: 480, margin: '10vh auto' }}>
        <h1>Lab Belajar ditutup</h1>
        <p className="muted">Mode latihan interaktif sudah dinonaktifkan. Gunakan SIAB2 production untuk operasional.</p>
        <button
          type="button"
          className="btn primary siab2-action-button"
          onClick={() => {
            window.history.pushState({}, '', '/siab2/login');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
        >
          Ke login SIAB2
        </button>
      </div>
    </div>
  );
}

export function BelajarHub({ presentMode }: { presentMode: boolean }) {
  const { resetWorld, world } = useDemoWorld();
  return (
    <div className={`belajar-lab belajar-hub siab2-shell${presentMode ? ' present' : ''}`} data-theme="dark">
      <div className="belajar-hub-inner">
        <span className="pill warn siab2-status-pill">LATIHAN · tidak mengubah absensi sekolah</span>
        <h1>Lab Belajar {BRAND.compactName}</h1>
        <p className="belajar-hub-lead">
          Pilih peran. Tampilan menu & dasbor mengikuti portal SIAB2 asli. Data mainan di browser ini saja.
          Satu keputusan bisa memunculkan <b>menu ajaib dampak</b> ke peran lain.
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
        <div className="belajar-hub-help card pad siab2-content-card">
          <div className="card-title">Cara presentasi 3 menit</div>
          <ol>
            <li>Buka <b>Admin / TU</b> → ikuti tutorial → Setujui izin.</li>
            <li>Di menu ajaib, klik <b>Lihat sebagai Guru</b>.</li>
            <li>Buka <b>Guru</b> → Presensi → Buka sesi → Tandai hadir → cek <b>Siswa</b>.</li>
          </ol>
          <p className="muted">Event di dunia ini: {world.events.length}. Tab browser sama = dunia sama.</p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn ghost siab2-action-button" onClick={() => resetWorld()}><RefreshCw size={14} /> Reset dunia latihan</button>
            <button type="button" className="btn ghost siab2-action-button" onClick={() => labGo('/belajar?present=1')}>Mode presentasi</button>
          </div>
        </div>
      </div>
    </div>
  );
}
