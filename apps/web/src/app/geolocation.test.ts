import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BrowserGeoError, captureBrowserGeolocation } from './geolocation';

function setGeolocation(geolocation: Partial<Geolocation> | undefined) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: geolocation
  });
}

describe('captureBrowserGeolocation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('requests high-accuracy fresh browser coordinates and maps payload fields', async () => {
    const getCurrentPosition = vi.fn((success) => success({
      coords: { latitude: -6.2, longitude: 106.816666, accuracy: 9 },
      timestamp: Date.parse('2026-06-14T01:00:00.000Z')
    }));
    setGeolocation({ getCurrentPosition } as unknown as Geolocation);

    await expect(captureBrowserGeolocation()).resolves.toEqual({
      latitude: -6.2,
      longitude: 106.816666,
      accuracyMeter: 9,
      capturedAt: '2026-06-14T01:00:00.000Z',
      source: 'browser_geolocation'
    });
    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    });
  });

  it('does not fabricate coordinates when permission is denied', async () => {
    const getCurrentPosition = vi.fn((_success, failure) => failure({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'denied' }));
    setGeolocation({ getCurrentPosition } as unknown as Geolocation);

    await expect(captureBrowserGeolocation()).rejects.toMatchObject({
      code: 'permission_denied'
    });
  });
});
