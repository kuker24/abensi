// Mock data — Indonesian school context.

const STUDENTS_XIPA1 = [
  ["Aisyah Rahmawati", "24071001"],
  ["Ahmad Fauzan Hakim", "24071002"],
  ["Alifa Nazhira Putri", "24071003"],
  ["Bintang Pratama", "24071004"],
  ["Cahaya Hidayat", "24071005"],
  ["Dimas Ardiansyah", "24071006"],
  ["Dzikra Nabila", "24071007"],
  ["Faiz Abdurrahman", "24071008"],
  ["Farah Shafira", "24071009"],
  ["Fathir Maulana", "24071010"],
  ["Gita Kirana", "24071011"],
  ["Hafiz Nur Iman", "24071012"],
  ["Hasna Kamila", "24071013"],
  ["Ibrahim Al-Ghifari", "24071014"],
  ["Indira Safitri", "24071015"],
  ["Jihan Aulia", "24071016"],
  ["Kevin Nugraha", "24071017"],
  ["Laila Syafira", "24071018"],
  ["Luthfi Ramadhan", "24071019"],
  ["Mahira Zahra", "24071020"],
  ["Muhammad Akbar", "24071021"],
  ["Naila Khaira", "24071022"],
  ["Nadhif Arsyad", "24071023"],
  ["Nisrina Aqila", "24071024"],
  ["Qonita Hanifah", "24071025"],
  ["Rafif Tsaqib", "24071026"],
  ["Raisa Putri", "24071027"],
  ["Reyhan Satria", "24071028"],
  ["Salma Azzahra", "24071029"],
  ["Yusuf Mahendra", "24071030"],
].map(([nama, nis], i) => ({ id: i+1, nama, nis, status: "ALPA" }));

const TEACHER = {
  nama: "Ust. Rahmat Hidayat, S.Pd.",
  nip: "198604172019031005",
  mapel: "Matematika Wajib",
  initials: "RH",
};

const TODAY_SESSIONS = [
  { id:"s1", jam:"07:15-08:45", kelas:"X-MIA-1", mapel:"Matematika Wajib", ruang:"R-204", status:"CLOSED", coverage:30 },
  { id:"s2", jam:"08:45-10:15", kelas:"X-MIA-3", mapel:"Matematika Wajib", ruang:"R-204", status:"OPEN", coverage:null },
  { id:"s3", jam:"10:30-12:00", kelas:"XI-IPS-1", mapel:"Matematika Wajib", ruang:"R-312", status:"SCHEDULED", coverage:null },
  { id:"s4", jam:"13:00-14:30", kelas:"XI-IPS-2", mapel:"Matematika Wajib", ruang:"R-312", status:"SCHEDULED", coverage:null },
];

const LIVE_EVENTS = [
  { id:1, time:"10:42:18", who:"Salma Azzahra",     role:"SISWA", event:"tap-in",   loc:"Gerbang Utara", ok:true },
  { id:2, time:"10:41:55", who:"Ust. Siti Maesaroh",role:"GURU",  event:"open-session", loc:"XI-MIA-2 · Biologi", ok:true },
  { id:3, time:"10:41:30", who:"Kartu UID 04:A2:1F", role:"SISWA", event:"tap-rejected", loc:"Gerbang Utara · kartu LOST", ok:false },
  { id:4, time:"10:40:12", who:"Ust. Agus Setiawan",role:"GURU",  event:"close-session",loc:"X-IPS-1 · Sejarah", ok:true },
  { id:5, time:"10:39:44", who:"Yusuf Mahendra",    role:"SISWA", event:"tap-in",   loc:"Gerbang Utara", ok:true },
  { id:6, time:"10:39:12", who:"Pak Bagus Iswanto", role:"PEGAWAI",event:"tap-in",  loc:"Gerbang Samping", ok:true },
  { id:7, time:"10:38:40", who:"Nadhif Arsyad",     role:"SISWA", event:"tap-in",   loc:"Gerbang Utara", ok:true },
];

