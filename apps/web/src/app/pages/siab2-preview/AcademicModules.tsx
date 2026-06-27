import { siab2Data, type AcademicModule } from './data';

const studentRows = [
  { code: 'Identitas', name: 'Data Siswa', detail: 'Tersusun' },
  { code: 'Rombel', name: 'Data Kelas', detail: 'Terkelola' },
  { code: 'Riwayat', name: 'Data Akademik', detail: 'Tercatat' }
] as const;

function TablePreview() {
  return (
    <div className="siab2p-mini-table">
      <div className="siab2p-mini-table-head">
        <span>Area</span>
        <span>Data</span>
        <span>Keterangan</span>
        <span>Status</span>
      </div>
      <div className="siab2p-mini-table-body">
        {studentRows.map((row) => (
          <div className="siab2p-mini-table-row" key={row.code}>
            <span>{row.code}</span>
            <strong>{row.name}</strong>
            <span>{row.detail}</span>
            <em>Siap</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartPreview() {
  const rows = [
    { label: 'Hadir', width: '82%', status: 'Tercatat', className: 'siab2p-bar-emerald' },
    { label: 'Izin / Sakit', width: '52%', status: 'Tercatat', className: 'siab2p-bar-sky' },
    { label: 'Terlambat', width: '24%', status: 'Perlu Tinjauan', className: 'siab2p-bar-orange' }
  ] as const;

  return (
    <div className="siab2p-module-chart">
      <div className="siab2p-module-chart-title">
        <strong>Presensi Harian</strong>
        <em>Tampilan UI</em>
      </div>
      {rows.map((row) => (
        <div className="siab2p-chart-line" key={row.label}>
          <div>
            <span>{row.label}</span>
            <strong className={row.className}>{row.status}</strong>
          </div>
          <i><b className={row.className} style={{ width: row.width }} /></i>
        </div>
      ))}
    </div>
  );
}

function TimelinePreview() {
  return (
    <div className="siab2p-module-timeline">
      <div className="siab2p-module-timeline-head">
        <span>Waktu</span>
        <span>Mata Pelajaran</span>
        <span>Kelas</span>
      </div>
      <div className="siab2p-timeline-entry siab2p-timeline-entry-green">
        <div>
          <strong>Jadwal Pelajaran</strong>
          <span>Guru Pengampu</span>
        </div>
        <em>Kelas Aktif</em>
      </div>
      <div className="siab2p-timeline-entry siab2p-timeline-entry-blue">
        <div>
          <strong>Jurnal KBM Terisi</strong>
          <span>Catatan Guru</span>
        </div>
        <em>Arsip Akademik</em>
      </div>
    </div>
  );
}

function SignaturePreview() {
  return (
    <div className="siab2p-signature-preview">
      <div className="siab2p-signature-paper">
        <div className="siab2p-signature-head">
          <strong>MAN 1 Rokan Hulu</strong>
          <span>Laporan Rekap Bulanan Madrasah</span>
        </div>
        <div className="siab2p-signature-row">
          <span>Rekap Kehadiran:</span>
          <strong>Tersedia</strong>
        </div>
        <div className="siab2p-signature-row">
          <span>Jurnal Mengajar:</span>
          <strong className="siab2p-text-accent">Tertata</strong>
        </div>
        <div className="siab2p-signature-footer">
          <div>
            <span>MAN 1 Rokan Hulu</span>
            <small>SIAB2</small>
          </div>
          <div>
            <span>Kepala Madrasah</span>
            <em>Siap Verifikasi ✓</em>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderPreview(type: AcademicModule['previewType']) {
  switch (type) {
    case 'table':
      return <TablePreview />;
    case 'chart':
      return <ChartPreview />;
    case 'timeline':
      return <TimelinePreview />;
    case 'signature':
      return <SignaturePreview />;
  }
}

export default function AcademicModules() {
  return (
    <section id="modul" className="siab2p-section siab2p-modules-section" aria-labelledby="siab2-modules-title">
      <div className="siab2p-container">
        <div className="siab2p-section-head siab2p-section-head-split">
          <div>
            <span className="siab2p-eyebrow">Modul Akademik Unggulan</span>
            <h2 id="siab2-modules-title">
              Ruang kerja <em>akademik</em> dalam satu sistem
            </h2>
          </div>
          <p>
            SIAB2 dirancang untuk membantu menyusun data siswa, guru, kehadiran, jadwal, jurnal mengajar, dan laporan madrasah dalam tampilan yang rapi dan mudah digunakan.
          </p>
        </div>

        <div className="siab2p-module-grid">
          {siab2Data.modules.map((module, index) => (
            <article className={`siab2p-module-card siab2p-module-card-${index + 1}`} key={module.id}>
              <div className="siab2p-card-hover-wash" />
              <div className="siab2p-module-card-top">
                <span>{module.tag}</span>
                <button type="button" aria-label={`Lihat ${module.title}`}>↗</button>
              </div>
              <div className="siab2p-module-copy">
                <h3>{module.title}</h3>
                <p>{module.desc}</p>
              </div>
              <div className="siab2p-module-preview">{renderPreview(module.previewType)}</div>
            </article>
          ))}
        </div>

        <div className="siab2p-section-center-action">
          <button type="button" onClick={() => document.getElementById('preview')?.scrollIntoView({ behavior: 'smooth' })}>
            Lihat Tampilan SIAB2 <span>↓</span>
          </button>
        </div>
      </div>
    </section>
  );
}
