import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronRight, PlayCircle, X } from 'lucide-react';
import { apiFetch, go } from './api';
import { Btn, IconBtn } from './ui';
import { BRAND } from './branding';
import type { User } from './types';

const TUTORIAL_VERSION = '2026.04.26';

type TutorialStep = {
  title: string;
  body: string;
  action?: { label: string; path: string };
};

const COMMON_START: TutorialStep = {
  title: `Selamat datang di ${BRAND.compactName}`,
  body: 'Tutorial singkat ini membantu Anda mengenali menu penting. Anda bisa menyelesaikannya sekarang atau membukanya lagi dari tombol Panduan di bagian atas.'
};

function stepsForRole(role?: string): TutorialStep[] {
  if (role === 'DEVELOPER') {
    return [
      COMMON_START,
      { title: 'Pusat Kontrol Developer', body: 'Gunakan halaman ini untuk memantau kesiapan sistem dan mengaktifkan tutorial ulang untuk akun tertentu.', action: { label: 'Buka Pusat Kontrol', path: '/admin/developer-control' } },
      { title: 'Aktifkan tutorial untuk pengguna', body: 'Cari nama pengguna, cek status tutorialnya, lalu klik “Aktifkan Tutorial Lagi”. Pengguna akan melihat panduan saat login berikutnya.' },
      { title: 'Pantau riwayat perubahan dan kesehatan sistem', body: 'Setiap aksi developer tercatat di Riwayat Perubahan. Gunakan catatan ini untuk memastikan perubahan tetap jelas dan bisa ditelusuri.', action: { label: 'Buka Riwayat Perubahan', path: '/admin/audit' } }
    ];
  }
  if (role === 'KEPALA_SEKOLAH') {
    return [
      COMMON_START,
      { title: 'Mulai dari Ringkasan Kepala Sekolah', body: 'Halaman ini berisi indikator hadir, scan gerbang, sesi, dan ibadah siswa dalam mode baca saja.', action: { label: 'Buka Ringkasan', path: '/admin/principal-dashboard' } },
      { title: 'Baca laporan tanpa mengubah data', body: 'Gunakan menu laporan, kehadiran siswa, sholat siswa, dan aktivitas sekarang untuk memantau kondisi sekolah.' },
      { title: 'Tindak lanjut melalui petugas', body: 'Jika ada masalah, koordinasikan dengan Admin/TU atau Guru Piket agar perubahan tetap dilakukan oleh petugas berwenang.' }
    ];
  }
  if (role === 'OPERATOR_IT') {
    return [
      COMMON_START,
      { title: 'Mulai dari Cek Sistem', body: 'Cek aplikasi, kartu, dan HP scanner. Jika ada gangguan, buka menu HP Scanner & Kartu atau Riwayat Perubahan.', action: { label: 'Buka Cek Sistem', path: '/admin/it-dashboard' } },
      { title: 'Kelola HP scanner dan kartu', body: 'Gunakan menu HP Scanner & Kartu untuk aktivasi HP Android, menambah kartu, atau mengganti status kartu hilang.', action: { label: 'Buka HP Scanner & Kartu', path: '/admin/devices' } },
      { title: 'Lihat jejak perubahan', body: 'Riwayat Perubahan membantu operator melihat siapa melakukan perubahan dan kapan perubahan terjadi.', action: { label: 'Buka Riwayat Perubahan', path: '/admin/audit' } }
    ];
  }
  if (role === 'GURU_PIKET') {
    return [
      COMMON_START,
      { title: 'Pantau tugas piket hari ini', body: 'Halaman Tugas Piket Hari Ini menampilkan sesi dan masalah yang perlu dibantu. Mulai dari sana setiap pergantian piket.', action: { label: 'Buka Tugas Piket', path: '/admin/picket-dashboard' } },
      { title: 'Catat kejadian di Catatan Piket', body: 'Jika ada kejadian penting, catat di Catatan Piket agar petugas lain memahami riwayatnya.', action: { label: 'Buka Catatan Piket', path: '/admin/picket' } },
      { title: 'Bantu cek masalah', body: 'Bila ada siswa belum scan atau data kelas tidak cocok, buka Masalah yang Perlu Dicek dan tulis alasan tindak lanjut dengan jelas.', action: { label: 'Buka Cek Masalah', path: '/admin/anomaly' } }
    ];
  }
  if (role === 'GURU_MAPEL') {
    return [
      COMMON_START,
      { title: 'Absen masuk saat mulai kelas', body: 'Buka Isi Presensi Kelas, pilih sesi Anda, lalu klik Absen Masuk / Mulai Kelas saat pelajaran dimulai.', action: { label: 'Isi Presensi', path: '/guru/presensi' } },
      { title: 'Simpan presensi dan jurnal sesi', body: 'Catat presensi siswa, lalu isi tujuan pembelajaran, kegiatan, jumlah JP, dan status ketuntasan. Simpan jurnal sebelum menutup sesi.' },
      { title: 'Akhiri kelas setelah jurnal tersimpan', body: 'Pastikan presensi dan jurnal sesi sudah benar, lalu klik Simpan & Tutup Sesi. Jika presensi salah, gunakan Perbaiki Presensi dengan alasan yang jelas.', action: { label: 'Buka Perbaiki Presensi', path: '/guru/koreksi' } }
    ];
  }
  if (role === 'SISWA') {
    return [
      COMMON_START,
      { title: 'Lihat kehadiran Anda', body: 'Kehadiran Saya menampilkan data dari gerbang, mushola, dan kelas. Siswa hanya melihat data, tidak mengubah presensi.', action: { label: 'Buka Kehadiran Saya', path: '/siswa/dashboard' } },
      { title: 'Pahami status presensi', body: 'Status seperti Hadir, Telat, Izin, Sakit, atau Alpa akan muncul setelah guru menyimpan dan menutup sesi kelas.' },
      { title: 'Jika data belum sesuai', body: 'Hubungi wali kelas, guru mapel, atau guru piket. Petugas akan memeriksa catatan gerbang dan kelas.' }
    ];
  }
  return [
    COMMON_START,
    { title: 'Pantau sesi dan masalah', body: 'Gunakan Ringkasan Admin untuk melihat kondisi hari ini. Buka Cek Sesi Kelas dan Cek Masalah untuk tindak lanjut cepat.', action: { label: 'Buka Ringkasan', path: '/admin/dashboard' } },
    { title: 'Kelola data harian', body: 'Menu Riwayat Scan, Catatan Piket, Akun & Data Sekolah, Jadwal Kelas, dan Laporan Sekolah disusun sesuai alur kerja sekolah agar mudah digunakan.' },
    { title: 'Semua perubahan tercatat', body: 'Setiap perubahan penting masuk ke Riwayat Perubahan. Gunakan ini untuk memastikan data tetap aman dan transparan.', action: { label: 'Buka Riwayat Perubahan', path: '/admin/audit' } }
  ];
}

