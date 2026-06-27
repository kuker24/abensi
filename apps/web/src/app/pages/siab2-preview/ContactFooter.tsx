const navLinks = [
  { id: 'beranda', label: 'Beranda Utama' },
  { id: 'modul', label: 'Modul Akademik' },
  { id: 'peran', label: 'Hak Akses Peran' },
  { id: 'preview', label: 'Tampilan Portal' },
  { id: 'alur', label: 'Buku Induk Digital' },
  { id: 'kontak', label: 'Hubungi Operator' }
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
            SIAB2 (Sistem Informasi Akademik Berkarakter) adalah portal ruang kerja digital untuk mendukung tata kelola madrasah modern di MAN 1 Rokan Hulu.
          </p>
          <div className="siab2p-footer-chips">
            <span><i />Portal Resmi</span>
            <span>TA 2026/2027</span>
            <span>Siap Integrasi Data</span>
          </div>
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
          <h4>Hubungi Operator</h4>
          <p>
            Untuk pertanyaan terkait aktivasi akun madrasah atau akses data akademik, silakan hubungi admin/operator MAN 1 Rokan Hulu melalui kanal resmi madrasah.
          </p>
          <div className="siab2p-contact-card">
            <span><i>👤</i>Kontak operator madrasah</span>
            <span><i>📍</i>Rokan Hulu, Riau</span>
          </div>
          <div className="siab2p-footer-actions">
            <a className="siab2p-footer-primary" href="/siab2/login">Masuk ke SIAB2 ↗</a>
            <a className="siab2p-footer-secondary" href="#kontak">Hubungi Operator</a>
          </div>
        </div>
      </div>

      <div className="siab2p-container siab2p-footer-bottom">
        <span>© 2026 MAN 1 Rokan Hulu – Kementerian Agama RI. Hak Cipta Dilindungi.</span>
        <strong><i />Portal SIAB2 <em>·</em> Data Contoh</strong>
      </div>
    </footer>
  );
}
