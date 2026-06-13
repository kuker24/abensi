export type BrowserGeoPayload = {
  latitude: number;
  longitude: number;
  accuracyMeter: number;
  capturedAt: string;
  source: 'browser_geolocation';
};

export type BrowserGeoErrorCode =
  | 'permission_denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported'
  | 'unknown';

export class BrowserGeoError extends Error {
  constructor(public readonly code: BrowserGeoErrorCode, message: string) {
    super(message);
    this.name = 'BrowserGeoError';
  }
}

const GEOLOCATION_TIMEOUT_MS = 10000;

export function captureBrowserGeolocation(timeoutMs = GEOLOCATION_TIMEOUT_MS): Promise<BrowserGeoPayload> {
  if (!('geolocation' in navigator)) {
    return Promise.reject(new BrowserGeoError('unsupported', 'Browser tidak mendukung geolocation.'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeter: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
          source: 'browser_geolocation'
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new BrowserGeoError('permission_denied', 'Izin lokasi ditolak. Aktifkan izin lokasi lalu coba lagi.'));
          return;
        }
        if (error.code === error.POSITION_UNAVAILABLE) {
          reject(new BrowserGeoError('unavailable', 'Lokasi tidak tersedia. Pastikan GPS aktif dan sinyal memadai.'));
          return;
        }
        if (error.code === error.TIMEOUT) {
          reject(new BrowserGeoError('timeout', 'Pengambilan lokasi terlalu lama. Coba lagi.'));
          return;
        }
        reject(new BrowserGeoError('unknown', error.message || 'Gagal mengambil lokasi.'));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: timeoutMs
      }
    );
  });
}
