import { useEffect, useState } from 'react';
import { getMe, updateMe } from '../lib/api';
import { Button, Card, Input, StatusPill, useToast } from '../components/ui';

export function ProfilePage() {
  const { pushToast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await getMe();
      setProfile(data);
      setFullName(data.fullName ?? '');
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memuat profil.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSave() {
    if (fullName.trim().length < 3) {
      pushToast('Nama minimal 3 karakter.', 'error');
      return;
    }

    try {
      const updated = await updateMe(fullName.trim());
      setProfile((prev: any) => ({ ...prev, ...updated }));
      pushToast('Profil berhasil diperbarui.', 'success');
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal menyimpan profil.', 'error');
    }
  }

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Profil Pengguna</h2>
        <p>Kelola data profil pribadi lintas role.</p>
      </Card>

      <Card>
        {loading ? <p>Memuat profil...</p> : null}

        {profile ? (
          <div className="profile-grid">
            <div className="stack-sm">
              <label>Username</label>
              <Input value={profile.username ?? ''} onChange={() => undefined} disabled />

              <label>Nama Lengkap</label>
              <Input value={fullName} onChange={setFullName} />

              <label>Role</label>
              <div>
                <StatusPill status={profile.role} />
              </div>

              <Button onClick={() => void handleSave()}>Simpan Profil</Button>
            </div>

            <div className="stack-sm">
              <h3>Ringkasan Akun</h3>
              <p>Status akun: {profile.active ? 'Aktif' : 'Nonaktif'}</p>
              <p>Status kartu: {profile.cardStatus ?? '-'}</p>
              <p>Kartu UID: {profile.smartCard?.uid ?? 'Belum terhubung'}</p>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
