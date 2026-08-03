import type { DemoActionType, DemoRole } from './world';

export type CoachStep = {
  id: string;
  title: string;
  body: string;
  analogy: string;
  voice: string;
  target?: string;
  /** Navigate lab screen when this step becomes active */
  goToScreen?: string;
  /** Pause auto-advance until one of these demo actions is dispatched */
  waitForAction?: DemoActionType | DemoActionType[];
  /** Fixed timer when voice is off or speech unavailable (ms) */
  autoMs?: number;
  /** Prefer waiting for speech end when voice is on */
  autoAdvance?: 'speech' | 'ms' | false;
  completeMission?: boolean;
  hintRoleJump?: DemoRole;
};

export type LearningPathItem = {
  role: DemoRole;
  order: number;
  missionTitle: string;
  missionGoal: string;
};

/** Ordered hub learning path (presentation-friendly). */
export const LEARNING_PATH: LearningPathItem[] = [
  {
    role: 'admin-tu',
    order: 1,
    missionTitle: 'Putuskan izin personel',
    missionGoal: 'Setujui izin, lalu lihat dampak ke Guru, Kepala, dan Piket.'
  },
  {
    role: 'guru',
    order: 2,
    missionTitle: 'Buka sesi & isi hadir',
    missionGoal: 'Buka sesi kelas, tandai hadir, tutup sesi — Siswa ikut berubah.'
  },
  {
    role: 'siswa',
    order: 3,
    missionTitle: 'Baca papan kehadiran',
    missionGoal: 'Pahami mode baca saja dan bagaimana aksi guru mengubah angka.'
  },
  {
    role: 'guru-piket',
    order: 4,
    missionTitle: 'Catat & buka masalah',
    missionGoal: 'Isi buku jaga dan nyalakan tanda masalah untuk Admin.'
  },
  {
    role: 'operator-it',
    order: 5,
    missionTitle: 'Jaga status scanner',
    missionGoal: 'Naik-turunkan HP scanner online agar petugas lain melihat indikator.'
  },
  {
    role: 'kepala-sekolah',
    order: 6,
    missionTitle: 'Minta klarifikasi',
    missionGoal: 'Pantau ringkasan read-only dan minta petugas menindaklanjuti.'
  }
];

function endStep(overrides: Partial<CoachStep> = {}): CoachStep {
  return {
    id: 'end',
    title: 'Misi selesai — coba peran lain',
    body: 'Kamu sudah menyelesaikan alur inti peran ini. Pakai chip ganti peran atau kembali ke Hub untuk jalur berikutnya. Data tetap mainan di browser.',
    analogy: 'Seperti bab sandiwara: babak ini selesai, tapi panggung yang sama dipakai peran lain.',
    voice:
      'Misi selesai. Kamu sudah menyelesaikan alur inti peran ini. Ganti peran lewat chip di sidebar, atau kembali ke Hub untuk jalur belajar berikutnya. Ingat, data di lab hanya mainan di browser ini.',
    target: '[data-demo="role-switch"]',
    autoMs: 8000,
    autoAdvance: 'speech',
    completeMission: true,
    ...overrides
  };
}

