import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpen,
  Calendar,
  CheckSquare,
  ChevronRight,
  Clock,
  CreditCard,
  Database,
  Edit3,
  FileText,
  Flag,
  Home,
  LayoutDashboard,
  ListChecks,
  Lock,
  LogOut,
  MapPin,
  Menu,
  Radar,
  Search,
  Settings,
  Shield,
  User as UserIcon,
  Users,
  X,
  Zap
} from 'lucide-react';
import { API_BASE, AUTH_EXPIRED_EVENT, apiFetch, defaultPathFor, go, normalizeRole, readStoredUser, THEME_KEY, TOKEN_KEY, USER_KEY } from './api';
import { ConfirmDialog, setRiskConfirmHandler } from './confirm';
import { Avatar, Btn, Card, EmptyState, Field, IconBtn, PageHead, TextInput, ThemeToggle, ToastHost } from './ui';
import type { ConfirmDialogState, Role, ThemeMode, ToastMessage, User } from './types';
import { AdminDashboard, AnomalyPage, AuditPage, DeveloperControlPage, DevicesPage, HelpPage, HistoryPage, ItDashboardPage, LiveMonitorPage, MasterDataPage, NotificationsPage, PicketBookPage, PicketDashboardPage, ReportsPage, SchedulePage, SessionsPage, SettingsPage, TeacherLeavesPage } from './pages/admin/AdminPages.jsx';
import { ClassInputPage, CorrectionPage, TeacherDashboard, TeacherLeavePage, TeacherRecapPage } from './pages/guru/GuruPages.jsx';
import { MyAttendancePage } from './pages/siswa/MyAttendancePage.jsx';
import { OnboardingTour } from './tutorial';

type Notify = (message: string, type?: string) => void;
type LoginRole = 'guru' | 'admin' | 'siswa';
type NavIcon = typeof Home;
type NavItem = readonly [section: string, url: string, label: string, icon: NavIcon];
type NavKey = 'admin' | 'operator' | 'picket' | 'guru' | 'siswa' | 'developer';
type ConnectionStatus = 'checking' | 'online' | 'offline';

/** Isolated clock — updates every second but re-renders only itself */
const LiveClock = memo(function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="chip" aria-live="off" aria-label={now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}>
      <Clock size={12} />
      <span className="hide-sm">{now.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })} · </span>
      <b>{now.toLocaleTimeString('id-ID', { hour12: false })}</b>
    </span>
  );
});

const ROLE_PRESETS: Record<LoginRole, { id: string; idLabel: string }> = {
  guru: { id: 'guru.matematika', idLabel: 'Nama akun Guru' },
  admin: { id: 'admin.tu', idLabel: 'Nama akun Admin/TU, Operator, atau Developer' },
  siswa: { id: 'siswa.citra', idLabel: 'Nama akun Siswa' }
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN_TU: 'Admin/TU',
  OPERATOR_IT: 'Operator IT',
  GURU_MAPEL: 'Guru Mapel',
  GURU_PIKET: 'Guru Piket',
  SISWA: 'Siswa',
  DEVELOPER: 'Developer'
};

const ROUTE_TITLE: Record<string, string[]> = {
  '/admin/dashboard': ['Admin/TU', 'Mulai Hari Ini'],
  '/admin/it-dashboard': ['Operator IT', 'Cek Sistem'],
  '/admin/picket-dashboard': ['Guru Piket', 'Tugas Piket Hari Ini'],
  '/admin/sessions': ['Admin/TU', 'Sesi Hari Ini'],
  '/admin/history': ['Admin/TU', 'Riwayat Scan'],
  '/admin/anomaly': ['Admin/TU', 'Masalah yang Perlu Dicek'],
  '/admin/picket': ['Admin/TU', 'Catatan Piket'],
  '/admin/master-data': ['Admin/TU', 'Akun & Data Sekolah'],
  '/admin/schedule': ['Admin/TU', 'Jadwal Kelas'],
  '/admin/devices': ['Admin/TU', 'HP Scanner & Kartu'],
  '/admin/reports': ['Admin/TU', 'Laporan Sekolah'],
  '/admin/live-monitor': ['Admin/TU', 'Aktivitas Sekarang'],
  '/admin/settings': ['Admin/TU', 'Aturan Absensi'],
  '/admin/audit': ['Admin/TU', 'Riwayat Perubahan'],
  '/admin/teacher-leaves': ['Admin/TU', 'Pengajuan Guru'],
  '/admin/notifications': ['Sistem', 'Tugas / Notifikasi'],
  '/admin/developer-control': ['Developer', 'Pusat Kontrol'],
  '/admin/help': ['Bantuan', 'Panduan'],
  '/guru/izin': ['Guru', 'Izin / Sakit / Dinas'],
  '/guru/notifikasi': ['Guru', 'Tugas / Notifikasi'],
  '/guru/panduan': ['Guru', 'Panduan'],
  '/siswa/notifikasi': ['Siswa', 'Tugas / Notifikasi'],
  '/siswa/panduan': ['Siswa', 'Panduan'],
  '/guru/dashboard': ['Guru', 'Mulai Mengajar'],
  '/guru/presensi': ['Guru', 'Isi Presensi Kelas'],
  '/guru/koreksi': ['Guru', 'Perbaiki Presensi'],
  '/guru/rekap': ['Guru', 'Laporan Kelas Saya'],
  '/guru/kehadiran-saya': ['Guru', 'Kehadiran Saya'],
  '/siswa/dashboard': ['Siswa', 'Kehadiran Saya']
};

