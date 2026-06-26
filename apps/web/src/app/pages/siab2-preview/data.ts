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
  { label: 'Tahun Ajaran', value: '2026/2027' },
  { label: 'Semester', value: 'Genap' },
  { label: 'Kelas Aktif', value: '24' },
  { label: 'Siswa Terdata', value: '683' },
  { label: 'Guru Aktif', value: '42' },
  { label: 'Rekap Hari Ini', value: 'Preview', good: true }
] as const;

export const siab2Data: Siab2DataType = {
  academicYear: 'Tahun Ajaran 2026/2027',
  semester: 'Semester Genap',
  institution: 'MAN 1 Rokan Hulu',
  stats: [
    { value: '683', label: 'Siswa Terdata' },
    { value: '42', label: 'Guru Aktif' },
    { value: '24', label: 'Kelas Akademik' },
    { value: '5', label: 'Peran Pengguna' },
    { value: '1', label: 'Sistem Terpadu' }
  ],
  modules: [
    {
      id: 'siswa-guru',
      title: 'Data Siswa & Guru',
      tag: 'Sistem Utama',
      desc: 'Manajemen data induk civitas akademika lengkap dengan riwayat NISN, NUPTK, dan dokumen akademik terpusat.',
      previewType: 'table'
    },
    {
      id: 'kehadiran',
      title: 'Kehadiran Harian',
      tag: 'Pencatatan Karakter',
      desc: 'Membantu memantau presensi harian siswa dengan status kehadiran detail (Hadir, Izin, Sakit, Alfa, Terlambat).',
      previewType: 'chart'
    },
    {
      id: 'jadwal-jurnal',
      title: 'Jadwal & Jurnal Mengajar',
      tag: 'Rencana KBM',
      desc: 'Distribusi jadwal pelajaran kelas teratur dikombinasikan dengan pengisian jurnal mengajar mandiri oleh guru setiap hari.',
      previewType: 'timeline'
    },
    {
      id: 'laporan',
      title: 'Laporan Kepala Madrasah',
      tag: 'Hasil Validasi',
      desc: 'Membantu menyusun rekap presensi, jurnal, dan laporan berkala untuk mempermudah tinjauan pimpinan.',
      previewType: 'signature'
    }
  ],
  roles: [
    {
      name: 'Admin Madrasah',
      desc: 'Mendukung pengelolaan data secara terpusat, akun pengguna, konfigurasi kelas, dan hak akses utama.',
      badge: 'Akses Penuh',
      features: ['Pembagian Rombel & Kelas', 'Validasi Data Induk Akademik', 'Audit Log Aktivitas']
    },
    {
      name: 'Guru',
      desc: 'Membantu pengisian agenda mengajar harian, pencatatan absensi siswa per jam pelajaran, serta catatan karakter.',
      badge: 'Akademik & Karakter',
      features: ['Jurnal Mengajar Elektronik', 'Presensi Kehadiran Terstruktur', 'Evaluasi Karakter Siswa']
    },
    {
      name: 'Siswa',
      desc: 'Melihat jadwal pelajaran secara mandiri, memantau grafik persentase kehadiran sekolah, serta riwayat catatan kedisiplinan.',
      badge: 'Portal Pelajar',
      features: ['Akses Jadwal Kelas Harian', 'Monitor Kehadiran Pribadi', 'Transparansi Rapor Karakter']
    },
    {
      name: 'Operator Akademik',
      desc: 'Mendukung penyiapan struktur data akademik, verifikasi data guru dan siswa, serta penyusunan jadwal pelajaran makro.',
      badge: 'Data & Struktur',
      features: ['Siap Integrasi Data', 'Penyusunan Jadwal Rinci', 'Manajemen NISN & NUPTK']
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
        { label: 'Siswa Terdata', value: '683', change: 'Aktif', status: 'Hadir' },
        { label: 'Guru Aktif', value: '42', change: 'Siap Verifikasi', status: 'Aktif' },
        { label: 'Kelas Aktif', value: '24', change: 'Semester Genap', status: 'Izin' }
      ],
      alerts: [
        { name: 'Siswa Belum Diabsen', detail: 'Kelas XII MIPA 1 (Guru Mapel 01)', status: 'Terlambat' },
        { name: 'Jurnal Belum Lengkap', detail: 'Kelas XI IPS 2 (Guru Mapel 02)', status: 'Pending' },
        { name: 'Data Siswa Belum Lengkap', detail: '5 Siswa di Kelas X Agama', status: 'Nonaktif' }
      ]
    },
    guru: {
      schedule: [
        { time: '07.30 - 09.00', subject: 'Fisika Peminatan', class: 'XII MIPA 1', status: 'Aktif' },
        { time: '09.15 - 10.45', subject: 'Fisika Umum', class: 'XI IPS 2', status: 'Pending' }
      ],
      alerts: [
        { name: 'Absensi Perlu Diisi', detail: 'Kelas XII MIPA 1 siap diverifikasi hari ini', status: 'Terlambat' },
        { name: 'Input Jurnal Mingguan', detail: 'Batas pengisian tanggal 28/06/2026', status: 'Pending' }
      ]
    },
    siswa: {
      schedule: [
        { time: '07.30 - 09.00', subject: 'Kimia', teacher: 'Guru Mapel 01', status: 'Hadir' },
        { time: '09.15 - 10.45', subject: 'Matematika Wajib', teacher: 'Guru Mapel 02', status: 'Hadir' },
        { time: '11.00 - 12.30', subject: 'Bahasa Inggris', teacher: 'Guru Mapel 03', status: 'Terlambat' }
      ],
      attendance: [
        { label: 'Hadir', count: '142 Hari', status: 'Hadir' },
        { label: 'Izin', count: '4 Hari', status: 'Izin' },
        { label: 'Sakit', count: '2 Hari', status: 'Sakit' },
        { label: 'Terlambat', count: '1 Kali', status: 'Terlambat' }
      ]
    },
    kepala: {
      metrics: [
        { label: 'Rasio Kehadiran Siswa Hari Ini', value: '97.4%', status: 'Hadir' },
        { label: 'Keterisian Jurnal Mengajar Guru', value: '92.8%', status: 'Aktif' }
      ],
      approvals: [
        { name: 'Laporan Kehadiran Bulanan - Mei', detail: 'Diajukan oleh Operator (25/06/2026)', status: 'Pending' },
        { name: 'Jurnal Mengajar Semester Genap', detail: 'Diajukan oleh Guru Mapel 01', status: 'Aktif' }
      ]
    }
  }
};