export function coachStepsForRole(role: DemoRole): CoachStep[] {
  if (role === 'admin-tu') {
    return [
      {
        id: 'welcome',
        title: 'Misi Admin / TU: putuskan izin',
        body: 'Ini dunia LATIHAN. Tidak mengubah absensi sekolah asli. Kita akan setujui izin guru, lalu melihat dampak ke peran lain.',
        analogy: 'Simulator setir: mirip mobil beneran, tapi tidak keluar ke jalan raya.',
        voice:
          'Selamat datang di Lab Belajar sebagai Admin T U. Ini dunia latihan. Data mainan, tidak mengubah absensi sekolah asli. Misi kamu: setujui izin guru, lalu amati dampak ke Guru, Kepala Sekolah, dan Guru Piket.',
        autoMs: 7500,
        autoAdvance: 'speech'
      },
      {
        id: 'sidebar',
        title: 'Menu kiri = peta kerja harian',
        body: 'Sidebar meniru portal SIAB2. Di lab, hanya menu beraksi yang interaktif; menu lain penanda posisi.',
        analogy: 'Daftar mainan di rak — pilih satu, buka ceritanya.',
        voice:
          'Perhatikan menu kiri. Ini peta kerja harian Admin T U, mirip portal SIAB2 asli. Di lab, fokus kita pada Izin Personel, masalah, perangkat, dan notifikasi. Menu lain sengaja disederhanakan.',
        target: '[data-demo="sidebar"]',
        autoMs: 7500,
        autoAdvance: 'speech'
      },
      {
        id: 'open-izin',
        title: 'Buka Izin Personel',
        body: 'Klik menu Izin Personel (atau biarkan panduan membuka halaman itu).',
        analogy: 'Membuka laci surat di kantor TU.',
        voice:
          'Sekarang buka menu Izin Personel. Panduan akan menyorot menu itu. Di production, di sinilah antrian izin guru dan staf diputuskan.',
        target: '[data-demo="nav-izin"]',
        goToScreen: 'izin',
        autoMs: 7000,
        autoAdvance: 'speech'
      },
      {
        id: 'approve',
        title: 'Setujui izin (aksi wajib)',
        body: 'Tekan tombol Setujui izin. Panduan menunggu sampai kamu melakukannya.',
        analogy: 'Remote TV: tekan sekali, saluran di kelas ikut ganti.',
        voice:
          'Tekan tombol Setujui izin pada antrian Pak Budi. Ini aksi wajib. Panduan tidak lanjut sampai kamu menekan tombol itu. Setelah disetujui, muncul panel dampak keputusan.',
        target: '[data-demo="approve-leave"]',
        goToScreen: 'izin',
        waitForAction: 'APPROVE_LEAVE',
        autoAdvance: false
      },
      {
        id: 'impact',
        title: 'Menu ajaib: dampak lintas peran',
        body: 'Panel ini menunjukkan siapa yang terdampak. Kamu bisa lompat ke peran Guru untuk melihat notifikasi hijau.',
        analogy: 'Satu remote, banyak layar di ruangan berbeda.',
        voice:
          'Ini menu ajaib dampak keputusan. Satu aksi Admin mengubah layar Guru, Kepala Sekolah, dan Piket. Kamu boleh menutup panel, atau menekan kartu peran untuk berpindah di dunia latihan yang sama.',
        target: '[data-demo="impact-panel"]',
        autoMs: 8000,
        autoAdvance: 'speech',
        hintRoleJump: 'guru'
      },
      {
        id: 'notif',
        title: 'Cek notifikasi lab',
        body: 'Lonceng dan menu Notifikasi menyimpan pesan mainan antar peran.',
        analogy: 'Papan pengumuman di ruang guru.',
        voice:
          'Buka notifikasi untuk melihat pesan yang dikirim sistem lab setelah keputusan izin. Di production, lonceng menandai tugas yang belum dibaca.',
        target: '[data-demo="tutorial-button"]',
        goToScreen: 'notifikasi',
        autoMs: 7000,
        autoAdvance: 'speech'
      },
      {
        id: 'timeline',
        title: 'Jejak dampak di bawah halaman',
        body: 'Setiap aksi penting tercatat di jejak dampak. Berguna saat presentasi ke rekan.',
        analogy: 'Buku harian sandiwara: siapa beraksi, siapa terpengaruh.',
        voice:
          'Di bagian bawah halaman ada jejak dampak terbaru. Gunakan ini saat menjelaskan alur ke rekan kerja: siapa beraksi, peran mana yang terpengaruh.',
        target: '[data-demo="impact-dock"]',
        autoMs: 7000,
        autoAdvance: 'speech'
      },
      endStep({
        body: 'Lanjut ke jalur Guru Mapel untuk mengisi presensi, atau Kepala Sekolah untuk mode pantau.',
        voice:
          'Misi Admin selesai. Lanjut ke jalur Guru Mapel untuk mengisi presensi, atau Kepala Sekolah untuk mode pantau. Gunakan Hub jika ingin melihat progress jalur belajar.',
        hintRoleJump: 'guru'
      })
    ];
  }

  if (role === 'guru') {
    return [
      {
        id: 'welcome',
        title: 'Misi Guru Mapel: isi presensi kelas',
        body: 'Alur lab: buka sesi → tandai hadir → tutup sesi. Semua mainan, tapi urutannya sama seperti kerja harian.',
        analogy: 'Wasit pertandingan: peluit buka, skor hadir, peluit tutup.',
        voice:
          'Selamat datang sebagai Guru Mapel di Lab Belajar. Misi kamu: buka sesi Matematika X I P A 1, tandai siswa hadir, lalu tutup sesi. Data mainan, tetapi urutan langkahnya meniru kerja harian.',
        autoMs: 7500,
        autoAdvance: 'speech'
      },
      {
        id: 'dash',
        title: 'Ringkasan mengajar',
        body: 'Dasbor menampilkan sesi hari ini. Aksi cepat mengarah ke Presensi Kelas.',
        analogy: 'Papan jadwal di ruang guru.',
        voice:
          'Ini ringkasan mengajar. Periksa sesi yang menjadi tanggung jawabmu hari ini. Dari sini kamu bisa masuk ke Isi Presensi Kelas.',
        target: '[data-demo="sidebar"]',
        goToScreen: 'dashboard',
        autoMs: 7000,
        autoAdvance: 'speech'
      },
      {
        id: 'open-presensi',
        title: 'Masuk Presensi Kelas',
        body: 'Buka menu Isi Presensi Kelas. Workspace lab meniru alur buka–isi–tutup.',
        analogy: 'Membuka pintu kelas sebelum absen.',
        voice:
          'Buka menu Isi Presensi Kelas. Di production kamu memilih sesi yang benar dulu. Di lab, sesi Matematika X I P A 1 sudah disiapkan.',
        target: '[data-demo="nav-presensi"]',
        goToScreen: 'presensi',
        autoMs: 7000,
        autoAdvance: 'speech'
      },
      {
        id: 'open-session',
        title: 'Buka sesi (wajib)',
        body: 'Tekan Buka sesi. Panduan menunggu aksi ini.',
        analogy: 'Peluit mulai pertandingan.',
        voice:
          'Tekan tombol Buka sesi. Ini langkah wajib. Tanpa sesi dibuka, presensi tidak boleh diisi. Panduan menunggu sampai tombol itu ditekan.',
        target: '[data-demo="open-session"]',
        goToScreen: 'presensi',
        waitForAction: 'OPEN_SESSION',
        autoAdvance: false
      },
      {
        id: 'mark-present',
        title: 'Tandai siswa hadir (wajib)',
        body: 'Tekan Tandai 8 siswa hadir. Di lab ini batch cepat; di production kamu menandai per siswa.',
        analogy: 'Mengisi skor papan — angka naik untuk penonton (Siswa & Admin).',
        voice:
          'Tekan Tandai delapan siswa hadir. Di lab ini batch cepat agar presentasi singkat. Di production, status diisi per siswa. Panduan menunggu aksi ini.',
        target: '[data-demo="mark-present"]',
        goToScreen: 'presensi',
        waitForAction: 'MARK_PRESENT',
        autoAdvance: false
      },
      {
        id: 'close-session',
        title: 'Tutup sesi (disarankan)',
        body: 'Tekan Tutup sesi agar status menjadi selesai. Opsional untuk lanjut, tetapi bagus untuk kebiasaan baik.',
        analogy: 'Peluit panjang penutup.',
        voice:
          'Jika sesi masih terbuka, tekan Tutup sesi. Di production, sesi yang lupa ditutup bisa memicu rekonsiliasi. Di lab kamu boleh melewati jika terburu-buru, atau menekan tombol lalu Lanjut.',
        target: '[data-demo="close-session"]',
        goToScreen: 'presensi',
        autoMs: 8000,
        autoAdvance: 'speech'
      },
      {
        id: 'impact-siswa',
        title: 'Dampak ke Siswa & Admin',
        body: 'Setelah menandai hadir, panel dampak dan papan Siswa berubah. Coba ganti peran ke Siswa di tab yang sama.',
        analogy: 'Papan skor stadion — pemain mencetak, penonton melihat.',
        voice:
          'Aksi presensi mengirim dampak ke Siswa dan Admin. Gunakan chip ganti peran atau kartu di panel dampak untuk membuka peran Siswa di dunia yang sama. Angka kehadiran Alya akan berubah.',
        target: '[data-demo="impact-dock"]',
        autoMs: 8000,
        autoAdvance: 'speech',
        hintRoleJump: 'siswa'
      },
      {
        id: 'izin-saya',
        title: 'Opsional: ajukan izin guru',
        body: 'Menu Izin Saya mengirim pengajuan ke antrian Admin TU — bagus untuk demo putaran kedua.',
        analogy: 'Menaruh surat di kotak TU.',
        voice:
          'Opsional: buka Izin Saya dan kirim pengajuan baru. Admin T U akan melihat antrian. Berguna jika kamu ingin mengulang misi Admin setelah ini.',
        target: '[data-demo="nav-izin-saya"]',
        goToScreen: 'izin-saya',
        autoMs: 7000,
        autoAdvance: 'speech'
      },
      endStep({
        body: 'Lanjut ke Siswa untuk melihat papan, atau Admin untuk memutus izin.',
        voice:
          'Misi Guru Mapel selesai. Lanjut ke peran Siswa untuk melihat papan kehadiran, atau kembali ke Admin untuk memutus izin. Kamu sudah siap menjelaskan alur kelas.',
        hintRoleJump: 'siswa'
      })
    ];
  }

  if (role === 'siswa') {
    return [
      {
        id: 'welcome',
        title: 'Misi Siswa: baca, jangan ubah',
        body: 'Siswa hanya membaca cerita kehadiran. Aksi guru dan petugas yang mengubah angka.',
        analogy: 'Pemegang tiket: melihat jam tayang, tidak menyetir bis.',
        voice:
          'Selamat datang sebagai Siswa di Lab Belajar. Peran ini hanya membaca. Kamu tidak mengisi presensi sendiri. Angka berubah jika Guru atau petugas beraksi di peran lain pada browser yang sama.',
        autoMs: 7500,
        autoAdvance: 'speech'
      },
      {
        id: 'board',
        title: 'Papan kehadiran hari ini',
        body: 'Gate, kelas, sholat, dan pulang ditampilkan sebagai status. Perhatikan bagian kelas setelah Guru menandai hadir.',
        analogy: 'Papan skor di stadion.',
        voice:
          'Ini papan kehadiranmu. Gerbang masuk, kelas, sholat, dan pulang. Jika Guru Mapel sudah menandai hadir di lab, status kelas akan berubah. Coba bandingkan sebelum dan sesudah misi Guru.',
        target: '[data-demo="student-board"]',
        goToScreen: 'dashboard',
        autoMs: 8000,
        autoAdvance: 'speech'
      },
      {
        id: 'readonly',
        title: 'Tidak ada tombol ubah presensi',
        body: 'Desain production: siswa tidak self-submit absensi kelas. Koreksi lewat guru atau petugas.',
        analogy: 'Tiket sudah dicetak — ubah hanya di loket.',
        voice:
          'Perhatikan: tidak ada tombol untuk mengubah sendiri status hadir kelas. Itu disengaja. Di SIAB2, koreksi dilakukan guru mapel, wali kelas, atau petugas berwenang.',
        target: '[data-demo="student-board"]',
        autoMs: 7500,
        autoAdvance: 'speech'
      },
      {
        id: 'cross-role',
        title: 'Coba putar peran Guru',
        body: 'Ganti ke Guru Mapel, isi presensi, lalu kembali ke Siswa — dunia localStorage-nya sama.',
        analogy: 'Ganti kostum di panggung yang sama.',
        voice:
          'Pakai chip ganti peran di sidebar untuk menjadi Guru Mapel. Isi presensi, lalu kembali ke Siswa. Dunia latihan disimpan di browser, jadi angkanya konsisten antar peran.',
        target: '[data-demo="role-switch"]',
        autoMs: 8000,
        autoAdvance: 'speech',
        hintRoleJump: 'guru'
      },
      {
        id: 'notif',
        title: 'Notifikasi & pesan sekolah',
        body: 'Pesan lab muncul di notifikasi. Di production ini bisa pengumuman atau status penting.',
        analogy: 'SMS sekolah, versi papan digital.',
        voice:
          'Buka notifikasi untuk membaca pesan mainan dari sekolah. Di production, lonceng menandai informasi yang perlu kamu baca.',
        goToScreen: 'notifikasi',
        autoMs: 6500,
        autoAdvance: 'speech'
      },
      endStep({
        body: 'Kembali ke Hub atau coba Admin/Piket untuk memahami petugas lain.',
        voice:
          'Misi Siswa selesai. Kamu memahami mode baca saja. Kembali ke Hub, atau coba peran Admin dan Piket untuk melihat sisi petugas.',
        hintRoleJump: 'admin-tu'
      })
    ];
  }

  if (role === 'kepala-sekolah') {
    return [
      {
        id: 'welcome',
        title: 'Misi Kepala: pantau & minta klarifikasi',
        body: 'Akses production read-only. Di lab kamu bisa minta klarifikasi agar petugas mendapat tugas.',
        analogy: 'Kapten di anjungan: lihat peta, radio ke awak.',
        voice:
          'Selamat datang sebagai Kepala Sekolah. Di production aksesmu baca saja. Di lab, misi kamu membaca ringkasan lalu meminta klarifikasi agar Admin dan Piket mendapat notifikasi.',
        autoMs: 7500,
        autoAdvance: 'speech'
      },
      {
        id: 'summary',
        title: 'Baca ringkasan sekolah',
        body: 'Panel menampilkan kelengkapan siswa, staf, masalah, dan gerbang — untuk keputusan, bukan entri data.',
        analogy: 'Peta kapal: arah, bukan dayung.',
        voice:
          'Perhatikan ringkasan. Cakupan siswa, staf hadir, masalah terbuka, dan scan gerbang. Gunakan angka ini untuk memutuskan siapa yang perlu dihubungi, bukan untuk mengubah data harian.',
        target: '[data-tour="principal-summary"]',
        goToScreen: 'dashboard',
        autoMs: 8000,
        autoAdvance: 'speech'
      },
      {
        id: 'clarity',
        title: 'Minta klarifikasi (wajib)',
        body: 'Tekan tombol Klarifikasi. Panduan menunggu aksi ini.',
        analogy: 'Radio kapal: “Tolong cek peta lagi.”',
        voice:
          'Tekan tombol Klarifikasi. Ini aksi lab yang mengirim tugas ke Admin T U dan Guru Piket. Panduan menunggu sampai tombol ditekan.',
        target: '[data-demo="kepala-clarity"]',
        goToScreen: 'dashboard',
        waitForAction: 'KEPALA_REQUEST_CLARITY',
        autoAdvance: false
      },
      {
        id: 'impact',
        title: 'Dampak ke petugas',
        body: 'Admin dan Piket menerima notifikasi. Kamu tetap tidak mengubah data master.',
        analogy: 'Perintah dari anjungan, eksekusi di geladak.',
        voice:
          'Panel dampak menunjukkan petugas yang harus menindaklanjuti. Kepala memantau dan mengarahkan; Admin dan Piket yang mengeksekusi di lapangan.',
        target: '[data-demo="impact-panel"]',
        autoMs: 7500,
        autoAdvance: 'speech',
        hintRoleJump: 'admin-tu'
      },
      {
        id: 'izin-pantau',
        title: 'Pantau antrian izin (read-only)',
        body: 'Menu Izin Personel untuk Kepala bersifat pantau — tidak ada tombol setujui.',
        analogy: 'Melihat kotak surat tanpa membuka gembok.',
        voice:
          'Buka Izin Personel. Sebagai Kepala, kamu memantau antrian tanpa menekan setujui atau tolak. Keputusan operasional ada di Admin T U.',
        goToScreen: 'izin',
        autoMs: 7000,
        autoAdvance: 'speech'
      },
      endStep({
        body: 'Lanjut ke Admin jika ingin melihat sisi eksekusi keputusan.',
        voice:
          'Misi Kepala Sekolah selesai. Lanjut ke Admin T U untuk melihat eksekusi, atau Hub untuk jalur lain.',
        hintRoleJump: 'admin-tu'
      })
    ];
  }

  if (role === 'operator-it') {
    return [
      {
        id: 'welcome',
        title: 'Misi Operator IT: jaga mesin scanner',
        body: 'Naik-turunkan status HP scanner. Admin dan Piket melihat indikator yang sama.',
        analogy: 'Montir bengkel: lampu hijau = mesin hidup.',
        voice:
          'Selamat datang sebagai Operator I T. Misi kamu menjaga status HP scanner di lab. Ketika scanner offline, Admin dan Piket harus melihat peringatan yang sama.',
        autoMs: 7500,
        autoAdvance: 'speech'
      },
      {
        id: 'dash',
        title: 'Cek sistem dulu',
        body: 'Dasbor merangkum kesiapan perangkat sebelum jam masuk.',
        analogy: 'Checklist bengkel pagi.',
        voice:
          'Mulai dari Cek Sistem. Pastikan ringkasan scanner dan kartu terbaca sebelum mengubah status di menu perangkat.',
        goToScreen: 'dashboard',
        autoMs: 6500,
        autoAdvance: 'speech'
      },
      {
        id: 'devices',
        title: 'Buka HP Scanner & Kartu',
        body: 'Masuk ke menu perangkat untuk kontrol lab online/offline.',
        analogy: 'Membuka kap mesin.',
        voice:
          'Buka HP Scanner dan Kartu. Di production di sini aktivasi Android reader dan kartu. Di lab, fokus pada tombol online dan offline.',
        target: '[data-demo="operator-devices"]',
        goToScreen: 'perangkat',
        autoMs: 7000,
        autoAdvance: 'speech'
      },
      {
        id: 'toggle',
        title: 'Ubah status scanner (wajib)',
        body: 'Tekan Scanner +1 online atau −1 offline. Panduan menunggu salah satu aksi.',
        analogy: 'Saklar lampu gerbang.',
        voice:
          'Tekan Scanner plus satu online, atau minus satu offline. Panduan menunggu sampai status berubah. Admin dan Piket akan melihat dampaknya.',
        target: '[data-demo="reader-online"]',
        goToScreen: 'perangkat',
        waitForAction: ['SET_READER_ONLINE', 'SET_READER_OFFLINE'],
        autoAdvance: false
      },
      {
        id: 'impact',
        title: 'Dampak ke Admin & Piket',
        body: 'Indikator perangkat di peran lain ikut berubah pada dunia yang sama.',
        analogy: 'Satu saklar, banyak lampu indikator.',
        voice:
          'Lihat panel dampak. Status scanner terasa di Admin dan Piket. Ganti peran untuk membuktikan indikatornya sama.',
        target: '[data-demo="impact-panel"]',
        autoMs: 7500,
        autoAdvance: 'speech',
        hintRoleJump: 'admin-tu'
      },
      endStep({
        body: 'Lanjut ke Piket atau Admin untuk melihat sisi operasional non-teknis.',
        voice:
          'Misi Operator I T selesai. Lanjut ke Guru Piket atau Admin untuk sisi operasional non-teknis.',
        hintRoleJump: 'guru-piket'
      })
    ];
  }

  // guru-piket
  return [
    {
      id: 'welcome',
      title: 'Misi Guru Piket: jaga pos harian',
      body: 'Catat kejadian dan buka tanda masalah. Admin serta Kepala ikut melihat.',
      analogy: 'Petugas jaga pos: buku catatan dan lampu kuning.',
      voice:
        'Selamat datang sebagai Guru Piket. Misi kamu mencatat kejadian di buku jaga dan membuka tanda masalah jika data tidak cocok. Admin dan Kepala akan melihat dampaknya.',
      autoMs: 7500,
      autoAdvance: 'speech'
    },
    {
      id: 'dash',
      title: 'Tugas piket hari ini',
      body: 'Dasbor menampilkan prioritas: sesi, masalah, dan catatan.',
      analogy: 'Papan tugas di pos gerbang.',
      voice:
        'Lihat tugas piket hari ini. Prioritaskan masalah terbuka dan catatan yang belum selesai sebelum jam sibuk.',
      goToScreen: 'dashboard',
      autoMs: 6500,
      autoAdvance: 'speech'
    },
    {
      id: 'picket',
      title: 'Buka Catatan Piket',
      body: 'Masuk ke buku jaga untuk mencatat kejadian.',
      analogy: 'Membuka buku pos.',
      voice:
        'Buka menu Catatan Piket. Di production, catatan ini membantu pergantian petugas memahami apa yang sudah terjadi.',
      target: '[data-demo="nav-picket"]',
      goToScreen: 'picket',
      autoMs: 6500,
      autoAdvance: 'speech'
    },
    {
      id: 'log',
      title: 'Catat kejadian (wajib)',
      body: 'Tekan Catat kejadian. Panduan menunggu aksi ini.',
      analogy: 'Menulis baris baru di buku jaga.',
      voice:
        'Tekan tombol Catat kejadian. Panduan menunggu sampai catatan baru masuk. Ini melatih kebiasaan menulis jejak operasional.',
      target: '[data-demo="log-picket"]',
      goToScreen: 'picket',
      waitForAction: 'LOG_PICKET',
      autoAdvance: false
    },
    {
      id: 'flag',
      title: 'Opsional: buka tanda masalah',
      body: 'Tekan Buka tanda masalah untuk menambah antrian rekonsiliasi lab.',
      analogy: 'Menyalakan lampu kuning di pos.',
      voice:
        'Opsional: tekan Buka tanda masalah. Admin T U bisa menyelesaikan flag itu di menu Cek Masalah. Berguna untuk demo lintas peran.',
      target: '[data-demo="open-flag"]',
      goToScreen: 'picket',
      autoMs: 7000,
      autoAdvance: 'speech'
    },
    {
      id: 'masalah',
      title: 'Lihat antrian masalah',
      body: 'Menu Cek Masalah menampilkan flag terbuka. Admin yang menyelesaikan di lab.',
      analogy: 'Papan tiket gangguan.',
      voice:
        'Buka Cek Masalah untuk melihat antrian. Di lab, Admin yang menekan selesai. Piket memastikan masalah terpantau sepanjang hari.',
      goToScreen: 'masalah',
      autoMs: 7000,
      autoAdvance: 'speech'
    },
    endStep({
      body: 'Lanjut ke Admin untuk menyelesaikan masalah, atau Operator untuk status scanner.',
      voice:
        'Misi Guru Piket selesai. Lanjut ke Admin untuk menyelesaikan masalah, atau Operator I T untuk status scanner.',
      hintRoleJump: 'admin-tu'
    })
  ];
}

export function missionTitleForRole(role: DemoRole): string {
  return LEARNING_PATH.find((item) => item.role === role)?.missionTitle || 'Misi lab';
}
