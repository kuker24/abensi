import { BadgeCheck, CalendarDays, MapPin, School, ShieldCheck, User } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { DEFAULT_CARD_SETTINGS, getCardTemplate } from '../../utils/cardTemplates';
import { buildQrValue, formatBirthInfo, getInitials, validateCardUser } from '../../utils/identityCard';

const FieldBlock = ({ label, value, children }) => (
  <div className="rounded-xl border border-slate-200/90 bg-white/92 px-3 py-2 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
    <p className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</p>
    <div className="mt-1 text-[10.5px] font-semibold leading-snug text-slate-950">
      {children || value || '-'}
    </div>
  </div>
);

const PhotoBlock = ({ user }) => {
  const photoUrl = user.foto || user.photo || user.photo_url || user.foto_url;

  return (
    <div className="relative mx-auto h-[74px] w-[64px] overflow-hidden rounded-[16px] border border-white/40 bg-slate-100 shadow-[0_18px_45px_rgba(2,8,23,0.22)] ring-4 ring-white/20">
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={`Foto ${user.nama || 'pemegang kartu'}`}
          className="h-full w-full object-cover"
          crossOrigin="anonymous"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-white to-blue-100 text-slate-400">
          <User className="h-7 w-7" />
          <span className="mt-1 text-[11px] font-black tracking-[0.12em] text-slate-500">
            {getInitials(user.nama)}
          </span>
        </div>
      )}
    </div>
  );
};

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
  const birthInfo = formatBirthInfo(user);
  const validation = validateCardUser(user);
  const cardNumber = user.nomor_kartu || user.nisn || 'BELUM ADA';
  const activeStatus = user.status || resolvedSettings.statusLabel;

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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(111,166,216,0.34),transparent_34%),linear-gradient(180deg,#f8fbff_0%,#edf4f8_48%,#e9f0f4_100%)]" />
      <div className="absolute -right-20 top-20 h-44 w-44 rounded-full border border-white/60 bg-white/20" />
      <div className="absolute -bottom-28 -left-12 h-52 w-52 rounded-full bg-[#0b1720]/10 blur-2xl" />

      <header className="relative h-[112px] overflow-hidden bg-[#061017] px-5 pt-4 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_8%,rgba(111,166,216,0.36),transparent_34%),linear-gradient(135deg,#05080b_0%,#0a151d_52%,#142637_100%)]" />
        <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-[#8fc4f3] via-[#5c8fb9] to-[#d7e9f8]" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#9dccf1] to-transparent opacity-80" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-white/10 shadow-[0_0_24px_rgba(111,166,216,0.28)]">
              <School className="h-5 w-5 text-[#b9dcf7]" />
            </div>
            <div>
              <p className="text-[15px] font-black leading-none tracking-[0.22em] text-white">
                {resolvedSettings.brandName}
              </p>
              <p className="mt-1 text-[7px] font-bold uppercase tracking-[0.24em] text-[#b9c7d2]">
                {resolvedSettings.schoolName}
              </p>
            </div>
          </div>

          <div className="rounded-full border border-[#9dccf1]/30 bg-[#9dccf1]/10 px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.18em] text-[#c7e4fb]">
            {activeStatus}
          </div>
        </div>

        <div className="relative mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#8fb9d8]">
              {resolvedSettings.issuerLabel}
            </p>
            <p className="mt-1 max-w-[178px] text-[8px] font-semibold leading-snug text-white/72">
              {resolvedSettings.tagline}
            </p>
          </div>
          <PhotoBlock user={user} />
        </div>
      </header>

      <main className="relative px-4 pb-3 pt-2.5">
        <section className="rounded-[20px] border border-white/70 bg-white/78 p-2.5 shadow-[0_18px_45px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[7px] font-black uppercase tracking-[0.24em] text-[#496a83]">Nama Pemegang</p>
            <span className="rounded-full bg-[#0d2130] px-2 py-1 text-[7px] font-black uppercase tracking-[0.16em] text-[#c6e1f7]">
              TA {user.tahun_ajaran || resolvedSettings.academicYear}
            </span>
          </div>
          <h2 className="mt-1.5 min-h-[34px] text-[15.5px] font-black uppercase leading-[1.08] tracking-[-0.02em] text-slate-950">
            {user.nama || 'Nama belum diisi'}
          </h2>

          <div className="mt-2 grid gap-1.5">
            <FieldBlock label="Tempat tanggal lahir" value={birthInfo}>
              <span className="inline-flex items-start gap-1.5">
                <CalendarDays className="mt-0.5 h-3 w-3 flex-shrink-0 text-[#496a83]" />
                <span>{birthInfo || '-'}</span>
              </span>
            </FieldBlock>

            <FieldBlock label="NISN" value={user.nisn}>
              <span className="font-mono text-[12px] font-black tracking-[0.08em] text-[#0b2233]">
                {user.nisn || '-'}
              </span>
            </FieldBlock>

            <FieldBlock label="Alamat">
              <span className="flex items-start gap-1.5">
                <MapPin className="mt-0.5 h-3 w-3 flex-shrink-0 text-[#496a83]" />
                <span className="max-h-[43px] overflow-hidden leading-snug">{user.alamat || '-'}</span>
              </span>
            </FieldBlock>
          </div>
        </section>

        <section className="mt-2 grid grid-cols-[80px_1fr] gap-2.5 rounded-[20px] border border-slate-900/10 bg-[#071018] p-2.5 text-white shadow-[0_16px_38px_rgba(2,8,23,0.24)]">
          <div className="rounded-2xl bg-white p-2 shadow-inner">
            <QRCodeSVG
              value={qrValue}
              size={64}
              level="M"
              bgColor="#ffffff"
              fgColor="#071018"
              marginSize={1}
              aria-label={`QR ${user.nama || user.nisn || 'kartu'}`}
            />
          </div>
          <div className="flex min-w-0 flex-col justify-between py-0.5">
            <div>
              <div className="flex items-center gap-1.5 text-[#a8cfee]">
                <ShieldCheck className="h-3.5 w-3.5" />
                <p className="text-[7px] font-black uppercase tracking-[0.2em]">Verifikasi Identitas</p>
              </div>
              <p className="mt-1 text-[8.5px] font-semibold leading-snug text-white/72">
                Pindai QR untuk membaca identitas resmi pemegang kartu.
              </p>
            </div>
            <div className="mt-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1">
              <p className="text-[6.5px] font-black uppercase tracking-[0.18em] text-white/42">Nomor Kartu</p>
              <p className="truncate font-mono text-[9px] font-black tracking-[0.08em] text-white">
                {cardNumber}
              </p>
            </div>
          </div>
        </section>

        {!validation.isValid && (
          <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2 py-1.5 text-[7.5px] font-bold leading-snug text-amber-900">
            <BadgeCheck className="mt-0.5 h-3 w-3 flex-shrink-0" />
            <span>Data belum lengkap: {validation.errors.join(', ')}</span>
          </div>
        )}
      </main>

    </article>
  );
};

export default IDCard;
