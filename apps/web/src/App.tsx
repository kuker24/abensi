import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AppLayout } from './components/layout';
import { ToastProvider } from './components/ui';
import {
  login,
  setAccessToken
} from './lib/api';
import {
  defaultUiTweaks,
  useCheckInDraftState,
  useMockSessionState,
  useUiTweaksState
} from './lib/experienceState';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AnomalyBoardPage } from './pages/AnomalyBoardPage';
import { AttendanceHistoryPage } from './pages/AttendanceHistoryPage';
import { AuditPage } from './pages/AuditPage';
import { ClassAttendancePage } from './pages/ClassAttendancePage';
import { LiveMonitorPage } from './pages/LiveMonitorPage';
import { LoginPage } from './pages/LoginPage';
import { MasterDataPage } from './pages/MasterDataPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReportsPage } from './pages/ReportsPage';
import { ScheduleManagementPage } from './pages/ScheduleManagementPage';
import { SmartCardPage } from './pages/SmartCardPage';
import { StudentCheckInPage } from './pages/StudentCheckInPage';
import { StudentDashboardPage } from './pages/StudentDashboardPage';
import { SystemSettingsPage } from './pages/SystemSettingsPage';
import { TeacherCorrectionPage } from './pages/TeacherCorrectionPage';
import { TeacherDashboardPage } from './pages/TeacherDashboardPage';
import { TeacherMyAttendancePage } from './pages/TeacherMyAttendancePage';
import { TeacherRecapPage } from './pages/TeacherRecapPage';
import type { Role, SessionUser } from './types/domain';
import type { UiTweaks } from './types/experience';

const TOKEN_KEY = 'schoolhub_access_token';
const USER_KEY = 'schoolhub_user';
const THEME_KEY = 'schoolhub_theme';

function getDefaultPath(role: Role) {
  if (role === 'SISWA') return '/siswa/dashboard';
  if (role === 'GURU_MAPEL') return '/guru/dashboard';
  return '/admin/dashboard';
}

function canAccessRole(role: Role, area: 'admin' | 'guru' | 'siswa') {
  if (area === 'siswa') return role === 'SISWA';
  if (area === 'guru') return role === 'GURU_MAPEL';
  return role === 'ADMIN_TU' || role === 'OPERATOR_IT' || role === 'GURU_PIKET';
}

function ProtectedShell(props: {
  user: SessionUser;
  mode: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
  tweaks: UiTweaks;
  onTweakChange: (patch: Partial<UiTweaks>) => void;
  onResetTweaks: () => void;
  children: JSX.Element;
}) {
  const location = useLocation();

  return (
    <AppLayout
      user={props.user}
      mode={props.mode}
      onToggleTheme={props.onToggleTheme}
      onLogout={props.onLogout}
      tweaks={props.tweaks}
      onTweakChange={props.onTweakChange}
      onResetTweaks={props.onResetTweaks}
      currentPath={location.pathname}
    >
      {props.children}
    </AppLayout>
  );
}

