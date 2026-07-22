export interface StatItem {
  value: string;
  label: string;
}

export interface AcademicModule {
  id: string;
  title: string;
  tag: string;
  desc: string;
  previewType: 'table' | 'chart' | 'timeline' | 'signature';
}

export interface RoleItem {
  name: string;
  desc: string;
  badge: string;
  features: string[];
}

export interface DashboardMetric {
  label: string;
  value: string;
  change: string;
  status: string;
}

export interface DashboardAlert {
  name: string;
  detail: string;
  status: string;
}

export interface GuruSchedule {
  time: string;
  subject: string;
  class: string;
  status: string;
}

export interface SiswaSchedule {
  time: string;
  subject: string;
  teacher: string;
  status: string;
}

export interface SiswaAttendance {
  label: string;
  count: string;
  status: string;
}

export interface KepalaMetric {
  label: string;
  value: string;
  status: string;
}

export interface KepalaApproval {
  name: string;
  detail: string;
  status: string;
}

export interface DashboardMockData {
  admin: {
    metrics: DashboardMetric[];
    alerts: DashboardAlert[];
  };
  guru: {
    schedule: GuruSchedule[];
    alerts: DashboardAlert[];
  };
  siswa: {
    schedule: SiswaSchedule[];
    attendance: SiswaAttendance[];
  };
  kepala: {
    metrics: KepalaMetric[];
    approvals: KepalaApproval[];
  };
}

export interface Siab2DataType {
  academicYear: string;
  semester: string;
  institution: string;
  stats: StatItem[];
  modules: AcademicModule[];
  roles: RoleItem[];
  dashboardMock: DashboardMockData;
}

export const roleDetails = [
  { role: 'Admin', text: 'kelola data, rombel, dan akun dalam satu ruang kerja.' },
  { role: 'Guru', text: 'jadwal, absensi, dan jurnal dalam satu ruang kerja.' },
  { role: 'Siswa', text: 'pantau jadwal, presensi, dan rapor dalam satu ruang kerja.' },
  { role: 'Operator Akademik', text: 'menyusun struktur data, jadwal, dan validasi akademik dalam satu ruang kerja.' },
  { role: 'Kepala Madrasah', text: 'meninjau laporan, presensi, dan jurnal dalam satu ruang kerja.' }
] as const;

export const ledgerItems = [
  { label: 'Madrasah', value: 'Berbasis Riset' },
  { label: 'Alamat', value: 'Jl. Tuanku Tambusai 183' },
  { label: 'Telepon', value: '07627393218' },
  { label: 'Email', value: 'Email Resmi' },
  { label: 'Portal', value: 'SIAB2' },
  { label: 'Akses', value: 'Sesuai Peran', good: true }
] as const;

