import type { DemoRole } from './world';

export type CoachStep = {
  id: string;
  title: string;
  body: string;
  analogy: string;
  voice?: string;
  target?: string;
  autoMs?: number;
};

export function coachStepsForRole(role: DemoRole): CoachStep[] {
  const commonEnd: CoachStep = {
    id: 'end',
    title: 'Kamu sudah siap mencoba!',
    body: 'Pakai tombol aksi di halaman. Setelah memutuskan, muncul “Dampak keputusan” — itu menu ajaib lintas peran.',
    analogy: 'Seperti main sandiwara: satu orang beraksi, penonton di peran lain melihat cerita berubah.',
    target: '[data-demo="impact-dock"]',
    autoMs: 7000
  };

  if (role === 'admin-tu') {
    return [
      {
        id: 'welcome',
        title: 'Halo, Admin / TU!',
        body: 'Ini dunia LATIHAN. Data mainan. Tidak mengubah absensi sekolah asli.',
        analogy: 'Seperti simulator setir: mirip mobil beneran, tapi tidak keluar ke jalan raya.',
        autoMs: 6500
      },
      {
        id: 'nav',
        title: 'Menu kiri = peta kerja',
        body: 'Setiap baris menu membawa tugas harian Admin TU. Di lab, isinya ringkas agar mudah dipelajari.',
        analogy: 'Menu kiri seperti daftar mainan di rak — pilih satu, buka ceritanya.',
        target: '[data-demo="sidebar"]',
        autoMs: 6500
      },
      {
        id: 'leave',
        title: 'Coba setujui izin guru',
        body: 'Buka Izin Personel, lalu tekan Setujui. Lihat panel dampak ke Guru, Kepala, dan Piket.',
        analogy: 'Remote TV di kantor TU: tekan sekali, saluran di kelas ikut ganti.',
        target: '[data-demo="nav-izin"]',
        autoMs: 7000
      },
      commonEnd
    ];
  }

  if (role === 'guru') {
    return [
      {
        id: 'welcome',
        title: 'Halo, Guru Mapel!',
        body: 'Tugasmu di lab: buka sesi, isi hadir, tutup kelas. Semua mainan.',
        analogy: 'Kamu wasit pertandingan: peluit = buka sesi, skor = jumlah hadir.',
        autoMs: 6500
      },
      {
        id: 'session',
        title: 'Buka sesi dulu',
        body: 'Masuk Presensi Kelas, tekan Buka Sesi, lalu Tandai Hadir. Siswa & Admin akan melihat dampaknya.',
        analogy: 'Membuka pintu kelas: semua tahu pelajaran mulai.',
        target: '[data-demo="nav-presensi"]',
        autoMs: 7000
      },
      {
        id: 'leave',
        title: 'Ajukan izin (opsional)',
        body: 'Dari Izin Saya, kirim pengajuan. Admin TU akan melihat antrian baru.',
        analogy: 'Menaruh surat di kotak TU — petugas lain melihat kotak terisi.',
        target: '[data-demo="nav-izin-saya"]',
        autoMs: 6500
      },
      commonEnd
    ];
  }

  if (role === 'siswa') {
    return [
      {
        id: 'welcome',
        title: 'Halo, Siswa!',
        body: 'Layar ini hanya membaca cerita. Aksi guru & admin yang mengubah angkamu.',
        analogy: 'Kamu pemegang tiket: melihat jam tayang, tidak menyetir bis.',
        autoMs: 6500
      },
      {
        id: 'board',
        title: 'Papan kehadiranmu',
        body: 'Angka berubah jika guru mengisi presensi di peran Guru (tab atau link lain di browser yang sama).',
        analogy: 'Papan skor di stadion — pemain mencetak, penonton melihat angka.',
        target: '[data-demo="student-board"]',
        autoMs: 7000
      },
      commonEnd
    ];
  }

  if (role === 'kepala-sekolah') {
    return [
      {
        id: 'welcome',
        title: 'Halo, Kepala Sekolah!',
        body: 'Mode pantau: baca ringkasan, minta klarifikasi, tidak mengutak-atik data harian.',
        analogy: 'Kapten di anjungan: lihat peta & radio ke awak, jarang pegang dayung.',
        autoMs: 6500
      },
      {
        id: 'clarity',
        title: 'Minta klarifikasi',
        body: 'Tekan tombol klarifikasi di ringkasan. Admin & piket dapat tugas notifikasi.',
        analogy: 'Radio kapal: “Tolong cek peta lagi.”',
        target: '[data-demo="kepala-clarity"]',
        autoMs: 7000
      },
      commonEnd
    ];
  }

  if (role === 'operator-it') {
    return [
      {
        id: 'welcome',
        title: 'Halo, Operator IT!',
        body: 'Jaga “mesin” scanner. Naik-turunkan status online di lab.',
        analogy: 'Montir bengkel: lampu hijau = mesin hidup.',
        autoMs: 6500
      },
      {
        id: 'device',
        title: 'Ubah status scanner',
        body: 'Tekan Online/Offline. Admin & Piket melihat indikator berubah.',
        analogy: 'Saklar lampu gerbang — penjaga & kantor sama-sama melihat.',
        target: '[data-demo="operator-devices"]',
        autoMs: 7000
      },
      commonEnd
    ];
  }

  return [
    {
      id: 'welcome',
      title: 'Halo, Guru Piket!',
      body: 'Catat kejadian dan buka tanda masalah. Admin & kepala ikut melihat.',
      analogy: 'Petugas jaga pos: tulis di buku, nyalakan lampu kuning bila perlu.',
      autoMs: 6500
    },
    {
      id: 'picket',
      title: 'Catat & tandai masalah',
      body: 'Gunakan tombol di Catatan Piket. Lihat dampak di menu ajaib.',
      analogy: 'Satu catatan di pos, banyak petugas membaca papan yang sama.',
      target: '[data-demo="nav-picket"]',
      autoMs: 7000
    },
    commonEnd
  ];
}
