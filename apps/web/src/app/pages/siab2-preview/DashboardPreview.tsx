import { useState } from 'react';
import { siab2Data } from './data';
import StatusBadge from './StatusBadge';

type DashboardTab = 'admin' | 'guru' | 'siswa' | 'kepala';

const tabs: { id: DashboardTab; label: string }[] = [
  { id: 'admin', label: 'Admin Madrasah' },
  { id: 'guru', label: 'Guru' },
  { id: 'siswa', label: 'Portal Siswa' },
  { id: 'kepala', label: 'Kepala Madrasah' }
];

export default function DashboardPreview() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('admin');

  const renderContent = () => {
    if (activeTab === 'admin') {
      return (
        <div className="siab2p-dashboard-content">
          <div className="siab2p-dashboard-metrics siab2p-dashboard-metrics-admin">
            {siab2Data.dashboardMock.admin.metrics.map((metric) => (
              <div className="siab2p-dashboard-metric" key={metric.label}>
                <span>{metric.label}</span>
                <div>
                  <strong>{metric.value}</strong>
                  <StatusBadge type={metric.status} text={metric.change} />
                </div>
              </div>
            ))}
          </div>
          <div className="siab2p-dashboard-list-block">
            <p>Log Aktivitas & Peringatan Sistem</p>
            <div className="siab2p-dashboard-list">
              {siab2Data.dashboardMock.admin.alerts.map((alert) => (
                <div className="siab2p-dashboard-list-row" key={alert.name}>
                  <span className="siab2p-row-dot" />
                  <div>
                    <strong>{alert.name}</strong>
                    <small>{alert.detail}</small>
                  </div>
                  <StatusBadge type={alert.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'guru') {
      return (
        <div className="siab2p-dashboard-content">
          <div className="siab2p-dashboard-list-block">
            <p>Jadwal Mengajar Hari Ini</p>
            <div className="siab2p-dashboard-schedule-grid">
              {siab2Data.dashboardMock.guru.schedule.map((schedule) => (
                <div className="siab2p-dashboard-metric" key={schedule.time}>
                  <div className="siab2p-schedule-head">
                    <em>{schedule.time}</em>
                    <StatusBadge type={schedule.status} text={schedule.status === 'Aktif' ? 'Sedang KBM' : 'Menunggu'} />
                  </div>
                  <strong className="siab2p-schedule-title">{schedule.subject}</strong>
                  <small>Ruang Kelas: {schedule.class}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="siab2p-dashboard-list-block">
            <p>Tugas & Tindakan Penting</p>
            <div className="siab2p-dashboard-list">
              {siab2Data.dashboardMock.guru.alerts.map((alert) => (
                <div className="siab2p-dashboard-list-row" key={alert.name}>
                  <span className="siab2p-row-dot" />
                  <div>
                    <strong>{alert.name}</strong>
                    <small>{alert.detail}</small>
                  </div>
                  <StatusBadge type={alert.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'siswa') {
      return (
        <div className="siab2p-dashboard-content">
          <div className="siab2p-dashboard-list-block">
            <p>Ringkasan Kehadiran Semester</p>
            <div className="siab2p-attendance-grid">
              {siab2Data.dashboardMock.siswa.attendance.map((item) => (
                <div className={`siab2p-attendance-card siab2p-attendance-${item.status.toLowerCase()}`} key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="siab2p-dashboard-list-block">
            <p>Jadwal Kelas & Guru Hari Ini</p>
            <div className="siab2p-dashboard-list">
              {siab2Data.dashboardMock.siswa.schedule.map((schedule, index) => (
                <div className="siab2p-dashboard-list-row" key={schedule.subject}>
                  <span className="siab2p-row-number">{index + 1}</span>
                  <div>
                    <strong>{schedule.subject}</strong>
                    <small>Guru: {schedule.teacher}</small>
                  </div>
                  <em className="siab2p-row-time">{schedule.time}</em>
                  <StatusBadge type={schedule.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="siab2p-dashboard-content">
        <div className="siab2p-dashboard-metrics siab2p-dashboard-metrics-head">
          {siab2Data.dashboardMock.kepala.metrics.map((metric) => (
            <div className="siab2p-dashboard-metric" key={metric.label}>
              <span>{metric.label}</span>
              <div>
                <strong>{metric.value}</strong>
                <StatusBadge type={metric.status} text="Hari Ini" />
              </div>
              <i className="siab2p-metric-progress"><b style={{ width: metric.value }} /></i>
            </div>
          ))}
        </div>
        <div className="siab2p-dashboard-list-block">
          <p>Validasi & Tinjauan Laporan</p>
          <div className="siab2p-dashboard-list">
            {siab2Data.dashboardMock.kepala.approvals.map((approval) => (
              <div className="siab2p-dashboard-list-row" key={approval.name}>
                <span className="siab2p-row-dot" />
                <div>
                  <strong>{approval.name}</strong>
                  <small>{approval.detail}</small>
                </div>
                <span className="siab2p-small-action">Tinjau</span>
                <StatusBadge type={approval.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section id="preview" className="siab2p-section siab2p-dashboard-section" aria-labelledby="siab2-dashboard-title">
      <div className="siab2p-container">
        <div className="siab2p-section-head siab2p-section-head-split">
          <div>
            <span className="siab2p-eyebrow">Preview Portal SIAB2</span>
            <h2 id="siab2-dashboard-title">
              Dashboard <em>akademik</em> mudah dipahami
            </h2>
          </div>
          <p>
            Preview workspace interaktif yang membantu menampilkan rekapitulasi data contoh secara jelas tanpa visual yang membingungkan.
          </p>
        </div>

        <div className="siab2p-browser-mockup">
          <div className="siab2p-browser-accent" />
          <div className="siab2p-browser-header">
            <div className="siab2p-window-dots"><span /><span /><span /></div>
            <div className="siab2p-address-pill">Portal SIAB2 — MAN 1 Rokan Hulu</div>
            <div className="siab2p-connected"><span /> <strong>Mode Preview</strong></div>
          </div>

          <div className="siab2p-dashboard-tabs" role="tablist" aria-label="Preview role dashboard SIAB2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? 'siab2p-dashboard-tab siab2p-dashboard-tab-active' : 'siab2p-dashboard-tab'}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="siab2p-browser-content">{renderContent()}</div>
          <div className="siab2p-browser-status">
            <span>Preview Build — Data Contoh</span>
            <strong><i />Simulasi Tampilan</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
