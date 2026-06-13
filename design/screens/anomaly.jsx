// Papan Anomali Rekonsiliasi.
function AnomalyBoard() {
  const [filter, setFilter] = useState("ALL");
  const [resolvingId, setResolvingId] = useState(null);
  const [resolved, setResolved] = useState(new Set());

  const visible = DATA.ANOMALIES.filter(a => resolved.has(a.id) ? filter === "RESOLVED" : (filter === "ALL" || filter === "OPEN" || filter === a.flag));

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <div className="eyebrow"><span className="dot"/> ENGINE REKONSILIASI · CROSS-LAYER CHECK</div>
          <h1 className="page-title">Papan Anomali</h1>
          <div className="page-sub">Flag tidak mengubah status — manusia yang memutuskan. <span className="mono muted">· 5 open · 2 resolved hari ini</span></div>
        </div>
        <div className="row" style={{gap:8}}>
          <Btn variant="ghost"><Icon.Filter/> Lanjutan</Btn>
          <Btn><Icon.FileText/> Ekspor</Btn>
        </div>
      </div>

      <div className="card pad" style={{marginBottom:16}}>
        <div className="row" style={{gap:6, flexWrap:"wrap"}}>
          {[
            ["ALL", "Semua", DATA.ANOMALIES.length],
            ["OPEN", "Open", DATA.ANOMALIES.length - resolved.size],
            ["BOLOS_KELAS", "Bolos kelas", 1],
            ["TIDAK_MENGAJAR", "Tidak mengajar", 1],
            ["LUPA_TAP_GERBANG", "Lupa tap", 1],
            ["ANOMALI_BUKA_TANPA_GERBANG", "Buka tanpa gerbang", 1],
            ["ALPA", "Alpa guru", 1],
            ["RESOLVED", "Resolved", resolved.size],
          ].map(([v, l, n]) => (
            <button key={v} className={"btn sm " + (filter===v ? "primary" : "ghost")} onClick={() => setFilter(v)}>
              {l} <span className="mono" style={{opacity:0.7}}>{n}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="col" style={{gap:14}}>
        {visible.length === 0 && (
          <div className="card pad-lg" style={{textAlign:"center"}}>
            <div className="muted">Tidak ada anomali pada filter ini. 🎉</div>
          </div>
        )}
        {visible.map(a => (
          <div key={a.id} className="card anom-card" style={{
            borderLeft: `3px solid var(--${a.level === "bad" ? "bad" : "warn"})`,
            opacity: resolved.has(a.id) ? 0.55 : 1
          }}>
            <div className="row" style={{justifyContent:"space-between", alignItems:"flex-start"}}>
              <div className="row" style={{gap:14, alignItems:"flex-start"}}>
                <Avatar name={a.subject} size="lg"/>
                <div>
                  <div className="row" style={{gap:8, flexWrap:"wrap"}}>
                    <Pill tone={a.level}>{a.flag}</Pill>
                    <span className="mono faint" style={{fontSize:11}}>{a.id}</span>
                    <span className="mono dim" style={{fontSize:11}}>· {a.at}</span>
                  </div>
                  <div style={{fontSize:16, fontWeight:600, marginTop:4, letterSpacing:"-0.01em"}}>{a.subject}</div>
                  <div className="mono dim" style={{fontSize:12, marginTop:2}}>{a.meta}</div>
                </div>
              </div>
              <div className="row" style={{gap:8}}>
                {resolved.has(a.id)
                  ? <Pill tone="ok">RESOLVED</Pill>
                  : <>
                      <Btn variant="ghost" size="sm"><Icon.AlertTri size={12}/> Eskalasi</Btn>
                      <Btn variant="primary" size="sm" onClick={() => setResolvingId(a.id)}><Icon.Check size={12}/> Resolve</Btn>
                    </>
                }
              </div>
            </div>

            <div className="anom-diag">
              <div className="anom-layer">
                <div className="anom-layer-label">LAPIS 1 · GATE</div>
                <div className="row" style={{gap:8}}>
                  {a.gate.ok ? <Icon.Check className="inline-svg" style={{color:"var(--ok)"}}/> : <Icon.X className="inline-svg" style={{color:"var(--bad)"}}/>}
                  <div>
                    <div className="mono" style={{fontSize:12.5, fontWeight:500}}>{a.gate.text}</div>
                    <div className="mono dim" style={{fontSize:11}}>{a.gate.sub}</div>
                  </div>
                </div>
              </div>
              <div className="anom-vs">VS</div>
              <div className="anom-layer">
                <div className="anom-layer-label">LAPIS 2 · KELAS</div>
                <div className="row" style={{gap:8}}>
                  {a.kelas.ok ? <Icon.Check className="inline-svg" style={{color:"var(--ok)"}}/> : <Icon.X className="inline-svg" style={{color:"var(--bad)"}}/>}
                  <div>
                    <div className="mono" style={{fontSize:12.5, fontWeight:500}}>{a.kelas.text}</div>
                    <div className="mono dim" style={{fontSize:11}}>{a.kelas.sub}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="muted" style={{fontSize:13, marginTop:12, lineHeight:1.6}}>{a.ctx}</div>
          </div>
        ))}
      </div>

      {resolvingId && (
        <ResolveModal
          anomaly={DATA.ANOMALIES.find(a => a.id === resolvingId)}
          onCancel={() => setResolvingId(null)}
          onResolve={() => { setResolved(r => new Set([...r, resolvingId])); setResolvingId(null); }}
        />
      )}
    </div>
  );
}

function ResolveModal({ anomaly, onCancel, onResolve }) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 10;
  return (
    <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", backdropFilter:"blur(6px)", display:"grid", placeItems:"center", zIndex:100}} onClick={onCancel}>
      <div className="card pad-lg elev" style={{maxWidth:520, width:"90%"}} onClick={e=>e.stopPropagation()}>
        <div className="eyebrow"><span className="dot"/> RESOLVE FLAG · ALASAN WAJIB</div>
        <div style={{fontSize:20, fontWeight:700, letterSpacing:"-0.02em", marginTop:6}}>
          {anomaly.flag.replaceAll("_"," ")} · {anomaly.subject}
        </div>
        <div className="muted" style={{fontSize:13.5, marginTop:6}}>
          Tercatat di audit append-only. Minimum 10 karakter, bukan spam.
        </div>
        <div className="field" style={{marginTop:18}}>
          <div className="field-label"><span>Alasan</span><span className="mono faint" style={{fontSize:11}}>{reason.trim().length}/10+</span></div>
          <label className="input" style={{alignItems:"flex-start"}}>
            <Icon.FileText size={14} style={{marginTop:4}}/>
            <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={4}
              style={{border:0, background:"transparent", outline:"none", flex:1, color:"inherit", fontFamily:"inherit", fontSize:"inherit", resize:"vertical"}}
              placeholder="Contoh: Guru izin mendadak via WA pagi ini, jadwal sudah dialihkan ke Ust. Nurul."/>
          </label>
        </div>
        <div className="row" style={{justifyContent:"flex-end", gap:8, marginTop:6}}>
          <Btn variant="ghost" onClick={onCancel}>Batal</Btn>
          <Btn variant="primary" disabled={!valid} onClick={onResolve}>
            <Icon.Check size={12}/> Resolve & simpan audit
          </Btn>
        </div>
      </div>
    </div>
  );
}

window.AnomalyBoard = AnomalyBoard;
