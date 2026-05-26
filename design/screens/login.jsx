// Login screen.
function LoginScreen({ onLogin }) {
  const [role, setRole] = useState("guru");
  const [id, setId] = useState("198604172019031005");
  const [pw, setPw] = useState("••••••••••");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = (e) => {
    e?.preventDefault();
    if (!id || !pw) { setErr("NIP/NIS dan kata sandi wajib diisi."); return; }
    setLoading(true); setErr("");
    setTimeout(() => { setLoading(false); onLogin(role); }, 450);
  };

  return (
    <div className="login">
      <div className="login-left">
        <div className="row" style={{ gap: 12 }}>
          <div className="brand-mark" style={{width:36,height:36,borderRadius:9,fontSize:14}}>e·H</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing:"-0.01em" }}>e-Hadir</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--fg-dim)" }}>MAN 1 ROKAN HULU · v2.1</div>
          </div>
          <div style={{marginLeft:"auto"}}>
            <ThemeToggle />
          </div>
        </div>

        <div className="login-hero">
          <div className="eyebrow"><span className="dot"></span> KEHADIRAN DIGITAL DUA LAPIS</div>
          <h1>
            Satu tap di gerbang.<br/>
            Satu klik di kelas.<br/>
            <span className="grad">Nol kecurangan.</span>
          </h1>
          <p>Sistem kehadiran dua lapis dengan engine rekonsiliasi yang menandai setiap anomali — bolos kelas, lupa tap, proxy — dalam 2 detik setelah sesi ditutup.</p>

          <div className="row" style={{gap:8, marginTop:22, flexWrap:"wrap"}}>
            <span className="chip"><Icon.Shield size={12}/> Audit append-only</span>
            <span className="chip"><Icon.MapPin size={12}/> Geofence aktif</span>
            <span className="chip"><Icon.Zap size={12}/> p95 · 500ms</span>
          </div>
        </div>

        <div className="login-specs">
          <div className="login-spec"><span className="k">LAPIS 1 — GATE</span><span className="v">RFID · Reader Gerbang</span></div>
          <div className="login-spec"><span className="k">LAPIS 2 — KELAS</span><span className="v">Manual oleh Guru</span></div>
          <div className="login-spec"><span className="k">REKONSILIASI</span><span className="v">Otomatis · End-of-session</span></div>
        </div>
      </div>

      <div className="login-right">
        <form className="login-card" onSubmit={submit}>
          <div style={{ fontSize: 11, fontFamily:"var(--font-mono)", color:"var(--fg-dim)", letterSpacing:"0.08em" }}>MASUK SEBAGAI</div>
          <div className="row" style={{ gap: 6, margin:"10px 0 22px" }}>
            {[["guru","Guru"],["admin","Admin/TU"],["siswa","Siswa"]].map(([v,l]) => (
              <button type="button" key={v} className={"btn sm " + (role===v?"primary":"ghost")} onClick={() => setRole(v)} style={{flex:1}}>{l}</button>
            ))}
          </div>

          <div className="field">
            <div className="field-label"><span>{role==="siswa"?"NIS":"NIP"}</span><span className="mono faint" style={{fontSize:11}}>wajib</span></div>
            <label className="input mono">
              <Icon.User size={14} />
              <input value={id} onChange={e=>setId(e.target.value)} placeholder={role==="siswa"?"Nomor Induk Siswa":"Nomor Induk Pegawai"} />
            </label>
          </div>

          <div className="field">
            <div className="field-label"><span>Kata Sandi</span><a href="#" onClick={e=>e.preventDefault()} style={{color:"var(--accent)", fontSize:12, textDecoration:"none"}}>Lupa?</a></div>
            <label className="input">
              <Icon.Lock size={14} />
              <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" />
            </label>
          </div>

          {err && (
            <div className="row" style={{ gap:8, padding:"8px 12px", background:"var(--bad-soft)", border:"1px solid color-mix(in oklch, var(--bad) 30%, var(--border))", borderRadius:"var(--radius)", color:"var(--bad)", fontSize:12.5, marginBottom:14 }}>
              <Icon.AlertTri size={14} /> {err}
            </div>
          )}

          <Btn variant="primary" size="lg" type="submit" disabled={loading} style={{ width:"100%" }}>
            {loading ? "Memverifikasi…" : <>Masuk <Icon.ArrowRight size={14}/></>}
          </Btn>

          <div className="hline" style={{margin:"20px 0 16px"}}/>
          <div className="row" style={{ fontSize:11.5, color:"var(--fg-dim)", gap:6, justifyContent:"center", fontFamily:"var(--font-mono)" }}>
            <Icon.Fingerprint size={12}/> Sesi dienkripsi · TTL 8 jam · RBAC aktif
          </div>
        </form>
      </div>
    </div>
  );
}
window.LoginScreen = LoginScreen;