const ANOMALIES = [
  {
    id: "F-2041",
    flag: "BOLOS_KELAS",
    level: "bad",
    subject: "Rafif Tsaqib",
    meta: "X-MIA-1 · NIS 24071026",
    at: "Hari ini · 08:32",
    gate: { ok:true,  text:"Tap IN 07:08", sub:"Gerbang Utara" },
    kelas:{ ok:false, text:"ALPA", sub:"Matematika · sesi 07:15-08:45" },
    ctx: "Hadir di sekolah, tapi ditandai ALPA oleh Ust. Rahmat Hidayat di sesi Matematika.",
  },
  {
    id: "F-2040",
    flag: "TIDAK_MENGAJAR",
    level: "warn",
    subject: "Ust. Burhanuddin, S.S.",
    meta: "Guru Bahasa Inggris · NIP 198...031",
    at: "Hari ini · 08:17",
    gate: { ok:true, text:"Tap IN 06:54", sub:"Gerbang Utara" },
    kelas:{ ok:false, text:"MISSED", sub:"X-MIA-4 · sesi tidak dibuka" },
    ctx: "Guru tap gerbang, tapi sesi ampuan jam 07:15 tidak dibuka dalam grace period 15 menit.",
  },
  {
    id: "F-2039",
    flag: "LUPA_TAP_GERBANG",
    level: "warn",
    subject: "Hafiz Nur Iman",
    meta: "X-MIA-1 · NIS 24071012",
    at: "Hari ini · 08:45",
    gate: { ok:false, text:"Tidak ada tap", sub:"kartu terakhir dipakai 2 hari lalu" },
    kelas:{ ok:true,  text:"HADIR", sub:"Matematika · sesi 07:15-08:45" },
    ctx: "Ditandai hadir di kelas, tapi tidak ada tap gerbang. Cek kondisi kartu.",
  },
  {
    id: "F-2038",
    flag: "ANOMALI_BUKA_TANPA_GERBANG",
    level: "bad",
    subject: "Ust. Yusril Abdullah",
    meta: "Guru Fiqih · NIP 199...012",
    at: "Kemarin · 14:08",
    gate: { ok:false, text:"Tidak ada tap", sub:"hari kerja, tidak izin" },
    kelas:{ ok:true,  text:"OPEN 13:55", sub:"XII-IPA-2 · dari 3.24 km" },
    ctx: "Sesi dibuka dari luar geofence — kemungkinan proxy. Perlu verifikasi segera.",
  },
  {
    id: "F-2037",
    flag: "ALPA",
    level: "warn",
    subject: "Ust. Dewi Anggraini",
    meta: "Guru Seni Budaya",
    at: "Kemarin · 16:00",
    gate: { ok:false, text:"Tidak ada tap", sub:"tanpa izin terdaftar" },
    kelas:{ ok:false, text:"3 sesi MISSED", sub:"seluruh beban hari Senin" },
    ctx: "Tidak hadir seharian tanpa izin. Konfirmasi ke wakil kurikulum.",
  },
];

const ADMIN_STATS = [
  { k:"Sesi Hari Ini",         v:"48", sub:"32 CLOSED · 1 OPEN · 15 SCHEDULED", tone:"", spark:[4,6,5,8,10,11,12] },
  { k:"Cakupan Presensi",      v:"98.2%", sub:"↑ 1.4% vs kemarin", tone:"ok", spark:[70,74,78,82,88,95,98] },
  { k:"Anomali Terdeteksi",    v:"12", sub:"5 belum di-resolve", tone:"warn", spark:[8,10,6,14,9,11,12] },
  { k:"Guru Hadir",            v:"42/46", sub:"2 izin · 2 alpa", tone:"", spark:[38,40,41,42,42,43,42] },
];

const WEEK_LABELS = ["Sen","Sel","Rab","Kam","Jum","Sab","Min"];
const WEEK_COVERAGE = [96.8, 97.2, 98.1, 97.9, 98.4, 95.1, 0];

window.DATA = {
  STUDENTS_XIPA1, TEACHER, TODAY_SESSIONS, LIVE_EVENTS,
  ANOMALIES, ADMIN_STATS, WEEK_LABELS, WEEK_COVERAGE,
};
