import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Bell,
  BookOpen,
  Calendar,
  CheckSquare,
  CreditCard,
  Database,
  Download,
  Edit3,
  FileText,
  Flag,
  Home,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Radar,
  Settings,
  User as UserIcon,
  Users
} from 'lucide-react';
import type { DemoRole } from './world';

export type LabNavItem = {
  id: string;
  section: string;
  label: string;
  screen: string;
  icon: LucideIcon;
  wired: boolean;
  demoAttr?: string;
};

function item(
  section: string,
  id: string,
  label: string,
  screen: string,
  icon: LucideIcon,
  wired: boolean,
  demoAttr?: string
): LabNavItem {
  return { id, section, label, screen, icon, wired, demoAttr };
}

export function navForRole(role: DemoRole): LabNavItem[] {
  if (role === 'admin-tu') {
    return [
      item('MULAI HARI INI', 'dash', 'Ringkasan Hari Ini', 'dashboard', LayoutDashboard, true),
      item('MULAI HARI INI', 'sessions', 'Cek Sesi Kelas', 'stub-sessions', Radar, false),
      item('MULAI HARI INI', 'masalah', 'Cek Masalah', 'masalah', Flag, true),
      item('MULAI HARI INI', 'live', 'Aktivitas Sekarang', 'stub-live', Activity, false),
      item('KERJA HARIAN', 'staff', 'Kepala/Staf Hadir', 'stub-staff', Users, false),
      item('KERJA HARIAN', 'complete', 'Kehadiran Lengkap Siswa', 'stub-complete', CheckSquare, false),
      item('KERJA HARIAN', 'prayer', 'Sholat Siswa', 'stub-prayer', CheckSquare, false),
      item('KERJA HARIAN', 'history', 'Riwayat Scan', 'stub-history', BookOpen, false),
      item('KERJA HARIAN', 'picket', 'Catatan Piket', 'stub-picket', ListChecks, false),
      item('KERJA HARIAN', 'izin', 'Izin Personel', 'izin', CheckSquare, true, 'nav-izin'),
      item('DATA SEKOLAH', 'master', 'Akun & Data Sekolah', 'stub-master', Users, false),
      item('DATA SEKOLAH', 'schedule', 'Jadwal Kelas', 'stub-schedule', Calendar, false),
      item('PRIBADI', 'izin-saya', 'Izin Saya', 'stub-izin-saya', Calendar, false),
      item('PERANGKAT', 'perangkat', 'HP Scanner & Kartu', 'perangkat', CreditCard, true),
      item('PERANGKAT', 'apk', 'APK Update Center', 'stub-apk', Download, false),
      item('LAPORAN', 'reports', 'Laporan Sekolah', 'stub-reports', FileText, false),
      item('BANTUAN & SISTEM', 'notif', 'Tugas / Notifikasi', 'notifikasi', Bell, true),
      item('BANTUAN & SISTEM', 'help', 'Panduan', 'stub-help', BookOpen, false),
      item('BANTUAN & SISTEM', 'security', 'Keamanan Akun', 'stub-security', KeyRound, false),
      item('BANTUAN & SISTEM', 'settings', 'Aturan Absensi', 'stub-settings', Settings, false),
      item('BANTUAN & SISTEM', 'audit', 'Riwayat Perubahan', 'stub-audit', Database, false)
    ];
  }
  if (role === 'kepala-sekolah') {
    return [
      item('PANTAUAN', 'dash', 'Ringkasan Kepala Sekolah', 'dashboard', LayoutDashboard, true),
      item('PANTAUAN', 'complete', 'Kehadiran Lengkap Siswa', 'stub-complete', CheckSquare, false),
      item('PANTAUAN', 'prayer', 'Sholat Siswa', 'stub-prayer', CheckSquare, false),
      item('PANTAUAN', 'staff', 'Kepala/Staf Hadir', 'stub-staff', Users, false),
      item('PANTAUAN', 'live', 'Aktivitas Sekarang', 'stub-live', Activity, false),
      item('PANTAUAN', 'izin', 'Izin Personel', 'izin', CheckSquare, true),
      item('LAPORAN', 'reports', 'Laporan Sekolah', 'stub-reports', FileText, false),
      item('PRIBADI', 'izin-saya', 'Izin Saya', 'stub-izin-saya', Calendar, false),
      item('BANTUAN', 'notif', 'Tugas / Notifikasi', 'notifikasi', Bell, true),
      item('BANTUAN', 'help', 'Panduan Kepala Sekolah', 'stub-help', BookOpen, false)
    ];
  }
  if (role === 'operator-it') {
    return [
      item('MULAI HARI INI', 'dash', 'Cek Sistem', 'dashboard', LayoutDashboard, true),
      item('PERANGKAT', 'perangkat', 'HP Scanner & Kartu', 'perangkat', CreditCard, true, 'operator-devices'),
      item('PERANGKAT', 'apk', 'APK Update Center', 'stub-apk', Download, false),
      item('PERANGKAT', 'live', 'Aktivitas Sekarang', 'stub-live', Activity, false),
      item('CEK KEAMANAN', 'audit', 'Riwayat Perubahan', 'stub-audit', Database, false),
      item('PRIBADI', 'izin-saya', 'Izin Saya', 'stub-izin-saya', Calendar, false),
      item('BANTUAN', 'notif', 'Tugas / Notifikasi', 'notifikasi', Bell, true),
      item('BANTUAN', 'help', 'Panduan Operator', 'stub-help', BookOpen, false)
    ];
  }
  if (role === 'guru-piket') {
    return [
      item('MULAI HARI INI', 'dash', 'Tugas Piket Hari Ini', 'dashboard', LayoutDashboard, true),
      item('KERJA PIKET', 'picket', 'Catatan Piket', 'picket', ListChecks, true, 'nav-picket'),
      item('KERJA PIKET', 'sessions', 'Cek Sesi Kelas', 'stub-sessions', Radar, false),
      item('KERJA PIKET', 'masalah', 'Cek Masalah', 'masalah', Flag, true),
      item('KERJA PIKET', 'history', 'Riwayat Scan', 'stub-history', BookOpen, false),
      item('KERJA PIKET', 'live', 'Aktivitas Sekarang', 'stub-live', Activity, false),
      item('PRIBADI', 'izin-saya', 'Izin Saya', 'stub-izin-saya', Calendar, false),
      item('BANTUAN', 'notif', 'Tugas / Notifikasi', 'notifikasi', Bell, true),
      item('BANTUAN', 'help', 'Panduan Piket', 'stub-help', BookOpen, false)
    ];
  }
  if (role === 'guru') {
    return [
      item('MULAI MENGAJAR', 'dash', 'Ringkasan Mengajar', 'dashboard', Home, true),
      item('MULAI MENGAJAR', 'presensi', 'Isi Presensi Kelas', 'presensi', CheckSquare, true, 'nav-presensi'),
      item('MULAI MENGAJAR', 'koreksi', 'Perbaiki Presensi', 'stub-koreksi', Edit3, false),
      item('LAPORAN', 'rekap', 'Laporan Kelas Saya', 'stub-rekap', FileText, false),
      item('PRIBADI', 'izin', 'Izin / Sakit / Dinas', 'izin-saya', Calendar, true, 'nav-izin-saya'),
      item('PRIBADI', 'hadir', 'Kehadiran Saya', 'stub-hadir', UserIcon, false),
      item('BANTUAN', 'notif', 'Tugas / Notifikasi', 'notifikasi', Bell, true),
      item('BANTUAN', 'help', 'Panduan', 'stub-help', BookOpen, false)
    ];
  }
  return [
    item('UTAMA', 'dash', 'Kehadiran Saya', 'dashboard', Home, true),
    item('BANTUAN', 'notif', 'Tugas / Notifikasi', 'notifikasi', Bell, true),
    item('BANTUAN', 'help', 'Panduan', 'stub-help', BookOpen, false)
  ];
}

