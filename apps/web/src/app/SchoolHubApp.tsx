import { Component, lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
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
  Eye,
  EyeOff,
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
  RefreshCw,
  Search,
  Settings,
  Shield,
  User as UserIcon,
  Users,
  X,
  Zap
} from 'lucide-react';
import { API_BASE, AUTH_EXPIRED_EVENT, apiFetch, defaultPathFor, go, normalizeRole, readStoredUser, USER_KEY } from './api';
import { ConfirmDialog, riskConfirm, setRiskConfirmHandler } from './confirm';
import { Avatar, Btn, Card, EmptyState, Field, IconBtn, PageHead, TextInput, ToastHost } from './ui';
import type { ConfirmDialogState, Role, ToastMessage, User } from './types';
import { WorkOSLoginHandler, WorkOSSSOButton } from './workos-auth';
import { BRAND } from './branding';
import { hasCapability, type Capability } from './capabilities';

const SSO_ENABLED = import.meta.env.VITE_SSO_ENABLED === 'true' && Boolean(import.meta.env.VITE_WORKOS_CLIENT_ID);


type Notify = (message: string, type?: string) => void;
type LoginRole = 'guru' | 'admin' | 'siswa';
type NavIcon = typeof Home;
type NavItem = readonly [section: string, url: AppRoutePath, label: string, icon: NavIcon];
type NavKey = 'admin' | 'operator' | 'picket' | 'guru' | 'siswa' | 'developer';
type ConnectionStatus = 'checking' | 'online' | 'offline';
export const NOTIFICATION_REFRESH_EVENT = 'schoolhub_notifications_refresh';

function lazyPage(loader: () => Promise<any>, exportName: string) {
  return lazy(async () => {
    const mod = await loader();
    const Component = mod[exportName] as ComponentType<any> | undefined;
    if (!Component) throw new Error(`Lazy export tidak ditemukan: ${exportName}`);
    return { default: Component };
  });
}

const loadAdminPages = () => import('./pages/admin/AdminPages.jsx');
const loadGuruPages = () => import('./pages/guru/GuruPages.jsx');
const loadSiswaPages = () => import('./pages/siswa/MyAttendancePage.jsx');

const AdminDashboard = lazyPage(loadAdminPages, 'AdminDashboard');
const AnomalyPage = lazyPage(loadAdminPages, 'AnomalyPage');
const AuditPage = lazyPage(loadAdminPages, 'AuditPage');
const DeveloperControlPage = lazyPage(loadAdminPages, 'DeveloperControlPage');
const DevicesPage = lazyPage(loadAdminPages, 'DevicesPage');
const HelpPage = lazyPage(loadAdminPages, 'HelpPage');
const HistoryPage = lazyPage(loadAdminPages, 'HistoryPage');
const ItDashboardPage = lazyPage(loadAdminPages, 'ItDashboardPage');
const LiveMonitorPage = lazyPage(loadAdminPages, 'LiveMonitorPage');
const MasterDataPage = lazyPage(loadAdminPages, 'MasterDataPage');
const NotificationsPage = lazyPage(loadAdminPages, 'NotificationsPage');
const PicketBookPage = lazyPage(loadAdminPages, 'PicketBookPage');
const PicketDashboardPage = lazyPage(loadAdminPages, 'PicketDashboardPage');
const PrayerAttendancePage = lazyPage(loadAdminPages, 'PrayerAttendancePage');
const ReportsPage = lazyPage(loadAdminPages, 'ReportsPage');
const SchedulePage = lazyPage(loadAdminPages, 'SchedulePage');
const SessionsPage = lazyPage(loadAdminPages, 'SessionsPage');
const SettingsPage = lazyPage(loadAdminPages, 'SettingsPage');
const StaffAttendancePage = lazyPage(loadAdminPages, 'StaffAttendancePage');
const StudentDailyCompletenessPage = lazyPage(loadAdminPages, 'StudentDailyCompletenessPage');
const TeacherLeavesPage = lazyPage(loadAdminPages, 'TeacherLeavesPage');
const ClassInputPage = lazyPage(loadGuruPages, 'ClassInputPage');
const CorrectionPage = lazyPage(loadGuruPages, 'CorrectionPage');
const TeacherDashboard = lazyPage(loadGuruPages, 'TeacherDashboard');
const TeacherLeavePage = lazyPage(loadGuruPages, 'TeacherLeavePage');
const TeacherRecapPage = lazyPage(loadGuruPages, 'TeacherRecapPage');
const MyAttendancePage = lazyPage(loadSiswaPages, 'MyAttendancePage');
const OnboardingTour = lazyPage(() => import('./tutorial'), 'OnboardingTour');

/** Isolated clock — updates every second but re-renders only itself */
const LiveClock = memo(function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="chip" aria-live="off" aria-label={now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' })}>
      <Clock size={12} />
      <span className="hide-sm">{now.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })} · </span>
      <b>{now.toLocaleTimeString('id-ID', { hour12: false, timeZone: 'Asia/Jakarta' })}</b>
    </span>
  );
});

const ROLE_PRESETS: Record<LoginRole, { id: string; idLabel: string }> = {
  guru: { id: '', idLabel: 'Nama akun Guru' },
  admin: { id: '', idLabel: 'Nama akun Admin/TU, Operator, atau Developer' },
  siswa: { id: '', idLabel: 'Nama akun Siswa' }
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN_TU: 'Admin/TU',
  OPERATOR_IT: 'Operator IT',
  GURU_MAPEL: 'Guru Mapel',
  GURU_PIKET: 'Guru Piket',
  SISWA: 'Siswa',
  DEVELOPER: 'Developer'
};

