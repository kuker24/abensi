import { useEffect, useMemo, useState } from 'react';
import { getGeofencePolicy, updateGeofencePolicy } from '../lib/api';
import type { GeofencePolicy } from '../types/domain';
import { Badge, Button, Card, Input, useToast } from '../components/ui';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toMapEmbedUrl(centerLat: number, centerLng: number, radiusMeter: number) {
  const safeRadius = Math.max(50, radiusMeter);
  const latDelta = safeRadius / 111320;
  const lngDelta = safeRadius / (111320 * Math.max(Math.cos((centerLat * Math.PI) / 180), 0.2));
  const minLat = centerLat - latDelta;
  const maxLat = centerLat + latDelta;
  const minLng = centerLng - lngDelta;
  const maxLng = centerLng + lngDelta;
  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox
  )}&layer=mapnik&marker=${encodeURIComponent(`${centerLat},${centerLng}`)}`;
}

function toPreviewPolicy(policy: GeofencePolicy) {
  return [
    `Guru wajib berada dalam radius ${policy.radiusMeter} m saat membuka sesi: ${policy.enforceSessionOpen ? 'aktif' : 'nonaktif'}.`,
    `Perubahan status hadir ke terlambat menggunakan masa toleransi ${policy.arrivalGraceMinutes} menit.`,
    `Sesi terlewat ditandai setelah masa toleransi ${policy.autoMissedGraceMinutes} menit.`,
    `Tap gerbang sebelum buka sesi: ${policy.requireGateTapForOpen ? 'wajib' : 'opsional'}.`,
    `Hak override guru piket: ${policy.allowPicketOverride ? 'diizinkan' : 'dinonaktifkan'}.`
  ];
}

export function SystemSettingsPage() {
  const { pushToast } = useToast();
  const [centerLat, setCenterLat] = useState('0');
  const [centerLng, setCenterLng] = useState('0');
  const [radiusMeter, setRadiusMeter] = useState('300');
  const [arrivalGraceMinutes, setArrivalGraceMinutes] = useState('15');
  const [autoMissedGraceMinutes, setAutoMissedGraceMinutes] = useState('15');
  const [enforceSessionOpen, setEnforceSessionOpen] = useState(true);
  const [requireGateTapForOpen, setRequireGateTapForOpen] = useState(false);
  const [allowPicketOverride, setAllowPicketOverride] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const policy = await getGeofencePolicy();
        setCenterLat(String(policy.centerLat));
        setCenterLng(String(policy.centerLng));
        setRadiusMeter(String(policy.radiusMeter));
        setArrivalGraceMinutes(String(policy.arrivalGraceMinutes));
        setAutoMissedGraceMinutes(String(policy.autoMissedGraceMinutes));
        setEnforceSessionOpen(Boolean(policy.enforceSessionOpen));
        setRequireGateTapForOpen(Boolean(policy.requireGateTapForOpen));
        setAllowPicketOverride(Boolean(policy.allowPicketOverride));
      } catch (err: any) {
        pushToast(err?.response?.data?.message ?? 'Gagal memuat kebijakan geofence.', 'error');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [pushToast]);

  const parsed = useMemo(() => {
    const lat = Number(centerLat);
    const lng = Number(centerLng);
    const radius = Number(radiusMeter);
    const arrivalGrace = Number(arrivalGraceMinutes);
    const missedGrace = Number(autoMissedGraceMinutes);

    return {
      lat,
      lng,
      radius,
      arrivalGrace,
      missedGrace,
      validCoordinates:
        !Number.isNaN(lat) && !Number.isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180,
      validNumbers:
        !Number.isNaN(radius) &&
        !Number.isNaN(arrivalGrace) &&
        !Number.isNaN(missedGrace) &&
        radius >= 25 &&
        arrivalGrace >= 0 &&
        missedGrace >= 0
    };
  }, [arrivalGraceMinutes, autoMissedGraceMinutes, centerLat, centerLng, radiusMeter]);

  const policyDraft: GeofencePolicy = useMemo(
    () => ({
      centerLat: parsed.lat,
      centerLng: parsed.lng,
      radiusMeter: parsed.radius,
      enforceSessionOpen,
      arrivalGraceMinutes: parsed.arrivalGrace,
      autoMissedGraceMinutes: parsed.missedGrace,
      requireGateTapForOpen,
      allowPicketOverride
    }),
    [allowPicketOverride, enforceSessionOpen, parsed, requireGateTapForOpen]
  );

  const mapSrc = useMemo(() => {
    if (!parsed.validCoordinates || Number.isNaN(parsed.radius)) return null;
    return toMapEmbedUrl(parsed.lat, parsed.lng, parsed.radius);
  }, [parsed]);

  const radarSize = `${clamp((Number.isNaN(parsed.radius) ? 25 : (parsed.radius / 1000) * 100), 22, 100)}%`;

  async function handleSave() {
    if (!parsed.validCoordinates) {
      pushToast('Koordinat wajib valid: latitude -90..90 dan longitude -180..180.', 'error');
      return;
    }

    if (!parsed.validNumbers) {
      pushToast('Periksa radius dan masa toleransi. Nilai belum valid.', 'error');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateGeofencePolicy(policyDraft);
      setCenterLat(String(updated.centerLat));
      setCenterLng(String(updated.centerLng));
      setRadiusMeter(String(updated.radiusMeter));
      setArrivalGraceMinutes(String(updated.arrivalGraceMinutes));
      setAutoMissedGraceMinutes(String(updated.autoMissedGraceMinutes));
      setEnforceSessionOpen(Boolean(updated.enforceSessionOpen));
      setRequireGateTapForOpen(Boolean(updated.requireGateTapForOpen));
      setAllowPicketOverride(Boolean(updated.allowPicketOverride));
      pushToast('Pengaturan sistem berhasil disimpan.', 'success');
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal menyimpan pengaturan.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Pengaturan Sistem</h2>
        <p>Kelola geofence, masa toleransi, dan kebijakan operasional pembukaan sesi.</p>
      </Card>

      <section className="grid cols-2">
        <Card className="settings-panel">
          <div className="section-header">
            <h3>Kebijakan Inti</h3>
            {loading ? <Badge tone="warning">Memuat...</Badge> : <Badge tone="info">Draf Aktif</Badge>}
          </div>
          <div className="stack-sm">
            <label className="field-label">Latitude Titik Pusat</label>
            <Input value={centerLat} onChange={setCenterLat} />

            <label className="field-label">Longitude Titik Pusat</label>
            <Input value={centerLng} onChange={setCenterLng} />

            <label className="field-label">Radius Geofence (meter)</label>
            <Input value={radiusMeter} onChange={setRadiusMeter} />

            <label className="field-label">Masa Toleransi Hadir ke Terlambat (menit)</label>
            <Input value={arrivalGraceMinutes} onChange={setArrivalGraceMinutes} />

            <label className="field-label">Masa Toleransi Sesi Terlewat (menit)</label>
            <Input value={autoMissedGraceMinutes} onChange={setAutoMissedGraceMinutes} />
          </div>
        </Card>

        <Card className="settings-panel">
          <h3>Pratinjau Peta dan Radius</h3>
          <p>Pratinjau area geofence berdasarkan titik pusat koordinat dan radius saat ini.</p>

          <div className="settings-map-wrap">
            {mapSrc ? (
              <iframe
                title="Peta Pratinjau Geofence"
                src={mapSrc}
                className="settings-map-frame"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="empty-state">
                <h3>Koordinat belum valid</h3>
                <p>Isi latitude/longitude valid untuk menampilkan peta.</p>
              </div>
            )}
          </div>

          <div className="geofence-radar" aria-hidden="true">
            <div className="geofence-radar-ring" style={{ width: radarSize, height: radarSize }} />
            <div className="geofence-radar-center" />
          </div>
        </Card>
      </section>

      <section className="grid cols-2">
        <Card className="settings-panel">
          <h3>Kontrol Akses</h3>
          <div className="stack-sm">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={enforceSessionOpen}
                onChange={(event) => setEnforceSessionOpen(event.target.checked)}
              />
              <span>Aktifkan validasi geofence saat buka sesi</span>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={requireGateTapForOpen}
                onChange={(event) => setRequireGateTapForOpen(event.target.checked)}
              />
              <span>Wajib tap gerbang sebelum buka sesi</span>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={allowPicketOverride}
                onChange={(event) => setAllowPicketOverride(event.target.checked)}
              />
              <span>Izinkan guru piket membuka sesi pengganti</span>
            </label>
          </div>
        </Card>

        <Card className="settings-panel">
          <h3>Simulasi Dampak Kebijakan</h3>
          <ul className="bullet-list">
            {toPreviewPolicy(policyDraft).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="action-row">
            <Button onClick={() => void handleSave()} disabled={saving || loading}>
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