export function groupNav(items: LabNavItem[]): Array<{ section: string; items: LabNavItem[] }> {
  const order: string[] = [];
  const map = new Map<string, LabNavItem[]>();
  for (const nav of items) {
    if (!map.has(nav.section)) {
      order.push(nav.section);
      map.set(nav.section, []);
    }
    map.get(nav.section)!.push(nav);
  }
  return order.map((section) => ({ section, items: map.get(section)! }));
}

export function rolePersona(role: DemoRole): { fullName: string; roleLabel: string; area: string } {
  if (role === 'admin-tu') return { fullName: 'Bu Rina', roleLabel: 'Admin/TU', area: 'Admin/TU' };
  if (role === 'kepala-sekolah') return { fullName: 'Pak Hadi', roleLabel: 'Kepala Sekolah', area: 'Kepala Sekolah' };
  if (role === 'operator-it') return { fullName: 'Mas Yoga', roleLabel: 'Operator IT', area: 'Operator IT' };
  if (role === 'guru-piket') return { fullName: 'Bu Sari', roleLabel: 'Guru Piket', area: 'Guru Piket' };
  if (role === 'guru') return { fullName: 'Pak Budi', roleLabel: 'Guru Mapel', area: 'Guru Mapel' };
  return { fullName: 'Alya Putri', roleLabel: 'Siswa', area: 'Siswa' };
}

export function pageContext(role: DemoRole, screen: string, items: LabNavItem[]): { area: string; title: string } {
  const persona = rolePersona(role);
  const hit = items.find((i) => i.screen === screen);
  if (hit) return { area: hit.section, title: hit.label };
  if (screen === 'dashboard') {
    if (role === 'admin-tu') return { area: 'MULAI HARI INI', title: 'Ringkasan Hari Ini' };
    if (role === 'kepala-sekolah') return { area: 'PANTAUAN', title: 'Ringkasan Kepala Sekolah' };
    if (role === 'operator-it') return { area: 'MULAI HARI INI', title: 'Cek Sistem' };
    if (role === 'guru-piket') return { area: 'MULAI HARI INI', title: 'Tugas Piket Hari Ini' };
    if (role === 'guru') return { area: 'MULAI MENGAJAR', title: 'Ringkasan Mengajar' };
    return { area: 'UTAMA', title: 'Kehadiran Saya' };
  }
  return { area: persona.area, title: screen };
}

export function roleHomePath(role: DemoRole) {
  return `/belajar/${role}`;
}

export function roleScreenPath(role: DemoRole, screen: string) {
  if (screen === 'dashboard') return roleHomePath(role);
  return `/belajar/${role}/${screen}`;
}

export function labGo(path: string) {
  if (path !== '/belajar' && !path.startsWith('/belajar/')) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
