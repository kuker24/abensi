import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileBarChart2,
  Home,
  LayoutGrid,
  Menu,
  SlidersHorizontal,
  Shield,
  UserCircle,
  Users
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { uiCopy } from '../lib/uiCopyId';
import { labelForRole, labelForStatus } from '../lib/uiLabels';
import type { Role, SessionUser } from '../types/domain';
import type { UiTweaks } from '../types/experience';
import { Avatar, Badge, Button, Dropdown, Popover, Select, Sheet, ThemeToggle, Tooltip } from './ui';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

export function buildNav(role: Role): NavItem[] {
  if (role === 'SISWA') {
    return [
      { to: '/siswa/dashboard', label: uiCopy.nav.studentDashboard, icon: <Home size={16} /> },
      { to: '/siswa/check-in', label: uiCopy.nav.studentCheckIn, icon: <SlidersHorizontal size={16} /> },
      { to: '/profil', label: uiCopy.nav.profile, icon: <UserCircle size={16} /> }
    ];
  }

  if (role === 'GURU_MAPEL') {
    return [
      { to: '/guru/dashboard', label: uiCopy.nav.teacherDashboard, icon: <Home size={16} /> },
      { to: '/guru/presensi', label: uiCopy.nav.teacherAttendance, icon: <ClipboardCheck size={16} /> },
      { to: '/guru/koreksi', label: uiCopy.nav.teacherCorrection, icon: <AlertTriangle size={16} /> },
      { to: '/guru/rekap', label: uiCopy.nav.teacherRecap, icon: <FileBarChart2 size={16} /> },
      { to: '/guru/kehadiran-saya', label: uiCopy.nav.teacherMyAttendance, icon: <Activity size={16} /> },
      { to: '/profil', label: uiCopy.nav.profile, icon: <UserCircle size={16} /> }
    ];
  }

  return [
    { to: '/admin/dashboard', label: uiCopy.nav.adminDashboard, icon: <LayoutGrid size={16} /> },
    { to: '/admin/anomali', label: uiCopy.nav.adminAnomaly, icon: <AlertTriangle size={16} /> },
    { to: '/admin/live-monitor', label: uiCopy.nav.adminLiveMonitor, icon: <Activity size={16} /> },
    { to: '/admin/riwayat', label: uiCopy.nav.adminHistory, icon: <ClipboardCheck size={16} /> },
    { to: '/admin/jadwal', label: uiCopy.nav.adminSchedule, icon: <CalendarDays size={16} /> },
    { to: '/admin/smart-card', label: uiCopy.nav.adminSmartCard, icon: <CreditCard size={16} /> },
    { to: '/admin/master-data', label: uiCopy.nav.adminMasterData, icon: <Users size={16} /> },
    { to: '/admin/laporan', label: uiCopy.nav.adminReports, icon: <FileBarChart2 size={16} /> },
    { to: '/admin/audit', label: uiCopy.nav.adminAudit, icon: <Shield size={16} /> },
    { to: '/admin/pengaturan', label: uiCopy.nav.adminSettings, icon: <UserCircle size={16} /> },
    { to: '/profil', label: uiCopy.nav.profile, icon: <UserCircle size={16} /> }
  ];
}

