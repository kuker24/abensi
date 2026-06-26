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
            SIAB2 (Sistem Informasi Akademik Berkarakter) adalah platform ruang kerja digital untuk tata kelola madrasah modern. Dikembangkan untuk MAN 1 Rokan Hulu, Kementerian Agama RI.
          </p>
          <div className="siab2p-footer-chips">
            <span><i />Sistem Aktif</span>
            <span>TA 2026/2027</span>
            <span>EMIS Integrated</span>
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
            Untuk pertanyaan terkait aktivasi akun madrasah, integrasi EMIS, atau akses data akademik—silakan hubungi tim IT operator SIAB2.
          </p>
          <div className="siab2p-contact-card">
            <a href="mailto:operator@man1rokanhulu.sch.id"><span>📧</span>operator@man1rokanhulu.sch.id</a>
            <span><i>📍</i>Jl. D.I. Panjaitan, Ujung Batu, Rokan Hulu, Riau</span>
          </div>
          <div className="siab2p-footer-actions">
            <a className="siab2p-footer-primary" href="/login">Masuk ke SIAB2 ↗</a>
            <a className="siab2p-footer-secondary" href="mailto:operator@man1rokanhulu.sch.id">Hubungi Operator</a>
          </div>
        </div>
      </div>

      <div className="siab2p-container siab2p-footer-bottom">
        <span>© 2026 MAN 1 Rokan Hulu – Kementerian Agama RI. Hak Cipta Dilindungi.</span>
        <strong><i />SIAB2 v2.0.4 <em>·</em> Preview Build</strong>
      </div>
    </footer>
  );
}