const NAV_ITEMS_BY_ROLE: Record<NavKey, NavItem[]> = {
  admin: [
    ['MULAI HARI INI', '/admin/dashboard', 'Ringkasan Hari Ini', LayoutDashboard], ['MULAI HARI INI', '/admin/sessions', 'Cek Sesi Kelas', Radar], ['MULAI HARI INI', '/admin/anomaly', 'Cek Masalah', Flag], ['MULAI HARI INI', '/admin/live-monitor', 'Aktivitas Sekarang', Activity],
    ['KERJA HARIAN', '/admin/history', 'Riwayat Scan', BookOpen], ['KERJA HARIAN', '/admin/picket', 'Catatan Piket', ListChecks], ['KERJA HARIAN', '/admin/teacher-leaves', 'Izin Guru', CheckSquare], ['DATA SEKOLAH', '/admin/master-data', 'Akun & Data Sekolah', Users], ['DATA SEKOLAH', '/admin/schedule', 'Jadwal Kelas', Calendar],
    ['PERANGKAT', '/admin/devices', 'HP Scanner & Kartu', CreditCard], ['LAPORAN', '/admin/reports', 'Laporan Sekolah', FileText], ['BANTUAN & SISTEM', '/admin/notifications', 'Tugas / Notifikasi', Bell], ['BANTUAN & SISTEM', '/admin/help', 'Panduan', BookOpen], ['BANTUAN & SISTEM', '/admin/settings', 'Aturan Absensi', Settings], ['BANTUAN & SISTEM', '/admin/audit', 'Riwayat Perubahan', Database]
  ],
  operator: [
    ['MULAI HARI INI', '/admin/it-dashboard', 'Cek Sistem', LayoutDashboard], ['PERANGKAT', '/admin/devices', 'HP Scanner & Kartu', CreditCard], ['PERANGKAT', '/admin/live-monitor', 'Aktivitas Sekarang', Activity], ['CEK KEAMANAN', '/admin/audit', 'Riwayat Perubahan', Database], ['BANTUAN', '/admin/notifications', 'Tugas / Notifikasi', Bell], ['BANTUAN', '/admin/help', 'Panduan Operator', BookOpen]
  ],
  developer: [
    ['KONTROL', '/admin/developer-control', 'Pusat Kontrol', Shield], ['KONTROL', '/admin/dashboard', 'Ringkasan Admin', LayoutDashboard], ['KONTROL', '/admin/it-dashboard', 'Cek Sistem', Radar], ['KONTROL', '/admin/live-monitor', 'Aktivitas Sekarang', Activity],
    ['DATA & SISTEM', '/admin/master-data', 'Akun & Data Sekolah', Users], ['DATA & SISTEM', '/admin/devices', 'HP Scanner & Kartu', CreditCard], ['DATA & SISTEM', '/admin/settings', 'Aturan Absensi', Settings], ['DATA & SISTEM', '/admin/audit', 'Riwayat Perubahan', Database],
    ['BANTUAN', '/admin/help', 'Panduan Developer', BookOpen]
  ],
  picket: [
    ['MULAI HARI INI', '/admin/picket-dashboard', 'Tugas Piket Hari Ini', LayoutDashboard], ['KERJA PIKET', '/admin/picket', 'Catatan Piket', ListChecks], ['KERJA PIKET', '/admin/sessions', 'Cek Sesi Kelas', Radar], ['KERJA PIKET', '/admin/anomaly', 'Cek Masalah', Flag], ['KERJA PIKET', '/admin/history', 'Riwayat Scan', BookOpen], ['KERJA PIKET', '/admin/live-monitor', 'Aktivitas Sekarang', Activity], ['BANTUAN', '/admin/notifications', 'Tugas / Notifikasi', Bell], ['BANTUAN', '/admin/help', 'Panduan Piket', BookOpen]
  ],
  guru: [['MULAI MENGAJAR', '/guru/dashboard', 'Ringkasan Mengajar', Home], ['MULAI MENGAJAR', '/guru/presensi', 'Isi Presensi Kelas', CheckSquare], ['MULAI MENGAJAR', '/guru/koreksi', 'Perbaiki Presensi', Edit3], ['LAPORAN', '/guru/rekap', 'Laporan Kelas Saya', FileText], ['PRIBADI', '/guru/izin', 'Izin / Sakit / Dinas', Calendar], ['PRIBADI', '/guru/kehadiran-saya', 'Kehadiran Saya', UserIcon], ['BANTUAN', '/guru/notifikasi', 'Tugas / Notifikasi', Bell], ['BANTUAN', '/guru/panduan', 'Panduan', BookOpen]],
  siswa: [['UTAMA', '/siswa/dashboard', 'Kehadiran Saya', Home], ['BANTUAN', '/siswa/notifikasi', 'Tugas / Notifikasi', Bell], ['BANTUAN', '/siswa/panduan', 'Panduan', BookOpen]]
};

