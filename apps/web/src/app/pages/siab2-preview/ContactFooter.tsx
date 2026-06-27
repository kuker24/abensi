const navLinks = [
  { id: 'beranda', label: 'Beranda Utama' },
  { id: 'modul', label: 'Modul Akademik' },
  { id: 'peran', label: 'Hak Akses Peran' },
  { id: 'preview', label: 'Tampilan Portal' },
  { id: 'alur', label: 'Buku Induk Digital' },
  { id: 'kontak', label: 'Kontak Resmi' }
] as const;

export default function ContactFooter() {
  const handleNavClick = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer id="kontak" className="siab2p-footer">
      <div className="siab2p-marquee" aria-hidden="true">
        <div className="siab2p-marquee-track">
          {Array.from({ length: 8 }).map((_, index) => (
            <span key={index}>SIAB2 • Sistem Informasi Akademik Berkarakter • MAN 1 Rokan Hulu • Kementerian Agama RI •</span>
          ))}
        </div>
      </div>

      <div className="siab2p-container siab2p-footer-grid">
        <div className="siab2p-footer-brand-block">
          <div className="siab2p-footer-brand">
            <img src="/logoman1.jpeg" alt="Logo MAN 1 Rokan Hulu" />
            <div>
              <strong>SIAB2</strong>
              <span>MAN 1 Rokan Hulu</span>
            </div>
          </div>
          <p>
            SIAB2 (Sistem Informasi Akademik Berkarakter) adalah ruang kerja digital akademik untuk mendukung tata kelola MAN 1 Rokan Hulu.
          </p>
        </div>

        <nav className="siab2p-footer-nav" aria-label="Navigasi footer SIAB2">
          <h4>Navigasi</h4>
          {navLinks.map((link) => (
            <button key={link.id} type="button" onClick={() => handleNavClick(link.id)}>
              <span>→</span>{link.label}
            </button>
          ))}
        </nav>

        <div className="siab2p-footer-contact">
          <h4>Kontak Resmi</h4>
          <p>
            Kontak resmi MAN 1 Rokan Hulu.
          </p>
          <div className="siab2p-contact-card">
            <span><strong>Profil</strong> Madrasah Berbasis Riset</span>
            <span><strong>Alamat</strong> JL.TUANKU TAMBUSAI NO.183</span>
            <span><strong>Telepon</strong> <a href="tel:07627393218">07627393218</a></span>
            <span><strong>Email</strong> <a href="mailto:manpasir675027@yahoo.co.id">manpasir675027@yahoo.co.id</a></span>
          </div>
          <div className="siab2p-footer-actions">
            <a className="siab2p-footer-primary" href="/siab2/login">Masuk ke SIAB2 ↗</a>
            <a className="siab2p-footer-secondary" href="mailto:manpasir675027@yahoo.co.id">Email Madrasah</a>
          </div>
        </div>
      </div>

      <div className="siab2p-container siab2p-footer-bottom">
        <span>© 2026 MAN 1 Rokan Hulu – Kementerian Agama RI. Hak Cipta Dilindungi.</span>
        <strong>Madrasah Berbasis Riset</strong>
      </div>
    </footer>
  );
}
