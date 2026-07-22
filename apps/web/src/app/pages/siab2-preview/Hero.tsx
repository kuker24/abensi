import { useEffect, useState } from 'react';
import { ledgerItems, roleDetails } from './data';
import GradientButton from './GradientButton';
import VideoBackground from './VideoBackground';

function MadrasahPhotoPanel() {
  return (
    <figure className="siab2p-photo-panel" aria-label="Foto resmi MAN 1 Rokan Hulu">
      <div className="siab2p-photo-panel-glow" />
      <div className="siab2p-photo-frame">
        <img
          src="/man1-rohul-hero-group.jpeg"
          alt="Foto grup resmi MAN 1 Rokan Hulu di depan gedung madrasah"
          loading="eager"
          decoding="async"
        />
        <div className="siab2p-photo-sheen" aria-hidden="true" />
        <div className="siab2p-photo-badge">Dokumentasi Madrasah</div>
        <figcaption className="siab2p-photo-caption">
          <span>MAN 1 Rokan Hulu</span>
          <strong>Madrasah Berbasis Riset</strong>
        </figcaption>
      </div>
      <div className="siab2p-photo-meta" aria-hidden="true">
        <span>SIAB2</span>
        <i />
        <span>Portal Akademik</span>
      </div>
    </figure>
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
              Portal akademik untuk membantu tata kelola data siswa, kehadiran, jadwal pelajaran, jurnal per sesi mengajar, dan laporan madrasah dalam satu ruang kerja digital yang rapi dan mudah dipahami.
            </p>

            <div className="siab2p-hero-actions">
              <GradientButton onClick={() => scrollNext('preview')} variant="solid">Lihat Tampilan</GradientButton>
              <GradientButton onClick={() => scrollNext('modul')} variant="outline">Jelajahi Modul</GradientButton>
            </div>
          </div>

          <div className="siab2p-hero-card-slot">
            <MadrasahPhotoPanel />
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
