import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, BookOpen, Check, ChevronRight, PlayCircle, Volume2, VolumeX, X } from 'lucide-react';
import { apiFetch, go } from './api';
import { Btn, IconBtn } from './ui';
import { BRAND } from './branding';
import type { User } from './types';

const INTERACTIVE_TUTORIAL_VERSION = '2026.07.25';
const VOICE_PREFERENCE_KEY = 'siab2_tutorial_voice';
const VIEWPORT_MARGIN = 16;

type TutorialStep = {
  title: string;
  body: string;
  voice?: string;
  target?: string;
  compactTarget?: string;
  action?: { label: string; path: string };
};

type SpotlightRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

const INTERACTIVE_COMMON_START: TutorialStep = {
  title: `Selamat datang di ${BRAND.compactName}`,
  body: 'Panduan ini menggunakan halaman SIAB2 yang sedang Anda buka. Area penting akan disorot, lalu panduan suara Bahasa Indonesia menjelaskan fungsinya.',
  voice: `Selamat datang di ${BRAND.compactName}. Panduan ini memakai halaman SIAB2 yang sedang Anda buka. Ikuti area yang disorot untuk mengenali fungsi utama akun Anda.`
};

function navTarget(path: string) {
  return `[data-tour="nav:${path}"]`;
}