export function App() {
  const location = useLocation();
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<SessionUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  });
  const [tweaks, setTweaks] = useUiTweaksState();
  const [checkInDraft, setCheckInDraft] = useCheckInDraftState();
  const [mockSessionState, setMockSessionState] = useMockSessionState();
  const [mode, setMode] = useState<'dark' | 'light'>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    setAccessToken(token);
  }, [token]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', mode === 'dark');
    localStorage.setItem(THEME_KEY, mode);
  }, [mode]);

  useEffect(() => {
    document.documentElement.dataset.uiDensity = tweaks.density;
    document.documentElement.dataset.uiRadius = tweaks.radius;
    document.documentElement.dataset.uiMotion = tweaks.motion;
    document.documentElement.dataset.uiEmphasis = tweaks.emphasis;
    document.documentElement.dataset.uiChroma = tweaks.chroma;
  }, [tweaks]);

  async function handleLogin(username: string, password: string) {
    const response = await login(username, password);
    localStorage.setItem(TOKEN_KEY, response.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    setToken(response.accessToken);
    setUser(response.user);
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setAccessToken(null);
  }

  const defaultPath = useMemo(() => (user ? getDefaultPath(user.role) : '/login'), [user]);
  const routeTransition = useMemo(() => {
    if (tweaks.motion === 'calm') {
      return {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.18, ease: 'easeOut' as const }
      };
    }
    if (tweaks.motion === 'vivid') {
      return {
        initial: { opacity: 0, y: 26, scale: 0.99 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -18, scale: 0.99 },
        transition: { duration: 0.34, ease: [0.21, 0.88, 0.37, 1] as [number, number, number, number] }
      };
    }
    return {
      initial: { opacity: 0, y: 14 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -12 },
      transition: { duration: 0.24, ease: 'easeOut' as const }
    };
  }, [tweaks.motion]);

  function handleTweakChange(patch: Partial<UiTweaks>) {
    setTweaks((prev) => ({
      ...prev,
      ...patch
    }));
  }

  function requireArea(area: 'admin' | 'guru' | 'siswa', element: JSX.Element) {
    if (!token || !user) {
      return <Navigate to="/login" replace />;
    }
    if (!canAccessRole(user.role, area)) {
      return <Navigate to={defaultPath} replace />;
    }
    return (
      <ProtectedShell
        user={user}
        mode={mode}
        onToggleTheme={() => setMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        onLogout={handleLogout}
        tweaks={tweaks}
        onTweakChange={handleTweakChange}
        onResetTweaks={() => setTweaks(defaultUiTweaks)}
      >
        {element}
      </ProtectedShell>
    );
  }

  function withShell(element: JSX.Element) {
    if (!token || !user) {
      return <Navigate to="/login" replace />;
    }

    return (
      <ProtectedShell
        user={user}
        mode={mode}
        onToggleTheme={() => setMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        onLogout={handleLogout}
        tweaks={tweaks}
        onTweakChange={handleTweakChange}
        onResetTweaks={() => setTweaks(defaultUiTweaks)}
      >
        {element}
      </ProtectedShell>
    );
  }

  return (
    <ToastProvider>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          className="route-stage"
          initial={routeTransition.initial}
          animate={routeTransition.animate}
          exit={routeTransition.exit}
          transition={routeTransition.transition}
        >
          <Routes location={location}>
            <Route
              path="/login"
              element={
                token && user ? (
                  <Navigate to={getDefaultPath(user.role)} replace />
                ) : (
                  <LoginPage
                    onSubmit={handleLogin}
                    mode={mode}
                    onToggleTheme={() => setMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                  />
                )
              }
            />

            <Route path="/" element={<Navigate to={defaultPath} replace />} />

            <Route path="/guru/dashboard" element={requireArea('guru', <TeacherDashboardPage />)} />
            <Route
              path="/guru/presensi"
              element={requireArea(
                'guru',
                <ClassAttendancePage mockState={mockSessionState} setMockState={setMockSessionState} />
              )}
            />
            <Route path="/guru/koreksi" element={requireArea('guru', <TeacherCorrectionPage />)} />
            <Route path="/guru/rekap" element={requireArea('guru', <TeacherRecapPage />)} />
            <Route path="/guru/kehadiran-saya" element={requireArea('guru', <TeacherMyAttendancePage />)} />

            <Route path="/admin/dashboard" element={requireArea('admin', <AdminDashboardPage />)} />
            <Route
              path="/admin/anomali"
              element={requireArea(
                'admin',
                <AnomalyBoardPage mockState={mockSessionState} setMockState={setMockSessionState} />
              )}
            />
            <Route path="/admin/live-monitor" element={requireArea('admin', <LiveMonitorPage />)} />
            <Route path="/admin/riwayat" element={requireArea('admin', <AttendanceHistoryPage />)} />
            <Route path="/admin/jadwal" element={requireArea('admin', <ScheduleManagementPage />)} />
            <Route path="/admin/smart-card" element={requireArea('admin', <SmartCardPage />)} />
            <Route path="/admin/pengaturan" element={requireArea('admin', <SystemSettingsPage />)} />
            <Route path="/admin/laporan" element={requireArea('admin', <ReportsPage />)} />
            <Route path="/admin/audit" element={requireArea('admin', <AuditPage />)} />
            <Route path="/admin/master-data" element={requireArea('admin', <MasterDataPage />)} />

            <Route path="/siswa/dashboard" element={requireArea('siswa', <StudentDashboardPage />)} />
            <Route
              path="/siswa/check-in"
              element={requireArea(
                'siswa',
                <StudentCheckInPage draft={checkInDraft} setDraft={setCheckInDraft} setMockState={setMockSessionState} />
              )}
            />

            <Route path="/profil" element={withShell(<ProfilePage />)} />

            <Route path="*" element={<Navigate to={defaultPath} replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </ToastProvider>
  );
}
