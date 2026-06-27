import { useEffect, useState } from 'react';

const navLinks = [
  { id: 'beranda', label: 'Beranda' },
  { id: 'modul', label: 'Modul' },
  { id: 'peran', label: 'Peran' },
  { id: 'preview', label: 'Tampilan' },
  { id: 'kontak', label: 'Kontak' }
] as const;

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeLink, setActiveLink] = useState('beranda');

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
      const scrollPosition = window.scrollY + 250;
      for (const link of navLinks) {
        const el = document.getElementById(link.id);
        if (!el) continue;
        const top = el.offsetTop;
        const height = el.offsetHeight;
        if (scrollPosition >= top && scrollPosition < top + height) {
          setActiveLink(link.id);
        }
      }
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <nav className="siab2p-nav-shell" aria-label="Navigasi utama SIAB2">
        <div className={`siab2p-nav ${scrolled ? 'siab2p-nav-scrolled' : ''}`}>
          <button className="siab2p-nav-brand" type="button" onClick={() => handleNavClick('beranda')} aria-label="Kembali ke beranda SIAB2">
            <span className="siab2p-nav-logo-wrap">
              <img src="/logoman1.jpeg" alt="Logo MAN 1 Rokan Hulu" />
            </span>
            <span className="siab2p-nav-brand-text">
              <strong>SIAB2</strong>
              <small>MAN 1 Rokan Hulu</small>
            </span>
          </button>

          <div className="siab2p-nav-links" aria-label="Section SIAB2">
            {navLinks.map((item) => (
              <button
                className={activeLink === item.id ? 'siab2p-nav-link siab2p-nav-link-active' : 'siab2p-nav-link'}
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="siab2p-nav-actions">
            <a className="siab2p-nav-cta" href="/siab2/login">
              <span>Masuk SIAB2 ↗</span>
            </a>
            <button
              className={`siab2p-menu-toggle ${mobileMenuOpen ? 'siab2p-menu-toggle-open' : ''}`}
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label={mobileMenuOpen ? 'Tutup menu SIAB2' : 'Buka menu SIAB2'}
              aria-expanded={mobileMenuOpen}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </nav>

      <div className={`siab2p-mobile-drawer ${mobileMenuOpen ? 'siab2p-mobile-drawer-open' : ''}`} aria-hidden={!mobileMenuOpen}>
        <div className="siab2p-mobile-drawer-links">
          {navLinks.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeLink === item.id ? 'siab2p-mobile-drawer-link siab2p-mobile-drawer-link-active' : 'siab2p-mobile-drawer-link'}
              onClick={() => handleNavClick(item.id)}
            >
              <span>{item.label}</span>
              <i>↗</i>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