export const siab2Data: Siab2DataType = {
  academicYear: 'MAN 1 Rokan Hulu',
  semester: 'Madrasah Berbasis Riset',
  institution: 'MAN 1 Rokan Hulu',
  stats: [
    { value: 'Profil', label: 'Madrasah Berbasis Riset' },
    { value: 'Alamat', label: 'JL.TUANKU TAMBUSAI NO.183' },
    { value: 'Telepon', label: '07627393218' },
    { value: 'Email', label: 'manpasir675027@yahoo.co.id' },
    { value: 'SIAB2', label: 'Sistem Akademik' }
  ],
  modules: [
    {
      id: 'siswa-guru',
      title: 'Data Siswa & Guru',
      tag: 'Sistem Utama',
      desc: 'Manajemen data induk civitas akademika untuk mendukung administrasi akademik madrasah secara tertata.',
      previewType: 'table'
    },
    {
      id: 'kehadiran',
      title: 'Kehadiran Harian',
      tag: 'Pencatatan Karakter',
      desc: 'Membantu pencatatan presensi harian siswa dengan status kehadiran yang mudah ditinjau oleh petugas terkait.',
      previewType: 'chart'
    },
    {
      id: 'jadwal-jurnal',
      title: 'Jadwal & Jurnal Sesi',
      tag: 'Rencana KBM',
      desc: 'Mendukung penyusunan jadwal pelajaran dan jurnal per sesi mengajar dalam alur kerja yang lebih rapi.',
      previewType: 'timeline'
    },
    {
      id: 'laporan',
      title: 'Laporan Kepala Madrasah',
      tag: 'Hasil Validasi',
      desc: 'Membantu penyusunan rekap presensi, jurnal, dan laporan berkala untuk bahan tinjauan pimpinan madrasah.',
      previewType: 'signature'
    }
  ],
  roles: [
    {
      name: 'Admin Madrasah',
      desc: 'Mendukung pengelolaan data secara terpusat, akun pengguna, konfigurasi kelas, dan hak akses utama.',
      badge: 'Akses Penuh',
      features: ['Pembagian Rombel & Kelas', 'Validasi Data Induk Akademik', 'Riwayat Aktivitas Pengguna']
    },
    {
      name: 'Guru',
      desc: 'Membantu pengisian jurnal sesi dan pencatatan presensi siswa sesuai jadwal pelajaran.',
      badge: 'Akademik & Karakter',
      features: ['Jurnal Sesi Mengajar', 'Presensi Kehadiran Terstruktur', 'Status Ketuntasan Pembelajaran']
    },
    {
      name: 'Siswa',
      desc: 'Melihat data kehadiran pribadi sesuai akses siswa.',
      badge: 'Portal Pelajar',
      features: ['Monitor Kehadiran Pribadi', 'Status Presensi Kelas', 'Riwayat Kehadiran']
    },
    {
      name: 'Operator Akademik',
      desc: 'Mendukung penyiapan struktur data akademik, verifikasi data guru dan siswa, serta penyusunan jadwal pelajaran makro.',
      badge: 'Data & Struktur',
      features: ['Penataan Data Akademik', 'Penyusunan Jadwal Rinci', 'Manajemen Identitas Akademik']
    },
    {
      name: 'Kepala Madrasah',
      desc: 'Membantu meninjau performa mengajar guru, rekapitulasi kehadiran siswa bulanan, serta alur verifikasi laporan.',
      badge: 'Pengawasan Mutu',
      features: ['Validasi Laporan Berkala', 'Grafik Kinerja Guru & Kelas', 'Tinjauan Hasil Bulanan']
    }
  ],
  dashboardMock: {
    admin: {
      metrics: [
        { label: 'Data Induk', value: 'Terkelola', change: 'Sesuai Peran', status: 'Hadir' },
        { label: 'Jurnal Sesi', value: 'Tersimpan', change: 'Perlu Tinjauan', status: 'Aktif' },
        { label: 'Laporan Akademik', value: 'Berkala', change: 'Untuk Pimpinan', status: 'Izin' }
      ],
      alerts: [
        { name: 'Validasi Presensi', detail: 'Pemeriksaan data kehadiran oleh petugas berwenang', status: 'Pending' },
        { name: 'Jurnal Sesi', detail: 'Catatan pembelajaran tersimpan bersama sesi kelas', status: 'Aktif' },
        { name: 'Kelengkapan Data', detail: 'Pembaruan data induk dilakukan sesuai kebutuhan madrasah', status: 'Hadir' }
      ]
    },
    guru: {
      schedule: [
        { time: 'Jam Pelajaran', subject: 'Jadwal Mengajar', class: 'Kelas Aktif', status: 'Aktif' },
        { time: 'Sebelum Tutup Sesi', subject: 'Jurnal Sesi', class: 'Catatan Kelas', status: 'Pending' }
      ],
      alerts: [
        { name: 'Presensi Kelas', detail: 'Guru mengisi presensi sesuai jadwal mengajar', status: 'Pending' },
        { name: 'Jurnal Sesi', detail: 'Tujuan, kegiatan, jumlah JP, dan ketuntasan tersimpan sebelum sesi ditutup', status: 'Aktif' }
      ]
    },
    siswa: {
      schedule: [
        { time: 'Hari Aktif', subject: 'Jadwal Pelajaran', teacher: 'Guru Pengampu', status: 'Hadir' },
        { time: 'Riwayat', subject: 'Kehadiran Pribadi', teacher: 'Madrasah', status: 'Hadir' }
      ],
      attendance: [
        { label: 'Hadir', count: 'Tercatat', status: 'Hadir' },
        { label: 'Izin', count: 'Tercatat', status: 'Izin' },
        { label: 'Sakit', count: 'Tercatat', status: 'Sakit' },
        { label: 'Terlambat', count: 'Tercatat', status: 'Terlambat' }
      ]
    },
    kepala: {
      metrics: [
        { label: 'Rekap Kehadiran', value: 'Tersedia', status: 'Hadir' },
        { label: 'Jurnal Sesi', value: 'Tersimpan', status: 'Aktif' }
      ],
      approvals: [
        { name: 'Laporan Kehadiran Berkala', detail: 'Disiapkan untuk tinjauan pimpinan madrasah', status: 'Pending' },
        { name: 'Jurnal Sesi Mengajar', detail: 'Catatan pembelajaran tersimpan per sesi kelas', status: 'Aktif' }
      ]
    }
  }
};
