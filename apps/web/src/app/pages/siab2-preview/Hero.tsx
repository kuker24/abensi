import { useEffect, useState } from 'react';
import { ledgerItems, roleDetails } from './data';
import GradientButton from './GradientButton';
import VideoBackground from './VideoBackground';

function AcademicPreviewCard() {
  return (
    <aside className="siab2p-academic-card" aria-label="Profil resmi MAN 1 Rokan Hulu">
      <div className="siab2p-academic-card-orb" />
      <div className="siab2p-card-header">
        <div className="siab2p-card-title-dot">
          <strong>Profil Resmi Madrasah</strong>
        </div>
        <em>SIAB2</em>
      </div>

      <div className="siab2p-card-metric-grid siab2p-official-profile-grid">
        <div className="siab2p-card-metric siab2p-card-metric-wide">
          <span>Madrasah</span>
          <strong>MAN 1 Rokan Hulu</strong>
        </div>
        <div className="siab2p-card-metric siab2p-card-metric-wide">
          <span>Profil</span>
          <strong className="siab2p-text-accent">Madrasah Berbasis Riset</strong>
        </div>
        <div className="siab2p-card-metric siab2p-card-metric-wide">
          <span>Alamat</span>
          <strong>JL.TUANKU TAMBUSAI NO.183</strong>
        </div>
        <div className="siab2p-card-metric">
          <span>Telepon</span>
          <strong>07627393218</strong>
        </div>
        <div className="siab2p-card-metric siab2p-card-metric-wide">
          <span>Email</span>
          <strong>manpasir675027@yahoo.co.id</strong>
        </div>
      </div>

      <div className="siab2p-card-footer-note">
        <span>Sistem Informasi Akademik Berkarakter</span>
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
                <span>Di bawah naungan Kementerian Agama RI</span>
              </div>
            </div>

            <h1 id="siab2-preview-title">SIAB2</h1>
            <h2>Sistem Informasi Akademik Berkarakter</h2>
            <p className="siab2p-role-line" key={roleDetails[roleIndex].role}>
              Untuk <strong>{roleDetails[roleIndex].role}</strong>: {roleDetails[roleIndex].text}
            </p>
            <p className="siab2p-hero-description">
              Portal akademik untuk membantu tata kelola data siswa, kehadiran, jadwal pelajaran, jurnal mengajar, dan laporan madrasah dalam satu ruang kerja digital yang rapi dan mudah dipahami.
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