type RouteRenderContext = { user: User; notify: Notify };

type AppRouteDefinition = {
  path: string;
  area: string;
  title: string;
  roles: readonly Role[];
  capabilities: readonly Capability[];
  render: (context: RouteRenderContext) => ReactNode;
};

export const ROUTES = [
  { path: '/admin/dashboard', area: 'Admin/TU', title: 'Mulai Hari Ini', roles: ['ADMIN_TU', 'DEVELOPER'], capabilities: ['reports.operational.read'], render: () => <AdminDashboard /> },
  { path: '/admin/it-dashboard', area: 'Operator IT', title: 'Cek Sistem', roles: ['OPERATOR_IT', 'DEVELOPER'], capabilities: ['devices.read'], render: () => <ItDashboardPage /> },
  { path: '/admin/picket-dashboard', area: 'Guru Piket', title: 'Tugas Piket Hari Ini', roles: ['GURU_PIKET', 'DEVELOPER'], capabilities: ['reconciliation.read'], render: () => <PicketDashboardPage /> },
  { path: '/admin/sessions', area: 'Admin/TU', title: 'Sesi Hari Ini', roles: ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'], capabilities: ['classAttendance.read'], render: () => <SessionsPage admin /> },
  { path: '/admin/history', area: 'Admin/TU', title: 'Riwayat Scan', roles: ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'], capabilities: ['gateAttendance.read'], render: () => <HistoryPage /> },
  { path: '/admin/staff-attendance', area: 'Admin/TU', title: 'Kepala/Staf Hadir', roles: ['ADMIN_TU', 'DEVELOPER'], capabilities: ['reports.school.read'], render: ({ notify }) => <StaffAttendancePage notify={notify} /> },
  { path: '/admin/student-completeness', area: 'Admin/TU', title: 'Kehadiran Lengkap Siswa', roles: ['ADMIN_TU', 'DEVELOPER'], capabilities: ['reports.school.read'], render: ({ notify }) => <StudentDailyCompletenessPage notify={notify} /> },
  { path: '/admin/prayer-attendance', area: 'Admin/TU', title: 'Sholat Siswa', roles: ['ADMIN_TU', 'DEVELOPER'], capabilities: ['reports.school.read'], render: ({ notify }) => <PrayerAttendancePage notify={notify} /> },
  { path: '/admin/anomaly', area: 'Admin/TU', title: 'Masalah yang Perlu Dicek', roles: ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'], capabilities: ['reconciliation.read'], render: ({ notify }) => <AnomalyPage notify={notify} /> },
  { path: '/admin/picket', area: 'Admin/TU', title: 'Catatan Piket', roles: ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'], capabilities: ['reconciliation.read'], render: ({ notify }) => <PicketBookPage notify={notify} /> },
  { path: '/admin/master-data', area: 'Admin/TU', title: 'Akun & Data Sekolah', roles: ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'], capabilities: ['users.read', 'academic.read'], render: ({ notify }) => <MasterDataPage notify={notify} /> },
  { path: '/admin/schedule', area: 'Admin/TU', title: 'Jadwal Kelas', roles: ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'], capabilities: ['schedules.read'], render: ({ notify }) => <SchedulePage notify={notify} /> },
  { path: '/admin/devices', area: 'Admin/TU', title: 'HP Scanner & Kartu', roles: ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'], capabilities: ['devices.read'], render: ({ notify }) => <DevicesPage notify={notify} /> },
  { path: '/admin/reports', area: 'Admin/TU', title: 'Laporan Sekolah', roles: ['ADMIN_TU', 'DEVELOPER'], capabilities: ['reports.school.read'], render: ({ notify }) => <ReportsPage notify={notify} /> },
  { path: '/admin/live-monitor', area: 'Admin/TU', title: 'Aktivitas Sekarang', roles: ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'], capabilities: ['reports.operational.read'], render: () => <LiveMonitorPage /> },
  { path: '/admin/settings', area: 'Admin/TU', title: 'Aturan Absensi', roles: ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'], capabilities: ['settings.read'], render: ({ notify }) => <SettingsPage notify={notify} /> },
  { path: '/admin/audit', area: 'Admin/TU', title: 'Riwayat Perubahan', roles: ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'], capabilities: ['audit.read'], render: () => <AuditPage /> },
  { path: '/admin/teacher-leaves', area: 'Admin/TU', title: 'Pengajuan Guru', roles: ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'], capabilities: ['schedules.read'], render: ({ notify }) => <TeacherLeavesPage notify={notify} /> },
  { path: '/admin/notifications', area: 'Sistem', title: 'Tugas / Notifikasi', roles: ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'], capabilities: ['profile.self.read'], render: () => <NotificationsPage /> },
  { path: '/admin/developer-control', area: 'Developer', title: 'Pusat Kontrol', roles: ['DEVELOPER'], capabilities: ['settings.manage'], render: ({ notify }) => <DeveloperControlPage notify={notify} /> },
  { path: '/admin/help', area: 'Bantuan', title: 'Panduan', roles: ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'], capabilities: ['profile.self.read'], render: ({ user }) => <HelpPage role={String(user.role)} /> },
  { path: '/guru/dashboard', area: 'Guru', title: 'Mulai Mengajar', roles: ['GURU_MAPEL'], capabilities: ['classAttendance.read'], render: () => <TeacherDashboard /> },
  { path: '/guru/presensi', area: 'Guru', title: 'Isi Presensi Kelas', roles: ['GURU_MAPEL'], capabilities: ['classAttendance.record'], render: ({ notify }) => <ClassInputPage notify={notify} /> },
  { path: '/guru/koreksi', area: 'Guru', title: 'Perbaiki Presensi', roles: ['GURU_MAPEL'], capabilities: ['classAttendance.correct'], render: ({ notify }) => <CorrectionPage notify={notify} /> },
  { path: '/guru/rekap', area: 'Guru', title: 'Laporan Kelas Saya', roles: ['GURU_MAPEL'], capabilities: ['reports.self.read'], render: () => <TeacherRecapPage /> },
  { path: '/guru/izin', area: 'Guru', title: 'Izin / Sakit / Dinas', roles: ['GURU_MAPEL'], capabilities: ['profile.self.update'], render: ({ notify }) => <TeacherLeavePage notify={notify} /> },
  { path: '/guru/kehadiran-saya', area: 'Guru', title: 'Kehadiran Saya', roles: ['GURU_MAPEL'], capabilities: ['reports.self.read'], render: () => <MyAttendancePage /> },
  { path: '/guru/notifikasi', area: 'Guru', title: 'Tugas / Notifikasi', roles: ['GURU_MAPEL'], capabilities: ['profile.self.read'], render: () => <NotificationsPage /> },
  { path: '/guru/panduan', area: 'Guru', title: 'Panduan', roles: ['GURU_MAPEL'], capabilities: ['profile.self.read'], render: ({ user }) => <HelpPage role={String(user.role)} /> },
  { path: '/siswa/dashboard', area: 'Siswa', title: 'Kehadiran Saya', roles: ['SISWA'], capabilities: ['reports.self.read'], render: () => <MyAttendancePage student title="Kehadiran Saya" /> },
  { path: '/siswa/notifikasi', area: 'Siswa', title: 'Tugas / Notifikasi', roles: ['SISWA'], capabilities: ['profile.self.read'], render: () => <NotificationsPage /> },
  { path: '/siswa/panduan', area: 'Siswa', title: 'Panduan', roles: ['SISWA'], capabilities: ['profile.self.read'], render: ({ user }) => <HelpPage role={String(user.role)} /> }
] as const satisfies readonly AppRouteDefinition[];

export type AppRoutePath = typeof ROUTES[number]['path'];

const ROUTE_BY_PATH = Object.fromEntries(ROUTES.map((route) => [route.path, route])) as unknown as Record<AppRoutePath, AppRouteDefinition>;

function routeForPath(path: string): AppRouteDefinition | undefined {
  return ROUTE_BY_PATH[path as AppRoutePath];
}

function navItem(section: string, path: AppRoutePath, icon: NavIcon, label = ROUTE_BY_PATH[path].title): NavItem {
  return [section, path, label, icon];
}

const NAV_ITEMS_BY_ROLE: Record<NavKey, NavItem[]> = {
  admin: [
    navItem('MULAI HARI INI', '/admin/dashboard', LayoutDashboard, 'Ringkasan Hari Ini'), navItem('MULAI HARI INI', '/admin/sessions', Radar, 'Cek Sesi Kelas'), navItem('MULAI HARI INI', '/admin/anomaly', Flag, 'Cek Masalah'), navItem('MULAI HARI INI', '/admin/live-monitor', Activity, 'Aktivitas Sekarang'),
    navItem('KERJA HARIAN', '/admin/staff-attendance', Users, 'Kepala/Staf Hadir'), navItem('KERJA HARIAN', '/admin/student-completeness', CheckSquare, 'Kehadiran Lengkap Siswa'), navItem('KERJA HARIAN', '/admin/prayer-attendance', CheckSquare, 'Sholat Siswa'), navItem('KERJA HARIAN', '/admin/history', BookOpen, 'Riwayat Scan'), navItem('KERJA HARIAN', '/admin/picket', ListChecks, 'Catatan Piket'), navItem('KERJA HARIAN', '/admin/teacher-leaves', CheckSquare, 'Izin Guru'), navItem('DATA SEKOLAH', '/admin/master-data', Users, 'Akun & Data Sekolah'), navItem('DATA SEKOLAH', '/admin/schedule', Calendar, 'Jadwal Kelas'),
    navItem('PERANGKAT', '/admin/devices', CreditCard, 'HP Scanner & Kartu'), navItem('LAPORAN', '/admin/reports', FileText, 'Laporan Sekolah'), navItem('BANTUAN & SISTEM', '/admin/notifications', Bell, 'Tugas / Notifikasi'), navItem('BANTUAN & SISTEM', '/admin/help', BookOpen, 'Panduan'), navItem('BANTUAN & SISTEM', '/admin/settings', Settings, 'Aturan Absensi'), navItem('BANTUAN & SISTEM', '/admin/audit', Database, 'Riwayat Perubahan')
  ],
  operator: [
    navItem('MULAI HARI INI', '/admin/it-dashboard', LayoutDashboard, 'Cek Sistem'), navItem('PERANGKAT', '/admin/devices', CreditCard, 'HP Scanner & Kartu'), navItem('PERANGKAT', '/admin/live-monitor', Activity, 'Aktivitas Sekarang'), navItem('CEK KEAMANAN', '/admin/audit', Database, 'Riwayat Perubahan'), navItem('BANTUAN', '/admin/notifications', Bell, 'Tugas / Notifikasi'), navItem('BANTUAN', '/admin/help', BookOpen, 'Panduan Operator')
  ],
  developer: [
    navItem('KONTROL', '/admin/developer-control', Shield, 'Pusat Kontrol'), navItem('KONTROL', '/admin/dashboard', LayoutDashboard, 'Ringkasan Admin'), navItem('KONTROL', '/admin/it-dashboard', Radar, 'Cek Sistem'), navItem('KONTROL', '/admin/live-monitor', Activity, 'Aktivitas Sekarang'),
    navItem('DATA & SISTEM', '/admin/master-data', Users, 'Akun & Data Sekolah'), navItem('DATA & SISTEM', '/admin/staff-attendance', Users, 'Kepala/Staf Hadir'), navItem('DATA & SISTEM', '/admin/student-completeness', CheckSquare, 'Kehadiran Lengkap Siswa'), navItem('DATA & SISTEM', '/admin/prayer-attendance', CheckSquare, 'Sholat Siswa'), navItem('DATA & SISTEM', '/admin/devices', CreditCard, 'HP Scanner & Kartu'), navItem('DATA & SISTEM', '/admin/settings', Settings, 'Aturan Absensi'), navItem('DATA & SISTEM', '/admin/audit', Database, 'Riwayat Perubahan'),
    navItem('BANTUAN', '/admin/help', BookOpen, 'Panduan Developer')
  ],
  picket: [
    navItem('MULAI HARI INI', '/admin/picket-dashboard', LayoutDashboard, 'Tugas Piket Hari Ini'), navItem('KERJA PIKET', '/admin/picket', ListChecks, 'Catatan Piket'), navItem('KERJA PIKET', '/admin/sessions', Radar, 'Cek Sesi Kelas'), navItem('KERJA PIKET', '/admin/anomaly', Flag, 'Cek Masalah'), navItem('KERJA PIKET', '/admin/history', BookOpen, 'Riwayat Scan'), navItem('KERJA PIKET', '/admin/live-monitor', Activity, 'Aktivitas Sekarang'), navItem('BANTUAN', '/admin/notifications', Bell, 'Tugas / Notifikasi'), navItem('BANTUAN', '/admin/help', BookOpen, 'Panduan Piket')
  ],
  guru: [navItem('MULAI MENGAJAR', '/guru/dashboard', Home, 'Ringkasan Mengajar'), navItem('MULAI MENGAJAR', '/guru/presensi', CheckSquare, 'Isi Presensi Kelas'), navItem('MULAI MENGAJAR', '/guru/koreksi', Edit3, 'Perbaiki Presensi'), navItem('LAPORAN', '/guru/rekap', FileText, 'Laporan Kelas Saya'), navItem('PRIBADI', '/guru/izin', Calendar, 'Izin / Sakit / Dinas'), navItem('PRIBADI', '/guru/kehadiran-saya', UserIcon, 'Kehadiran Saya'), navItem('BANTUAN', '/guru/notifikasi', Bell, 'Tugas / Notifikasi'), navItem('BANTUAN', '/guru/panduan', BookOpen, 'Panduan')],
  siswa: [navItem('UTAMA', '/siswa/dashboard', Home, 'Kehadiran Saya'), navItem('BANTUAN', '/siswa/notifikasi', Bell, 'Tugas / Notifikasi'), navItem('BANTUAN', '/siswa/panduan', BookOpen, 'Panduan')]
};

function navKeyForRole(role?: string): NavKey {
  if (role === 'DEVELOPER') return 'developer';
  if (role === 'OPERATOR_IT') return 'operator';
  if (role === 'GURU_PIKET') return 'picket';
  if (role === 'GURU_MAPEL') return 'guru';
  if (role === 'SISWA') return 'siswa';
  return 'admin';
}

export function canAccessRoute(path: string, user: User | null) {
  const route = routeForPath(path);
  return Boolean(user?.role && route?.roles.includes(user.role as Role) && route.capabilities.every((capability) => hasCapability(String(user.role), capability)));
}

export function navItemsForUser(user: User | null): NavItem[] {
  const role = navKeyForRole(user?.role);
  return NAV_ITEMS_BY_ROLE[role].filter(([, url]) => canAccessRoute(url, user));
}

export function routeCrumbs(path: string): [string, string] | [typeof BRAND.compactName] {
  const route = routeForPath(path);
  return route ? [route.area, route.title] : [BRAND.compactName];
}

function roleLabel(role?: string): string {
  return role && role in ROLE_LABEL ? ROLE_LABEL[role as Role] : role || '—';
}

function loginAreaForRole(role?: string): LoginRole | null {
  if (role === 'GURU_MAPEL') return 'guru';
  if (role === 'SISWA') return 'siswa';
  if (role === 'ADMIN_TU' || role === 'OPERATOR_IT' || role === 'GURU_PIKET' || role === 'DEVELOPER') return 'admin';
  return null;
}

function loginAreaLabel(role: LoginRole): string {
  if (role === 'guru') return 'Guru';
  if (role === 'siswa') return 'Siswa';
  return 'Admin/TU';
}

function PageLoading() {
  return <div className="content"><Card><div className="state">Memuat halaman…</div></Card></div>;
}

type AppErrorBoundaryState = { error: Error | null };

class AppErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('SIAB2 UI error boundary', error, info);
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const message = this.state.error.message || 'Terjadi kesalahan saat membuka halaman.';
    const likelyChunkError = /chunk|dynamically imported module|importing a module script|failed to fetch/i.test(message);
    const title = likelyChunkError ? 'Aplikasi baru diperbarui' : 'Halaman tidak bisa ditampilkan';
    const sub = likelyChunkError
      ? 'File aplikasi berubah saat halaman masih terbuka. Muat ulang halaman agar browser mengambil versi terbaru.'
      : 'Sistem menangkap error agar layar tidak kosong. Coba muat ulang atau kembali ke dasbor.';

    return (
      <div className="content">
        <Card>
          <div className="state bad" role="alert" style={{ alignItems: 'flex-start', textAlign: 'left' }}>
            <AlertTriangle size={20} />
            <div style={{ display: 'grid', gap: 8 }}>
              <b>{title}</b>
              <span>{sub}</span>
              <span className="mono faint" style={{ fontSize: 11 }}>{message}</span>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Btn onClick={() => window.location.reload()}><RefreshCw size={14} /> Muat ulang</Btn>
                <Btn variant="ghost" onClick={() => go('/')}>Kembali ke dasbor</Btn>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }
}

function LoginScreen({ onLogin, showSso = false }: { onLogin: (selectedRole: LoginRole, username: string, password: string) => Promise<void>; showSso?: boolean }) {
  const [role, setRoleState] = useState<LoginRole>('guru');
  const [id, setId] = useState(ROLE_PRESETS.guru.id);
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
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
  return (
    <div className="login login-v2">
      <div className="login-left">
        <div className="login-left-overlay" />
        <div className="login-left-content" tabIndex={0} aria-label={`Informasi ${BRAND.description}`}>
          <div className="login-topbar">
            <div className="row" style={{ gap: 12 }}>
              <div className="brand-mark login-brand-mark">
                <img className="brand-logo" src="/logoman1.jpeg" alt="Logo MAN 1 Rokan Hulu" />
              </div>
              <div>
                <div className="login-brand-name login-brand-name-long">{BRAND.shortName}</div>
                <div className="login-brand-sub">{BRAND.fullName} · {BRAND.institution}</div>
              </div>
            </div>
          </div>
          <div className="login-hero">
            <div className="eyebrow"><span className="dot" /> SIAB2</div>
            <h1>Satu sistem akademik.<br />Presensi lebih tertib.<br /><span className="grad">Karakter lebih terjaga.</span></h1>
            <p>{BRAND.description} membantu sekolah mengelola kehadiran siswa dari gerbang dan kelas. Jika ada siswa belum tempel kartu, tidak masuk kelas, atau data tidak sesuai, petugas akan lebih mudah mengetahuinya.</p>
            <div className="row" style={{ gap: 8, marginTop: 22, flexWrap: 'wrap' }}>
              <span className="chip chip-light"><Shield size={12} /> Semua perubahan tercatat</span>
              <span className="chip chip-light"><MapPin size={12} /> Hanya di area sekolah</span>
              <span className="chip chip-light"><Zap size={12} /> Cepat dan ringan</span>
            </div>
          </div>
          <div className="login-divider" />
          <div className="login-specs">
            <div className="login-spec">
              <span className="k">DI GERBANG</span>
              <span className="v">Tempel kartu siswa</span>
            </div>
            <div className="login-spec">
              <span className="k">DI KELAS</span>
              <span className="v">Dicek oleh guru</span>
            </div>
            <div className="login-spec">
              <span className="k">PENGECEKAN DATA</span>
              <span className="v">Dibantu otomatis</span>
            </div>
          </div>
        </div>
      </div>
      <div className="login-right">
        <form className="login-card" onSubmit={submit}>
          <div className="login-role-label">MASUK SEBAGAI</div>
          <div className="row login-role-tabs" style={{ gap: 6, margin: '10px 0 22px' }} role="tablist" aria-label="Pilih jenis akun">
            {(['guru', 'admin', 'siswa'] as LoginRole[]).map((v) => (
              <button type="button" key={v} className={`btn sm login-role-option ${role === v ? 'primary' : 'ghost'}`} onClick={() => setRole(v)} style={{ flex: 1 }} role="tab" aria-selected={role === v}>
                {v === 'guru' ? 'Guru' : v === 'admin' ? 'Admin/TU' : 'Siswa'}
              </button>
            ))}
          </div>
          <Field label={ROLE_PRESETS[role].idLabel}>
            <TextInput icon={<UserIcon size={14} />} value={id} placeholder="Masukkan nama akun" autoComplete="username" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setId(e.target.value)} />
          </Field>
          <Field label="Kata Sandi">
            <div className="login-password-wrap">
              <TextInput icon={<Lock size={14} />} type={showPw ? 'text' : 'password'} value={pw} placeholder="Masukkan kata sandi" autoComplete="current-password" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPw(e.target.value)} />
              <button type="button" className="login-pw-toggle" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}>{showPw ? <EyeOff size={14} /> : <Eye size={14} />}</button>
            </div>
          </Field>
          {err && <div className="inline-error" id="login-error" role="alert"><AlertTriangle size={14} /> {err}</div>}
          <Btn variant="primary" size="lg" loading={loading} type="submit" style={{ width: '100%' }}>Masuk <ArrowRight size={14} /></Btn>
          {showSso && <>
            <div className="hline" style={{ margin: '20px 0 16px' }} />
            <div style={{ textAlign: 'center', color: 'var(--fg-faint)', fontSize: '12px', marginBottom: '12px' }}>atau masuk dengan</div>
            <WorkOSSSOButton returnTo={defaultPathFor(null)} />
          </>}
          <div className="hline" style={{ margin: '20px 0 16px' }} />
          <div className="login-footer">
            <div className="login-footer-line" />
            <div className="login-footer-text">
              <span className="login-footer-brand">MAN 1 Rokan Hulu</span>
              <span className="login-footer-dot" />
              <span className="login-footer-tag">Madrasah Berbasis Riset</span>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordChangeScreen({ onChanged }: { onChanged: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengganti password.');
    } finally {
      setLoading(false);
    }
  }
  return <div className="login-page"><div className="login-card"><form onSubmit={submit} className="login-form"><PageHead eyebrow="PASSWORD WAJIB DIGANTI" title="Buat password baru" sub={`Akun baru atau akun yang di-reset wajib mengganti password sebelum memakai ${BRAND.compactName}.`} />
    <Field label="Password saat ini"><TextInput type="password" value={currentPassword} autoComplete="current-password" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentPassword(e.target.value)} /></Field>
    <Field label="Password baru"><TextInput type="password" value={newPassword} autoComplete="new-password" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)} /></Field>
    {error && <div className="inline-error" role="alert"><AlertTriangle size={14} /> {error}</div>}
    <Btn variant="primary" size="lg" loading={loading} type="submit" style={{ width: '100%' }}>Simpan password baru</Btn>
  </form></div></div>;
}

function Sidebar({ user, path, onLogout, isOpen, onClose }: { user: User; path: string; onLogout: () => void; isOpen?: boolean; onClose?: () => void }) {
  const itemsForUser = useMemo(() => navItemsForUser(user), [user]);
  const grouped = useMemo(() => itemsForUser.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item[0]] ||= []).push(item);
    return acc;
  }, {}), [itemsForUser]);
  const handleNav = useCallback((url: string) => { go(url); onClose?.(); }, [onClose]);
  return (
    <aside className={`side${isOpen ? ' side-open' : ''}`} aria-label="Navigasi utama">
      <div className="brand">
        <div className="brand-mark">
          <img className="brand-logo" src="/logoman1.jpeg" alt="Logo MAN 1 Rokan Hulu" />
        </div>
        <div className="brand-text">
          <div className="brand-name">{BRAND.shortName}</div>
          <div className="brand-sub">{BRAND.fullName} · {BRAND.institution}</div>
        </div>
        <button className="btn icon ghost hamburger" aria-label="Tutup navigasi" onClick={onClose}><X size={16} /></button>
      </div>
      <nav className="nav-body" aria-label="Menu navigasi" style={{ flex: 1, overflowY: 'auto' }}>
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
                <Ico size={16} aria-hidden="true" strokeWidth={2} /><span>{label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="side-foot">
        <div className="side-user">
          <Avatar name={user?.fullName} size="sm" />
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

function TopBar({ crumbs, user, onOpenTutorial, onToggleSidebar, connection }: { crumbs: string[]; user: User; onOpenTutorial: () => void; onToggleSidebar: () => void; connection: ConnectionStatus }) {
  const [query, setQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuItems = useMemo(
    () => navItemsForUser(user).map(([section, url, label]) => ({ section, url, label })),
    [user]
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
  const refreshUnreadCount = useCallback(async () => {
    if (!user?.id) {
      setUnreadCount(null);
      return;
    }
    try {
      const data = await apiFetch<{ unreadCount?: number }>('/notifications?unreadOnly=true&page=1&limit=1');
      const nextCount = Number(data?.unreadCount ?? 0);
      setUnreadCount(Number.isFinite(nextCount) ? Math.max(0, nextCount) : 0);
    } catch {
      // Fail closed visually: the bell stays usable, but we do not show a fake warning badge.
      setUnreadCount(null);
    }
  }, [user?.id]);
  useEffect(() => { void refreshUnreadCount(); }, [refreshUnreadCount]);
  useEffect(() => {
    const refresh = () => { void refreshUnreadCount(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') void refreshUnreadCount(); };
    window.addEventListener(NOTIFICATION_REFRESH_EVENT, refresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener(NOTIFICATION_REFRESH_EVENT, refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshUnreadCount]);
  // Ctrl+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const roleStatus = connection === 'online' ? 'Sedang Aktif' : connection === 'checking' ? 'Memeriksa Koneksi' : 'Tidak Terhubung';
  const safeUnreadCount = unreadCount ?? 0;
  const notificationLabel = safeUnreadCount > 0 ? `Notifikasi, ${safeUnreadCount} belum dibaca` : 'Notifikasi';
  const notificationBadge = safeUnreadCount > 99 ? '99+' : String(safeUnreadCount);
  return (
    <div className="topbar">
      <button className="btn icon ghost hamburger" style={{ minWidth: 40, minHeight: 40 }} aria-label="Buka menu navigasi" onClick={onToggleSidebar}>
        <Menu size={18} />
      </button>
      <div className="crumb" style={{ flexWrap: 'wrap' }}>
        {crumbs.map((c, i) => (
          <span key={`${c}-${i}`} className="row" style={{ gap: 6 }}>
            <span className={i === crumbs.length - 1 ? 'now' : ''}>{c}</span>
            {i < crumbs.length - 1 && <ChevronRight size={12} style={{ color: 'var(--fg-faint)' }} />}
          </span>
        ))}
      </div>
      <div className="top-spacer" />
      <div className="searchbox searchbox-active">
        <Search size={14} />
        <input
          ref={searchRef}
          aria-label="Cari menu"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') openFirstResult(); if (e.key === 'Escape') { setQuery(''); searchRef.current?.blur(); } }}
          placeholder="Cari menu… (Ctrl+K)"
        />
        {query && (
          <div className="search-results" role="listbox" aria-label="Hasil pencarian menu">
            {results.length ? results.map((item) => (
              <button key={item.url} type="button" onMouseDown={(e) => { e.preventDefault(); setQuery(''); go(item.url); }}>
                <span>{item.label}</span>
                <small>{item.section}</small>
              </button>
            )) : <div className="search-empty">Belum ditemukan.</div>}
          </div>
        )}
      </div>
      <LiveClock />
      <div className={`system-ribbon top-status ${connection}`} aria-live="polite" style={{ border: 'none', background: 'transparent', boxShadow: 'none', padding: 0 }}>
        <span className="connection-lamp" aria-hidden="true" />
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{roleLabel(user?.role)} {roleStatus}</span>
      </div>
      <IconBtn label="Lihat tutorial" onClick={onOpenTutorial}><BookOpen size={16} /></IconBtn>
      <span className="notif-wrapper"><IconBtn label={notificationLabel} onClick={() => { const area = normalizeRole(user?.role, 'admin'); go(area === 'guru' ? '/guru/notifikasi' : area === 'siswa' ? '/siswa/notifikasi' : '/admin/notifications'); }}>
        <Bell size={16} />
        {safeUnreadCount > 0 && <span className="notif-badge" aria-hidden="true">{notificationBadge}</span>}
      </IconBtn></span>
    </div>
  );
}

function AppLayout({ user, path, onLogout, children }: { user: User; path: string; onLogout: () => void; children: ReactNode }) {
  const crumbs = routeCrumbs(path);
  const [connection, setConnection] = useState<ConnectionStatus>(() => navigator.onLine ? 'checking' : 'offline');
  const [tutorialOpenKey, setTutorialOpenKey] = useState(0);
  const [tutorialEnabled, setTutorialEnabled] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => { setSidebarOpen(false); }, [path]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setTutorialEnabled(true), 4500);
    return () => window.clearTimeout(timeoutId);
  }, [user?.id]);

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

  const showTutorial = Boolean(user) || tutorialEnabled || tutorialOpenKey > 0;
  return <div className="app"><a href="#main-content" className="skip-link">Lompat ke konten</a><div className={`side-backdrop${sidebarOpen ? ' side-open' : ''}`} onClick={() => setSidebarOpen(false)} aria-hidden="true" /><Sidebar user={user} path={path} onLogout={onLogout} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} /><main className="main" id="main-content" tabIndex={-1}><TopBar crumbs={crumbs} user={user} connection={connection} onOpenTutorial={() => { setTutorialEnabled(true); setTutorialOpenKey((value) => value + 1); }} onToggleSidebar={() => setSidebarOpen((v) => !v)} /><AppErrorBoundary resetKey={path}><Suspense fallback={<PageLoading />}>{children}</Suspense></AppErrorBoundary></main>{showTutorial && <Suspense fallback={null}><OnboardingTour user={user} manualOpenKey={tutorialOpenKey} /></Suspense>}</div>;
}

function Unauthorized({ user }: { user: User | null }) {
  return <div className="content"><PageHead eyebrow="AKSES DITOLAK" title="Menu ini bukan untuk peran Anda" sub="Sistem menjaga agar guru, siswa, admin, operator, dan developer hanya membuka menu sesuai tugasnya." actions={<Btn onClick={() => go(defaultPathFor(user))}><Home size={14} /> Kembali ke dasbor</Btn>} /><Card><EmptyState title="Akses ditolak" sub="Jika Anda butuh akses, hubungi operator IT sekolah atau developer sistem." /></Card></div>;
}

function NotFound({ user }: { user: User | null }) {
  return <div className="content"><PageHead eyebrow="HALAMAN TIDAK DITEMUKAN" title="Menu ini belum tersedia" sub={`Alamat yang dibuka tidak terdaftar di ${BRAND.compactName}. Pilih menu yang tersedia untuk peran Anda.`} actions={<Btn onClick={() => go(defaultPathFor(user))}><Home size={14} /> Kembali ke dasbor</Btn>} /><Card title="Menu yang bisa Anda buka" sub="Gunakan daftar ini bila bingung mencari halaman."><div className="quick-route-list">{navItemsForUser(user).map(([, url, label, Ico]) => <button key={url} type="button" onClick={() => go(url)}><Ico size={15} /><span>{label}</span><ChevronRight size={13} /></button>)}</div></Card></div>;
}

function App() {
  const [path, setPath] = useState(window.location.pathname === '/' ? '' : window.location.pathname);
  const [user, setUser] = useState<User | null>(readStoredUser());
  const [sessionChecked, setSessionChecked] = useState(() => !readStoredUser());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [backendSsoEnabled, setBackendSsoEnabled] = useState(false);
  const toastIdRef = useRef(0);

  // WorkOS SSO intentionally does not create local users in the browser.
  // SSO must complete via backend token exchange/callback and /auth/me.
  const notify: Notify = (message, type = 'ok') => {
    const id = ++toastIdRef.current;
    const duration = type === 'bad' ? 8000 : type === 'warn' ? 6000 : 3600;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  };
  const removeToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));
  useEffect(() => { const onPop = () => setPath(window.location.pathname === '/' ? '' : window.location.pathname); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  useEffect(() => { document.documentElement.setAttribute('data-theme', 'dark'); }, []);
  useEffect(() => {
    if (!SSO_ENABLED) return;
    let cancelled = false;
    fetch(`${API_BASE}/auth/sso/config`, { headers: { accept: 'application/json' }, credentials: 'include' })
      .then((response) => response.ok ? response.json() : { enabled: false })
      .then((data) => { if (!cancelled) setBackendSsoEnabled(data?.enabled === true); })
      .catch(() => { if (!cancelled) setBackendSsoEnabled(false); });
    return () => { cancelled = true; };
  }, []);
  // Unsaved changes warning — DISABLED: warn only when form state is dirty, not on every page.
  // Individual pages should set dirty state before enabling beforeunload.
  // To re-enable: add formDirty state and check it in the handler.
  useEffect(() => { setRiskConfirmHandler(({ title, message }) => new Promise((resolve) => setConfirmDialog({ title, message, resolve }))); return () => setRiskConfirmHandler(null); }, []);
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setSessionChecked(true);
      notify('Sesi masuk habis. Silakan masuk ulang.', 'bad');
      go('/login');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);
  useEffect(() => {
    const storedUser = readStoredUser();
    if (!storedUser) {
      setSessionChecked(true);
      return;
    }

    let cancelled = false;
    setSessionChecked(false);
    apiFetch<{ user: User }>('/auth/me')
      .then((response) => {
        if (cancelled) return;
        localStorage.setItem(USER_KEY, JSON.stringify(response.user));
        setUser(response.user);
        // Keep /login stable for explicit re-authentication and E2E/visual checks.
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem(USER_KEY);
        setUser(null);
        if (window.location.pathname !== '/login') go('/login');
      })
      .finally(() => {
        if (!cancelled) setSessionChecked(true);
      });

    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!user) {
      const stored = readStoredUser();
      if (stored) setUser(stored);
    }
  }, [path, user]);
  useEffect(() => { if (sessionChecked && !readStoredUser() && path !== '/login') go('/login'); }, [path, sessionChecked]);
  async function handleLogin(selectedRole: LoginRole, username: string, password: string) {
    try {
      localStorage.removeItem(USER_KEY);
      const response = await apiFetch<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password, expectedRole: selectedRole }) });
      const actualRoleArea = loginAreaForRole(response.user?.role);
      if (!response.user || actualRoleArea !== selectedRole) {
        try { await apiFetch('/auth/logout', { method: 'POST', body: JSON.stringify({}) }); } catch { /* best effort: hapus cookie sesi yang baru dibuat */ }
        localStorage.removeItem(USER_KEY);
        setUser(null);
        const actualLabel = actualRoleArea ? loginAreaLabel(actualRoleArea) : roleLabel(response.user?.role);
        throw new Error(`Akun ini terdaftar sebagai ${actualLabel}, bukan ${loginAreaLabel(selectedRole)}. Pilih tab ${actualLabel} atau gunakan akun ${loginAreaLabel(selectedRole)}.`);
      }
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      setSessionChecked(true);
      setUser(response.user);
      go(defaultPathFor(response.user));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login gagal. Periksa koneksi atau kredensial Anda.';
      const friendlyMessage = message.includes('tidak sesuai pilihan peran')
        ? `Akun ini bukan akun ${loginAreaLabel(selectedRole)}. Pilih tab yang sesuai atau gunakan akun ${loginAreaLabel(selectedRole)}.`
        : message;
      notify(friendlyMessage, 'bad');
      throw new Error(friendlyMessage);
    }
  }
  async function logout() {
    if (!await riskConfirm('Anda akan keluar dari akun ini. Lanjutkan?', 'Keluar dari akun')) return;
    try { await apiFetch('/auth/logout', { method: 'POST', body: JSON.stringify({}) }); } catch { /* tetap keluar lokal jika server tidak bisa dihubungi */ }
    localStorage.removeItem(USER_KEY);
    setSessionChecked(true);
    setUser(null);

    go('/login');
  }
  const confirmLayer = <ConfirmDialog dialog={confirmDialog} onCancel={() => { confirmDialog?.resolve(false); setConfirmDialog(null); }} onConfirm={() => { confirmDialog?.resolve(true); setConfirmDialog(null); }} />;

  if (!path || path === '/') { setTimeout(() => go(user ? defaultPathFor(user) : '/login'), 0); return null; }
  if (!sessionChecked && path !== '/login') return <><PageLoading /><ToastHost toasts={toasts} onClose={removeToast} />{confirmLayer}</>;
  if (path === '/login') return <>{SSO_ENABLED && backendSsoEnabled && <WorkOSLoginHandler />}<LoginScreen onLogin={handleLogin} showSso={SSO_ENABLED && backendSsoEnabled} /><ToastHost toasts={toasts} onClose={removeToast} />{confirmLayer}</>;
  if (!user) return <LoginScreen onLogin={handleLogin} showSso={SSO_ENABLED && backendSsoEnabled} />;
  if (user.mustChangePassword) return <><PasswordChangeScreen onChanged={() => { localStorage.removeItem(USER_KEY); setSessionChecked(true); setUser(null); notify('Password berhasil diganti. Silakan masuk kembali.', 'ok'); go('/login'); }} /><ToastHost toasts={toasts} onClose={removeToast} />{confirmLayer}</>;
  const route = routeForPath(path);
  const exists = Boolean(route);
  const allowed = exists && canAccessRoute(path, user);
  const screen = !route ? <NotFound user={user} /> : !allowed ? <Unauthorized user={user} /> : route.render({ user, notify });
  return <><AppLayout user={user} path={path} onLogout={logout}>{screen}</AppLayout><ToastHost toasts={toasts} onClose={removeToast} />{confirmLayer}</>;
}

export { App };
