import { siab2Data } from './data';

export default function StatsSection() {
  return (
    <section className="siab2p-stats-section" aria-label="Statistik SIAB2">
      <div className="siab2p-container">
        <div className="siab2p-stats-grid">
          {siab2Data.stats.map((stat) => (
            <div className="siab2p-stat-item" key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
