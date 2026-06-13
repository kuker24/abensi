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
import { hasCapability, type Capability } from './capabilities';

const SSO_ENABLED = import.meta.env.VITE_SSO_ENABLED === 'true' && Boolean(import.meta.env.VITE_WORKOS_CLIENT_ID);


type Notify = (message: string, type?: string) => void;
type LoginRole = 'guru' | 'admin' | 'siswa';
type NavIcon = typeof Home;
type NavItem = readonly [section: string, url: string, label: string, icon: NavIcon];
type NavKey = 'admin' | 'operator' | 'picket' | 'guru' | 'siswa' | 'developer';
type ConnectionStatus = 'checking' | 'online' | 'offline';

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
const ReportsPage = lazyPage(loadAdminPages, 'ReportsPage');
const SchedulePage = lazyPage(loadAdminPages, 'SchedulePage');
const SessionsPage = lazyPage(loadAdminPages, 'SessionsPage');
const SettingsPage = lazyPage(loadAdminPages, 'SettingsPage');
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
    <span className="chip" aria-live="off" aria-label={now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}>
      <Clock size={12} />
      <span className="hide-sm">{now.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })} · </span>
      <b>{now.toLocaleTimeString('id-ID', { hour12: false })}</b>
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

const ROUTE_CAPABILITIES: Record<string, Capability[]> = {
  '/admin/dashboard': ['reports.operational.read'],
  '/admin/it-dashboard': ['devices.read'],
  '/admin/picket-dashboard': ['reconciliation.read'],
  '/admin/sessions': ['classAttendance.read'],
  '/admin/history': ['gateAttendance.read'],
  '/admin/anomaly': ['reconciliation.read'],
  '/admin/picket': ['reconciliation.read'],
  '/admin/master-data': ['users.read', 'academic.read'],
  '/admin/schedule': ['schedules.read'],
  '/admin/devices': ['devices.read'],
  '/admin/reports': ['reports.school.read'],
  '/admin/live-monitor': ['reports.operational.read'],
  '/admin/settings': ['settings.read'],
  '/admin/audit': ['audit.read'],
  '/admin/teacher-leaves': ['schedules.read'],
  '/admin/notifications': ['profile.self.read'],
  '/admin/developer-control': ['settings.manage'],
  '/admin/help': ['profile.self.read'],
  '/guru/dashboard': ['classAttendance.read'],
  '/guru/presensi': ['classAttendance.record'],
  '/guru/koreksi': ['classAttendance.correct'],
  '/guru/rekap': ['reports.self.read'],
  '/guru/izin': ['profile.self.update'],
  '/guru/kehadiran-saya': ['reports.self.read'],
  '/guru/notifikasi': ['profile.self.read'],
  '/guru/panduan': ['profile.self.read'],
  '/siswa/dashboard': ['reports.self.read'],
  '/siswa/notifikasi': ['profile.self.read'],
  '/siswa/panduan': ['profile.self.read']
};

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
  '/admin/reports': ['ADMIN_TU', 'DEVELOPER'],
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
  const requiredCapabilities = ROUTE_CAPABILITIES[path] || [];
  return Boolean(user?.role && allowed?.includes(String(user.role)) && requiredCapabilities.every((capability) => hasCapability(String(user.role), capability)));
}

function navItemsForUser(user: User | null): NavItem[] {
  const role = navKeyForRole(user?.role);
  return NAV_ITEMS_BY_ROLE[role].filter(([, url]) => canAccessRoute(url, user));
}