export function OnboardingTour({ user, manualOpenKey = 0 }: { user: User; manualOpenKey?: number }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [version, setVersion] = useState(TUTORIAL_VERSION);
  const versionRef = useRef(version);
  versionRef.current = version;
  const [loading, setLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const steps = useMemo(() => stepsForRole(String(user?.role || 'ADMIN_TU')), [user?.role]);
  const current = steps[Math.min(step, steps.length - 1)];

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ shouldShow?: boolean; version?: string }>('/tutorials/me')
      .then((data) => {
        if (cancelled) return;
        setVersion(data.version || TUTORIAL_VERSION);
        if (data.shouldShow) {
          setStep(0);
          setOpen(true);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (manualOpenKey > 0) {
      setStep(0);
      setOpen(true);
    }
  }, [manualOpenKey]);

  async function complete() {
    setLoading(true);
    try {
      await apiFetch('/tutorials/me/complete', { method: 'POST', body: JSON.stringify({ version }) });
    } catch {
      // Tutorial tetap boleh ditutup jika jaringan sedang bermasalah.
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  async function dismiss() {
    setLoading(true);
    try {
      await apiFetch('/tutorials/me/dismiss', { method: 'POST', body: JSON.stringify({ version: versionRef.current }) });
    } catch {
      // Aman diabaikan; pengguna bisa membuka ulang dari tombol panduan.
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cardRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); void dismiss(); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(cardRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); opener?.focus(); };
  }, [open]);

  function openAction(path: string) {
    setOpen(false);
    void apiFetch('/tutorials/me/dismiss', { method: 'POST', body: JSON.stringify({ version }) }).catch(() => undefined);
    go(path);
  }

  if (!open) return null;

  return <div className="tour-backdrop" role="dialog" aria-modal="true" aria-label="Tutorial awal">
    <div ref={cardRef} className="tour-card">
      <div className="tour-top"><div className="tour-icon"><BookOpen size={20} /></div><div><div className="eyebrow"><span className="dot" /> TUTORIAL AWAL</div><h2>{current.title}</h2></div><IconBtn label="Tutup tutorial" onClick={dismiss}><X size={16} /></IconBtn></div>
      <p>{current.body}</p>
      <div className="tour-progress" aria-label={`Langkah ${step + 1} dari ${steps.length}`}>{steps.map((item, index) => <span key={item.title} className={index <= step ? 'on' : ''} />)}</div>
      {current.action && <button type="button" className="tour-action" onClick={() => openAction(current.action!.path)}><PlayCircle size={16} /> {current.action.label} <ChevronRight size={14} /></button>}
      <div className="tour-foot"><Btn variant="ghost" disabled={loading} onClick={dismiss}>Lewati dulu</Btn><div className="row" style={{ gap: 8 }}><Btn variant="ghost" disabled={step === 0 || loading} onClick={() => setStep((v) => Math.max(0, v - 1))}>Kembali</Btn>{step < steps.length - 1 ? <Btn variant="primary" onClick={() => setStep((v) => Math.min(steps.length - 1, v + 1))}>Lanjut <ArrowRight size={14} /></Btn> : <Btn variant="primary" loading={loading} onClick={complete}><Check size={14} /> Selesai</Btn>}</div></div>
    </div>
  </div>;
}
