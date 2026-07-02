import { BadgeCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import schoolLogo from '../../assets/logoman1.jpeg';
import { DEFAULT_CARD_SETTINGS, getCardTemplate } from '../../utils/cardTemplates';
import { buildQrValue, getCardRoleLabel, validateCardUser } from '../../utils/identityCard';

const IDCard = ({
  user,
  settings = {},
  cardSkin,
  schoolName,
  brandName,
  tagline,
  academicYear,
  issuerLabel,
  statusLabel,
  scale = 1,
}) => {
  if (!user) return null;

  const resolvedSettings = {
    ...DEFAULT_CARD_SETTINGS,
    ...settings,
    ...(cardSkin ? { cardSkin } : {}),
    ...(schoolName ? { schoolName } : {}),
    ...(brandName ? { brandName } : {}),
    ...(tagline ? { tagline } : {}),
    ...(academicYear ? { academicYear } : {}),
    ...(issuerLabel ? { issuerLabel } : {}),
    ...(statusLabel ? { statusLabel } : {}),
  };
  const template = getCardTemplate(resolvedSettings.cardSkin);
  const { renderWidthPx, renderHeightPx } = template.dimensions;
  const qrValue = buildQrValue(user);
  const validation = validateCardUser(user);
  const roleLabel = getCardRoleLabel(user);
  const issuerLabelText = resolvedSettings.issuerLabel?.toLowerCase().includes('tanda pengenal')
    ? 'Kartu Digital Madrasah'
    : resolvedSettings.issuerLabel || 'Kartu Digital Madrasah';

  const cardStyle = {
    width: `${renderWidthPx}px`,
    height: `${renderHeightPx}px`,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    flexShrink: 0,
  };

  return (
    <article
      className="id-card id-card--portrait relative isolate overflow-hidden rounded-[26px] bg-[#eef4f8] font-sans text-slate-950 shadow-[0_24px_80px_rgba(2,8,23,0.28)]"
      style={cardStyle}
      data-card-skin={template.id}
      aria-label={`Kartu tanda pengenal ${user.nama || ''}`.trim()}
    >
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
                {resolvedSettings.brandName}
              </p>
              <p className="mt-1 text-[8px] font-black uppercase tracking-[0.22em] text-[#557088]">
                {resolvedSettings.schoolName}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[13px] font-black uppercase tracking-[0.08em] text-[#0d3047]">
            {issuerLabelText}
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
              value={qrValue}
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
            <h2 className="max-w-[280px] text-[18px] font-black uppercase leading-[1.05] tracking-[0.04em]">
              {user.nama || 'Nama belum diisi'}
            </h2>
            <p className="mt-2 font-mono text-[13px] font-black leading-none tracking-[0.12em] text-white/95">
              {user.nisn || '-'}
            </p>
            <p className="mt-2 max-w-[260px] text-[10px] font-black uppercase leading-none tracking-[0.12em] text-white/88">
              {roleLabel}
            </p>
          </div>
        </section>

        <footer className="flex h-[100px] flex-col items-center justify-center gap-2 bg-white px-5 text-center text-[#071018]">
          <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#557088]">
            Kartu Digital Madrasah
          </p>
          <p className="text-[12px] font-black uppercase tracking-[0.04em] text-[#071018]">
            MAN 1 Rokan Hulu
          </p>
          {!validation.isValid && (
            <div className="mt-1 flex max-w-[260px] items-start gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2 py-1.5 text-[7.5px] font-bold leading-snug text-amber-900">
              <BadgeCheck className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span>Data belum lengkap: {validation.errors.join(', ')}</span>
            </div>
          )}
        </footer>
      </main>

    </article>
  );
};

export default IDCard;