function routeExists(path: string) {
  return Boolean(ROUTE_ACCESS[path]);
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
    console.error('SchoolHub UI error boundary', error, info);
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
        <div className="login-left-content">
          <div className="login-topbar">
            <div className="row" style={{ gap: 12 }}>
              <div className="brand-mark login-brand-mark">
                <img className="brand-logo" src="/logoman1.jpeg" alt="Logo MAN 1 Rokan Hulu" />
              </div>
              <div>
                <div className="login-brand-name">e-Hadir</div>
                <div className="login-brand-sub">MAN 1 ROKAN HULU</div>
              </div>
            </div>
          </div>
          <div className="login-hero">
            <div className="eyebrow"><span className="dot" /> ABSENSI SEKOLAH DIGITAL</div>
            <h1>Tempel kartu di gerbang.<br />Dicek lagi di kelas.<br /><span className="grad">Lebih rapi dan aman.</span></h1>
            <p>Sistem ini membantu sekolah mencatat kehadiran siswa dari gerbang dan kelas. Jika ada siswa belum tempel kartu, tidak masuk kelas, atau data tidak sesuai, petugas akan lebih mudah mengetahuinya.</p>
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
              <button type="button" key={v} className={`btn sm login-role-option ${role === v ? 'primary' : 'ghost'}`} onClick={() => setRole(v)} style={{ flex: 1 }} role="tab" aria-selected={role === v} aria-pressed={role === v}>
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
  return <div className="login-page"><div className="login-card"><form onSubmit={submit} className="login-form"><PageHead eyebrow="PASSWORD WAJIB DIGANTI" title="Buat password baru" sub="Akun baru atau akun yang di-reset wajib mengganti password sebelum memakai e-Hadir." />
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
          <div className="brand-name">e-Hadir</div>
          <div className="brand-sub">MAN 1 ROHUL</div>
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
      <span className="notif-wrapper"><IconBtn label="Notifikasi" onClick={() => { const area = normalizeRole(user?.role, 'admin'); go(area === 'guru' ? '/guru/notifikasi' : area === 'siswa' ? '/siswa/notifikasi' : '/admin/notifications'); }}>
        <Bell size={16} />
      </IconBtn><span className="notif-dot" aria-label="Ada notifikasi baru" /></span>
    </div>
  );
}

function AppLayout({ user, path, onLogout, children }: { user: User; path: string; onLogout: () => void; children: ReactNode }) {
  const crumbs = ROUTE_TITLE[path] || ['e-Hadir'];
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
  return <div className="app"><a href="#main-content" className="skip-link">Lompat ke konten</a><div className={`side-backdrop${sidebarOpen ? ' side-open' : ''}`} onClick={() => setSidebarOpen(false)} aria-hidden="true" /><Sidebar user={user} path={path} onLogout={onLogout} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} /><main className="main" id="main-content"><TopBar crumbs={crumbs} user={user} connection={connection} onOpenTutorial={() => { setTutorialEnabled(true); setTutorialOpenKey((value) => value + 1); }} onToggleSidebar={() => setSidebarOpen((v) => !v)} /><AppErrorBoundary resetKey={path}><Suspense fallback={<PageLoading />}>{children}</Suspense></AppErrorBoundary></main>{showTutorial && <Suspense fallback={null}><OnboardingTour user={user} manualOpenKey={tutorialOpenKey} /></Suspense>}</div>;
}

function Unauthorized({ user }: { user: User | null }) {
  return <div className="content"><PageHead eyebrow="AKSES DITOLAK" title="Menu ini bukan untuk peran Anda" sub="Sistem menjaga agar guru, siswa, admin, operator, dan developer hanya membuka menu sesuai tugasnya." actions={<Btn onClick={() => go(defaultPathFor(user))}><Home size={14} /> Kembali ke dasbor</Btn>} /><Card><EmptyState title="Akses ditolak" sub="Jika Anda butuh akses, hubungi operator IT sekolah atau developer sistem." /></Card></div>;
}

function NotFound({ user }: { user: User | null }) {
  return <div className="content"><PageHead eyebrow="HALAMAN TIDAK DITEMUKAN" title="Menu ini belum tersedia" sub="Alamat yang dibuka tidak terdaftar di e-Hadir. Pilih menu yang tersedia untuk peran Anda." actions={<Btn onClick={() => go(defaultPathFor(user))}><Home size={14} /> Kembali ke dasbor</Btn>} /><Card title="Menu yang bisa Anda buka" sub="Gunakan daftar ini bila bingung mencari halaman."><div className="quick-route-list">{navItemsForUser(user).map(([, url, label, Ico]) => <button key={url} type="button" onClick={() => go(url)}><Ico size={15} /><span>{label}</span><ChevronRight size={13} /></button>)}</div></Card></div>;
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
  if (user.mustChangePassword) return <><PasswordChangeScreen onChanged={() => { const next = { ...user, mustChangePassword: false }; localStorage.setItem(USER_KEY, JSON.stringify(next)); setUser(next); notify('Password berhasil diganti.', 'ok'); }} /><ToastHost toasts={toasts} onClose={removeToast} />{confirmLayer}</>;
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
  return <><AppLayout user={user} path={path} onLogout={logout}>{screen}</AppLayout><ToastHost toasts={toasts} onClose={removeToast} />{confirmLayer}</>;
}

export { App };
