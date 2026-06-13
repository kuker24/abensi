// Class Input — the hero screen.
const STATUSES = ["HADIR","TELAT","IZIN","SAKIT","ALPA"];

function ClassInput({ onClose, layout="pills" }) {
  const [roster, setRoster] = useState(DATA.STUDENTS_XIPA1.map(s => ({...s})));
  const [q, setQ] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(42*60);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => { const t = setInterval(() => setSecondsLeft(s => Math.max(0,s-1)), 1000); return () => clearInterval(t); }, []);

  const counts = useMemo(() => {
    const c = { HADIR:0, TELAT:0, IZIN:0, SAKIT:0, ALPA:0 };
    roster.forEach(r => { c[r.status] = (c[r.status]||0) + 1; });
    return c;
  }, [roster]);

  const filtered = q ? roster.filter(r => r.nama.toLowerCase().includes(q.toLowerCase()) || r.nis.includes(q)) : roster;

  const setStatus = (id, s) => setRoster(r => r.map(x => x.id === id ? {...x, status: s} : x));
  const markAll = (s) => setRoster(r => r.map(x => ({...x, status: s})));

  const mm = String(Math.floor(secondsLeft/60)).padStart(2,"0");
  const ss = String(secondsLeft%60).padStart(2,"0");

  return (
    <div className="content" style={{paddingBottom: 0}}>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{color:"var(--accent)"}}><span className="dot"/> SESI AKTIF · OPEN · INPUT PRESENSI</div>
          <h1 className="page-title">Matematika Wajib · X-MIA-3</h1>
          <div className="page-sub">R-204 · 08:45–10:15 · Ust. Rahmat Hidayat · 30 siswa terdaftar</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div className="mono faint" style={{fontSize:11, letterSpacing:"0.08em"}}>SISA WAKTU</div>
          <div className="mono" style={{fontSize:32, fontWeight:600, fontVariantNumeric:"tabular-nums", letterSpacing:"-0.02em", color: secondsLeft < 5*60 ? "var(--warn)" : "var(--fg)"}}>{mm}:{ss}</div>
        </div>
      </div>

      {/* action bar */}
      <div className="card pad" style={{marginBottom: 16}}>
        <div className="row" style={{gap:10, flexWrap:"wrap"}}>
          <Btn variant="primary" onClick={() => markAll("HADIR")}>
            <Icon.Check/> Tandai semua HADIR
          </Btn>
          <Btn variant="danger" onClick={() => markAll("ALPA")}>
            <Icon.X/> Reset ke ALPA
          </Btn>
          <div style={{width:1, height:24, background:"var(--border)"}}/>
          <label className="input" style={{maxWidth:320, flex:1}}>
            <Icon.Search size={14}/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari nama atau NIS…"/>
          </label>
          <div style={{flex:1}}/>
          <span className="chip"><Icon.Wifi size={12}/> Offline-first · auto sync</span>
        </div>
      </div>

      {/* roster */}
      <div className="roster">
        <div className="roster-row" style={{background:"var(--bg-2)", borderBottom:"1px solid var(--border-2)"}}>
          <div className="roster-idx">#</div>
          <div/>
          <div className="mono faint" style={{fontSize:11, letterSpacing:"0.08em", textTransform:"uppercase"}}>Siswa · {filtered.length} dari 30</div>
          <div className="mono faint" style={{fontSize:11, letterSpacing:"0.08em", textTransform:"uppercase"}}>Status · tap untuk ubah</div>
        </div>
        {filtered.map((s, i) => (
          <div key={s.id} className="roster-row">
            <div className="roster-idx">{String(s.id).padStart(2,"0")}</div>
            <Avatar name={s.nama}/>
            <div>
              <div className="roster-name">{s.nama}</div>
              <div className="roster-meta">NIS {s.nis}</div>
            </div>
            <div className="statuspick">
              {STATUSES.map(st => (
                <button key={st}
                  className={(s.status === st ? "on " : "") + st.toLowerCase()}
                  onClick={() => setStatus(s.id, st)}>
                  {st}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* sticky dock */}
      <div className="dock" style={{position:"sticky", bottom: 16}}>
        <div className="dock-stats">
          <span className="s"><span className="k">HADIR</span><span className="v" style={{color:"var(--ok)"}}>{counts.HADIR}</span></span>
          <span className="s"><span className="k">TELAT</span><span className="v" style={{color:"var(--warn)"}}>{counts.TELAT}</span></span>
          <span className="s"><span className="k">IZIN</span><span className="v" style={{color:"var(--info)"}}>{counts.IZIN}</span></span>
          <span className="s"><span className="k">SAKIT</span><span className="v" style={{color:"var(--accent)"}}>{counts.SAKIT}</span></span>
          <span className="s"><span className="k">ALPA</span><span className="v" style={{color:"var(--bad)"}}>{counts.ALPA}</span></span>
          <span className="s"><span className="k">·</span><span className="v">{counts.HADIR+counts.TELAT+counts.IZIN+counts.SAKIT+counts.ALPA}/30</span></span>
        </div>
        <div style={{flex:1}}/>
        <Btn variant="ghost" onClick={onClose}><Icon.ChevronL/> Kembali</Btn>
        <Btn variant="primary" size="lg" onClick={() => setConfirm(true)}>
          Tutup sesi · jalankan rekonsiliasi <Icon.ArrowRight size={14}/>
        </Btn>
      </div>

      {confirm && (
        <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", backdropFilter:"blur(6px)", display:"grid", placeItems:"center", zIndex:100}} onClick={() => setConfirm(false)}>
          <div className="card pad-lg elev" style={{maxWidth:440}} onClick={e=>e.stopPropagation()}>
            <div className="eyebrow"><span className="dot"/> KONFIRMASI · TIDAK DAPAT DIBATALKAN</div>
            <div style={{fontSize:20, fontWeight:700, letterSpacing:"-0.02em", marginTop:6}}>Tutup sesi X-MIA-3?</div>
            <div className="muted" style={{fontSize:13.5, marginTop:6}}>Status seluruh siswa akan terkunci. Engine rekonsiliasi akan berjalan otomatis dan menandai anomali (jika ada) dalam ≤ 2 detik.</div>
            <div className="card" style={{padding:14, marginTop:16, background:"var(--bg-2)"}}>
              <div className="row" style={{gap:14, flexWrap:"wrap", fontFamily:"var(--font-mono)", fontSize:12}}>
                <span style={{color:"var(--ok)"}}>HADIR {counts.HADIR}</span>
                <span style={{color:"var(--warn)"}}>TELAT {counts.TELAT}</span>
                <span style={{color:"var(--info)"}}>IZIN {counts.IZIN}</span>
                <span style={{color:"var(--accent)"}}>SAKIT {counts.SAKIT}</span>
                <span style={{color:"var(--bad)"}}>ALPA {counts.ALPA}</span>
              </div>
            </div>
            <div className="row" style={{marginTop:18, justifyContent:"flex-end", gap:8}}>
              <Btn variant="ghost" onClick={() => setConfirm(false)}>Batal</Btn>
              <Btn variant="primary" onClick={() => { setConfirm(false); onClose(true); }}>Ya, tutup sesi</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
window.ClassInput = ClassInput;
