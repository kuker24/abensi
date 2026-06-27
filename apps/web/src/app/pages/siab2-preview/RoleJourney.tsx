import { useState } from 'react';
import { siab2Data } from './data';

function RoleIcon() {
  return (
    <svg className="siab2p-role-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.75 4.5 7.5l7.5 3.75 7.5-3.75L12 3.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6.75 9.75v4.5c0 1.85 2.35 3.35 5.25 3.35s5.25-1.5 5.25-3.35v-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M19.5 8.25v5.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function RoleJourney() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeRole = siab2Data.roles[activeIndex];

  return (
    <section id="peran" className="siab2p-section siab2p-role-section" aria-labelledby="siab2-role-title">
      <div className="siab2p-container">
        <div className="siab2p-section-head siab2p-section-head-split">
          <div>
            <span className="siab2p-eyebrow">Akses Sesuai Peran</span>
            <h2 id="siab2-role-title">
              Ruang kerja disusun sesuai <em>peran</em>
            </h2>
          </div>
          <p>
            Admin, guru, siswa, operator, dan kepala madrasah membuka informasi sesuai tugas akademik masing-masing, tanpa menumpuk menu yang tidak dibutuhkan.
          </p>
        </div>

        <div className="siab2p-role-grid">
          <div className="siab2p-role-list" aria-label="Daftar peran SIAB2">
            {siab2Data.roles.map((role, index) => (
              <button
                key={role.name}
                type="button"
                className={activeIndex === index ? 'siab2p-role-list-item siab2p-role-list-item-active' : 'siab2p-role-list-item'}
                aria-pressed={activeIndex === index}
                onClick={() => setActiveIndex(index)}
              >
                <span className="siab2p-role-list-icon"><RoleIcon /></span>
                <span className="siab2p-role-list-copy">
                  <span>
                    <strong>{role.name}</strong>
                    <em>{role.badge}</em>
                  </span>
                  <small>{role.desc}</small>
                </span>
              </button>
            ))}
          </div>

          <article className="siab2p-role-detail">
            <div className="siab2p-role-detail-title">
              <span><RoleIcon /></span>
              <h3>Ruang Kerja {activeRole.name}</h3>
            </div>
            <p>{activeRole.desc}</p>
            <div className="siab2p-role-features">
              <h4>Fitur Utama & Akses Kerja</h4>
              <div>
                {activeRole.features.map((feature) => (
                  <span key={feature}>{feature}</span>
                ))}
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
