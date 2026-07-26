export type DemoRole = 'admin-tu' | 'kepala-sekolah' | 'operator-it' | 'guru-piket' | 'guru' | 'siswa';

export type DemoActionType =
  | 'APPROVE_LEAVE'
  | 'REJECT_LEAVE'
  | 'SUBMIT_LEAVE'
  | 'OPEN_SESSION'
  | 'MARK_PRESENT'
  | 'CLOSE_SESSION'
  | 'LOG_PICKET'
  | 'OPEN_FLAG'
  | 'RESOLVE_FLAG'
  | 'SET_READER_ONLINE'
  | 'SET_READER_OFFLINE'
  | 'KEPALA_REQUEST_CLARITY'
  | 'RESET_WORLD';

export type DemoImpact = {
  role: DemoRole;
  surface: string;
  message: string;
};

export type DemoEvent = {
  id: string;
  at: string;
  actorRole: DemoRole;
  type: DemoActionType;
  summary: string;
  analogy: string;
  impacts: DemoImpact[];
};

export type DemoNotification = {
  id: string;
  text: string;
  unread: boolean;
};

export type DemoWorld = {
  version: 1;
  characters: {
    admin: string;
    kepala: string;
    operator: string;
    piket: string;
    guru: string;
    siswa: string;
    classCode: string;
    subject: string;
  };
  leave: {
    id: string;
    applicant: string;
    type: string;
    reason: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
  };
  session: {
    id: string;
    classCode: string;
    subject: string;
    status: 'SCHEDULED' | 'OPEN' | 'CLOSED';
    presentCount: number;
    totalStudents: number;
  };
  flags: Array<{ id: string; type: string; subject: string; open: boolean }>;
  devices: { readersOnline: number; max: number; lastNote: string };
  notifications: Record<DemoRole, DemoNotification[]>;
  events: DemoEvent[];
  lastImpactEventId?: string;
  stats: {
    staffPresent: number;
    studentComplete: number;
    openProblems: number;
  };
};

export const DEMO_ROLES: Array<{ id: DemoRole; label: string; analogy: string; path: string }> = [
  { id: 'admin-tu', label: 'Admin / TU', analogy: 'Kantor pusat sekolah — pegang remote banyak layar', path: '/belajar/admin-tu' },
  { id: 'kepala-sekolah', label: 'Kepala Sekolah', analogy: 'Kapten kapal — lihat peta, tidak dayung sendiri', path: '/belajar/kepala-sekolah' },
  { id: 'operator-it', label: 'Operator IT', analogy: 'Montir mesin — jaga HP scanner & sistem', path: '/belajar/operator-it' },
  { id: 'guru-piket', label: 'Guru Piket', analogy: 'Petugas jaga gerbang & catatan harian', path: '/belajar/guru-piket' },
  { id: 'guru', label: 'Guru Mapel', analogy: 'Wasit kelas — isi hadir & tutup sesi', path: '/belajar/guru' },
  { id: 'siswa', label: 'Siswa', analogy: 'Pemilik tiket — lihat kehadiran & pesan', path: '/belajar/siswa' }
];

export const WORLD_STORAGE_KEY = 'lab-belajar-world-v1';

function nid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function pushNotif(world: DemoWorld, role: DemoRole, text: string): DemoWorld {
  const item: DemoNotification = { id: nid('n'), text, unread: true };
  return {
    ...world,
    notifications: {
      ...world.notifications,
      [role]: [item, ...world.notifications[role]].slice(0, 12)
    }
  };
}