function stepsForRole(role?: string): TutorialStep[] {
  if (role === 'DEVELOPER') {
    return [
      INTERACTIVE_COMMON_START,
      {
        title: 'Pastikan akun dan sistem aktif',
        body: 'Bagian ini menunjukkan peran Developer dan kondisi sambungan SIAB2 sebelum Anda melakukan tindakan sistem.',
        voice: 'Lihat status di bagian atas. Pastikan tertulis Developer Sedang Aktif sebelum melakukan tindakan sistem.',
        target: '[data-tour="system-status"]',
        compactTarget: '[data-tour="topbar"]'
      },
      {
        title: 'Pegang prinsip perubahan aman',
        body: 'Nonaktifkan akun yang memiliki riwayat. Hapus permanen hanya data uji kosong, dan selalu periksa pratinjau sebelum cleanup.',
        voice: 'Perhatikan prinsip aman. Pertahankan data bersejarah, hapus permanen hanya data uji kosong, dan periksa pratinjau sebelum cleanup.',
        target: '.content > .smart-help'
      },
      {
        title: 'Kelola dari Pusat Kontrol',
        body: 'Gunakan Pusat Kontrol untuk mengaktifkan tutorial ulang, memeriksa kesehatan sistem, dan menjalankan cleanup yang terkontrol.',
        voice: 'Gunakan Pusat Kontrol untuk tutorial pengguna, kesehatan sistem, dan cleanup yang aman.',
        target: navTarget('/admin/developer-control'),
        compactTarget: '[data-tour="navigation-toggle"]'
      },
      {
        title: 'Periksa kesiapan teknis',
        body: 'Cek Sistem merangkum kesiapan aplikasi, kartu, dan HP scanner sebelum operasional sekolah dimulai.',
        voice: 'Buka Cek Sistem untuk memastikan aplikasi, kartu, dan HP scanner siap dipakai.',
        target: navTarget('/admin/it-dashboard'),
        compactTarget: '[data-tour="navigation-toggle"]'
      },
      {
        title: 'Telusuri setiap perubahan',
        body: 'Riwayat Perubahan menunjukkan pelaku, waktu, dan tindakan penting. Gunakan sebagai jejak audit sebelum dan sesudah perubahan.',
        voice: 'Gunakan Riwayat Perubahan untuk menelusuri pelaku, waktu, dan tindakan penting.',
        target: navTarget('/admin/audit'),
        compactTarget: '[data-tour="navigation-toggle"]'
      },
      {
        title: 'Periksa tugas dan notifikasi',
        body: 'Lonceng menampilkan informasi yang perlu ditinjau. Tanda angka berarti masih ada notifikasi belum dibaca.',
        voice: 'Periksa tombol lonceng untuk tugas dan notifikasi yang belum dibaca.',
        target: '[data-tour="notifications"]'
      },
      {
        title: 'Amankan sesi Developer',
        body: 'Buka menu profil untuk memeriksa identitas atau keluar. Selalu keluar setelah memakai perangkat bersama.',
        voice: 'Gunakan tombol profil untuk memeriksa identitas dan keluar dengan aman.',
        target: '[data-tour="profile"]'
      },
      {
        title: 'Buka panduan kapan saja',
        body: 'Tombol buku membuka tutorial ini kembali ketika Anda perlu mengulang alur kontrol sistem.',
        voice: 'Tombol buku membuka tutorial ini kembali kapan saja. Anda siap menggunakan SIAB2 sebagai Developer.',
        target: '[data-tour="tutorial-button"]'
      }
    ];
  }
  if (role === 'KEPALA_SEKOLAH') {
    return [
      INTERACTIVE_COMMON_START,
      {
        title: 'Pastikan akun dan sistem aktif',
        body: 'Bagian ini menunjukkan peran Kepala Sekolah dan kondisi sambungan SIAB2. Akses Anda bersifat baca saja.',
        voice: 'Lihat status di bagian atas. Pastikan tertulis Kepala Sekolah Sedang Aktif. Akses ini digunakan untuk memantau tanpa mengubah data.',
        target: '[data-tour="system-status"]',
        compactTarget: '[data-tour="topbar"]'
      },
      {
        title: 'Baca ringkasan kondisi sekolah',
        body: 'Panel ini merangkum cakupan presensi, sesi hari ini, scan gerbang, dan masalah aktif untuk pengambilan keputusan.',
        voice: 'Panel ringkasan menunjukkan cakupan presensi, sesi, scan gerbang, dan masalah aktif hari ini.',
        target: '[data-tour="principal-summary"]'
      },
      {
        title: 'Buka laporan sekolah',
        body: 'Gunakan Laporan Sekolah untuk membaca dan mencetak ringkasan resmi tanpa mengubah data operasional.',
        voice: 'Gunakan Laporan Sekolah untuk membaca dan mencetak ringkasan resmi dalam mode baca saja.',
        target: navTarget('/admin/reports'),
        compactTarget: '[data-tour="navigation-toggle"]'
      },
      {
        title: 'Pantau aktivitas sekarang',
        body: 'Aktivitas Sekarang menampilkan kejadian gerbang dan sesi terbaru. Koordinasikan tindak lanjut dengan petugas berwenang.',
        voice: 'Pantau Aktivitas Sekarang, lalu koordinasikan masalah dengan Admin TU, Operator IT, atau Guru Piket.',
        target: navTarget('/admin/live-monitor'),
        compactTarget: '[data-tour="navigation-toggle"]'
      },
      {
        title: 'Periksa notifikasi',
        body: 'Lonceng menampilkan informasi untuk akun Anda. Tanda angka berarti masih ada notifikasi belum dibaca.',
        voice: 'Periksa tombol lonceng untuk informasi yang belum dibaca.',
        target: '[data-tour="notifications"]'
      },
      {
        title: 'Jaga keamanan akun',
        body: 'Buka menu profil untuk memeriksa identitas atau keluar. Jangan biarkan akun aktif pada perangkat bersama.',
        voice: 'Gunakan tombol profil untuk memeriksa identitas dan keluar dengan aman.',
        target: '[data-tour="profile"]'
      },
      {
        title: 'Buka panduan kapan saja',
        body: 'Tombol buku membuka tutorial ini kembali jika Anda ingin mengulang alur pantauan.',
        voice: 'Tombol buku membuka tutorial ini kembali kapan saja. Anda siap memantau SIAB2 sebagai Kepala Sekolah.',
        target: '[data-tour="tutorial-button"]'
      }
    ];
  }
  if (role === 'OPERATOR_IT') {
    return [
      INTERACTIVE_COMMON_START,
      {
        title: 'Pastikan akun dan sistem aktif',
        body: 'Bagian ini menunjukkan peran Operator IT dan kondisi sambungan SIAB2 sebelum pemeriksaan perangkat.',
        voice: 'Lihat status di bagian atas. Pastikan tertulis Operator IT Sedang Aktif sebelum memeriksa perangkat.',
        target: '[data-tour="system-status"]',
        compactTarget: '[data-tour="topbar"]'
      },
      {
        title: 'Periksa kesehatan sistem',
        body: 'Kartu ini merangkum kesiapan aplikasi, jumlah kartu aktif atau hilang, dan alat reader yang aktif.',
        voice: 'Periksa ringkasan kesehatan aplikasi, kartu, dan alat reader sebelum operasional dimulai.',
        target: '.content > .grid.g-4'
      },
      {
        title: 'Kelola HP scanner dan kartu',
        body: 'Gunakan HP Scanner & Kartu untuk aktivasi Android, pengelolaan kartu, dan penanganan kartu hilang.',
        voice: 'Gunakan HP Scanner dan Kartu untuk aktivasi Android, pengelolaan kartu, dan kartu hilang.',
        target: navTarget('/admin/devices'),
        compactTarget: '[data-tour="navigation-toggle"]'
      },
      {
        title: 'Lihat jejak perubahan',
        body: 'Riwayat Perubahan membantu memastikan siapa melakukan tindakan teknis dan kapan tindakan terjadi.',
        voice: 'Gunakan Riwayat Perubahan untuk menelusuri tindakan teknis dan waktu kejadiannya.',
        target: navTarget('/admin/audit'),
        compactTarget: '[data-tour="navigation-toggle"]'
      },
      {
        title: 'Periksa tugas dan notifikasi',
        body: 'Lonceng menampilkan gangguan atau informasi yang perlu ditinjau. Tanda angka berarti ada notifikasi belum dibaca.',
        voice: 'Periksa tombol lonceng untuk gangguan atau informasi yang belum dibaca.',
        target: '[data-tour="notifications"]'
      },
      {
        title: 'Amankan akun operator',
        body: 'Buka menu profil untuk memeriksa identitas atau keluar setelah pekerjaan teknis selesai.',
        voice: 'Gunakan tombol profil untuk memeriksa identitas dan keluar dengan aman.',
        target: '[data-tour="profile"]'
      },
      {
        title: 'Buka panduan kapan saja',
        body: 'Tombol buku membuka tutorial ini kembali saat Anda perlu mengulang pemeriksaan sistem.',
        voice: 'Tombol buku membuka tutorial ini kembali kapan saja. Anda siap menggunakan SIAB2 sebagai Operator IT.',
        target: '[data-tour="tutorial-button"]'
      }
    ];
  }
  if (role === 'GURU_PIKET') {
    return [
      INTERACTIVE_COMMON_START,
      {
        title: 'Pastikan akun dan sistem aktif',
        body: 'Bagian ini menunjukkan peran Guru Piket dan kondisi sambungan SIAB2 sebelum Anda menangani tugas hari ini.',
        voice: 'Lihat status di bagian atas. Pastikan tertulis Guru Piket Sedang Aktif sebelum memulai tugas.',
        target: '[data-tour="system-status"]',
        compactTarget: '[data-tour="topbar"]'
      },
      {
        title: 'Baca ringkasan tugas piket',
        body: 'Ringkasan ini menunjukkan sesi yang belum dimulai, guru yang sedang mengajar, sesi belum ditutup, dan masalah aktif.',
        voice: 'Periksa ringkasan sesi dan masalah aktif untuk menentukan prioritas tugas piket.',
        target: '.content > .grid.g-4'
      },
      {
        title: 'Catat kejadian penting',
        body: 'Gunakan Catatan Piket agar petugas berikutnya memahami kejadian dan tindak lanjut yang sudah dilakukan.',
        voice: 'Tulis kejadian penting di Catatan Piket agar riwayat tugas mudah dipahami.',
        target: navTarget('/admin/picket'),
        compactTarget: '[data-tour="navigation-toggle"]'
      },
      {
        title: 'Tindak masalah dengan jelas',
        body: 'Cek Masalah digunakan ketika siswa belum scan atau data kelas tidak cocok. Tulis alasan tindak lanjut secara jelas.',
        voice: 'Gunakan Cek Masalah untuk data yang tidak cocok, lalu tulis alasan tindak lanjut dengan jelas.',
        target: navTarget('/admin/anomaly'),
        compactTarget: '[data-tour="navigation-toggle"]'
      },
      {
        title: 'Periksa tugas dan notifikasi',
        body: 'Lonceng menampilkan tugas atau informasi piket. Tanda angka berarti masih ada notifikasi belum dibaca.',
        voice: 'Periksa tombol lonceng untuk tugas atau informasi piket yang belum dibaca.',
        target: '[data-tour="notifications"]'
      },
      {
        title: 'Amankan akun Anda',
        body: 'Buka menu profil untuk memeriksa identitas atau keluar setelah pergantian petugas.',
        voice: 'Gunakan tombol profil untuk memeriksa identitas dan keluar setelah pergantian petugas.',
        target: '[data-tour="profile"]'
      },
      {
        title: 'Buka panduan kapan saja',
        body: 'Tombol buku membuka tutorial ini kembali saat Anda perlu mengulang alur piket.',
        voice: 'Tombol buku membuka tutorial ini kembali kapan saja. Anda siap menggunakan SIAB2 sebagai Guru Piket.',
        target: '[data-tour="tutorial-button"]'
      }
    ];
  }
  if (role === 'GURU_MAPEL') {
    return [
      INTERACTIVE_COMMON_START,
      {
        title: 'Pastikan akun dan sistem aktif',
        body: 'Bagian ini menunjukkan peran akun Anda dan kondisi sambungan SIAB2. Status “Sedang Aktif” berarti layanan dapat digunakan.',
        voice: 'Lihat status di bagian atas. Pastikan tertulis Guru Mapel Sedang Aktif sebelum memulai pekerjaan kelas.',
        target: '[data-tour="system-status"]',
        compactTarget: '[data-tour="topbar"]'
      },
      {
        title: 'Mulai dari Ringkasan Mengajar',
        body: 'Ringkasan Mengajar menampilkan jadwal dan sesi Anda hari ini. Gunakan halaman ini untuk memastikan kelas yang akan dimulai sudah benar.',
        voice: 'Mulai dari menu Ringkasan Mengajar. Di sini Anda memeriksa jadwal dan sesi yang menjadi tanggung jawab Anda hari ini.',
        target: navTarget('/guru/dashboard'),
        compactTarget: '[data-tour="navigation-toggle"]'
      },
      {
        title: 'Isi Presensi Kelas',
        body: 'Pilih sesi yang benar, tekan Absen Masuk atau Mulai Kelas, catat status setiap siswa, lalu simpan jurnal pembelajaran.',
        voice: 'Gunakan menu Isi Presensi Kelas. Pilih sesi yang benar, mulai kelas, catat presensi siswa, lalu simpan jurnal pembelajaran.',
        target: navTarget('/guru/presensi'),
        compactTarget: '[data-tour="navigation-toggle"]',
        action: { label: 'Buka Isi Presensi', path: '/guru/presensi' }
      },
      {
        title: 'Ajukan Izin atau Sakit Pribadi',
        body: 'Menu Izin / Sakit / Dinas Luar digunakan untuk mengajukan ketidakhadiran resmi sebelum sesi kelas berjalan.',
        voice: 'Gunakan menu Izin untuk mengajukan ketidakhadiran resmi Anda. Pilih jenis izin, rentang tanggal, dan berikan alasan yang jelas.',
        target: navTarget('/guru/izin'),
        compactTarget: '[data-tour="navigation-toggle"]',
        action: { label: 'Buka Pengajuan Izin', path: '/guru/izin' }
      },
      {
        title: 'Perbaiki hanya jika diperlukan',
        body: 'Gunakan Perbaiki Presensi ketika data yang sudah tersimpan memang salah. Setiap koreksi memerlukan alasan yang jelas dan akan tercatat.',
        voice: 'Menu Perbaiki Presensi hanya digunakan jika data yang sudah tersimpan salah. Tulis alasan koreksi dengan jelas karena perubahan akan tercatat.',
        target: navTarget('/guru/koreksi'),
        compactTarget: '[data-tour="navigation-toggle"]'
      },
      {
        title: 'Periksa tugas dan notifikasi',
        body: 'Lonceng menampilkan tugas atau informasi yang perlu Anda lihat. Tanda angka berarti masih ada notifikasi yang belum dibaca.',
        voice: 'Periksa tombol lonceng. Jika ada angka, berarti masih ada tugas atau informasi yang belum dibaca.',
        target: '[data-tour="notifications"]'
      },
      {
        title: 'Kelola akun Anda',
        body: 'Buka menu profil untuk melihat identitas akun atau keluar dengan aman setelah selesai menggunakan SIAB2.',
        voice: 'Tombol profil menampilkan identitas akun dan pilihan keluar. Selalu keluar setelah memakai perangkat bersama.',
        target: '[data-tour="profile"]'
      },
      {
        title: 'Buka panduan kapan saja',
        body: 'Tombol buku membuka tutorial ini kembali. Gunakan jika Anda lupa urutan kerja atau ingin mengulang panduan suara.',
        voice: 'Tombol buku membuka tutorial ini kembali kapan saja. Anda sekarang siap menggunakan SIAB2 sebagai Guru Mapel.',
        target: '[data-tour="tutorial-button"]'
      }
    ];
  }
  if (role === 'SISWA') {
    return [
      INTERACTIVE_COMMON_START,
      {
        title: 'Pastikan akun dan sistem aktif',
        body: 'Bagian ini menunjukkan peran akun dan kondisi sambungan SIAB2. Status “Sedang Aktif” berarti data dapat dimuat.',
        voice: 'Lihat status di bagian atas. Pastikan tertulis Siswa Sedang Aktif agar data kehadiran dapat dimuat.',
        target: '[data-tour="system-status"]',
        compactTarget: '[data-tour="topbar"]'
      },
      {
        title: 'Baca Kehadiran Saya',
        body: 'Kehadiran Saya merangkum catatan gerbang, mushola, dan kelas milik Anda. Data ini hanya dapat dilihat, bukan diubah oleh siswa.',
        voice: 'Gunakan menu Kehadiran Saya untuk membaca catatan gerbang, mushola, dan kelas. Siswa hanya dapat melihat data, bukan mengubah presensi.',
        target: navTarget('/siswa/dashboard'),
        compactTarget: '[data-tour="navigation-toggle"]',
        action: { label: 'Buka Kehadiran Saya', path: '/siswa/dashboard' }
      },
      {
        title: 'Pahami status presensi',
        body: 'Status Hadir, Terlambat, Izin, Sakit, atau Alpa muncul setelah petugas dan guru menyimpan data. Jika belum sesuai, hubungi guru atau petugas sekolah.',
        voice: 'Status presensi muncul setelah guru atau petugas menyimpan data. Jika status belum sesuai, hubungi guru mapel, wali kelas, atau guru piket.'
      },
      {
        title: 'Periksa notifikasi',
        body: 'Lonceng menampilkan informasi untuk akun Anda. Tanda angka berarti masih ada notifikasi yang belum dibaca.',
        voice: 'Periksa tombol lonceng. Tanda angka menunjukkan notifikasi yang belum dibaca.',
        target: '[data-tour="notifications"]'
      },
      {
        title: 'Jaga keamanan akun',
        body: 'Buka menu profil untuk memeriksa identitas akun atau keluar. Jangan biarkan akun tetap masuk pada perangkat bersama.',
        voice: 'Gunakan tombol profil untuk memeriksa identitas atau keluar. Jangan biarkan akun tetap masuk pada perangkat bersama.',
        target: '[data-tour="profile"]'
      },
      {
        title: 'Buka panduan kapan saja',
        body: 'Tombol buku membuka tutorial ini kembali jika Anda ingin mengulang penjelasan.',
        voice: 'Tombol buku membuka tutorial ini kembali kapan saja. Anda sekarang siap membaca data kehadiran di SIAB2.',
        target: '[data-tour="tutorial-button"]'
      }
    ];
  }
  return [
    INTERACTIVE_COMMON_START,
    {
      title: 'Pastikan akun dan sistem aktif',
      body: 'Bagian ini menunjukkan peran Admin TU dan kondisi sambungan SIAB2 sebelum pekerjaan operasional dimulai.',
      voice: 'Lihat status di bagian atas. Pastikan tertulis Admin TU Sedang Aktif sebelum memulai pekerjaan.',
      target: '[data-tour="system-status"]',
      compactTarget: '[data-tour="topbar"]'
    },
    {
      title: 'Baca ringkasan operasional',
      body: 'Panel ini merangkum cakupan presensi, sesi hari ini, scan gerbang, dan masalah aktif yang perlu diprioritaskan.',
      voice: 'Panel ringkasan menunjukkan cakupan presensi, sesi, scan gerbang, dan masalah aktif hari ini.',
      target: '[data-tour="admin-summary"]'
    },
    {
      title: 'Tindak masalah lebih dulu',
      body: 'Cek Masalah menampilkan data gerbang atau kelas yang perlu diverifikasi. Catat alasan setiap tindak lanjut dengan jelas.',
      voice: 'Gunakan Cek Masalah untuk data yang perlu diverifikasi, lalu tulis alasan tindak lanjut dengan jelas.',
      target: navTarget('/admin/anomaly'),
      compactTarget: '[data-tour="navigation-toggle"]'
    },
    {
      title: 'Kelola akun dan data sekolah',
      body: 'Akun & Data Sekolah digunakan untuk data master. Periksa data dan dampaknya sebelum menyimpan perubahan.',
      voice: 'Gunakan Akun dan Data Sekolah untuk data master. Periksa data sebelum menyimpan perubahan.',
      target: navTarget('/admin/master-data'),
      compactTarget: '[data-tour="navigation-toggle"]'
    },
    {
      title: 'Pastikan perubahan tercatat',
      body: 'Riwayat Perubahan menampilkan tindakan penting agar data tetap aman, transparan, dan dapat ditelusuri.',
      voice: 'Gunakan Riwayat Perubahan untuk memastikan tindakan penting dapat ditelusuri.',
      target: navTarget('/admin/audit'),
      compactTarget: '[data-tour="navigation-toggle"]'
    },
    {
      title: 'Periksa tugas dan notifikasi',
      body: 'Lonceng menampilkan pekerjaan atau informasi yang perlu ditinjau. Tanda angka berarti ada notifikasi belum dibaca.',
      voice: 'Periksa tombol lonceng untuk pekerjaan atau informasi yang belum dibaca.',
      target: '[data-tour="notifications"]'
    },
    {
      title: 'Amankan akun Admin TU',
      body: 'Buka menu profil untuk memeriksa identitas atau keluar setelah pekerjaan administrasi selesai.',
      voice: 'Gunakan tombol profil untuk memeriksa identitas dan keluar dengan aman.',
      target: '[data-tour="profile"]'
    },
    {
      title: 'Buka panduan kapan saja',
      body: 'Tombol buku membuka tutorial ini kembali saat Anda perlu mengulang alur administrasi.',
      voice: 'Tombol buku membuka tutorial ini kembali kapan saja. Anda siap menggunakan SIAB2 sebagai Admin TU.',
      target: '[data-tour="tutorial-button"]'
    }
  ];
}

