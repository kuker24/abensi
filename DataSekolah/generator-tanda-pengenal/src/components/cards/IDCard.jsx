import { BadgeCheck, Building2, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { CARD_PIXEL_HEIGHT, CARD_PIXEL_WIDTH, getQrPayload } from './cardConfig';

const OFFICIAL_QR_PREFIX = 'schoolhub:qr:v1:';
const LOGO_SRC = `${import.meta.env.BASE_URL || './'}logoman1.jpeg`;

const safeText = (value, fallback = '—') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const compactText = (value, max = 32) => {
  const text = safeText(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const normalizeRole = (role) => String(role || '').toLowerCase();

const roleMeta = (user) => {
  const rawRole = user?.displayRole || user?.raw?.Role || user?.role || '';
  const role = normalizeRole(rawRole);

  if (role.includes('guru') || role.includes('teacher')) {
    return {
      label: 'PEGAWAI',
      subLabel: 'Guru / Tendik',
      header: 'linear-gradient(135deg, #064e3b 0%, #0f766e 55%, #d97706 140%)',
      chipBg: '#ecfdf5',
      chipText: '#065f46',
      accent: '#d97706',
    };
  }

  if (role.includes('admin') || role.includes('operator') || role.includes('tu')) {
    return {
      label: 'OPERATOR',
      subLabel: 'Admin / Operator',
      header: 'linear-gradient(135deg, #0f172a 0%, #0369a1 62%, #0f766e 130%)',
      chipBg: '#ecfeff',
      chipText: '#155e75',
      accent: '#0891b2',
    };
  }

  return {
    label: 'SISWA',
    subLabel: 'Peserta Didik',
    header: 'linear-gradient(135deg, #064e3b 0%, #047857 58%, #0f172a 135%)',
    chipBg: '#eff6ff',
    chipText: '#1d4ed8',
    accent: '#f59e0b',
  };
};

const getProgram = (user, programName) =>
  safeText(user?.program || user?.raw?.Program || user?.label || programName, 'SIAB2');

const getLevel = (user) =>
  safeText(
    user?.classCode || user?.kelas || user?.raw?.['Kelas/Jabatan'] || user?.level || user?.className || user?.jabatan,
    'MAN 1 Rokan Hulu'
  );

const getStatus = (user) => safeText(user?.status || user?.raw?.Status, 'Aktif');

const nameSizeClass = (name) => {
  if (name.length > 30) return 'text-[13px] leading-[1.06]';
  if (name.length > 22) return 'text-[14px] leading-[1.06]';
  return 'text-[17px] leading-[1.02]';
};

const IDCard = ({
  user,
  schoolName = 'MAN 1 Rokan Hulu',
  programName = 'SIAB2',
  examPeriod,
  scale = 1,
  darkMode = false,
}) => {
  if (!user) return null;

  const meta = roleMeta(user);
  const qrPayload = getQrPayload(user);
  const isOfficialQr = qrPayload.startsWith(OFFICIAL_QR_PREFIX);
  const program = getProgram(user, programName || examPeriod);
  const idValue = safeText(user.idNumber || user.username || user.raw?.Username, 'ID belum ada');
  const name = safeText(user.nama || user.fullName || user.raw?.['Nama Lengkap'], 'Nama belum ada');
  const level = getLevel(user);
  const status = getStatus(user);

  const cardStyle = {
    width: `${CARD_PIXEL_WIDTH}px`,
    height: `${CARD_PIXEL_HEIGHT}px`,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    flexShrink: 0,
  };

  return (
    <div
      className="id-card id-card-portrait relative overflow-hidden rounded-[16px] bg-[#f8faf5] font-sans text-slate-950 shadow-2xl"
      style={cardStyle}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#fffdf3_0%,#f3fbf4_54%,#eef7ff_100%)]" />
      <div className="absolute -right-8 top-28 h-24 w-24 rounded-full border-[13px] border-emerald-100/80" />
      <div className="absolute -left-10 bottom-28 h-20 w-20 rounded-full border-[12px] border-sky-100/80" />
      <div className="absolute inset-x-0 top-0 h-[68px]" style={{ background: meta.header }} />
      <div className="absolute inset-x-0 top-[58px] h-[18px] rounded-t-[42%] bg-[#f8faf5]" />
      <div className="absolute left-1/2 top-2 h-[10px] w-[50px] -translate-x-1/2 rounded-full bg-white/25 p-[2px] shadow-inner">
        <div className="h-full rounded-full bg-white/80" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: meta.header }} />

      <div className="relative z-10 flex h-full flex-col px-3 pb-2 pt-4">
        <header className="flex h-[46px] items-center gap-2 text-white">
          <div className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[12px] border border-white/55 bg-white p-1.5 shadow-[0_10px_18px_rgba(15,23,42,0.22)]">
            <img
              src={LOGO_SRC}
              alt="Logo MAN 1 Rokan Hulu"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[6.3px] font-black uppercase leading-none tracking-[0.16em] text-emerald-100">Kartu Identitas</p>
            <h1 className="mt-0.5 text-[13px] font-black uppercase leading-none tracking-tight">SIAB2</h1>
            <p className="mt-0.5 truncate text-[6.5px] font-bold uppercase tracking-[0.07em] text-white/80">{schoolName}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="rounded-full bg-white/18 px-2 py-0.5 text-[6.3px] font-black uppercase tracking-[0.12em] ring-1 ring-white/25">{meta.label}</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/14 text-white ring-1 ring-white/25">
              <Building2 className="h-3.5 w-3.5" />
            </div>
          </div>
        </header>

        <main className="mt-1 flex min-h-0 flex-1 flex-col">
          <section className="h-[53px] rounded-[15px] border border-emerald-900/10 bg-white/88 p-2 shadow-[0_8px_20px_rgba(15,23,42,0.10)]">
            <p className="text-[6.8px] font-black uppercase tracking-[0.22em] text-emerald-700">Nama</p>
            <h2 className={`mt-0.5 line-clamp-2 min-h-[24px] font-black uppercase tracking-tight text-slate-950 ${nameSizeClass(name)}`}>
              {name}
            </h2>
            <div className="mt-0.5 flex items-center gap-1 text-[6.8px] font-bold uppercase tracking-wide text-slate-500">
              <BadgeCheck className="h-2.5 w-2.5 text-emerald-700" /> {meta.subLabel}
            </div>
          </section>

          <section className="mt-1.5 grid gap-1">
            <InfoRow label="ID" value={idValue} strong mono darkMode={darkMode} />
            <InfoRow label="Kelas/Level" value={level} strong darkMode={darkMode} />
            <div className="grid grid-cols-[1fr_52px] gap-1">
              <InfoRow label="Program" value={compactText(program.replace(' Absensi', ''), 18)} darkMode={darkMode} />
              <StatusBox value={status} darkMode={darkMode} />
            </div>
          </section>

          <section className="mt-auto flex h-[89px] items-center gap-2 pt-1">
            <div className="shrink-0 rounded-[13px] border border-slate-200 bg-white p-1 shadow-[0_9px_20px_rgba(15,23,42,0.18)]">
              <QRCodeSVG
                value={qrPayload}
                size={84}
                level="H"
                bgColor="#ffffff"
                fgColor="#020617"
                marginSize={1}
                className="qr-render block"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className={`mb-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[6.8px] font-black uppercase tracking-[0.13em] text-white ${isOfficialQr ? 'bg-emerald-800' : 'bg-red-600'}`}>
                <ShieldCheck className="h-2.5 w-2.5" />
                {isOfficialQr ? 'Absensi' : 'Fallback'}
              </div>
              <p className="text-[6.8px] font-semibold leading-[1.18] text-slate-600">
                {isOfficialQr ? 'Scan dengan aplikasi resmi SIAB2 Reader.' : 'Jangan cetak produksi sebelum QR resmi.'}
              </p>
              <p className="mt-1 text-[6.5px] font-black uppercase leading-tight tracking-[0.12em] text-emerald-800">
                MAN 1 Rokan Hulu
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

const InfoRow = ({ label, value, strong = false, mono = false, darkMode = false }) => (
  <div className={`flex h-[17px] items-center justify-between gap-2 rounded-[9px] border ${darkMode ? 'border-slate-600/50 bg-slate-800/80' : 'border-slate-200/80 bg-white/78'} px-2 shadow-sm`}>
    <span className={`shrink-0 text-[6.4px] font-black uppercase tracking-[0.16em] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
    <span
      className={`truncate text-right text-[7.4px] ${strong ? (darkMode ? 'font-black text-white' : 'font-black text-slate-950') : (darkMode ? 'font-bold text-slate-200' : 'font-bold text-slate-700')} ${mono ? 'font-mono tracking-tight' : ''}`}
      title={value}
    >
      {value}
    </span>
  </div>
);

const StatusBox = ({ value, darkMode = false }) => (
  <div className={`flex h-[17px] items-center justify-center rounded-[9px] border ${darkMode ? 'border-emerald-700/50 bg-emerald-900/40 text-emerald-300' : 'border-emerald-200 bg-emerald-50 text-emerald-800'} px-1 text-[7px] font-black shadow-sm`}>
    {value}
  </div>
);

export default IDCard;
