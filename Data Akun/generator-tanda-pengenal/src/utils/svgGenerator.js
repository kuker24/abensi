import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import schoolLogo from '../assets/logoman1.jpeg';
import { buildQrValue } from './identityCard';
import {
  buildCardPngFilename,
  buildCardSVGMarkup,
  buildCardSvgFilename,
  getCardAssetDimensions,
  getResolvedCardAssetSettings,
} from './cardAssetMarkup';

export {
  buildCardPngFilename,
  buildCardSVGMarkup,
  buildCardSvgFilename,
  getCardAssetDimensions,
} from './cardAssetMarkup';

const DEFAULT_PNG_SCALE = 3;

const nextFrame = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => resolve());
    return;
  }

  setTimeout(resolve, 0);
});
const pause = (duration = 120) => new Promise((resolve) => setTimeout(resolve, duration));

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

export const generateCardSVG = async (user, options = {}) => {
  const settings = getResolvedCardAssetSettings(options);
  const qrValue = buildQrValue(user);
  const [qrMarkup, logoDataUrl] = await Promise.all([
    renderQrMarkup(qrValue),
    getLogoDataUrl(),
  ]);

  return buildCardSVGMarkup(user, { settings, qrMarkup, logoDataUrl });
};

export const generateCardPNGBlob = async (user, options = {}) => {
  const { renderWidthPx, renderHeightPx } = getCardAssetDimensions(options);
  const scale = Number.isFinite(options.scale) ? Math.max(1, options.scale) : DEFAULT_PNG_SCALE;
  const svgText = await generateCardSVG(user, options);
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();
    image.decoding = 'async';
    const imageLoaded = new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Gagal merender SVG kartu ke PNG.'));
    });

    image.src = url;
    await imageLoaded;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(renderWidthPx * scale);
    canvas.height = Math.round(renderHeightPx * scale);
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      throw new Error('Canvas tidak tersedia untuk export PNG.');
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Gagal membuat PNG kartu.'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
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

export const downloadPNG = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

export const downloadPNGCards = async (users, options = {}) => {
  const total = users.length;

  for (let index = 0; index < total; index += 1) {
    const user = users[index];
    const pngBlob = await generateCardPNGBlob(user, options);
    downloadPNG(pngBlob, buildCardPngFilename(user, index));
    options.onProgress?.({ current: index + 1, total });
    await pause();
  }

  return total;
};
