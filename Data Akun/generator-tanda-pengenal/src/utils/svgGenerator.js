import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import schoolLogo from '../assets/logoman1.jpeg';
import { DEFAULT_CARD_SETTINGS, getCardTemplate } from './cardTemplates';
import { buildQrValue } from './identityCard';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XMLNS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const pause = (duration = 120) => new Promise((resolve) => setTimeout(resolve, duration));

const escapeXml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const sanitizeFilenameSegment = (value = 'kartu') => {
  const normalized = String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'kartu';
};

const imageUrlToDataUrl = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Gagal memuat logo untuk SVG.');
  }

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Gagal membaca logo untuk SVG.'));
    reader.readAsDataURL(blob);
  });
};

let cachedLogoDataUrl = null;

const getLogoDataUrl = async () => {
  if (!cachedLogoDataUrl) {
    cachedLogoDataUrl = await imageUrlToDataUrl(schoolLogo);
  }

  return cachedLogoDataUrl;
};

const renderQrMarkup = async (value) => {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '160px';
  container.style.height = '160px';
  container.style.opacity = '0';
  document.body.appendChild(container);

  const root = createRoot(container);

  try {
    flushSync(() => {
      root.render(
        React.createElement(QRCodeSVG, {
          value,
          size: 144,
          level: 'M',
          bgColor: '#ffffff',
          fgColor: '#071018',
          marginSize: 2,
        }),
      );
    });

    await nextFrame();

    const qrSvg = container.querySelector('svg');
    if (!qrSvg) {
      throw new Error('Gagal membuat QR SVG.');
    }

    return {
      viewBox: qrSvg.getAttribute('viewBox') || '0 0 144 144',
      content: qrSvg.innerHTML,
    };
  } finally {
    root.unmount();
    container.remove();
  }
};

const getNameFontSize = (name) => {
  if (name.length > 30) return 12;
  if (name.length > 24) return 14;
  if (name.length > 18) return 16;
  return 18;
};

export const generateCardSVG = async (user, options = {}) => {
  if (!user) {
    throw new Error('Data kartu tidak tersedia.');
  }

  const settings = {
    ...DEFAULT_CARD_SETTINGS,
    ...(options.settings || {}),
  };
  const template = getCardTemplate(settings.cardSkin);
  const { widthMm, heightMm, renderWidthPx, renderHeightPx } = template.dimensions;
  const qrValue = buildQrValue(user);
  const qrMarkup = await renderQrMarkup(qrValue);
  const logoDataUrl = await getLogoDataUrl();
  const name = user.nama || 'Nama belum diisi';
  const nisn = user.nisn || '-';
  const classOrRole = user.kelas || user.role || user.jurusan || '-';
  const issuerLabelText = settings.issuerLabel?.toLowerCase().includes('tanda pengenal')
    ? 'Kartu Digital Madrasah'
    : settings.issuerLabel || 'Kartu Digital Madrasah';
  const nameFontSize = getNameFontSize(name);
  const logoClipId = `logoClip-${sanitizeFilenameSegment(nisn)}-${Date.now()}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${XMLNS}" xmlns:xlink="${XLINK_NS}" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${renderWidthPx} ${renderHeightPx}" role="img" aria-label="Kartu tanda pengenal ${escapeXml(name)}">
  <title>Kartu Digital Madrasah SIAB2 - ${escapeXml(name)}</title>
  <desc>SVG ukuran kartu CR80 ${widthMm}mm x ${heightMm}mm, tidak ditempatkan pada kertas A4.</desc>
  <defs>
    <clipPath id="${logoClipId}">
      <rect x="78" y="18" width="56" height="56" rx="18" ry="18" />
    </clipPath>
  </defs>
  <rect width="324" height="514" rx="26" fill="#ffffff" />

  <g id="header">
    <rect x="0" y="0" width="324" height="108" fill="#ffffff" />
    <rect x="78" y="18" width="56" height="56" rx="18" fill="#ffffff" stroke="#e2e8f0" stroke-width="1" />
    <image href="${logoDataUrl}" xlink:href="${logoDataUrl}" x="82" y="22" width="48" height="48" preserveAspectRatio="xMidYMid meet" clip-path="url(#${logoClipId})" />
    <text x="150" y="44" fill="#071018" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="900" letter-spacing="4">SIAB2</text>
    <text x="150" y="61" fill="#557088" font-family="Arial, Helvetica, sans-serif" font-size="8" font-weight="900" letter-spacing="2.2">MAN 1 ROKAN HULU</text>
    <text x="162" y="94" fill="#0d3047" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="900" letter-spacing="1.2">${escapeXml(issuerLabelText).toUpperCase()}</text>
  </g>

  <g id="qr-panel">
    <rect x="0" y="108" width="90" height="210" fill="#0d3047" />
    <rect x="90" y="108" width="144" height="210" fill="#071018" />
    <rect x="234" y="108" width="90" height="210" fill="#0d3047" />
    <rect x="80" y="131" width="164" height="164" rx="28" fill="#ffffff" />
    <svg x="90" y="141" width="144" height="144" viewBox="${escapeXml(qrMarkup.viewBox)}">
      ${qrMarkup.content}
    </svg>
  </g>

  <g id="identity-band">
    <rect x="0" y="318" width="324" height="96" fill="#0d3047" />
    <text x="162" y="353" fill="#ffffff" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${nameFontSize}" font-weight="900" letter-spacing="1.2">${escapeXml(name).toUpperCase()}</text>
    <text x="162" y="379" fill="#ffffff" text-anchor="middle" font-family="Courier New, monospace" font-size="13" font-weight="900" letter-spacing="2.1">${escapeXml(nisn)}</text>
    <text x="162" y="401" fill="#ffffff" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="900" letter-spacing="1.5">${escapeXml(classOrRole).toUpperCase()}</text>
  </g>

  <g id="footer">
    <rect x="0" y="414" width="324" height="100" fill="#ffffff" />
    <text x="162" y="461" fill="#557088" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="8" font-weight="900" letter-spacing="2.1">KARTU DIGITAL MADRASAH</text>
    <text x="162" y="487" fill="#071018" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="900" letter-spacing="0.7">MAN 1 ROKAN HULU</text>
  </g>
</svg>`;
};

export const downloadSVG = (svgText, filename) => {
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const buildCardSvgFilename = (user, index = 0) => {
  const order = String(index + 1).padStart(2, '0');
  const identity = user?.nisn || user?.nama || order;
  return `kartu-siab2-${order}-${sanitizeFilenameSegment(identity)}.svg`;
};

export const downloadSVGCards = async (users, options = {}) => {
  const total = users.length;

  for (let index = 0; index < total; index += 1) {
    const user = users[index];
    const svgText = await generateCardSVG(user, options);
    downloadSVG(svgText, buildCardSvgFilename(user, index));
    options.onProgress?.({ current: index + 1, total });
    await pause();
  }

  return total;
};