function navKeyForRole(role?: string): NavKey {
  if (role === 'DEVELOPER') return 'developer';
  if (role === 'OPERATOR_IT') return 'operator';
  if (role === 'GURU_PIKET') return 'picket';
  if (role === 'GURU_MAPEL') return 'guru';
  if (role === 'SISWA') return 'siswa';
  return 'admin';
}

const ROUTE_ACCESS: Record<string, string[]> = {
  '/admin/dashboard': ['ADMIN_TU', 'DEVELOPER'],
  '/admin/it-dashboard': ['OPERATOR_IT', 'DEVELOPER'],
  '/admin/picket-dashboard': ['GURU_PIKET', 'DEVELOPER'],
  '/admin/sessions': ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'],
  '/admin/history': ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'],
  '/admin/anomaly': ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'],
  '/admin/picket': ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'],
  '/admin/master-data': ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'],
  '/admin/schedule': ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'],
  '/admin/devices': ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'],
  '/admin/reports': ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'],
  '/admin/live-monitor': ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'],
  '/admin/settings': ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'],
  '/admin/audit': ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'],
  '/admin/teacher-leaves': ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'],
  '/admin/notifications': ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'],
  '/admin/developer-control': ['DEVELOPER'],
  '/admin/help': ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'],
  '/guru/dashboard': ['GURU_MAPEL'],
  '/guru/presensi': ['GURU_MAPEL'],
  '/guru/koreksi': ['GURU_MAPEL'],
  '/guru/rekap': ['GURU_MAPEL'],
  '/guru/izin': ['GURU_MAPEL'],
  '/guru/kehadiran-saya': ['GURU_MAPEL'],
  '/guru/notifikasi': ['GURU_MAPEL'],
  '/guru/panduan': ['GURU_MAPEL'],
  '/siswa/dashboard': ['SISWA'],
  '/siswa/notifikasi': ['SISWA'],
  '/siswa/panduan': ['SISWA']
};

function canAccessRoute(path: string, user: User | null) {
  const allowed = ROUTE_ACCESS[path];
  return Boolean(user?.role && allowed?.includes(String(user.role)));
}

function routeExists(path: string) {
  return Boolean(ROUTE_ACCESS[path]);
}

function roleLabel(role?: string): string {
  return role && role in ROLE_LABEL ? ROLE_LABEL[role as Role] : role || '—';
}

