import { siab2Data } from './data';

function StatLabel({ value, label }: { value: string; label: string }) {
  if (value === 'Email') {
    return (
      <span className="siab2p-stat-label siab2p-stat-label-email" aria-label={label}>
        <span>manpasir675027</span>
        <span>@yahoo.co.id</span>
      </span>
    );
  }

  return <span className="siab2p-stat-label">{label}</span>;
}

export default function StatsSection() {
  return (
    <section className="siab2p-stats-section" aria-label="Informasi SIAB2">
      <div className="siab2p-container">
        <div className="siab2p-stats-grid">
          {siab2Data.stats.map((stat) => (
            <div className="siab2p-stat-item" key={stat.label}>
              <strong>{stat.value}</strong>
              <StatLabel value={stat.value} label={stat.label} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
