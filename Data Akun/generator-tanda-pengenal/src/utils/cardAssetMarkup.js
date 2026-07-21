import { DEFAULT_CARD_SETTINGS, getCardTemplate } from './cardTemplates.js';
import { getCardIdentityLine, getCardRoleLabel, getCardSourceLabel, isDraftCard } from './identityCard.js';

const XMLNS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

const escapeXml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const getNameFontSize = (name) => {
  if (name.length > 30) return 12;
  if (name.length > 24) return 14;
  if (name.length > 18) return 16;
  return 18;
};

export const getResolvedCardAssetSettings = (options = {}) => ({
  ...DEFAULT_CARD_SETTINGS,
  ...(options.settings || {}),
});

export const getCardAssetDimensions = (options = {}) => {
  const settings = getResolvedCardAssetSettings(options);
  const template = getCardTemplate(settings.cardSkin);
  return template.dimensions;
};

export const buildCardSVGMarkup = (user, { settings = DEFAULT_CARD_SETTINGS, qrMarkup, logoDataUrl } = {}) => {
  if (!user) {
    throw new Error('Data kartu tidak tersedia.');
  }

  if (!qrMarkup?.content || !logoDataUrl) {
    throw new Error('Asset kartu belum lengkap untuk membuat SVG.');
  }

  const template = getCardTemplate(settings.cardSkin);
  const { widthMm, heightMm, renderWidthPx, renderHeightPx } = template.dimensions;
  const name = user.nama || 'Nama belum diisi';
  const identityLine = getCardIdentityLine(user);
  const roleLabel = getCardRoleLabel(user);
  const draftCard = isDraftCard(user);
  const draftSourceLabel = draftCard ? getCardSourceLabel(user) : '';
  const nameFontSize = getNameFontSize(name);
  const logoClipId = `logoClip-${Date.now()}`;
  const draftBadgeMarkup = draftCard ? `<g id="draft-source-badge">
    <rect x="184" y="16" width="124" height="22" rx="11" fill="#fff1f2" stroke="#fda4af" stroke-width="1" />
    <text x="246" y="30" fill="#be123c" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="7" font-weight="900" letter-spacing="0.7">${escapeXml(draftSourceLabel)}</text>
  </g>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${XMLNS}" xmlns:xlink="${XLINK_NS}" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${renderWidthPx} ${renderHeightPx}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Kartu tanda pengenal ${escapeXml(name)}" data-card-asset="siab2-card-only" style="background: transparent;">
  <title>SIAB2 - ${escapeXml(name)}</title>
  <desc>SVG card-only ukuran CR80 ${widthMm}mm x ${heightMm}mm, tanpa wrapper preview, kanvas A4, atau background halaman.</desc>
  <defs>
    <clipPath id="${logoClipId}">
      <rect x="78" y="18" width="56" height="56" rx="18" ry="18" />
    </clipPath>
  </defs>
  <rect id="card-surface" width="${renderWidthPx}" height="${renderHeightPx}" rx="26" fill="#ffffff" />

  <g id="header">
    <rect x="0" y="0" width="324" height="108" fill="#ffffff" />
    <rect x="78" y="18" width="56" height="56" rx="18" fill="#ffffff" stroke="#e2e8f0" stroke-width="1" />
    <image href="${logoDataUrl}" xlink:href="${logoDataUrl}" x="82" y="22" width="48" height="48" preserveAspectRatio="xMidYMid meet" clip-path="url(#${logoClipId})" />
    <text x="150" y="44" fill="#071018" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="900" letter-spacing="4">SIAB2</text>
    <text x="150" y="61" fill="#557088" font-family="Arial, Helvetica, sans-serif" font-size="8" font-weight="900" letter-spacing="2.2">MAN 1 ROKAN HULU</text>
  </g>

  <g id="qr-panel">
    <rect x="0" y="108" width="90" height="210" fill="#0d3047" />
    <rect x="90" y="108" width="144" height="210" fill="#071018" />
    <rect x="234" y="108" width="90" height="210" fill="#0d3047" />
    <rect x="80" y="131" width="164" height="164" rx="28" fill="#ffffff" />
    <svg x="90" y="141" width="144" height="144" viewBox="${escapeXml(qrMarkup.viewBox || '0 0 144 144')}">
      ${qrMarkup.content}
    </svg>
  </g>

  <g id="identity-band">
    <rect x="0" y="318" width="324" height="96" fill="#0d3047" />
    <text x="162" y="353" fill="#ffffff" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${nameFontSize}" font-weight="900" letter-spacing="1.2">${escapeXml(name).toUpperCase()}</text>
    <text x="162" y="379" fill="#ffffff" text-anchor="middle" font-family="Courier New, monospace" font-size="13" font-weight="900" letter-spacing="2.1">${escapeXml(identityLine.label)}: ${escapeXml(identityLine.value)}</text>
    <text x="162" y="401" fill="#ffffff" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="900" letter-spacing="1.5">${escapeXml(roleLabel).toUpperCase()}</text>
  </g>

  <g id="footer">
    <rect x="0" y="414" width="324" height="100" fill="#ffffff" />
    <text x="162" y="461" fill="#557088" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="8" font-weight="900" letter-spacing="2.1">KARTU TANDA PENGENAL SIAB2</text>
    <text x="162" y="487" fill="#071018" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="900" letter-spacing="0.7">MAN 1 ROKAN HULU</text>
  </g>

  ${draftCard ? `<g id="draft-watermark" opacity="0.72" transform="translate(162 274) rotate(-45)">
    <rect x="-214" y="-22" width="428" height="44" fill="#fff1f2" stroke="#e11d48" stroke-width="4" />
    <text x="0" y="10" fill="#be123c" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="900" letter-spacing="4">DRAFT</text>
  </g>` : ''}
  ${draftBadgeMarkup}
</svg>`;
};

export const buildCardSvgFilename = (_user, index = 0) => {
  const order = String(index + 1).padStart(2, '0');
  return `kartu-siab2-${order}.svg`;
};

export const buildCardPngFilename = (_user, index = 0) => {
  const order = String(index + 1).padStart(2, '0');
  return `kartu-siab2-${order}.png`;
};