export function createSeedWorld(): DemoWorld {
  return {
    version: 1,
    characters: {
      admin: 'Bu Rina (TU)',
      kepala: 'Pak Hadi (Kepala)',
      operator: 'Mas Yoga (IT)',
      piket: 'Bu Sari (Piket)',
      guru: 'Pak Budi (Mapel)',
      siswa: 'Alya Putri',
      classCode: 'X-IPA-1',
      subject: 'Matematika'
    },
    leave: {
      id: 'leave_demo_1',
      applicant: 'Pak Budi (Mapel)',
      type: 'IZIN',
      reason: 'Mengantar orang tua ke puskesmas',
      status: 'PENDING'
    },
    session: {
      id: 'session_demo_1',
      classCode: 'X-IPA-1',
      subject: 'Matematika',
      status: 'SCHEDULED',
      presentCount: 0,
      totalStudents: 32
    },
    flags: [
      { id: 'flag_demo_1', type: 'LUPA_TAP_GERBANG', subject: 'Alya Putri', open: true }
    ],
    devices: { readersOnline: 2, max: 3, lastNote: '2 dari 3 HP scanner online' },
    notifications: {
      'admin-tu': [{ id: 'n0', text: 'Ada 1 pengajuan izin menunggu keputusan.', unread: true }],
      'kepala-sekolah': [{ id: 'n0', text: 'Pantau ringkasan kehadiran hari ini.', unread: false }],
      'operator-it': [{ id: 'n0', text: 'Cek status HP scanner sebelum jam masuk.', unread: false }],
      'guru-piket': [{ id: 'n0', text: '1 masalah gerbang masih terbuka.', unread: true }],
      guru: [{ id: 'n0', text: 'Sesi Matematika X-IPA-1 siap dibuka.', unread: true }],
      siswa: [{ id: 'n0', text: 'Belum ada pesan baru dari sekolah.', unread: false }]
    },
    events: [],
    stats: { staffPresent: 18, studentComplete: 240, openProblems: 1 }
  };
}

export type DemoAction = { type: DemoActionType; actorRole: DemoRole };