function LoginScreen({ onLogin, mode, onToggleTheme }: { onLogin: (selectedRole: LoginRole, username: string, password: string) => Promise<void>; mode: ThemeMode; onToggleTheme: (theme: ThemeMode) => void }) {
  const [role, setRoleState] = useState<LoginRole>('guru');
  const [id, setId] = useState(ROLE_PRESETS.guru.id);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const setRole = (nextRole: LoginRole) => {
    setRoleState(nextRole);
    setId(ROLE_PRESETS[nextRole].id);
    setPw('');
    setErr('');
  };
  const submit = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!id || !pw) return setErr('Nama akun dan kata sandi wajib diisi.');
    setLoading(true);
    setErr('');
    try {
      await onLogin(role, id.trim(), pw);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Login gagal.');
    } finally {
      setLoading(false);
    }
  };
  return <div className="login"><div className="login-left"><div className="row" style={{ gap: 12 }}><div className="brand-mark login-brand-mark"><img className="brand-logo" src="/logoman1.jpeg" alt="Logo MAN 1 Rokan Hulu" /></div><div><div style={{ fontWeight: 700, fontSize: 15 }}>e-Hadir</div><div className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>MAN 1 ROKAN HULU</div></div><div style={{ marginLeft: 'auto' }}><ThemeToggle mode={mode} onToggle={onToggleTheme} /></div></div><div className="login-hero"><div className="eyebrow"><span className="dot" /> ABSENSI SEKOLAH DIGITAL</div><h1>Tempel kartu di gerbang.<br />Dicek lagi di kelas.<br /><span className="grad">Lebih rapi dan aman.</span></h1><p>Sistem ini membantu sekolah mencatat kehadiran siswa dari gerbang dan kelas. Jika ada siswa belum tempel kartu, tidak masuk kelas, atau data tidak sesuai, petugas akan lebih mudah mengetahuinya.</p><div className="row" style={{ gap: 8, marginTop: 22, flexWrap: 'wrap' }}><span className="chip"><Shield size={12} /> Semua perubahan tercatat</span><span className="chip"><MapPin size={12} /> Hanya di area sekolah</span><span className="chip"><Zap size={12} /> Cepat dan ringan</span></div></div><div className="login-specs"><div className="login-spec"><span className="k">DI GERBANG</span><span className="v">Tempel kartu siswa</span></div><div className="login-spec"><span className="k">DI KELAS</span><span className="v">Dicek oleh guru</span></div><div className="login-spec"><span className="k">PENGECEKAN DATA</span><span className="v">Dibantu otomatis</span></div></div></div><div className="login-right"><form className="login-card" onSubmit={submit}><div className="mono faint" style={{ fontSize: 11, letterSpacing: '0.08em' }}>MASUK SEBAGAI</div><div className="row" style={{ gap: 6, margin: '10px 0 22px' }}>{(['guru', 'admin', 'siswa'] as LoginRole[]).map((v) => <button type="button" key={v} className={`btn sm ${role === v ? 'primary' : 'ghost'}`} onClick={() => setRole(v)} style={{ flex: 1 }}>{v === 'guru' ? 'Guru' : v === 'admin' ? 'Admin/TU' : 'Siswa'}</button>)}</div><Field label={ROLE_PRESETS[role].idLabel}><TextInput icon={<UserIcon size={14} />} value={id} placeholder="Masukkan nama akun" autoComplete="username" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setId(e.target.value)} /></Field><Field label="Kata Sandi"><TextInput icon={<Lock size={14} />} type="password" value={pw} placeholder="Masukkan kata sandi" autoComplete="current-password" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPw(e.target.value)} /></Field>{err && <div className="inline-error"><AlertTriangle size={14} /> {err}</div>}<Btn variant="primary" size="lg" loading={loading} type="submit" style={{ width: '100%' }}>Masuk <ArrowRight size={14} /></Btn><div className="hline" style={{ margin: '20px 0 16px' }} /><div className="row mono" style={{ fontSize: 11.5, color: 'var(--fg-dim)', gap: 6, justifyContent: 'center' }}><Shield size={12} /> Selamat Datang Di e-Hadir MAN 1 ROKAN HULU</div></form></div></div>;
}

