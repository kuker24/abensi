// Full-screen live monitor.
function LiveMonitor() {
  const [events, setEvents] = useState(DATA.LIVE_EVENTS);

  useEffect(() => {
    const names = ["Alifa Nazhira","Bintang Pratama","Cahaya Hidayat","Dimas Ardiansyah","Faiz Abdurrahman","Kevin Nugraha","Nisrina Aqila","Qonita Hanifah"];
    const locs = ["Gerbang Utara","Gerbang Samping"];
    let counter = 100;
    const t = setInterval(() => {
      const now = new Date();
      const time = now.toLocaleTimeString("id-ID", {hour12:false});
      const who = names[Math.floor(Math.random()*names.length)];
      const ok = Math.random() > 0.12;
      setEvents(ev => [{
        id: ++counter, time, who, role:"SISWA",
        event: ok ? "tap-in" : "tap-rejected",
        loc: locs[Math.floor(Math.random()*locs.length)] + (ok?"":" · kartu LOST"),
        ok
      }, ...ev.slice(0,19)]);
    }, 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <div className="row" style={{gap:10}}>
            <div className="live-dot"/>
            <div className="eyebrow">STREAM LIVE · LATENCY 1.8S · 200 EVT/MIN</div>
          </div>
          <h1 className="page-title">Live Monitor</h1>
          <div className="page-sub">Tap gerbang · buka/tutup sesi · real-time · auto-refresh</div>
        </div>
        <div className="row" style={{gap:8}}>
          <Btn variant="ghost"><Icon.Filter/> Peran · waktu</Btn>
          <Btn><Icon.Zap/> Pause stream</Btn>
        </div>
      </div>

      <div className="grid g-4" style={{marginBottom:16}}>
        <div className="stat">
          <div className="stat-label">Tap IN · hari ini</div>
          <div className="stat-num">1.284</div>
          <div className="stat-delta up">↑ 3.8% vs kemarin</div>
        </div>
        <div className="stat">
          <div className="stat-label">Rejected</div>
          <div className="stat-num" style={{color:"var(--bad)"}}>7</div>
          <div className="stat-delta">5 LOST · 2 geofence</div>
        </div>
        <div className="stat">
          <div className="stat-label">Sesi dibuka</div>
          <div className="stat-num">33</div>
          <div className="stat-delta">1 OPEN sekarang</div>
        </div>
        <div className="stat">
          <div className="stat-label">Avg latency</div>
          <div className="stat-num">412<span style={{fontSize:16, color:"var(--fg-dim)", marginLeft:4}}>ms</span></div>
          <div className="stat-delta up">p95 · 500ms target</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Event stream</div>
          <div className="row" style={{gap:6}}>
            <Pill tone="ok">TAP IN</Pill>
            <Pill>SESI</Pill>
            <Pill tone="bad">REJECTED</Pill>
          </div>
        </div>
        <div className="feed">
          {events.map(e => (
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
    </div>
  );
}
window.LiveMonitor = LiveMonitor;
