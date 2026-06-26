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
  Download,
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
type NavKey = 'admin' | 'principal' | 'operator' | 'picket' | 'guru' | 'siswa' | 'developer';
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
const AndroidApkUpdatePage = lazyPage(loadAdminPages, 'AndroidApkUpdatePage');
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
const PrincipalDashboard = lazyPage(loadAdminPages, 'PrincipalDashboard');
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
const SIAB2PreviewLanding = lazy(() => import('./pages/SIAB2PreviewLanding'));
const OnboardingTour = lazyPage(() => import('./tutorial'), 'OnboardingTour');
const PUBLIC_ROUTE_PATHS = new Set(['/siab2-preview']);

function isPublicRoutePath(path: string) {
  return PUBLIC_ROUTE_PATHS.has(path);
}

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
  admin: { id: '', idLabel: 'Nama akun Admin/TU, Kepala Sekolah, Operator, atau Developer' },
  siswa: { id: '', idLabel: 'Nama akun Siswa' }
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN_TU: 'Admin/TU',
  KEPALA_SEKOLAH: 'Kepala Sekolah',
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
  { path: '/admin/principal-dashboard', area: 'Kepala Sekolah', title: 'Ringkasan Kepala Sekolah', roles: ['KEPALA_SEKOLAH', 'DEVELOPER'], capabilities: ['reports.operational.read'], render: () => <PrincipalDashboard /> },
  { path: '/admin/it-dashboard', area: 'Operator IT', title: 'Cek Sistem', roles: ['OPERATOR_IT', 'DEVELOPER'], capabilities: ['devices.read'], render: () => <ItDashboardPage /> },
  { path: '/admin/picket-dashboard', area: 'Guru Piket', title: 'Tugas Piket Hari Ini', roles: ['GURU_PIKET', 'DEVELOPER'], capabilities: ['reconciliation.read'], render: () => <PicketDashboardPage /> },
  { path: '/admin/sessions', area: 'Admin/TU', title: 'Sesi Hari Ini', roles: ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'], capabilities: ['classAttendance.read'], render: () => <SessionsPage admin /> },
  { path: '/admin/history', area: 'Admin/TU', title: 'Riwayat Scan', roles: ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'], capabilities: ['gateAttendance.read'], render: () => <HistoryPage /> },
  { path: '/admin/staff-attendance', area: 'Admin/TU', title: 'Kepala/Staf Hadir', roles: ['ADMIN_TU', 'KEPALA_SEKOLAH', 'DEVELOPER'], capabilities: ['reports.school.read'], render: ({ notify }) => <StaffAttendancePage notify={notify} /> },
  { path: '/admin/student-completeness', area: 'Admin/TU', title: 'Kehadiran Lengkap Siswa', roles: ['ADMIN_TU', 'KEPALA_SEKOLAH', 'DEVELOPER'], capabilities: ['reports.school.read'], render: ({ notify }) => <StudentDailyCompletenessPage notify={notify} /> },
  { path: '/admin/prayer-attendance', area: 'Admin/TU', title: 'Sholat Siswa', roles: ['ADMIN_TU', 'KEPALA_SEKOLAH', 'DEVELOPER'], capabilities: ['reports.school.read'], render: ({ notify }) => <PrayerAttendancePage notify={notify} /> },
  { path: '/admin/anomaly', area: 'Admin/TU', title: 'Masalah yang Perlu Dicek', roles: ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'], capabilities: ['reconciliation.read'], render: ({ notify }) => <AnomalyPage notify={notify} /> },
  { path: '/admin/picket', area: 'Admin/TU', title: 'Catatan Piket', roles: ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'], capabilities: ['reconciliation.read'], render: ({ notify }) => <PicketBookPage notify={notify} /> },
  { path: '/admin/master-data', area: 'Admin/TU', title: 'Akun & Data Sekolah', roles: ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'], capabilities: ['users.read', 'academic.read'], render: ({ notify }) => <MasterDataPage notify={notify} /> },
  { path: '/admin/schedule', area: 'Admin/TU', title: 'Jadwal Kelas', roles: ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'], capabilities: ['schedules.read'], render: ({ notify }) => <SchedulePage notify={notify} /> },
  { path: '/admin/devices', area: 'Admin/TU', title: 'HP Scanner & Kartu', roles: ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'], capabilities: ['devices.read'], render: ({ notify }) => <DevicesPage notify={notify} /> },
  { path: '/admin/android-apk-update', area: 'Admin/TU', title: 'APK Update Center', roles: ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'], capabilities: ['devices.manage'], render: ({ notify }) => <AndroidApkUpdatePage notify={notify} /> },
  { path: '/admin/reports', area: 'Admin/TU', title: 'Laporan Sekolah', roles: ['ADMIN_TU', 'KEPALA_SEKOLAH', 'DEVELOPER'], capabilities: ['reports.school.read'], render: ({ notify }) => <ReportsPage notify={notify} /> },
  { path: '/admin/live-monitor', area: 'Admin/TU', title: 'Aktivitas Sekarang', roles: ['ADMIN_TU', 'KEPALA_SEKOLAH', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'], capabilities: ['reports.operational.read'], render: () => <LiveMonitorPage /> },
  { path: '/admin/settings', area: 'Admin/TU', title: 'Aturan Absensi', roles: ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'], capabilities: ['settings.read'], render: ({ notify }) => <SettingsPage notify={notify} /> },
  { path: '/admin/audit', area: 'Admin/TU', title: 'Riwayat Perubahan', roles: ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'], capabilities: ['audit.read'], render: () => <AuditPage /> },
  { path: '/admin/teacher-leaves', area: 'Admin/TU', title: 'Pengajuan Guru', roles: ['ADMIN_TU', 'OPERATOR_IT', 'DEVELOPER'], capabilities: ['schedules.read'], render: ({ notify }) => <TeacherLeavesPage notify={notify} /> },
  { path: '/admin/notifications', area: 'Sistem', title: 'Tugas / Notifikasi', roles: ['ADMIN_TU', 'KEPALA_SEKOLAH', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'], capabilities: ['profile.self.read'], render: () => <NotificationsPage /> },
  { path: '/admin/developer-control', area: 'Developer', title: 'Pusat Kontrol', roles: ['DEVELOPER'], capabilities: ['settings.manage'], render: ({ notify }) => <DeveloperControlPage notify={notify} /> },
  { path: '/admin/help', area: 'Bantuan', title: 'Panduan', roles: ['ADMIN_TU', 'KEPALA_SEKOLAH', 'OPERATOR_IT', 'GURU_PIKET', 'DEVELOPER'], capabilities: ['profile.self.read'], render: ({ user }) => <HelpPage role={String(user.role)} /> },
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
    navItem('PERANGKAT', '/admin/devices', CreditCard, 'HP Scanner & Kartu'), navItem('PERANGKAT', '/admin/android-apk-update', Download, 'APK Update Center'), navItem('LAPORAN', '/admin/reports', FileText, 'Laporan Sekolah'), navItem('BANTUAN & SISTEM', '/admin/notifications', Bell, 'Tugas / Notifikasi'), navItem('BANTUAN & SISTEM', '/admin/help', BookOpen, 'Panduan'), navItem('BANTUAN & SISTEM', '/admin/settings', Settings, 'Aturan Absensi'), navItem('BANTUAN & SISTEM', '/admin/audit', Database, 'Riwayat Perubahan')
  ],
  principal: [
    navItem('PANTAUAN', '/admin/principal-dashboard', LayoutDashboard, 'Ringkasan Kepala Sekolah'), navItem('PANTAUAN', '/admin/student-completeness', CheckSquare, 'Kehadiran Lengkap Siswa'), navItem('PANTAUAN', '/admin/prayer-attendance', CheckSquare, 'Sholat Siswa'), navItem('PANTAUAN', '/admin/staff-attendance', Users, 'Kepala/Staf Hadir'), navItem('PANTAUAN', '/admin/live-monitor', Activity, 'Aktivitas Sekarang'), navItem('LAPORAN', '/admin/reports', FileText, 'Laporan Sekolah'), navItem('BANTUAN', '/admin/notifications', Bell, 'Tugas / Notifikasi'), navItem('BANTUAN', '/admin/help', BookOpen, 'Panduan Kepala Sekolah')
  ],
  operator: [
    navItem('MULAI HARI INI', '/admin/it-dashboard', LayoutDashboard, 'Cek Sistem'), navItem('PERANGKAT', '/admin/devices', CreditCard, 'HP Scanner & Kartu'), navItem('PERANGKAT', '/admin/android-apk-update', Download, 'APK Update Center'), navItem('PERANGKAT', '/admin/live-monitor', Activity, 'Aktivitas Sekarang'), navItem('CEK KEAMANAN', '/admin/audit', Database, 'Riwayat Perubahan'), navItem('BANTUAN', '/admin/notifications', Bell, 'Tugas / Notifikasi'), navItem('BANTUAN', '/admin/help', BookOpen, 'Panduan Operator')
  ],
  developer: [
    navItem('KONTROL', '/admin/developer-control', Shield, 'Pusat Kontrol'), navItem('KONTROL', '/admin/dashboard', LayoutDashboard, 'Ringkasan Admin'), navItem('KONTROL', '/admin/it-dashboard', Radar, 'Cek Sistem'), navItem('KONTROL', '/admin/live-monitor', Activity, 'Aktivitas Sekarang'),
    navItem('DATA & SISTEM', '/admin/master-data', Users, 'Akun & Data Sekolah'), navItem('DATA & SISTEM', '/admin/staff-attendance', Users, 'Kepala/Staf Hadir'), navItem('DATA & SISTEM', '/admin/student-completeness', CheckSquare, 'Kehadiran Lengkap Siswa'), navItem('DATA & SISTEM', '/admin/prayer-attendance', CheckSquare, 'Sholat Siswa'), navItem('DATA & SISTEM', '/admin/devices', CreditCard, 'HP Scanner & Kartu'), navItem('DATA & SISTEM', '/admin/android-apk-update', Download, 'APK Update Center'), navItem('DATA & SISTEM', '/admin/settings', Settings, 'Aturan Absensi'), navItem('DATA & SISTEM', '/admin/audit', Database, 'Riwayat Perubahan'),
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
  if (role === 'KEPALA_SEKOLAH') return 'principal';
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
  if (role === 'ADMIN_TU' || role === 'KEPALA_SEKOLAH' || role === 'OPERATOR_IT' || role === 'GURU_PIKET' || role === 'DEVELOPER') return 'admin';
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
    <div className="login login-v2 siab2-login-page" data-siab2-auth="login">
      <div className="siab2-login-ambient" aria-hidden="true" />
      <div className="siab2-login-constellation" aria-hidden="true" />
      <div className="siab2-login-shell">
        <section className="login-left siab2-login-visual" aria-label={`Informasi ${BRAND.description}`}>
          <div className="siab2-login-grid" aria-hidden="true" />
          <div className="siab2-login-orbit siab2-login-orbit-one" aria-hidden="true" />
          <div className="siab2-login-orbit siab2-login-orbit-two" aria-hidden="true" />
          <div className="siab2-login-orbit siab2-login-orbit-three" aria-hidden="true" />
          <div className="login-left-content siab2-login-visual-content" tabIndex={0}>
            <div className="login-topbar siab2-login-brandbar">
              <div className="siab2-login-brand-lockup">
                <div className="brand-mark login-brand-mark siab2-login-logo-frame">
                  <img className="brand-logo" src="/logoman1.jpeg" alt="Logo MAN 1 Rokan Hulu" />
                </div>
                <div>
                  <div className="login-brand-name login-brand-name-long siab2-login-brand-name">{BRAND.shortName}</div>
                  <div className="login-brand-sub siab2-login-brand-sub">{BRAND.fullName}</div>
                </div>
              </div>
              <a className="siab2-login-preview-link" href="/siab2-preview">Lihat preview ↗</a>
            </div>

            <div className="siab2-login-visual-main">
              <div className="login-hero siab2-login-hero">
                <div className="eyebrow siab2-login-eyebrow"><span className="dot" /> MAN 1 ROKAN HULU · PORTAL AKADEMIK</div>
                <h1 aria-label="Presensi sekolah lebih rapi dalam satu sistem. SIAB2 Sistem Informasi Akademik Berkarakter."><span>SIAB2</span><em>Sistem Informasi Akademik Berkarakter</em></h1>
                <p className="siab2-login-role-line">
                  Untuk <strong>{role === 'guru' ? 'Guru' : role === 'admin' ? 'Admin/TU' : 'Siswa'}</strong>: ruang kerja akademik yang rapi untuk presensi, kelas, laporan, dan koordinasi madrasah.
                </p>
                <p className="siab2-login-hero-description">Masuk ke portal resmi dengan tampilan gelap sinematik, status operasional, dan modul akademik yang dirancang satu keluarga dengan preview SIAB2 Pass 3.</p>
                <div className="siab2-login-trust-row" aria-label="Fitur utama SIAB2">
                  <span><Shield size={13} /> Akses berbasis peran</span>
                  <span><Activity size={13} /> Status harian</span>
                  <span><BookOpen size={13} /> Modul akademik</span>
                </div>
              </div>

              <aside className="siab2-login-status-card" aria-label="Status Portal SIAB2">
                <div className="siab2-login-status-orb" aria-hidden="true" />
                <div className="siab2-login-status-head">
                  <div><span /><strong>Status Portal SIAB2</strong></div>
                  <em>Data Contoh</em>
                </div>
                <div className="siab2-login-metric-grid">
                  <div className="siab2-login-metric"><Calendar size={15} /><span>Tahun Ajaran</span><strong>2026/2027</strong></div>
                  <div className="siab2-login-metric"><Clock size={15} /><span>Semester</span><strong>Genap</strong></div>
                  <div className="siab2-login-metric siab2-login-metric-wide">
                    <div><CheckSquare size={16} /><span>Presensi Hari Ini</span></div>
                    <strong>97.4% Hadir</strong>
                    <i><b /> Preview operasional harian</i>
                  </div>
                  <div className="siab2-login-metric"><Users size={15} /><span>Kelas Aktif</span><strong>24 Rombel</strong></div>
                  <div className="siab2-login-metric"><Database size={15} /><span>Ledger Akademik</span><strong>Tersusun</strong></div>
                </div>
                <div className="siab2-login-progress-track"><span /></div>
              </aside>
            </div>

            <div className="siab2-login-academic-layer" role="group" aria-label="Ringkasan akademik SIAB2">
              <div className="siab2-login-module-deck">
                <div className="siab2-login-module-chip"><Radar size={14} /><span>Gerbang</span><strong>Datang & pulang</strong></div>
                <div className="siab2-login-module-chip"><ListChecks size={14} /><span>Jurnal</span><strong>KBM harian</strong></div>
                <div className="siab2-login-module-chip"><FileText size={14} /><span>Laporan</span><strong>Rekap pimpinan</strong></div>
              </div>
              <div className="login-specs siab2-login-specs">
                <div className="login-spec siab2-login-spec"><span className="k">MODUL AKTIF</span><span className="v">Presensi · Kelas · Laporan</span></div>
                <div className="login-spec siab2-login-spec"><span className="k">AKSES</span><span className="v">Guru · Admin/TU · Siswa</span></div>
                <div className="login-spec siab2-login-spec"><span className="k">PORTAL</span><span className="v">MAN 1 Rokan Hulu</span></div>
              </div>
              <div className="siab2-login-ledger-card">
                <div className="siab2-login-ledger-head"><LayoutDashboard size={15} /><strong>Mini Dashboard</strong><span>Live Preview</span></div>
                <div className="siab2-login-ledger-row"><span>Presensi guru</span><strong>Terpantau</strong></div>
                <div className="siab2-login-ledger-row"><span>Jurnal kelas</span><strong>Siap input</strong></div>
                <div className="siab2-login-ledger-row"><span>Notifikasi</span><strong>Ringkas</strong></div>
              </div>
            </div>
          </div>
        </section>

        <section className="login-right siab2-login-panel" aria-label="Form masuk SIAB2">
          <div className="siab2-login-panel-orbit" aria-hidden="true" />
          <form className="login-card siab2-login-card" onSubmit={submit}>
            <div className="siab2-login-card-status"><span /> Portal aman · {role === 'guru' ? 'Guru' : role === 'admin' ? 'Admin/TU' : 'Siswa'}</div>
            <div className="siab2-login-card-header">
              <div className="siab2-login-card-kicker">AKSES RESMI SIAB2</div>
              <h2>Masuk ke portal</h2>
              <p>{BRAND.fullName}</p>
            </div>

            <div className="login-role-label siab2-login-role-label">Pilih area akun</div>
            <div className="row login-role-tabs siab2-login-role-tabs" role="tablist" aria-label="Pilih jenis akun">
              {(['guru', 'admin', 'siswa'] as LoginRole[]).map((v) => (
                <button type="button" key={v} className={`btn sm login-role-option siab2-login-role-option ${role === v ? 'primary' : 'ghost'}`} onClick={() => setRole(v)} role="tab" aria-selected={role === v}>
                  {v === 'guru' ? 'Guru' : v === 'admin' ? 'Admin/TU' : 'Siswa'}
                </button>
              ))}
            </div>

            <div className="siab2-login-form-fields">
              <Field label={ROLE_PRESETS[role].idLabel}>
                <TextInput icon={<UserIcon size={14} />} value={id} placeholder="Masukkan nama akun" autoComplete="username" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setId(e.target.value)} aria-describedby={err ? 'login-error' : undefined} />
              </Field>
              <Field label="Kata Sandi">
                <div className="login-password-wrap siab2-login-password-wrap">
                  <TextInput icon={<Lock size={14} />} type={showPw ? 'text' : 'password'} value={pw} placeholder="Masukkan kata sandi" autoComplete="current-password" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPw(e.target.value)} aria-describedby={err ? 'login-error' : undefined} />
                  <button type="button" className="login-pw-toggle siab2-login-pw-toggle" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}>{showPw ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                </div>
              </Field>
            </div>

            {err && <div className="inline-error siab2-login-error" id="login-error" role="alert"><AlertTriangle size={14} /> {err}</div>}
            <Btn variant="primary" size="lg" loading={loading} type="submit" aria-label="Masuk" style={{ width: '100%' }}>Masuk ke SIAB2 <ArrowRight size={14} /></Btn>

            {showSso && <>
              <div className="hline siab2-login-divider" />
              <div className="siab2-login-alt-label">atau masuk dengan SSO</div>
              <WorkOSSSOButton className="siab2-login-sso" returnTo={defaultPathFor(null)} />
            </>}

            <div className="hline siab2-login-divider" />
            <div className="login-footer siab2-login-footer">
              <div className="login-footer-line" />
              <div className="login-footer-text">
                <span className="login-footer-brand">{BRAND.institution}</span>
                <span className="login-footer-dot" />
                <span className="login-footer-tag">Kementerian Agama RI</span>
              </div>
            </div>
          </form>
          <div className="siab2-login-form-ledger" aria-hidden="true">
            <span><Bell size={13} /> Notifikasi rapi</span>
            <span><Zap size={13} /> Akses cepat</span>
          </div>
        </section>
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
  return (
    <div className="login login-v2 siab2-login-page siab2-login-page-compact" data-siab2-auth="password-change">
      <div className="siab2-login-ambient" aria-hidden="true" />
      <div className="siab2-login-constellation" aria-hidden="true" />
      <div className="siab2-login-password-shell">
        <section className="siab2-login-password-context" aria-label={`Konteks keamanan ${BRAND.compactName}`}>
          <div className="siab2-login-grid" aria-hidden="true" />
          <div className="siab2-login-orbit siab2-login-orbit-one" aria-hidden="true" />
          <div className="siab2-login-brand-lockup siab2-login-password-brand">
            <div className="brand-mark login-brand-mark siab2-login-logo-frame">
              <img className="brand-logo" src="/logoman1.jpeg" alt="Logo MAN 1 Rokan Hulu" />
            </div>
            <div>
              <div className="login-brand-name login-brand-name-long siab2-login-brand-name">{BRAND.shortName}</div>
              <div className="login-brand-sub siab2-login-brand-sub">{BRAND.fullName}</div>
            </div>
          </div>
          <div className="siab2-login-password-copy">
            <div className="eyebrow siab2-login-eyebrow"><span className="dot" /> PROTEKSI AKUN</div>
            <h1><span>SIAB2</span><em>Pengamanan akses pertama</em></h1>
            <p>Lengkapi pergantian password sebelum masuk ke ruang kerja akademik. Status portal, modul, dan ledger tetap memakai visual Pass 3 yang sama.</p>
          </div>
          <div className="siab2-login-module-deck siab2-login-password-modules">
            <div className="siab2-login-module-chip"><Shield size={14} /><span>Akun</span><strong>Diverifikasi</strong></div>
            <div className="siab2-login-module-chip"><Lock size={14} /><span>Password</span><strong>Diperbarui</strong></div>
            <div className="siab2-login-module-chip"><LayoutDashboard size={14} /><span>Portal</span><strong>Siap akses</strong></div>
          </div>
        </section>

        <form onSubmit={submit} className="login-form login-card siab2-login-card siab2-login-card-password siab2-login-password-form">
          <div className="siab2-login-card-status"><span /> Sesi awal · wajib ganti password</div>
          <div className="siab2-login-card-header">
            <div className="siab2-login-card-kicker">PASSWORD WAJIB DIGANTI</div>
            <h2>Buat password baru</h2>
            <p>Akun baru atau akun yang di-reset wajib mengganti password sebelum memakai {BRAND.compactName}.</p>
          </div>
          <Field label="Password saat ini"><TextInput type="password" value={currentPassword} autoComplete="current-password" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentPassword(e.target.value)} /></Field>
          <Field label="Password baru"><TextInput type="password" value={newPassword} autoComplete="new-password" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)} /></Field>
          {error && <div className="inline-error siab2-login-error" role="alert"><AlertTriangle size={14} /> {error}</div>}
          <Btn variant="primary" size="lg" loading={loading} type="submit" style={{ width: '100%' }}>Simpan password baru</Btn>
        </form>
      </div>
    </div>
  );
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
      if (!isPublicRoutePath(window.location.pathname)) go('/login');
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
        if (window.location.pathname !== '/login' && !isPublicRoutePath(window.location.pathname)) go('/login');
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
  useEffect(() => { if (sessionChecked && !readStoredUser() && path !== '/login' && !isPublicRoutePath(path)) go('/login'); }, [path, sessionChecked]);
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
        : message.includes('Username atau password salah')
          ? 'Nama akun atau kata sandi salah.'
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

  if (isPublicRoutePath(path)) return <><Suspense fallback={<PageLoading />}><SIAB2PreviewLanding /></Suspense><ToastHost toasts={toasts} onClose={removeToast} />{confirmLayer}</>;
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
