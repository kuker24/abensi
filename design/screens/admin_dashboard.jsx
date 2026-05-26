// Admin / TU dashboard.
function AdminDashboard({ onNavAnomaly }) {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <div className="eyebrow"><span className="dot"/> OPERASIONAL · LIVE</div>
          <h1 className="page-title">Dasbor Admin</h1>
          <div className="page-sub">Ringkasan hari ini · Senin, 24 April 2026 · <span className="mono" style={{color:"var(--ok)"}}>● sistem sehat</span></div>
        </div>
        <div className="row" style={{gap:8}}>
          <Btn variant="ghost"><Icon.Filter/> Filter</Btn>
          <Btn><Icon.FileText/> Ekspor rekap</Btn>
        </div>
      </div>

      <div className="grid g-4">
        {DATA.ADMIN_STATS.map(s => <StatCard key={s.k} {...s} />)}
      </div>

      <div className="grid g-3" style={{marginTop:18, alignItems:"stretch"}}>
        {/* Trend */}
        <div className="card" style={{gridColumn:"span 2"}}>
          <div className="card-head">
            <div>
              <div className="card-title">Cakupan presensi · 7 hari</div>
              <div className="card-sub">% sesi `CLOSED` dengan presensi lengkap</div>
            </div>
            <div className="row" style={{gap:6}}>
              <Pill tone="ok">↑ 1.4%</Pill>
              <Pill>avg 97.8%</Pill>
            </div>
          </div>
          <div style={{padding:"22px 22px 34px"}}>
            <div className="bars">
              {DATA.WEEK_COVERAGE.map((v,i) => (
                <div key={i} style={{position:"relative", height:"100%"}}>
                  <div className="bar" style={{height: v===0 ? "6px" : `${(v/100)*100}%`, opacity: v===0 ? 0.3 : 1, marginTop:"auto"}}/>
                  <div className="bar-lbl">{DATA.WEEK_LABELS[i]}<br/><span style={{opacity:0.6}}>{v===0?"—":v+"%"}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Anomaly summary */}
        <div className="card pad">
          <div className="row" style={{justifyContent:"space-between"}}>
            <div className="card-title">Anomali aktif</div>
            <Btn variant="ghost" size="sm" onClick={onNavAnomaly}>Buka papan <Icon.ArrowRight size={12}/></Btn>
          </div>
          <div className="col" style={{marginTop:14, gap:8}}>
            {[
              ["BOLOS_KELAS", 3, "bad"],
              ["TIDAK_MENGAJAR", 1, "warn"],
              ["LUPA_TAP_GERBANG", 1, "warn"],
              ["ANOMALI_BUKA_TANPA_GERBANG", 1, "bad"],
              ["ALPA", 1, "warn"],
            ].map(([name, n, tone]) => (
              <div key={name} className="row" style={{padding:"10px 12px", border:"1px solid var(--border)", borderRadius:"var(--radius)", background:"var(--surface-2)"}}>
                <Pill tone={tone}>{name}</Pill>
                <div style={{flex:1}}/>
                <span className="mono" style={{fontSize:13, fontWeight:600}}>{n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g-3" style={{marginTop:18, alignItems:"stretch"}}>
        {/* Live Monitor mini */}
        <div className="card" style={{gridColumn:"span 2"}}>
          <div className="card-head">
            <div className="row" style={{gap:10}}>
              <div className="live-dot"/>
              <div>
                <div className="card-title">Live Monitor · gerbang & sesi</div>
                <div className="card-sub">stream · latency 1.8s · 200 event/menit kapasitas</div>
              </div>
            </div>
            <Btn variant="ghost" size="sm">Full screen <Icon.ArrowRight size={12}/></Btn>
          </div>
          <div className="feed">
            {DATA.LIVE_EVENTS.slice(0,6).map(e => (
              <div key={e.id} className="feed-item">
                <Avatar name={e.who} size="sm"/>
                <div>
                  <div style={{fontSize:13, fontWeight:500}}>{e.who}</div>
                  <div className="mono dim" style={{fontSize:11, marginTop:2}}>{e.role} · {e.loc}</div>
                </div>
                <Pill tone={e.ok ? "ok" : "bad"}>
                  {e.event === "tap-in" ? "TAP IN" : e.event === "tap-rejected" ? "REJECTED" : e.event === "open-session" ? "OPEN" : "CLOSED"}
                </Pill>
                <div className="feed-time">{e.time}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Kehadiran guru */}
        <div className="card pad">
          <div className="row" style={{justifyContent:"space-between"}}>
            <div className="card-title">Kehadiran guru · hari ini</div>
            <span className="chip mono">42/46</span>
          </div>

          <div className="col" style={{marginTop:16, gap:4}}>
            {[
              ["HADIR", 38, "ok"],
              ["TELAT", 4, "warn"],
              ["IZIN", 1, "info"],
              ["SAKIT", 1, "acc"],
              ["DINAS LUAR", 0, ""],
              ["ALPA", 2, "bad"],
            ].map(([k, v, tone]) => (
              <div key={k} className="row" style={{padding:"8px 0"}}>
                <Pill tone={tone}>{k}</Pill>
                <div style={{flex:1, marginLeft:8, height:4, background:"var(--border)", borderRadius:2, overflow:"hidden"}}>
                  <div style={{
                    height:"100%",
                    width: `${(v/46)*100}%`,
                    background: `var(--${tone==="ok"?"ok":tone==="warn"?"warn":tone==="bad"?"bad":tone==="info"?"info":tone==="acc"?"accent":"border-2"})`,
                    transition:"width 400ms"
                  }}/>
                </div>
                <span className="mono" style={{fontSize:12, minWidth:24, textAlign:"right"}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
window.AdminDashboard = AdminDashboard;
