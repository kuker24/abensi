import { useState, type ReactNode } from 'react';

interface ParallaxCard {
  id: number;
  title: string;
  detail: string;
  preview: ReactNode;
  benefit: string;
}

const studentRows = [
  { area: 'Identitas', name: 'Data Siswa', status: 'Tersusun' },
  { area: 'Rombel', name: 'Data Kelas', status: 'Terkelola' },
  { area: 'Riwayat', name: 'Data Akademik', status: 'Tercatat' }
] as const;

function BukuIndukPreview() {
  return (
    <div className="siab2p-parallax-mini-table">
      <div><span>Area</span><span>Data</span><span>Status</span></div>
      {studentRows.map((row) => (
        <p key={row.area}><span>{row.area}</span><strong>{row.name}</strong><em>{row.status}</em></p>
      ))}
    </div>
  );
}

function PresensiPreview() {
  const rows = [
    { label: 'Hadir', width: '82%', status: 'Tercatat', color: 'siab2p-bar-emerald' },
    { label: 'Izin', width: '48%', status: 'Tercatat', color: 'siab2p-bar-sky' },
    { label: 'Alfa', width: '24%', status: 'Perlu Tinjauan', color: 'siab2p-bar-rose' }
  ] as const;
  return (
    <div className="siab2p-parallax-progress">
      {rows.map((row) => (
        <div key={row.label}>
          <p><span>{row.label}</span><strong className={row.color}>{row.status}</strong></p>
          <i><b className={row.color} style={{ width: row.width }} /></i>
        </div>
      ))}
      <small>Ringkasan presensi kelas</small>
    </div>
  );
}

function JadwalPreview() {
  return (
    <div className="siab2p-parallax-schedule">
      <p><time>Jadwal</time><span><strong>Pelajaran</strong><em>Kelas aktif</em></span></p>
      <p><time>Jurnal</time><span><strong>Catatan KBM</strong><em>Guru pengampu</em></span></p>
    </div>
  );
}

function JurnalPreview() {
  const rows = [
    { label: 'Tujuan pembelajaran', done: false },
    { label: 'Kegiatan', done: false },
    { label: 'Jumlah JP', done: false },
    { label: 'Status ketuntasan', done: false }
  ];
  return (
    <div className="siab2p-parallax-checks">
      {rows.map((row) => (
        <p key={row.label} className={row.done ? 'siab2p-check-done' : ''}><span>{row.done ? '✓' : '○'}</span>{row.label}</p>
      ))}
      <small>Jurnal wajib sebelum sesi ditutup</small>
    </div>
  );
}

function RekapPreview() {
  return (
    <div className="siab2p-parallax-report">
      <strong>Rekap Kelas</strong>
      <span>Periode pilihan</span>
      <p><em>Sesi kelas</em><b>Tersedia</b></p>
      <p><em>Status kehadiran</em><b>Terhitung</b></p>
    </div>
  );
}

function LaporanPreview() {
  return (
    <div className="siab2p-parallax-report">
      <strong>MAN 1 Rokan Hulu</strong>
      <span>Laporan Rekap Lintas Kelas</span>
      <p><em>Rekap Kehadiran</em><b>Tersedia</b></p>
      <p><em>Jurnal Sesi</em><b>Per Sesi</b></p>
      <i>Siap ditinjau</i>
    </div>
  );
}

const cards: ParallaxCard[] = [
  {
    id: 1,
    title: 'Buku Induk Siswa',
    detail: 'Struktur data siswa, kelas, dan riwayat akademik disusun dalam satu alur kerja.',
    preview: <BukuIndukPreview />,
    benefit: 'Merapikan struktur data akademik'
  },
  {
    id: 2,
    title: 'Presensi Harian',
    detail: 'Rekapitulasi presensi membantu kerja harian guru dan petugas madrasah.',
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
    title: 'Jurnal Sesi Mengajar',
    detail: 'Pencatatan tujuan, kegiatan, jumlah JP, dan ketuntasan sebelum sesi ditutup.',
    preview: <JurnalPreview />,
    benefit: 'Mendukung monitoring KBM per hari'
  },
  {
    id: 5,
    title: 'Rekap Bulanan',
    detail: 'Rekap kelas sesuai periode pilihan untuk bahan tinjauan.',
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
              <div className="siab2p-benefit-line">{card.benefit}</div>
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
            <div className="siab2p-lightbox-status">Tampilan UI · Siap ditinjau</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
