import type { DemoRole } from './world';

export type LabNavItem = {
  id: string;
  label: string;
  screen: string;
  demoAttr?: string;
};

export function navForRole(role: DemoRole): LabNavItem[] {
  if (role === 'admin-tu') {
    return [
      { id: 'dash', label: 'Ringkasan Hari Ini', screen: 'dashboard' },
      { id: 'izin', label: 'Izin Personel', screen: 'izin', demoAttr: 'nav-izin' },
      { id: 'masalah', label: 'Cek Masalah', screen: 'masalah' },
      { id: 'perangkat', label: 'HP Scanner', screen: 'perangkat' }
    ];
  }
  if (role === 'kepala-sekolah') {
    return [
      { id: 'dash', label: 'Ringkasan Kepala', screen: 'dashboard' },
      { id: 'izin', label: 'Pantau Izin', screen: 'izin' }
    ];
  }
  if (role === 'operator-it') {
    return [
      { id: 'dash', label: 'Cek Sistem', screen: 'dashboard' },
      { id: 'perangkat', label: 'HP Scanner', screen: 'perangkat', demoAttr: 'operator-devices' }
    ];
  }
  if (role === 'guru-piket') {
    return [
      { id: 'dash', label: 'Tugas Piket', screen: 'dashboard' },
      { id: 'picket', label: 'Catatan Piket', screen: 'picket', demoAttr: 'nav-picket' },
      { id: 'masalah', label: 'Cek Masalah', screen: 'masalah' }
    ];
  }
  if (role === 'guru') {
    return [
      { id: 'dash', label: 'Ringkasan Mengajar', screen: 'dashboard' },
      { id: 'presensi', label: 'Isi Presensi Kelas', screen: 'presensi', demoAttr: 'nav-presensi' },
      { id: 'izin', label: 'Izin / Sakit / Dinas', screen: 'izin-saya', demoAttr: 'nav-izin-saya' }
    ];
  }
  return [
    { id: 'dash', label: 'Kehadiran Saya', screen: 'dashboard' },
    { id: 'notif', label: 'Notifikasi', screen: 'notifikasi' }
  ];
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
