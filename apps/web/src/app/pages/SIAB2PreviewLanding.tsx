import { BRAND } from '../branding';

const previewStats = [
  ['Tahun Pelajaran', '2026/2027'],
  ['Semester', 'Genap'],
  ['Rombel Aktif', '24'],
  ['Siswa', '683'],
  ['Guru', '42'],
  ['Rekap Hari Ini', 'Preview']
] as const;

const academicModules = [
  {
    title: 'Data Siswa & Guru',
    description: 'Tampilan rapi untuk membaca identitas, status aktif, kelas, dan kelengkapan data akademik.',
    meta: 'Master data'
  },
  {
    title: 'Kehadiran Harian',
    description: 'Status hadir, izin, sakit, alfa, dan terlambat divisualkan jelas untuk kerja harian guru.',
    meta: 'Absensi'
  },
  {
    title: 'Jadwal & Jurnal Mengajar',
    description: 'Ruang kerja guru untuk melihat agenda kelas dan menyiapkan catatan kegiatan pembelajaran.',
    meta: 'KBM'
  },
  {
    title: 'Laporan Kepala Madrasah',
    description: 'Pratinjau ringkas untuk rekap bulanan, pemantauan, dan bahan validasi madrasah.',
    meta: 'Laporan'
  }
] as const;

const previewRows = [
  ['Kelas X IPA 1', 'Presensi berjalan', 'Hadir 31/34'],
  ['Kelas XI IPS 2', 'Menunggu jurnal', 'Guru mapel'],
  ['Kelas XII Agama', 'Rekap tersusun', 'Siap laporan']
] as const;

export default function SIAB2PreviewLanding() {
  return (
    <main className="siab2-preview" aria-labelledby="siab2-preview-title">
      <nav className="siab2-preview-nav" aria-label="Navigasi preview SIAB2">
        <a className="siab2-brand" href="/siab2-preview" aria-label="SIAB2 preview home">
          <img src="/logoman1.jpeg" alt="Logo MAN 1 Rokan Hulu" />
          <span>
            <strong>SIAB2</strong>
            <small>{BRAND.institution}</small>
          </span>
        </a>
        <div className="siab2-preview-links">
          <a href="#siab2-modul">Modul</a>
          <a href="#siab2-dashboard-preview">Preview</a>
          <a className="siab2-nav-login" href="/login">Masuk</a>
        </div>
      </nav>

      <section className="siab2-hero">
        <div className="siab2-hero-copy">
          <p className="siab2-kicker">Preview visual · belum memakai data production</p>
          <h1 id="siab2-preview-title">SIAB2</h1>
          <p className="siab2-subtitle">Sistem Informasi Akademik Berkarakter</p>
          <p className="siab2-supporting">Satu ruang kerja digital untuk admin, guru, siswa, operator, dan kepala madrasah.</p>
          <p className="siab2-description">Kelola data siswa, kehadiran harian, jadwal pelajaran, jurnal mengajar, dan laporan madrasah dalam tampilan yang rapi, aman, dan mudah dipahami.</p>
          <div className="siab2-actions" aria-label="Aksi preview SIAB2">
            <a className="siab2-button siab2-button-primary" href="/login">Masuk ke SIAB2</a>
            <a className="siab2-button siab2-button-secondary" href="#siab2-modul">Lihat Modul</a>
          </div>
        </div>

        <aside className="siab2-card siab2-status-card" aria-label="Kartu status akademik preview">
          <div className="siab2-status-head">
            <span>Academic Status</span>
            <strong>Preview</strong>
          </div>
          <div className="siab2-stat-grid">
            {previewStats.map(([label, value]) => (
              <div className="siab2-stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p>Data pada halaman ini adalah preview visual, bukan data production.</p>
        </aside>
      </section>

      <section className="siab2-section" id="siab2-modul" aria-labelledby="siab2-module-title">
        <div className="siab2-section-head">
          <p className="siab2-kicker">Modul Akademik</p>
          <h2 id="siab2-module-title">Fondasi ruang kerja madrasah</h2>
          <p>Empat area utama dari visual SIAB2 disiapkan sebagai arahan tampilan, bukan pengganti dashboard live yang sudah terhubung API.</p>
        </div>
        <div className="siab2-module-grid">
          {academicModules.map((module) => (
            <article className="siab2-card siab2-module-card" key={module.title}>
              <span>{module.meta}</span>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="siab2-section siab2-dashboard-section" id="siab2-dashboard-preview" aria-labelledby="siab2-dashboard-title">
        <div className="siab2-section-head">
          <p className="siab2-kicker">Dashboard preview static</p>
          <h2 id="siab2-dashboard-title">Konsep shell tanpa mengganti data real</h2>
          <p>Contoh di bawah ini hanya visual statis. Dashboard operasional tetap memakai route dan API existing di repo abensi.</p>
        </div>
        <div className="siab2-card siab2-dashboard-preview-card">
          <div className="siab2-window-bar">
            <span />
            <span />
            <span />
            <strong>Portal SIAB2 — MAN 1 Rokan Hulu</strong>
          </div>
          <div className="siab2-dashboard-grid">
            <div className="siab2-dashboard-panel">
              <p>Role Navigation</p>
              <div className="siab2-role-list" aria-label="Role preview">
                <span>Admin</span>
                <span>Guru</span>
                <span>Siswa</span>
                <span>Operator</span>
                <span>Kepala Madrasah</span>
              </div>
            </div>
            <div className="siab2-dashboard-panel siab2-dashboard-table">
              <p>Aktivitas Akademik</p>
              {previewRows.map(([kelas, status, info]) => (
                <div className="siab2-preview-row" key={kelas}>
                  <strong>{kelas}</strong>
                  <span>{status}</span>
                  <em>{info}</em>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="siab2-preview-footer">
        <strong>SIAB2 — {BRAND.fullName}</strong>
        <span>{BRAND.institution}. Preview visual untuk review integrasi, bukan halaman production final.</span>
      </footer>
    </main>
  );
}
