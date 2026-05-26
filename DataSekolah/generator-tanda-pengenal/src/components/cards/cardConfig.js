export const CARD_WIDTH_MM = 55;
export const CARD_HEIGHT_MM = 85;
export const CARD_PIXEL_WIDTH = 208;
export const CARD_PIXEL_HEIGHT = 321;

const safeText = (value, fallback = '—') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

export const getQrPayload = (user) => {
  const explicitQr = safeText(
    user?.qrCode || user?.qr || user?.qrPayload || user?.credentialQr || user?.raw?.qrCode || user?.raw?.['QR Code'] || user?.raw?.KodeQR,
    ''
  );

  if (explicitQr) return explicitQr;

  const identifier = safeText(user?.username || user?.idNumber || user?.raw?.Username, 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-');

  return `schoolhub:id-card:v1:${identifier}`;
};
