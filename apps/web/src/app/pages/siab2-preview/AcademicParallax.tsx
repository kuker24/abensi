import { useState, type ReactNode } from 'react';

interface ParallaxCard {
  id: number;
  title: string;
  detail: string;
  preview: ReactNode;
  benefit: string;
}

const studentRows = [
  { nisn: '********10', name: 'Siswa XII-01', status: 'Contoh' },
  { nisn: '********21', name: 'Siswa XI-02', status: 'Contoh' },
  { nisn: '********31', name: 'Siswa X-03', status: 'Contoh' }
] as const;

function BukuIndukPreview() {
  return (
    <div className="siab2p-parallax-mini-table">
      <div><span>NISN Demo</span><span>Data Contoh</span><span>Status</span></div>
      {studentRows.map((row) => (
        <p key={row.nisn}><span>{row.nisn}</span><strong>{row.name}</strong><em>{row.status}</em></p>
      ))}
    </div>
  );
}

function PresensiPreview() {
  const rows = [
    { label: 'Hadir', pct: 93.7, color: 'siab2p-bar-emerald' },
    { label: 'Izin', pct: 4.2, color: 'siab2p-bar-sky' },
    { label: 'Alfa', pct: 2.1, color: 'siab2p-bar-rose' }
  ] as const;
  return (
    <div className="siab2p-parallax-progress">
      {rows.map((row) => (
        <div key={row.label}>
          <p><span>{row.label}</span><strong className={row.color}>{row.pct}%</strong></p>
          <i><b className={row.color} style={{ width: `${row.pct}%` }} /></i>
        </div>
      ))}
      <small>Kelas XII MIPA 1 · Data Contoh</small>
    </div>
  );
}

function JadwalPreview() {
  return (
    <div className="siab2p-parallax-schedule">
      <p><time>07.30</time><span><strong>Fisika Peminatan</strong><em>XII MIPA 1</em></span></p>
      <p><time>09.15</time><span><strong>Fisika Umum</strong><em>XI IPS 2</em></span></p>
    </div>
  );
}

function JurnalPreview() {
  const rows = [
    { label: 'Materi disampaikan', done: true },
    { label: 'Absensi diisi', done: true },
    { label: 'Jurnal KBM terisi', done: false },
    { label: 'Evaluasi dicatat', done: false }
  ];
  return (
    <div className="siab2p-parallax-checks">
      {rows.map((row) => (
        <p key={row.label} className={row.done ? 'siab2p-check-done' : ''}><span>{row.done ? '✓' : '○'}</span>{row.label}</p>
      ))}
      <small>Guru Mapel 01</small>
    </div>
  );
}

function RekapPreview() {
  return (
    <div className="siab2p-parallax-bars">
      <div>
        {[78, 92, 88, 95, 90, 97].map((value, index) => (
          <p key={value + index}><i style={{ height: `${(value / 100) * 52}px` }} /><span>{['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun'][index]}</span></p>
        ))}
      </div>
      <small>Kehadiran Bulanan (%)</small>
    </div>
  );
}

function LaporanPreview() {
  return (
    <div className="siab2p-parallax-report">
      <strong>MAN 1 Rokan Hulu</strong>
      <span>Laporan Rekap Lintas Kelas</span>
      <p><em>Rasio Kehadiran</em><b>96.8%</b></p>
      <p><em>Jurnal Terisi</em><b>92.4%</b></p>
      <i>Siap Verifikasi ✓</i>
    </div>
  );
}

const cards: ParallaxCard[] = [
  {
    id: 1,
    title: 'Buku Induk Siswa',
    detail: 'Contoh daftar NISN tersamarkan, data keluarga, dan mutasi akademik dalam sistem.',
    preview: <BukuIndukPreview />,
    benefit: 'Merapikan struktur data akademik'
  },
  {
    id: 2,
    title: 'Presensi Harian',
    detail: 'Contoh rekapitulasi presensi untuk membantu kerja harian guru.',
    preview: <PresensiPreview />,
    benefit: 'Mendukung tinjauan absensi pimpinan'
  },
  {
    id: 3,
    title: 'Jadwal Mengajar',
    detail: 'Distribusi KBM mingguan terhindar dari bentrokan jadwal guru.',
    preview: <JadwalPreview />,
    benefit: 'Membantu deteksi bentrok jam mengajar'
  },
  {
    id: 4,
    title: 'Jurnal Mengajar Guru',
    detail: 'Pencatatan materi pelajaran dan kendala kelas secara langsung.',
    preview: <JurnalPreview />,
    benefit: 'Mendukung monitoring KBM per hari'
  },
  {
    id: 5,
    title: 'Rekap Bulanan',
    detail: 'Statistik visual kehadiran dan jurnal bulanan untuk bahan tinjauan.',
    preview: <RekapPreview />,
    benefit: 'Merapikan bahan rekapitulasi data'
  },
  {
    id: 6,
    title: 'Laporan Madrasah',
    detail: 'Tampilan pelaporan kinerja akademik untuk bahan tinjauan pimpinan.',
    preview: <LaporanPreview />,
    benefit: 'Merapikan bahan pendukung akreditasi'
  }
];

export default function AcademicParallax() {
  const [focusedCard, setFocusedCard] = useState<ParallaxCard | null>(null);

  return (
    <section id="alur" className="siab2p-section siab2p-parallax-section" aria-labelledby="siab2-parallax-title">
      <div className="siab2p-container">
        <div className="siab2p-section-head siab2p-section-head-center">
          <span className="siab2p-eyebrow">Ruang Akademik Digital</span>
          <h2 id="siab2-parallax-title">
            Buku induk <em>digital</em> madrasah
          </h2>
          <p>
            Semua instrumen KBM dan administrasi disusun dalam alur kerja yang rapi untuk mendukung madrasah berkarakter.
          </p>
        </div>

        <div className="siab2p-parallax-grid">
          {cards.map((card) => (
            <button className="siab2p-parallax-card" key={card.id} type="button" onClick={() => setFocusedCard(card)}>
              <div className="siab2p-card-hover-wash" />
              <div className="siab2p-parallax-card-head">
                <div>
                  <span>Modul 0{card.id}</span>
                  <strong>{card.title}</strong>
                </div>
                <em>↗</em>
              </div>
              <div className="siab2p-parallax-preview">{card.preview}</div>
              <p>{card.detail}</p>
              <div className="siab2p-benefit-line"><i />{card.benefit}</div>
            </button>
          ))}
        </div>
      </div>

      {focusedCard ? (
        <div className="siab2p-lightbox" role="dialog" aria-modal="true" aria-label={focusedCard.title} onClick={() => setFocusedCard(null)}>
          <div className="siab2p-lightbox-card" onClick={(event) => event.stopPropagation()}>
            <div className="siab2p-lightbox-head">
              <span>Modul 0{focusedCard.id}</span>
              <button type="button" onClick={() => setFocusedCard(null)} aria-label="Tutup detail modul">✕</button>
            </div>
            <h3>{focusedCard.title}</h3>
            <p>{focusedCard.detail}</p>
            {focusedCard.preview}
            <div className="siab2p-lightbox-status"><i />Tampilan UI · Siap Verifikasi</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