function Sidebar({ user, path, onLogout, isOpen, onClose }: { user: User; path: string; onLogout: () => void; isOpen?: boolean; onClose?: () => void }) {
  const role = navKeyForRole(user?.role);
  const grouped = useMemo(() => NAV_ITEMS_BY_ROLE[role].reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item[0]] ||= []).push(item);
    return acc;
  }, {}), [role]);
  const handleNav = useCallback((url: string) => { go(url); onClose?.(); }, [onClose]);
  return (
    <aside className={`side${isOpen ? ' side-open' : ''}`} aria-label="Navigasi utama">
      <div className="brand">
        <div className="brand-mark">
          <img className="brand-logo" src="/logoman1.jpeg" alt="Logo MAN 1 Rokan Hulu" />
        </div>
        <div className="brand-text">
          <div className="brand-name">e-Hadir</div>
          <div className="brand-sub">MAN 1 ROHUL</div>
        </div>
        <button className="btn icon ghost hamburger" aria-label="Tutup navigasi" onClick={onClose}><X size={16} /></button>
      </div>
      <nav className="nav-body" aria-label="Menu navigasi">
        {Object.entries(grouped).map(([section, items]) => (
          <div key={section} className="nav-block">
            <div className="nav-section" aria-hidden="true">{section}</div>
            {items.map(([, url, label, Ico]) => (
              <button
                key={url}
                className={`nav-item${path === url ? ' active' : ''}`}
                onClick={() => handleNav(url)}
                aria-current={path === url ? 'page' : undefined}
              >
                <Ico size={16} aria-hidden="true" /><span>{label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="side-foot">
        <div className="side-user">
          <Avatar name={user?.fullName} />
          <div className="side-user-info">
            <div className="side-user-name">{user?.fullName}</div>
            <div className="side-user-role">{roleLabel(user?.role)}</div>
          </div>
          <IconBtn label="Keluar dari akun" onClick={onLogout}><LogOut size={15} /></IconBtn>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ crumbs, mode, onToggleTheme, user, onOpenTutorial, onToggleSidebar, connection }: { crumbs: string[]; mode: ThemeMode; onToggleTheme: (theme: ThemeMode) => void; user: User; onOpenTutorial: () => void; onToggleSidebar: () => void; connection: ConnectionStatus }) {
  const [query, setQuery] = useState('');
  const role = navKeyForRole(user?.role);
  const menuItems = useMemo(
    () => NAV_ITEMS_BY_ROLE[role].map(([section, url, label]) => ({ section, url, label })),
    [role]
  );
  const normalized = query.trim().toLowerCase();
  const results = useMemo(
    () => normalized ? menuItems.filter((item) => `${item.label} ${item.section}`.toLowerCase().includes(normalized)).slice(0, 6) : [],
    [normalized, menuItems]
  );
  const openFirstResult = useCallback(() => {
    const first = results[0];
    if (!first) return;
    setQuery('');
    go(first.url);
  }, [results]);
  const roleStatus = connection === 'online' ? 'Sedang Aktif' : connection === 'checking' ? 'Memeriksa Koneksi' : 'Tidak Terhubung';
  return <div className="topbar"><button className="btn icon ghost hamburger" aria-label="Buka menu navigasi" onClick={onToggleSidebar}><Menu size={20} /></button><div className="crumb">{crumbs.map((c, i) => <span key={c} className="row" style={{ gap: 8 }}><span className={i === crumbs.length - 1 ? 'now' : ''}>{c}</span>{i < crumbs.length - 1 && <ChevronRight size={12} />}</span>)}</div><div className="top-spacer" /><div className="searchbox searchbox-active"><Search size={14} /><input aria-label="Cari menu" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') openFirstResult(); if (e.key === 'Escape') setQuery(''); }} placeholder="Cari menu…" />{query && <div className="search-results" role="listbox" aria-label="Hasil pencarian menu">{results.length ? results.map((item) => <button key={item.url} type="button" onMouseDown={(e) => { e.preventDefault(); setQuery(''); go(item.url); }}><span>{item.label}</span><small>{item.section}</small></button>) : <div className="search-empty">Belum ditemukan.</div>}</div>}</div><LiveClock /><div className={`system-ribbon top-status ${connection}`} aria-live="polite"><span className="connection-lamp" aria-hidden="true" /><Shield size={13} /><span>{roleLabel(user?.role)} {roleStatus}</span></div><IconBtn label="Lihat tutorial" onClick={onOpenTutorial}><BookOpen size={16} /></IconBtn><IconBtn label="Notifikasi" onClick={() => { const area = normalizeRole(user?.role, 'admin'); go(area === 'guru' ? '/guru/notifikasi' : area === 'siswa' ? '/siswa/notifikasi' : '/admin/notifications'); }}><Bell size={16} /></IconBtn><ThemeToggle mode={mode} onToggle={onToggleTheme} /></div>;
}

function AppLayout({ user, path, mode, onToggleTheme, onLogout, children }: { user: User; path: string; mode: ThemeMode; onToggleTheme: (theme: ThemeMode) => void; onLogout: () => void; children: ReactNode }) {
  const crumbs = ROUTE_TITLE[path] || ['e-Hadir'];
  const [connection, setConnection] = useState<ConnectionStatus>(() => navigator.onLine ? 'checking' : 'offline');
  const [tutorialOpenKey, setTutorialOpenKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => { setSidebarOpen(false); }, [path]);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;

    const checkConnection = async () => {
      if (!navigator.onLine) {
        setConnection('offline');
        return;
      }

      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(`${API_BASE}/health/live`, {
          headers: { accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal
        });
        if (!cancelled) setConnection(response.ok ? 'online' : 'offline');
      } catch {
        if (!cancelled) setConnection('offline');
      }
    };

    const handleOnline = () => {
      setConnection('checking');
      void checkConnection();
    };
    const handleOffline = () => setConnection('offline');

    void checkConnection();
    const timer = window.setInterval(checkConnection, 20000);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return <div className="app"><a href="#main-content" className="skip-link">Lompat ke konten</a><div className={`side-backdrop${sidebarOpen ? ' side-open' : ''}`} onClick={() => setSidebarOpen(false)} aria-hidden="true" /><Sidebar user={user} path={path} onLogout={onLogout} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} /><main className="main" id="main-content"><TopBar crumbs={crumbs} mode={mode} onToggleTheme={onToggleTheme} user={user} connection={connection} onOpenTutorial={() => setTutorialOpenKey((value) => value + 1)} onToggleSidebar={() => setSidebarOpen((v) => !v)} />{children}</main><OnboardingTour user={user} manualOpenKey={tutorialOpenKey} /></div>;
}

function Unauthorized({ user }: { user: User | null }) {
  return <div className="content"><PageHead eyebrow="AKSES DITOLAK" title="Menu ini bukan untuk peran Anda" sub="Sistem menjaga agar guru, siswa, admin, operator, dan developer hanya membuka menu sesuai tugasnya." actions={<Btn onClick={() => go(defaultPathFor(user))}><Home size={14} /> Kembali ke dasbor</Btn>} /><Card><EmptyState title="Akses ditolak" sub="Jika Anda butuh akses, hubungi operator IT sekolah atau developer sistem." /></Card></div>;
}

function NotFound({ user }: { user: User | null }) {
  const role = navKeyForRole(user?.role);
  return <div className="content"><PageHead eyebrow="HALAMAN TIDAK DITEMUKAN" title="Menu ini belum tersedia" sub="Alamat yang dibuka tidak terdaftar di e-Hadir. Pilih menu yang tersedia untuk peran Anda." actions={<Btn onClick={() => go(defaultPathFor(user))}><Home size={14} /> Kembali ke dasbor</Btn>} /><Card title="Menu yang bisa Anda buka" sub="Gunakan daftar ini bila bingung mencari halaman."><div className="quick-route-list">{NAV_ITEMS_BY_ROLE[role].map(([, url, label, Ico]) => <button key={url} type="button" onClick={() => go(url)}><Ico size={15} /><span>{label}</span><ChevronRight size={13} /></button>)}</div></Card></div>;
}

function App() {
  const [path, setPath] = useState(window.location.pathname === '/' ? '' : window.location.pathname);
  const [user, setUser] = useState<User | null>(readStoredUser());
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [mode, setMode] = useState<ThemeMode>((localStorage.getItem(THEME_KEY) as ThemeMode | null) || 'dark');
  const notify: Notify = (message, type = 'ok') => { setToast({ message, type }); setTimeout(() => setToast(null), 3600); };
  useEffect(() => { const onPop = () => setPath(window.location.pathname === '/' ? '' : window.location.pathname); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  useEffect(() => { document.documentElement.setAttribute('data-theme', mode); localStorage.setItem(THEME_KEY, mode); }, [mode]);
  useEffect(() => { setRiskConfirmHandler(({ title, message }) => new Promise((resolve) => setConfirmDialog({ title, message, resolve }))); return () => setRiskConfirmHandler(null); }, []);
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setToast({ message: 'Sesi masuk habis. Silakan masuk ulang.', type: 'warn' });
      go('/login');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);
  useEffect(() => { if (!readStoredUser() && path !== '/login') go('/login'); }, [path]);
  async function handleLogin(_selectedRole: LoginRole, username: string, password: string) {
    const response = await apiFetch<{ accessToken?: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    localStorage.removeItem(TOKEN_KEY);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    setUser(response.user);
    go(defaultPathFor(response.user));
  }
  async function logout() {
    try { await apiFetch('/auth/logout', { method: 'POST', body: JSON.stringify({}) }); } catch { /* tetap keluar lokal jika server tidak bisa dihubungi */ }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    go('/login');
  }
  if (!path || path === '/') { setTimeout(() => go(user ? defaultPathFor(user) : '/login'), 0); return null; }
  const confirmLayer = <ConfirmDialog dialog={confirmDialog} onCancel={() => { confirmDialog?.resolve(false); setConfirmDialog(null); }} onConfirm={() => { confirmDialog?.resolve(true); setConfirmDialog(null); }} />;
  if (path === '/login') return <><LoginScreen onLogin={handleLogin} mode={mode} onToggleTheme={(theme: ThemeMode) => setMode(theme)} /><ToastHost toast={toast} onClose={() => setToast(null)} />{confirmLayer}</>;
  if (!user) return <LoginScreen onLogin={handleLogin} mode={mode} onToggleTheme={(theme: ThemeMode) => setMode(theme)} />;
  const exists = routeExists(path);
  const allowed = exists && canAccessRoute(path, user);
  const screen = (() => {
    if (!exists) return <NotFound user={user} />;
    if (!allowed) return <Unauthorized user={user} />;
    if (path === '/admin/dashboard') return <AdminDashboard />;
    if (path === '/admin/it-dashboard') return <ItDashboardPage />;
    if (path === '/admin/picket-dashboard') return <PicketDashboardPage />;
    if (path === '/admin/sessions') return <SessionsPage admin />;
    if (path === '/admin/history') return <HistoryPage />;
    if (path === '/admin/anomaly') return <AnomalyPage notify={notify} />;
    if (path === '/admin/picket') return <PicketBookPage notify={notify} />;
    if (path === '/admin/master-data') return <MasterDataPage notify={notify} />;
    if (path === '/admin/schedule') return <SchedulePage notify={notify} />;
    if (path === '/admin/devices') return <DevicesPage notify={notify} />;
    if (path === '/admin/reports') return <ReportsPage notify={notify} />;
    if (path === '/admin/live-monitor') return <LiveMonitorPage />;
    if (path === '/admin/settings') return <SettingsPage notify={notify} />;
    if (path === '/admin/audit') return <AuditPage />;
    if (path === '/admin/teacher-leaves') return <TeacherLeavesPage notify={notify} />;
    if (path === '/admin/notifications') return <NotificationsPage />;
    if (path === '/admin/developer-control') return <DeveloperControlPage notify={notify} />;
    if (path === '/admin/help') return <HelpPage role={String(user.role)} />;
    if (path === '/guru/dashboard') return <TeacherDashboard />;
    if (path === '/guru/presensi') return <ClassInputPage notify={notify} />;
    if (path === '/guru/koreksi') return <CorrectionPage notify={notify} />;
    if (path === '/guru/rekap') return <TeacherRecapPage />;
    if (path === '/guru/izin') return <TeacherLeavePage notify={notify} />;
    if (path === '/guru/kehadiran-saya') return <MyAttendancePage />;
    if (path === '/guru/notifikasi') return <NotificationsPage />;
    if (path === '/guru/panduan') return <HelpPage role={String(user.role)} />;
    if (path === '/siswa/dashboard') return <MyAttendancePage student title="Kehadiran Saya" />;
    if (path === '/siswa/notifikasi') return <NotificationsPage />;
    if (path === '/siswa/panduan') return <HelpPage role={String(user.role)} />;
    return <Unauthorized user={user} />;
  })();
  return <><AppLayout user={user} path={path} mode={mode} onToggleTheme={(theme: ThemeMode) => setMode(theme)} onLogout={logout}>{screen}</AppLayout><ToastHost toast={toast} onClose={() => setToast(null)} />{confirmLayer}</>;
}

export { App };
