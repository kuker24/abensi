import { QRCodeSVG } from 'qrcode.react';
import {
  CARD_PIXEL_HEIGHT,
  CARD_PIXEL_WIDTH,
  getCardIdentityNumber,
  getCardLevel,
  getCardRoleLabel,
  getCardSubLabel,
  getQrPayload,
  safeText,
} from './cardConfig';

const schoolLogo = `${import.meta.env.BASE_URL || './'}logoman1.jpeg`;
const OFFICIAL_QR_PREFIX = 'schoolhub:qr:v1:';

const nameSizeClass = (name) => {
  if (name.length > 30) return 'text-[16px] leading-[1.05]';
  if (name.length > 22) return 'text-[18px] leading-[1.05]';
  return 'text-[21px] leading-[1.02]';
};

const IDCard = ({
  user,
  schoolName = 'MAN 1 Rokan Hulu',
  scale = 1,
}) => {
  if (!user) return null;

  const qrPayload = getQrPayload(user);
  const isOfficialQr = qrPayload.startsWith(OFFICIAL_QR_PREFIX);
  const name = safeText(user.nama || user.fullName, 'Nama belum ada');
  const idValue = getCardIdentityNumber(user);
  const level = getCardLevel(user);
  const roleLabel = getCardRoleLabel(user);
  const subLabel = getCardSubLabel(user);

  const cardStyle = {
    width: `${CARD_PIXEL_WIDTH}px`,
    height: `${CARD_PIXEL_HEIGHT}px`,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    flexShrink: 0,
  };

  return (
    <article
      className="id-card id-card--portrait relative isolate overflow-hidden rounded-[26px] bg-[#eef4f8] font-sans text-slate-950 shadow-[0_24px_80px_rgba(2,8,23,0.28)]"
      style={cardStyle}
      aria-label={`Kartu tanda pengenal ${user.nama || ''}`.trim()}
    >
      <div className="absolute right-4 top-4 z-40 rounded-full border border-emerald-300 bg-emerald-50/95 px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.14em] text-emerald-700">
        {isOfficialQr ? 'RESMI' : 'DRAFT'}
      </div>

      <header className="relative h-[108px] bg-white px-5 py-4 text-[#071018]">
        <div className="flex h-full flex-col items-center justify-center text-center">
          <div className="flex items-center justify-center gap-3">
            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-[18px] border border-[#071018]/10 bg-white shadow-[0_10px_26px_rgba(7,16,24,0.12)]">
              <img
                src={schoolLogo}
                alt="Logo MAN 1 Rokan Hulu"
                className="h-full w-full object-contain p-1"
                crossOrigin="anonymous"
              />
            </div>
            <div className="text-left">
              <p className="text-[20px] font-black uppercase leading-none tracking-[0.18em] text-[#071018]">
                SIAB2
              </p>
              <p className="mt-1 text-[8px] font-black uppercase tracking-[0.22em] text-[#557088]">
                {schoolName}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[13px] font-black uppercase tracking-[0.08em] text-[#0d3047]">
            KARTU TANDA PENGENAL RESMI
          </p>
        </div>
      </header>

      <main className="relative flex h-[406px] flex-col">
        <section className="relative flex h-[210px] items-center justify-center overflow-hidden bg-[#071018] px-5">
          <div className="absolute inset-y-0 left-0 w-[28%] bg-[#0d3047]" />
          <div className="absolute inset-y-0 right-0 w-[28%] bg-[#0d3047]" />
          <div className="absolute inset-y-0 left-[28%] right-[28%] bg-[#071018]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_26%,rgba(143,196,243,0.18),transparent_34%),linear-gradient(180deg,rgba(7,16,24,0.02),rgba(7,16,24,0.28))]" />
          <div className="relative grid h-[164px] w-[164px] place-items-center rounded-[28px] bg-white shadow-[0_18px_44px_rgba(7,16,24,0.34)] ring-4 ring-white/20">
            <QRCodeSVG
              value={qrPayload}
              size={144}
              level="M"
              bgColor="#ffffff"
              fgColor="#071018"
              marginSize={2}
              aria-label={`QR ${user.nama || user.nisn || 'kartu'}`}
            />
          </div>
        </section>

        <section className="relative flex h-[96px] flex-col items-center justify-center overflow-hidden px-5 text-center text-white shadow-[0_-1px_0_rgba(255,255,255,0.42)_inset,0_1px_0_rgba(255,255,255,0.42)_inset]">
          <div className="absolute inset-0 bg-[#0d3047]" style={{ backgroundColor: '#0d3047' }} />
          <div className="relative z-10 flex flex-col items-center justify-center">
            <h2 className={`max-w-[280px] font-black uppercase leading-[1.05] tracking-[0.04em] ${nameSizeClass(name)}`}>
              {name}
            </h2>
            <p className="mt-2 font-mono text-[13px] font-black leading-none tracking-[0.12em] text-white/95">
              {idValue}
            </p>
            <p className="mt-2 max-w-[260px] text-[10px] font-black uppercase leading-none tracking-[0.12em] text-white/88">
              {roleLabel}
            </p>
            <p className="mt-1 max-w-[260px] truncate text-[8px] font-bold uppercase leading-none tracking-[0.08em] text-white/72">
              {level} · {subLabel}
            </p>
          </div>
        </section>

        <footer className="flex h-[100px] flex-col items-center justify-center gap-2 bg-white px-5 text-center text-[#071018]">
          <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#557088]">
            Kartu Tanda Pengenal SIAB2
          </p>
          <p className="text-[12px] font-black uppercase tracking-[0.04em] text-[#071018]">
            MAN 1 Rokan Hulu
          </p>
        </footer>
      </main>
    </article>
  );
};

export default IDCard;
