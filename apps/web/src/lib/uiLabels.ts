import type { Role } from '../types/domain';

const STATUS_LABEL_MAP: Record<string, string> = {
  HADIR: 'Hadir',
  TELAT: 'Terlambat',
  IZIN: 'Izin',
  SAKIT: 'Sakit',
  ALPA: 'Tanpa Keterangan',
  OPEN: 'Sedang Berjalan',
  CLOSED: 'Selesai',
  MISSED: 'Terlewat',
  SCHEDULED: 'Terjadwal',
  RESOLVED: 'Terselesaikan',
  QUEUED: 'Dalam Antrean',
  EXCUSED_ABSENCE: 'Izin Tidak Mengajar',
  ALPA_MENGAJAR: 'Tidak Mengajar',
  ACTIVE: 'Aktif',
  INACTIVE: 'Nonaktif',
  LOST: 'Hilang',
  BOLOS_KELAS: 'Diduga Membolos Kelas',
  LUPA_TAP_GERBANG: 'Lupa Tap Gerbang',
  TIDAK_MENGAJAR: 'Tidak Mengajar',
  ANOMALI_BUKA_TANPA_GERBANG: 'Buka Sesi Tanpa Tap Gerbang',
  GATE_TAP: 'Tap Gerbang',
  SESSION_OPENED: 'Sesi Dibuka',
  SESSION_CLOSED: 'Sesi Ditutup',
  ANOMALY: 'Anomali',
  VALID: 'Valid',
  TAP_IN_VALID: 'Tap Masuk Valid',
  TAP_OUT_VALID: 'Tap Keluar Valid',
  FLAG_OPEN: 'Flag Terbuka',
  FLAG_RESOLVED: 'Flag Terselesaikan',
  CALM: 'Tenang',
  BALANCED: 'Seimbang',
  VIVID: 'Dinamis',
  DATA: 'Fokus Data',
  CONTEXT: 'Fokus Konteks',
  COMFORTABLE: 'Nyaman',
  COMPACT: 'Ringkas',
  SOFT: 'Membulat',
  SHARP: 'Tegas',
  EMERALD: 'Hijau',
  SLATE: 'Biru Abu',
  SUNSET: 'Senja'
};

const ROLE_LABEL_MAP: Record<Role, string> = {
  ADMIN_TU: 'Admin Tata Usaha',
  GURU_MAPEL: 'Guru Mata Pelajaran',
  GURU_PIKET: 'Guru Piket',
  SISWA: 'Siswa',
  OPERATOR_IT: 'Operator IT'
};

function startCase(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function labelForStatus(value: string | null | undefined) {
  if (!value) return '-';
  const normalized = String(value).trim();
  return STATUS_LABEL_MAP[normalized] ?? STATUS_LABEL_MAP[normalized.toUpperCase()] ?? startCase(normalized);
}

export function labelForRole(role: Role | string) {
  if (!role) return '-';
  return ROLE_LABEL_MAP[role as Role] ?? startCase(role);
}

export function labelForBoolean(value: boolean, yesLabel = 'Ya', noLabel = 'Tidak') {
  return value ? yesLabel : noLabel;
}
