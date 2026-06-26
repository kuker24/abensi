import { useEffect, useState } from 'react';
import { ledgerItems, roleDetails } from './data';
import GradientButton from './GradientButton';
import VideoBackground from './VideoBackground';

function AcademicPreviewCard() {
  return (
    <aside className="siab2p-academic-card" aria-label="Status Portal SIAB2">
      <div className="siab2p-academic-card-orb" />
      <div className="siab2p-card-header">
        <div className="siab2p-card-title-dot">
          <span />
          <strong>Status Portal SIAB2</strong>
        </div>
        <em>Tahun Ajaran</em>
      </div>

      <div className="siab2p-card-metric-grid">
        <div className="siab2p-card-metric">
          <span>Tahun Pelajaran</span>
          <strong>2026/2027</strong>
        </div>
        <div className="siab2p-card-metric">
          <span>Semester</span>
          <strong className="siab2p-text-accent">Genap</strong>
        </div>
        <div className="siab2p-card-metric siab2p-card-metric-wide">
          <div className="siab2p-presence-row">
            <div>
              <span>Status Presensi Hari Ini</span>
              <strong>97.4% Hadir</strong>
            </div>
            <i>Data Contoh</i>
          </div>
          <div className="siab2p-progress-track">
            <div className="siab2p-progress-fill" />
          </div>
        </div>
        <div className="siab2p-card-metric">
          <span>Kelas Aktif</span>
          <strong>24 Rombel</strong>
        </div>
        <div className="siab2p-card-metric">
          <span>Siswa & Guru</span>
          <strong>683 / 42 Orang</strong>
        </div>
      </div>

      <div className="siab2p-card-footer-note">
        <span>Preview UI SIAB2</span>
        <strong>MAN 1 Rokan Hulu</strong>
      </div>
    </aside>
  );
}

export default function Hero() {
  const [roleIndex, setRoleIndex] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setRoleIndex((prev) => (prev + 1) % roleDetails.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const scrollNext = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="beranda" className="siab2p-hero" aria-labelledby="siab2-preview-title">
      <VideoBackground />

      <div className="siab2p-hero-inner">
        <div className="siab2p-hero-grid">
          <div className="siab2p-hero-copy">
            <div className="siab2p-institution-badge">
              <img src="/logoman1.jpeg" alt="Logo MAN 1 Rokan Hulu" />
              <div>
                <p>MAN 1 Rokan Hulu</p>
                <span>Kementerian Agama RI</span>
              </div>
            </div>

            <h1 id="siab2-preview-title">SIAB2</h1>
            <h2>Sistem Informasi Akademik Berkarakter</h2>
            <p className="siab2p-role-line" key={roleDetails[roleIndex].role}>
              Untuk <strong>{roleDetails[roleIndex].role}</strong>: {roleDetails[roleIndex].text}
            </p>
            <p className="siab2p-hero-description">
              Dirancang untuk membantu menyusun data siswa, kehadiran harian, jadwal pelajaran, jurnal mengajar, dan laporan madrasah dalam satu ruang kerja digital yang rapi, aman, dan mudah dipahami.
            </p>

            <div className="siab2p-hero-actions">
              <GradientButton onClick={() => scrollNext('preview')} variant="solid">Lihat Tampilan</GradientButton>
              <GradientButton onClick={() => scrollNext('modul')} variant="outline">Jelajahi Modul</GradientButton>
            </div>
          </div>

          <div className="siab2p-hero-card-slot">
            <AcademicPreviewCard />
          </div>
        </div>
      </div>

      <button className="siab2p-scroll-indicator" type="button" onClick={() => scrollNext('modul')} aria-label="Scroll ke modul akademik">
        <span>Scroll</span>
        <i />
      </button>

      <div className="siab2p-ledger-strip" aria-label="Ringkasan akademik SIAB2">
        <div className="siab2p-ledger-grid">
          {ledgerItems.map((item) => (
            <div className="siab2p-ledger-item" key={item.label}>
              <span>{item.label}</span>
              <strong className={'good' in item ? 'siab2p-ledger-good' : ''}>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
