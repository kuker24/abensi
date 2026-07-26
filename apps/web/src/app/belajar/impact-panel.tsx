import { ArrowRight, Sparkles, X } from 'lucide-react';
import { DEMO_ROLES, type DemoEvent, type DemoRole } from './world';
import { labGo, roleHomePath } from './lab-nav';

export function ImpactPanel({
  event,
  onClose
}: {
  event: DemoEvent;
  onClose: () => void;
}) {
  function jump(role: DemoRole) {
    onClose();
    labGo(roleHomePath(role));
  }

  return (
    <div className="belajar-impact-backdrop" role="dialog" aria-modal="true" aria-label="Dampak keputusan" data-demo="impact-panel">
      <div className="belajar-impact-panel">
        <div className="belajar-impact-head">
          <span className="belajar-impact-badge"><Sparkles size={14} /> Menu ajaib · Dampak keputusan</span>
          <button type="button" className="btn icon ghost" aria-label="Tutup" onClick={onClose}><X size={16} /></button>
        </div>
        <h2>{event.summary}</h2>
        <p className="belajar-analogy">{event.analogy}</p>
        <div className="belajar-impact-list">
          {event.impacts.map((impact) => {
            const meta = DEMO_ROLES.find((r) => r.id === impact.role);
            return (
              <button key={`${impact.role}-${impact.surface}`} type="button" className="belajar-impact-card" onClick={() => jump(impact.role)}>
                <div>
                  <b>{meta?.label || impact.role}</b>
                  <small>{impact.surface}</small>
                  <p>{impact.message}</p>
                </div>
                <ArrowRight size={16} />
              </button>
            );
          })}
        </div>
        <p className="muted belajar-impact-hint">Klik kartu di atas untuk pindah peran di dunia latihan yang sama. Data production tidak berubah.</p>
        <button type="button" className="btn primary" onClick={onClose}>Mengerti, lanjut latihan</button>
      </div>
    </div>
  );
}