function readVoicePreference() {
  try {
    return localStorage.getItem(VOICE_PREFERENCE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function storeVoicePreference(enabled: boolean) {
  try {
    localStorage.setItem(VOICE_PREFERENCE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Tutorial tetap berjalan jika penyimpanan browser tidak tersedia.
  }
}

function isVisible(rect: DOMRect) {
  return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
}

function spotlightStyle(rect: SpotlightRect): CSSProperties {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function cardStyle(rect: SpotlightRect): CSSProperties {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const cardWidth = Math.min(520, viewportWidth - VIEWPORT_MARGIN * 2);
  const estimatedCardHeight = Math.min(400, viewportHeight - VIEWPORT_MARGIN * 2);
  const gap = 18;
  const clampLeft = (value: number) => Math.max(VIEWPORT_MARGIN, Math.min(value, viewportWidth - cardWidth - VIEWPORT_MARGIN));
  const clampTop = (value: number) => Math.max(VIEWPORT_MARGIN, Math.min(value, viewportHeight - estimatedCardHeight - VIEWPORT_MARGIN));

  if (viewportWidth >= 760 && rect.right < viewportWidth * 0.4 && viewportWidth - rect.right >= cardWidth + gap + VIEWPORT_MARGIN) {
    return { left: rect.right + gap, top: clampTop(rect.top) };
  }
  if (viewportWidth >= 760 && rect.left > viewportWidth * 0.6 && rect.left >= cardWidth + gap + VIEWPORT_MARGIN) {
    return { left: rect.left - cardWidth - gap, top: clampTop(rect.top) };
  }

  const left = clampLeft(rect.left + rect.width / 2 - cardWidth / 2);
  if (rect.bottom + gap + estimatedCardHeight <= viewportHeight - VIEWPORT_MARGIN) return { left, top: rect.bottom + gap };
  if (rect.top - gap - estimatedCardHeight >= VIEWPORT_MARGIN) return { left, top: rect.top - gap - estimatedCardHeight };
  return { left, bottom: VIEWPORT_MARGIN };
}

export function OnboardingTour({ user, manualOpenKey = 0, onRequestSidebar }: { user: User; manualOpenKey?: number; onRequestSidebar?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(readVoicePreference);
  const [targetRect, setTargetRect] = useState<SpotlightRect | null>(null);
  const [compactViewport, setCompactViewport] = useState(() => window.innerWidth <= 768);
  const sidebarOpenedByTour = useRef(false);
  const [loading, setLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const steps = useMemo(() => stepsForRole(String(user?.role || 'ADMIN_TU')), [user?.role]);
  const current = steps[Math.min(step, steps.length - 1)];
  const tutorialVersion = INTERACTIVE_TUTORIAL_VERSION;
  const voiceSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

  useEffect(() => {
    const update = () => setCompactViewport(window.innerWidth <= 768);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ shouldShow?: boolean }>(`/tutorials/me?clientVersion=${encodeURIComponent(tutorialVersion)}`)
      .then((data) => {
        if (cancelled) return;
        if (data.shouldShow) {
          setStep(0);
          setOpen(true);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [tutorialVersion, user?.id]);

  useEffect(() => {
    if (manualOpenKey > 0) {
      setStep(0);
      setOpen(true);
    }
  }, [manualOpenKey]);

  useEffect(() => {
    if (!open || !voiceEnabled || !voiceSupported) return undefined;
    const synthesis = window.speechSynthesis;
    let spoken = false;
    let fallbackTimer = 0;
    const speak = (allowDefaultVoice = false) => {
      if (spoken) return;
      const voices = synthesis.getVoices();
      const indonesianVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith('id'));
      if (!indonesianVoice && !allowDefaultVoice) return;
      const utterance = new SpeechSynthesisUtterance(`${current.title}. ${current.voice || current.body}`);
      utterance.lang = 'id-ID';
      utterance.rate = 0.96;
      utterance.pitch = 1;
      if (indonesianVoice) utterance.voice = indonesianVoice;
      spoken = true;
      synthesis.speak(utterance);
    };
    const onVoicesChanged = () => {
      speak();
      if (spoken) window.clearTimeout(fallbackTimer);
    };
    synthesis.cancel();
    speak();
    if (!spoken) {
      synthesis.addEventListener('voiceschanged', onVoicesChanged, { once: true });
      fallbackTimer = window.setTimeout(() => speak(true), 1200);
    }
    return () => {
      window.clearTimeout(fallbackTimer);
      synthesis.removeEventListener('voiceschanged', onVoicesChanged);
      synthesis.cancel();
    };
  }, [current.body, current.title, current.voice, open, voiceEnabled, voiceSupported]);

  useEffect(() => {
    if (!open || !current.target) {
      if (sidebarOpenedByTour.current) {
        sidebarOpenedByTour.current = false;
        onRequestSidebar?.(false);
      }
      setTargetRect(null);
      return undefined;
    }

    let active = true;
    let activeTarget: HTMLElement | null = null;
    const refreshTimers: number[] = [];
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    const mobileNavTarget = compactViewport && current.target.startsWith('[data-tour="nav:');
    if (mobileNavTarget) {
      sidebarOpenedByTour.current = true;
      onRequestSidebar?.(true);
    } else if (sidebarOpenedByTour.current) {
      sidebarOpenedByTour.current = false;
      onRequestSidebar?.(false);
    }
    const selectors = mobileNavTarget
      ? [current.target]
      : compactViewport && current.compactTarget
        ? [current.compactTarget, current.target]
        : [current.target, current.compactTarget].filter(Boolean) as string[];

    const findTarget = () => selectors
      .map((selector) => document.querySelector<HTMLElement>(selector))
      .find((element) => element && isVisible(element.getBoundingClientRect())) || null;
    const firstTarget = findTarget() || document.querySelector<HTMLElement>(selectors[0]);
    firstTarget?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });

    const update = () => {
      if (!active) return;
      const target = findTarget();
      if (!target) {
        setTargetRect(null);
        return;
      }
      if (target !== activeTarget) {
        activeTarget = target;
        target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        resizeObserver?.disconnect();
        mutationObserver?.disconnect();
        if ('ResizeObserver' in window) {
          resizeObserver = new ResizeObserver(update);
          resizeObserver.observe(target);
          if (target.parentElement) resizeObserver.observe(target.parentElement);
        }
        mutationObserver = new MutationObserver(update);
        mutationObserver.observe(target.parentElement || target, { attributes: true, childList: true, characterData: true, subtree: true });
      }
      const rect = target.getBoundingClientRect();
      const padding = 7;
      const left = Math.max(0, rect.left - padding);
      const top = Math.max(0, rect.top - padding);
      const right = Math.min(window.innerWidth, rect.right + padding);
      const bottom = Math.min(window.innerHeight, rect.bottom + padding);
      setTargetRect({ top, right, bottom, left, width: right - left, height: bottom - top });
    };

    update();
    refreshTimers.push(window.setTimeout(update, 50), window.setTimeout(update, 180), window.setTimeout(update, 360));
    void document.fonts?.ready.then(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      active = false;
      refreshTimers.forEach((timer) => window.clearTimeout(timer));
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [compactViewport, current.compactTarget, current.target, onRequestSidebar, open]);

  useEffect(() => () => {
    if (sidebarOpenedByTour.current) onRequestSidebar?.(false);
  }, [onRequestSidebar]);

  function closeRequestedSidebar() {
    if (!sidebarOpenedByTour.current) return;
    sidebarOpenedByTour.current = false;
    onRequestSidebar?.(false);
  }

  async function complete() {
    setLoading(true);
    try {
      await apiFetch('/tutorials/me/complete', { method: 'POST', body: JSON.stringify({ version: tutorialVersion }) });
    } catch {
      // Tutorial tetap dapat ditutup saat jaringan tidak tersedia.
    } finally {
      setLoading(false);
      closeRequestedSidebar();
      setOpen(false);
    }
  }

  async function dismiss() {
    setLoading(true);
    try {
      await apiFetch('/tutorials/me/dismiss', { method: 'POST', body: JSON.stringify({ version: tutorialVersion }) });
    } catch {
      // Pengguna dapat membuka ulang tutorial dari tombol panduan.
    } finally {
      setLoading(false);
      closeRequestedSidebar();
      setOpen(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cardRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); void dismiss(); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(cardRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!cardRef.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); opener?.focus(); };
  }, [open]);

  function openAction(path: string) {
    closeRequestedSidebar();
    setOpen(false);
    void apiFetch('/tutorials/me/dismiss', { method: 'POST', body: JSON.stringify({ version: tutorialVersion }) }).catch(() => undefined);
    go(path);
  }

  function toggleVoice() {
    setVoiceEnabled((enabled) => {
      storeVoicePreference(!enabled);
      return !enabled;
    });
  }

  if (!open) return null;

  return <div className={`tour-backdrop${targetRect ? ' has-target' : ''}`} role="dialog" aria-modal="true" aria-label="Tutorial awal" data-tutorial-dialog="true">
    <span className="tour-announcement" role="status" aria-live="polite" aria-atomic="true">{current.title}. {current.body}</span>
    {targetRect && <div className="tour-spotlight" style={spotlightStyle(targetRect)} aria-hidden="true" />}
    <div ref={cardRef} className={`tour-card${targetRect ? ' tour-card-anchored' : ''}`} style={targetRect ? cardStyle(targetRect) : undefined}>
      <div className="tour-top">
        <div className="tour-heading"><div className="tour-icon"><BookOpen size={20} /></div><div><div className="eyebrow"><span className="dot" /> TUTORIAL AWAL</div><h2>{current.title}</h2></div></div>
        <div className="tour-tools">{voiceSupported && <IconBtn label={voiceEnabled ? 'Matikan panduan suara' : 'Nyalakan panduan suara'} aria-pressed={voiceEnabled} onClick={toggleVoice}>{voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}</IconBtn>}<IconBtn label="Tutup tutorial" onClick={dismiss}><X size={16} /></IconBtn></div>
      </div>
      <div className="tour-copy"><p>{current.body}</p>{targetRect && <span className="tour-target-note">Lihat area yang disorot pada layar.</span>}</div>
      <div className="tour-progress" aria-label={`Langkah ${step + 1} dari ${steps.length}`}>{steps.map((item, index) => <span key={item.title} className={index <= step ? 'on' : ''} />)}</div>
      {current.action && <button type="button" className="tour-action" onClick={() => openAction(current.action!.path)}><PlayCircle size={16} /> {current.action.label} <ChevronRight size={14} /></button>}
      <div className="tour-foot"><Btn variant="ghost" disabled={loading} onClick={dismiss}>Lewati dulu</Btn><div className="row" style={{ gap: 8 }}><Btn variant="ghost" disabled={step === 0 || loading} onClick={() => setStep((value) => Math.max(0, value - 1))}>Kembali</Btn>{step < steps.length - 1 ? <Btn variant="primary" onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>Lanjut <ArrowRight size={14} /></Btn> : <Btn variant="primary" loading={loading} onClick={complete}><Check size={14} /> Selesai</Btn>}</div></div>
    </div>
  </div>;
}