export function AppLayout(props: {
  user: SessionUser;
  mode: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
  currentPath: string;
  tweaks: UiTweaks;
  onTweakChange: (patch: Partial<UiTweaks>) => void;
  onResetTweaks: () => void;
  children: ReactNode;
}) {
  const items = buildNav(props.user.role);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  return (
    <div className="layout-root">
      <aside className="sidebar sidebar-desktop">
        <Sidebar items={items} currentPath={props.currentPath} />
      </aside>

      <main className="layout-main">
        <TopBar
          user={props.user}
          mode={props.mode}
          onToggleTheme={props.onToggleTheme}
          onLogout={props.onLogout}
          tweaks={props.tweaks}
          quickItems={items.slice(0, 3)}
          onOpenMenu={() => setMenuOpen(true)}
          onOpenTweaks={() => setTweaksOpen(true)}
        />
        <section className="page-content">{props.children}</section>
      </main>

      <Sheet open={menuOpen} title="Navigasi" onClose={() => setMenuOpen(false)} side="left">
        <div className="sidebar sidebar-mobile">
          <Sidebar items={items} currentPath={props.currentPath} onNavigate={() => setMenuOpen(false)} compact />
        </div>
      </Sheet>

      <Sheet open={tweaksOpen} title={uiCopy.tweak.title} onClose={() => setTweaksOpen(false)} side="right">
        <div className="stack-sm">
          <p>{uiCopy.tweak.description}</p>

          <div className="toolbar-group">
            <label htmlFor="tweak-density">{uiCopy.tweak.density}</label>
            <Select
              id="tweak-density"
              value={props.tweaks.density}
              onChange={(value) => props.onTweakChange({ density: value as UiTweaks['density'] })}
              options={[
                { label: uiCopy.tweak.densityComfortable, value: 'comfortable' },
                { label: uiCopy.tweak.densityCompact, value: 'compact' }
              ]}
            />
          </div>

          <div className="toolbar-group">
            <label htmlFor="tweak-radius">{uiCopy.tweak.radius}</label>
            <Select
              id="tweak-radius"
              value={props.tweaks.radius}
              onChange={(value) => props.onTweakChange({ radius: value as UiTweaks['radius'] })}
              options={[
                { label: uiCopy.tweak.radiusSoft, value: 'soft' },
                { label: uiCopy.tweak.radiusSharp, value: 'sharp' }
              ]}
            />
          </div>

          <div className="toolbar-group">
            <label htmlFor="tweak-motion">{uiCopy.tweak.motion}</label>
            <Select
              id="tweak-motion"
              value={props.tweaks.motion}
              onChange={(value) => props.onTweakChange({ motion: value as UiTweaks['motion'] })}
              options={[
                { label: uiCopy.tweak.motionCalm, value: 'calm' },
                { label: uiCopy.tweak.motionBalanced, value: 'balanced' },
                { label: uiCopy.tweak.motionVivid, value: 'vivid' }
              ]}
            />
          </div>

          <div className="toolbar-group">
            <label htmlFor="tweak-emphasis">{uiCopy.tweak.emphasis}</label>
            <Select
              id="tweak-emphasis"
              value={props.tweaks.emphasis}
              onChange={(value) => props.onTweakChange({ emphasis: value as UiTweaks['emphasis'] })}
              options={[
                { label: uiCopy.tweak.emphasisData, value: 'data' },
                { label: uiCopy.tweak.emphasisContext, value: 'context' }
              ]}
            />
          </div>

          <div className="toolbar-group">
            <label htmlFor="tweak-chroma">{uiCopy.tweak.palette}</label>
            <Select
              id="tweak-chroma"
              value={props.tweaks.chroma}
              onChange={(value) => props.onTweakChange({ chroma: value as UiTweaks['chroma'] })}
              options={[
                { label: uiCopy.tweak.paletteEmerald, value: 'emerald' },
                { label: uiCopy.tweak.paletteSlate, value: 'slate' },
                { label: uiCopy.tweak.paletteSunset, value: 'sunset' }
              ]}
            />
          </div>

          <Button variant="secondary" onClick={props.onResetTweaks}>
            {uiCopy.tweak.reset}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

export function Sidebar(props: {
  items: NavItem[];
  currentPath: string;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  return (
    <>
      <div className="brand">
        <h1>{uiCopy.appName}</h1>
        <p>{uiCopy.schoolName}</p>
      </div>
      <nav>
        {props.items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={props.onNavigate}
            className={props.currentPath.startsWith(item.to) ? 'nav-item nav-active' : 'nav-item'}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}

export function TopBar(props: {
  user: SessionUser;
  mode: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
  tweaks: UiTweaks;
  onOpenMenu: () => void;
  onOpenTweaks: () => void;
  quickItems: NavItem[];
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <Tooltip content={uiCopy.topbar.openMenu}>
          <span>
            <Button variant="ghost" size="sm" className="topbar-menu-btn" onClick={props.onOpenMenu}>
              <Menu size={16} />
            </Button>
          </span>
        </Tooltip>
        <Avatar name={props.user.fullName} />
        <div>
          <strong>{props.user.fullName}</strong>
          <p>{labelForRole(props.user.role)}</p>
        </div>
      </div>

      <div className="topbar-right">
        <Popover
          trigger={
            <Button variant="ghost" size="sm">
              {uiCopy.topbar.quickAccess}
            </Button>
          }
        >
          <div className="stack-sm">
            {props.quickItems.map((item) => (
              <Link key={item.to} to={item.to}>
                {item.label}
              </Link>
            ))}
            <Link to="/profil">Lihat Profil</Link>
          </div>
        </Popover>

        <ThemeToggle mode={props.mode} onToggle={props.onToggleTheme} />

        <Button variant="ghost" size="sm" onClick={props.onOpenTweaks}>
          <SlidersHorizontal size={14} />
          {uiCopy.topbar.uiPanel}
        </Button>
        <Badge tone="info">{labelForStatus(props.tweaks.motion)}</Badge>

        <Dropdown
          label={
            <span className="action-row">
              <Avatar name={props.user.fullName} />
              {uiCopy.topbar.account}
            </span>
          }
          items={[
            {
              label: uiCopy.topbar.profile,
              onSelect: () => {
                window.location.assign('/profil');
              }
            },
            {
              label: uiCopy.topbar.logout,
              onSelect: props.onLogout
            }
          ]}
        />
      </div>
    </header>
  );
}
