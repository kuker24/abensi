const BULK_GENERATE_PATH = '/api/v1/qr-credentials/bulk-generate';
const BULK_GENERATE_BODY = JSON.stringify({ label: 'QR Absensi SIAB2', onlyMissing: true });

export const bulkGenerateMissingQr = async (csrfToken, fetchImpl = fetch) => {
  if (!csrfToken) throw new Error('Sesi keamanan tidak tersedia. Muat ulang generator lalu coba lagi.');

  const response = await fetchImpl(BULK_GENERATE_PATH, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    credentials: 'include',
    body: BULK_GENERATE_BODY,
  });
  if (!response.ok) throw new Error(`Gagal membuat QR yang belum ada (HTTP ${response.status})`);

  return response;
};
