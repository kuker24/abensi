// Main app — routing + tweaks.
const { useState: uS, useEffect: uE } = React;

const TWEAKS_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "accentHue": 285,
  "density": "calm",
  "brandMark": "e·H"
}/*EDITMODE-END*/;

function applyTweaks(t) {
  document.documentElement.setAttribute("data-theme", t.theme);
  document.documentElement.style.setProperty("--accent",     `oklch(0.70 0.19 ${t.accentHue})`);
  document.documentElement.style.setProperty("--accent-2",   `oklch(0.62 0.21 ${t.accentHue-10})`);
  document.documentElement.style.setProperty("--accent-soft",`oklch(0.42 0.15 ${t.accentHue} / 0.18)`);
  document.documentElement.style.setProperty("--accent-ring",`oklch(0.70 0.19 ${t.accentHue} / 0.35)`);
}

function App() {
  const [route, setRoute] = uS("login"); // login | teacher-dash | class-input | admin-dash | anomaly | live-monitor
  const [role, setRole] = uS("guru");
  const [tweaks, setTweaks] = useTweaks ? useTweaks(TWEAKS_DEFAULTS) : [TWEAKS_DEFAULTS, ()=>{}];

  uE(() => { applyTweaks(tweaks); }, [tweaks]);

  const onLogin = (r) => {
    setRole(r);
    setRoute(r === "admin" ? "admin-dash" : "teacher-dash");
  };

  const onNav = (r) => {
    if (r === "__logout") { setRoute("login"); return; }
    setRoute(r);
  };

  if (route === "login") {
    return <>
      <LoginScreen onLogin={onLogin}/>
      <TweaksShell tweaks={tweaks} setTweaks={setTweaks}/>
    </>;
  }

  const counts = { sesi: 1, anomaly: 5 };

  const crumbs = {
    "teacher-dash":  ["Guru", "Dasbor"],
    "class-input":   ["Guru", "Input Presensi", "X-MIA-3 · Matematika"],
    "teacher-rekap": ["Guru", "Rekap Ampuan"],
    "teacher-me":    ["Guru", "Kehadiran Saya"],
    "admin-dash":    ["Admin/TU", "Dasbor"],
    "anomaly":       ["Admin/TU", "Papan Anomali"],
    "live-monitor":  ["Admin/TU", "Live Monitor"],
    "history":       ["Admin/TU", "Riwayat Absen"],
    "schedule":      ["Admin/TU", "Jadwal & Sesi"],
    "cards":         ["Admin/TU", "Smart Card"],
    "settings":      ["Admin/TU", "Pengaturan"],
  }[route] || ["e-Hadir"];

  return <>
    <div className="app">
      <Sidebar role={role} route={route} onNav={onNav} counts={counts}/>
      <main className="main">
        <TopBar crumbs={crumbs}/>
        {route === "teacher-dash"  && <TeacherDashboard onOpenSession={() => setRoute("class-input")}/>}
        {route === "class-input"   && <ClassInput onClose={() => setRoute("teacher-dash")}/>}
        {route === "admin-dash"    && <AdminDashboard onNavAnomaly={() => setRoute("anomaly")}/>}
        {route === "anomaly"       && <AnomalyBoard/>}
        {route === "live-monitor"  && <LiveMonitor/>}
        {["teacher-rekap","teacher-me","history","schedule","cards","settings"].includes(route) && <Placeholder name={crumbs[crumbs.length-1]}/>}
      </main>
    </div>
    <TweaksShell tweaks={tweaks} setTweaks={setTweaks}/>
  </>;
}

function Placeholder({ name }) {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <div className="eyebrow"><span className="dot"/> PLACEHOLDER</div>
          <h1 className="page-title">{name}</h1>
          <div className="page-sub">Layar ini belum didesain di bundle Prioritas 1. Lima layar inti yang sudah siap ada di sidebar.</div>
        </div>
      </div>
      <div className="card pad-lg" style={{display:"grid", placeItems:"center", minHeight:280}}>
        <div style={{textAlign:"center", maxWidth:440}}>
          <div style={{display:"inline-grid", placeItems:"center", width:48, height:48, borderRadius:12, background:"var(--surface-2)", border:"1px solid var(--border)", marginBottom:14}}>
            <Icon.Cpu size={22}/>
          </div>
          <div style={{fontWeight:600, fontSize:16}}>Bagian berikutnya pada roadmap</div>
          <div className="muted" style={{fontSize:13.5, marginTop:6}}>
            Prioritas 1 yang aktif: Login, Dasbor Guru, Input Presensi Kelas, Dasbor Admin, Papan Anomali, Live Monitor.
          </div>
        </div>
      </div>
    </div>
  );
}

function TweaksShell({ tweaks, setTweaks }) {
  return (
    <TweaksPanel title="Tweaks · e-Hadir">
      <TweakSection title="Tampilan">
        <TweakRadio label="Tema"
          value={tweaks.theme}
          onChange={v => setTweaks({ theme: v })}
          options={[["dark","Dark"],["light","Light"]]}/>
        <TweakSlider label="Accent hue"
          value={tweaks.accentHue} min={0} max={360} step={1}
          onChange={v => setTweaks({ accentHue: v })}/>
        <TweakText label="Brand mark" value={tweaks.brandMark}
          onChange={v => setTweaks({ brandMark: v })}/>
      </TweakSection>
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
