// Teacher Dashboard — tablet-first.
function TeacherDashboard({ onOpenSession }) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const next = DATA.TODAY_SESSIONS.find(s => s.status === "OPEN") || DATA.TODAY_SESSIONS.find(s => s.status === "SCHEDULED");

  useEffect(() => {
    // countdown to arbitrary time
    let s = 7*60 + 42;
    const t = setInterval(() => { s = Math.max(0, s-1); setSecondsLeft(s); }, 1000);
    setSecondsLeft(s);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(secondsLeft/60)).padStart(2,"0");
  const ss = String(secondsLeft%60).padStart(2,"0");

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <div className="eyebrow"><span className="dot"/> SELAMAT PAGI, UST. RAHMAT</div>
          <h1 className="page-title">Sesi hari ini.</h1>
          <div className="page-sub">4 sesi terjadwal · 1 sudah selesai · cakupan kehadiran Anda <span className="mono" style={{color:"var(--ok)"}}>100%</span></div>
        </div>
        <div className="row" style={{gap:8}}>
          <Btn variant="ghost"><Icon.Calendar/> Kalender minggu</Btn>
          <Btn><Icon.FileText/> Rekap ampuan</Btn>
        </div>
      </div>

      {/* HERO next session */}
      <div className="hero-session">
        <div className="hero-grid"/>
        <div className="row" style={{justifyContent:"space-between", alignItems:"flex-start"}}>
          <div>
            <div className="eyebrow" style={{color:"var(--accent)"}}><span className="dot"/> SESI AKTIF · OPEN</div>
            <div style={{fontSize: 34, fontWeight: 700, letterSpacing:"-0.025em", marginTop: 2}}>{next.mapel} · {next.kelas}</div>
            <div className="row muted" style={{marginTop: 8, gap: 14, fontSize: 13}}>
              <span className="row" style={{gap:6}}><Icon.Clock size={14}/> <span className="mono">{next.jam}</span></span>
              <span>·</span>
              <span className="row" style={{gap:6}}><Icon.MapPin size={14}/> {next.ruang}</span>
              <span>·</span>
              <span className="row" style={{gap:6}}><Icon.Users size={14}/> 30 siswa terdaftar</span>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div className="mono faint" style={{fontSize:11, letterSpacing:"0.08em"}}>SISA WAKTU SESI</div>
            <div className="countdown">{mm}:{ss}</div>
          </div>
        </div>

        <div className="row" style={{marginTop:28, gap:10, flexWrap:"wrap"}}>
          <Btn variant="primary" size="lg" onClick={onOpenSession}>
            <Icon.Play/> Masuk ke sesi
          </Btn>
          <Btn size="lg"><Icon.CheckSquare/> Tandai semua HADIR</Btn>
          <div style={{flex:1}}/>
          <div className="row" style={{gap:8}}>
            <span className="chip"><Icon.MapPin size={12}/> Geofence OK · 38m dari titik</span>
            <span className="chip"><Icon.Wifi size={12}/> Sinkron live</span>
          </div>
        </div>
      </div>

      <div className="grid g-3" style={{marginTop: 22, alignItems:"stretch"}}>
        {/* Timeline */}
        <div className="card" style={{gridColumn:"span 2"}}>
          <div className="card-head">
            <div>
              <div className="card-title">Timeline sesi hari ini</div>
              <div className="card-sub">Senin · 24 April 2026</div>
            </div>
            <div className="row" style={{gap:6}}>
              <Pill tone="ok">1 CLOSED</Pill>
              <Pill tone="acc">1 OPEN</Pill>
              <Pill>2 SCHEDULED</Pill>
            </div>
          </div>
          <div className="tl" style={{padding: "4px 18px 14px"}}>
            {DATA.TODAY_SESSIONS.map((s, i) => {
              const dotTone = s.status === "OPEN" ? "now" : s.status === "CLOSED" ? "ok" : s.status === "MISSED" ? "bad" : "";
              return (
                <div key={s.id} className="tl-item">
                  <div className="tl-time">{s.jam.split("-")[0]}</div>
                  <div className={"tl-dot " + dotTone} />
                  <div>
                    <div className="tl-title">{s.mapel} · <span className="muted">{s.kelas}</span></div>
                    <div className="tl-sub">{s.ruang} · {s.jam} {s.coverage!=null && <>· <span style={{color:"var(--ok)"}}>{s.coverage}/30 ter-absen</span></>}</div>
                  </div>
                  <StatusPill status={s.status} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Kehadiran saya */}
        <div className="card pad">
          <div className="card-title">Kehadiran saya · hari ini</div>
          <div className="card-sub" style={{marginTop:2}}>Diturunkan dari tap gerbang + aksi sesi</div>

          <div className="col" style={{gap:0, marginTop:16}}>
            <div className="tl-item" style={{gridTemplateColumns:"auto 14px 1fr auto"}}>
              <div className="tl-time">06:54</div>
              <div className="tl-dot ok"/>
              <div>
                <div className="tl-title row" style={{gap:8}}><Icon.ArrowIn size={14}/> Tap IN gerbang</div>
                <div className="tl-sub">Gerbang Utara · valid · geofence</div>
              </div>
              <Pill tone="ok">HADIR</Pill>
            </div>
            <div className="tl-item" style={{gridTemplateColumns:"auto 14px 1fr auto"}}>
              <div className="tl-time">07:15</div>
              <div className="tl-dot ok"/>
              <div>
                <div className="tl-title">Buka sesi · X-MIA-1</div>
                <div className="tl-sub">Ditutup 08:44 · 30/30 ter-absen</div>
              </div>
              <Pill tone="ok">CLOSED</Pill>
            </div>
            <div className="tl-item" style={{gridTemplateColumns:"auto 14px 1fr auto"}}>
              <div className="tl-time">08:52</div>
              <div className="tl-dot now"/>
              <div>
                <div className="tl-title">Buka sesi · X-MIA-3</div>
                <div className="tl-sub">Sesi berjalan · 0/30 ter-absen</div>
              </div>
              <Pill tone="acc">OPEN</Pill>
            </div>
          </div>

          <div className="hline" style={{margin:"16px 0"}}/>
          <div className="row" style={{justifyContent:"space-between", fontSize:12}}>
            <span className="muted">Status derivasi harian</span>
            <Pill tone="ok">HADIR · MENGAJAR</Pill>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid g-3" style={{marginTop: 18}}>
        <div className="card pad hover">
          <div className="row" style={{justifyContent:"space-between"}}><div className="mono faint" style={{fontSize:11}}>QUICK ACTION</div><Icon.CornerDn size={14}/></div>
          <div style={{fontWeight:600, marginTop:10, fontSize:15}}>Koreksi presensi</div>
          <div className="muted" style={{fontSize:12.5, marginTop:4}}>Alasan wajib · minimum 10 karakter · tercatat audit</div>
        </div>
        <div className="card pad hover">
          <div className="row" style={{justifyContent:"space-between"}}><div className="mono faint" style={{fontSize:11}}>QUICK ACTION</div><Icon.CornerDn size={14}/></div>
          <div style={{fontWeight:600, marginTop:10, fontSize:15}}>Lapor izin / sakit</div>
          <div className="muted" style={{fontSize:12.5, marginTop:4}}>Sesi hari ini otomatis dialihkan ke guru piket</div>
        </div>
        <div className="card pad hover">
          <div className="row" style={{justifyContent:"space-between"}}><div className="mono faint" style={{fontSize:11}}>QUICK ACTION</div><Icon.CornerDn size={14}/></div>
          <div style={{fontWeight:600, marginTop:10, fontSize:15}}>Rekap kelas ampuan</div>
          <div className="muted" style={{fontSize:12.5, marginTop:4}}>Mingguan · bulanan · ekspor XLSX</div>
        </div>
      </div>
    </div>
  );
}
window.TeacherDashboard = TeacherDashboard;