export function applyDemoAction(world: DemoWorld, action: DemoAction): { world: DemoWorld; event: DemoEvent | null } {
  if (action.type === 'RESET_WORLD') {
    const fresh = createSeedWorld();
    return { world: fresh, event: null };
  }

  const at = new Date().toISOString();
  const base = { id: nid('ev'), at, actorRole: action.actorRole, type: action.type };

  if (action.type === 'APPROVE_LEAVE') {
    if (world.leave.status !== 'PENDING') return { world, event: null };
    let next: DemoWorld = { ...world, leave: { ...world.leave, status: 'APPROVED' } };
    const impacts: DemoImpact[] = [
      { role: 'guru', surface: 'Izin Saya', message: 'Izin Pak Budi disetujui. Notifikasi hijau muncul.' },
      { role: 'kepala-sekolah', surface: 'Ringkasan', message: 'Antrian izin berkurang 1.' },
      { role: 'guru-piket', surface: 'Catatan', message: 'Piket tahu guru mapel izin hari ini.' }
    ];
    next = pushNotif(next, 'guru', 'Izin Anda disetujui oleh Admin TU. Silakan istirahat tenang.');
    next = pushNotif(next, 'kepala-sekolah', 'Admin TU menyetujui izin Pak Budi.');
    next = pushNotif(next, 'guru-piket', 'Pak Budi izin disetujui — sesuaikan jaga kelas bila perlu.');
    next = pushNotif(next, 'admin-tu', 'Keputusan izin tersimpan di dunia latihan.');
    const event: DemoEvent = {
      ...base,
      summary: 'Admin TU menyetujui izin Pak Budi',
      analogy: 'Seperti remote TV: tekan di kantor TU, layar guru & kepala ikut ganti saluran.',
      impacts
    };
    next = { ...next, events: [event, ...next.events].slice(0, 30), lastImpactEventId: event.id };
    return { world: next, event };
  }

  if (action.type === 'REJECT_LEAVE') {
    if (world.leave.status !== 'PENDING') return { world, event: null };
    let next: DemoWorld = { ...world, leave: { ...world.leave, status: 'REJECTED' } };
    const impacts: DemoImpact[] = [
      { role: 'guru', surface: 'Izin Saya', message: 'Izin ditolak — guru melihat alasan di notifikasi.' },
      { role: 'kepala-sekolah', surface: 'Ringkasan', message: 'Status izin diperbarui.' }
    ];
    next = pushNotif(next, 'guru', 'Izin ditolak. Hubungi Admin TU bila perlu klarifikasi.');
    next = pushNotif(next, 'kepala-sekolah', 'Admin TU menolak pengajuan izin Pak Budi.');
    const event: DemoEvent = {
      ...base,
      summary: 'Admin TU menolak izin Pak Budi',
      analogy: 'Tombol merah di remote: saluran “izin disetujui” tidak nyala.',
      impacts
    };
    next = { ...next, events: [event, ...next.events].slice(0, 30), lastImpactEventId: event.id };
    return { world: next, event };
  }

  if (action.type === 'SUBMIT_LEAVE') {
    let next: DemoWorld = {
      ...world,
      leave: {
        id: nid('leave'),
        applicant: world.characters.guru,
        type: 'IZIN',
        reason: 'Keperluan keluarga mendadak (latihan)',
        status: 'PENDING'
      }
    };
    const impacts: DemoImpact[] = [
      { role: 'admin-tu', surface: 'Izin Personel', message: 'Antrian izin baru menunggu keputusan.' },
      { role: 'kepala-sekolah', surface: 'Pantauan', message: 'Ada pengajuan izin yang perlu dipantau.' }
    ];
    next = pushNotif(next, 'admin-tu', 'Pengajuan izin baru dari Pak Budi menunggu review.');
    next = pushNotif(next, 'kepala-sekolah', 'Ada izin personel baru di antrian.');
    next = pushNotif(next, 'guru', 'Pengajuan izin terkirim. Menunggu keputusan Admin TU.');
    const event: DemoEvent = {
      ...base,
      summary: 'Guru mengajukan izin',
      analogy: 'Guru menaruh surat di kotak TU. Admin & kepala melihat kotak penuh.',
      impacts
    };
    next = { ...next, events: [event, ...next.events].slice(0, 30), lastImpactEventId: event.id };
    return { world: next, event };
  }

  if (action.type === 'OPEN_SESSION') {
    if (world.session.status !== 'SCHEDULED') return { world, event: null };
    let next: DemoWorld = { ...world, session: { ...world.session, status: 'OPEN', presentCount: 0 } };
    const impacts: DemoImpact[] = [
      { role: 'siswa', surface: 'Kehadiran', message: 'Kelas dibuka — absensi bisa diisi guru.' },
      { role: 'admin-tu', surface: 'Sesi', message: 'Sesi X-IPA-1 berstatus Berjalan.' },
      { role: 'kepala-sekolah', surface: 'Ringkasan', message: 'Guru mulai mengajar.' }
    ];
    next = pushNotif(next, 'admin-tu', 'Sesi Matematika X-IPA-1 dibuka oleh Pak Budi.');
    next = pushNotif(next, 'siswa', 'Guru membuka kelas Matematika. Siap belajar!');
    const event: DemoEvent = {
      ...base,
      summary: 'Guru membuka sesi kelas',
      analogy: 'Seperti membuka pintu kelas: semua orang tahu pelajaran dimulai.',
      impacts
    };
    next = { ...next, events: [event, ...next.events].slice(0, 30), lastImpactEventId: event.id };
    return { world: next, event };
  }

  if (action.type === 'MARK_PRESENT') {
    if (world.session.status !== 'OPEN') return { world, event: null };
    const presentCount = Math.min(world.session.totalStudents, world.session.presentCount + 8);
    let next: DemoWorld = {
      ...world,
      session: { ...world.session, presentCount },
      stats: {
        ...world.stats,
        studentComplete: world.stats.studentComplete + 8
      }
    };
    const impacts: DemoImpact[] = [
      { role: 'siswa', surface: 'Kehadiran Saya', message: 'Status hadir bertambah di layar siswa.' },
      { role: 'admin-tu', surface: 'Kelengkapan', message: 'Angka siswa hadir naik.' },
      { role: 'kepala-sekolah', surface: 'Ringkasan', message: 'Grafik kehadiran bergerak.' }
    ];
    next = pushNotif(next, 'siswa', `Presensi kelas tersimpan. Hadir: ${presentCount}/${world.session.totalStudents}.`);
    next = pushNotif(next, 'admin-tu', `Guru mengisi presensi: ${presentCount} siswa ditandai hadir.`);
    const event: DemoEvent = {
      ...base,
      summary: `Guru menandai ${presentCount} siswa hadir`,
      analogy: 'Guru centang daftar seperti wasit mencatat skor — papan skor sekolah ikut berubah.',
      impacts
    };
    next = { ...next, events: [event, ...next.events].slice(0, 30), lastImpactEventId: event.id };
    return { world: next, event };
  }

  if (action.type === 'CLOSE_SESSION') {
    if (world.session.status !== 'OPEN') return { world, event: null };
    const closedSession = { ...world.session, status: 'CLOSED' as const };
    let next: DemoWorld = { ...world, session: closedSession };
    const impacts: DemoImpact[] = [
      { role: 'admin-tu', surface: 'Sesi', message: 'Sesi selesai dan terkunci di rekap.' },
      { role: 'siswa', surface: 'Kehadiran', message: 'Kelas ditutup untuk hari ini.' }
    ];
    next = pushNotif(next, 'admin-tu', 'Sesi Matematika X-IPA-1 ditutup.');
    next = pushNotif(next, 'siswa', 'Sesi kelas selesai. Terima kasih sudah hadir.');
    const event: DemoEvent = {
      ...base,
      summary: 'Guru menutup sesi kelas',
      analogy: 'Pintu kelas dikunci lagi — permainan ronde ini selesai.',
      impacts
    };
    next = { ...next, events: [event, ...next.events].slice(0, 30), lastImpactEventId: event.id };
    return { world: next, event };
  }

  if (action.type === 'LOG_PICKET') {
    let next = pushNotif(world, 'admin-tu', 'Piket mencatat kejadian baru di buku piket latihan.');
    next = pushNotif(next, 'kepala-sekolah', 'Ada catatan piket baru untuk dipantau.');
    const impacts: DemoImpact[] = [
      { role: 'admin-tu', surface: 'Catatan Piket', message: 'Baris baru muncul di buku piket.' },
      { role: 'kepala-sekolah', surface: 'Pantauan', message: 'Kepala melihat jejak kejadian harian.' }
    ];
    const event: DemoEvent = {
      ...base,
      summary: 'Piket menulis catatan kejadian',
      analogy: 'Seperti menulis di buku jaga pos: petugas lain bisa baca cerita yang sama.',
      impacts
    };
    next = {
      ...next,
      events: [event, ...next.events].slice(0, 30),
      lastImpactEventId: event.id,
      flags: next.flags
    };
    return { world: next, event };
  }

  if (action.type === 'OPEN_FLAG') {
    const flag = { id: nid('flag'), type: 'BOLOS_KELAS', subject: 'Siswa Latihan', open: true };
    let next = {
      ...world,
      flags: [flag, ...world.flags],
      stats: { ...world.stats, openProblems: world.stats.openProblems + 1 }
    };
    const impacts: DemoImpact[] = [
      { role: 'admin-tu', surface: 'Cek Masalah', message: 'Masalah baru masuk antrian.' },
      { role: 'kepala-sekolah', surface: 'Ringkasan', message: 'Angka masalah terbuka naik.' }
    ];
    next = pushNotif(next, 'admin-tu', 'Piket membuka tanda masalah baru.');
    next = pushNotif(next, 'kepala-sekolah', 'Ada masalah operasional baru.');
    const event: DemoEvent = {
      ...base,
      summary: 'Piket membuka tanda masalah',
      analogy: 'Menyalakan lampu kuning di papan sekolah — semua petugas melihat peringatan.',
      impacts
    };
    next = { ...next, events: [event, ...next.events].slice(0, 30), lastImpactEventId: event.id };
    return { world: next, event };
  }

  if (action.type === 'RESOLVE_FLAG') {
    const open = world.flags.find((f) => f.open);
    if (!open) return { world, event: null };
    let next = {
      ...world,
      flags: world.flags.map((f) => (f.id === open.id ? { ...f, open: false } : f)),
      stats: { ...world.stats, openProblems: Math.max(0, world.stats.openProblems - 1) }
    };
    const impacts: DemoImpact[] = [
      { role: 'guru-piket', surface: 'Cek Masalah', message: 'Masalah ditutup dari antrian piket.' },
      { role: 'kepala-sekolah', surface: 'Ringkasan', message: 'Beban masalah berkurang.' }
    ];
    next = pushNotif(next, 'guru-piket', 'Masalah gerbang ditandai selesai oleh Admin TU.');
    next = pushNotif(next, 'kepala-sekolah', 'Satu masalah operasional diselesaikan.');
    const event: DemoEvent = {
      ...base,
      summary: 'Admin menyelesaikan tanda masalah',
      analogy: 'Lampu kuning dimatikan — jalan aman lagi.',
      impacts
    };
    next = { ...next, events: [event, ...next.events].slice(0, 30), lastImpactEventId: event.id };
    return { world: next, event };
  }

  if (action.type === 'SET_READER_ONLINE' || action.type === 'SET_READER_OFFLINE') {
    const online = action.type === 'SET_READER_ONLINE'
      ? Math.min(world.devices.max, world.devices.readersOnline + 1)
      : Math.max(0, world.devices.readersOnline - 1);
    let next = {
      ...world,
      devices: {
        readersOnline: online,
        max: world.devices.max,
        lastNote: `${online} dari ${world.devices.max} HP scanner online`
      }
    };
    const impacts: DemoImpact[] = [
      { role: 'admin-tu', surface: 'Perangkat', message: next.devices.lastNote },
      { role: 'guru-piket', surface: 'Operasional', message: 'Status gerbang/scanner berubah.' }
    ];
    next = pushNotif(next, 'admin-tu', `Operator IT: ${next.devices.lastNote}`);
    next = pushNotif(next, 'guru-piket', `Status scanner: ${next.devices.lastNote}`);
    const event: DemoEvent = {
      ...base,
      summary: action.type === 'SET_READER_ONLINE' ? 'Operator menaikkan scanner online' : 'Operator menandai scanner offline',
      analogy: 'Montir menyalakan/mematikan mesin gerbang — penjaga & kantor melihat lampu indikator.',
      impacts
    };
    next = { ...next, events: [event, ...next.events].slice(0, 30), lastImpactEventId: event.id };
    return { world: next, event };
  }

  if (action.type === 'KEPALA_REQUEST_CLARITY') {
    let next = pushNotif(world, 'admin-tu', 'Kepala Sekolah meminta klarifikasi data kehadiran hari ini.');
    next = pushNotif(next, 'guru-piket', 'Kepala minta cek ulang masalah gerbang.');
    const impacts: DemoImpact[] = [
      { role: 'admin-tu', surface: 'Notifikasi', message: 'Tugas klarifikasi dari kepala masuk.' },
      { role: 'guru-piket', surface: 'Tugas', message: 'Piket diminta bantu cek lapangan.' }
    ];
    const event: DemoEvent = {
      ...base,
      summary: 'Kepala meminta klarifikasi',
      analogy: 'Kapten radio ke awak kapal: “Tolong cek peta lagi.”',
      impacts
    };
    next = { ...next, events: [event, ...next.events].slice(0, 30), lastImpactEventId: event.id };
    return { world: next, event };
  }

  return { world, event: null };
}

export function roleFromPath(path: string): DemoRole | null {
  const part = path.replace(/^\/belajar\/?/, '').split('/')[0] || '';
  const map: Record<string, DemoRole> = {
    'admin-tu': 'admin-tu',
    'kepala-sekolah': 'kepala-sekolah',
    'operator-it': 'operator-it',
    'guru-piket': 'guru-piket',
    guru: 'guru',
    siswa: 'siswa'
  };
  return map[part] || null;
}

export function screenFromPath(path: string): string {
  const parts = path.replace(/^\/belajar\/?/, '').split('/').filter(Boolean);
  return parts[1] || 'dashboard';
}

export function isBelajarLabPath(path: string): boolean {
  return path === '/belajar' || path.startsWith('/belajar/');
}

export function isBelajarLabEnabled(): boolean {
  const raw = import.meta.env.VITE_BELAJAR_LAB_ENABLED;
  if (raw === 'false' || raw === '0') return false;
  return true;
}
