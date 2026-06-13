// Shared UI components.

const { useState, useEffect, useMemo, useRef } = React;

function Pill({ tone="", children, dot=true }) {
  return (
    <span className={"pill " + tone}>
      {dot && <span className="d" />}
      {children}
    </span>
  );
}

function Avatar({ name, size="" }) {
  const initials = name.split(" ").slice(0,2).map(s=>s[0]).join("").toUpperCase();
  // deterministic hue from name
  const hue = [...name].reduce((a,c)=>a+c.charCodeAt(0),0) % 360;
  const bg = `oklch(0.35 0.08 ${hue})`;
  const fg = `oklch(0.88 0.07 ${hue})`;
  return (
    <div className={"ava " + size} style={{ background: bg, color: fg, borderColor: "transparent" }}>
      {initials}
    </div>
  );
}

function Btn({ variant="", size="", children, ...p }) {
  return <button className={"btn " + variant + " " + size} {...p}>{children}</button>;
}

function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute("data-theme") || "dark");
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  return (
    <button className="btn icon ghost" title="Ganti tema" onClick={() => setTheme(t => t==="dark"?"light":"dark")}>
      {theme === "dark" ? <Icon.Sun/> : <Icon.Moon/>}
    </button>
  );
}

function StatusPill({ status }) {
  const map = {
    HADIR:  "ok", TELAT: "warn", IZIN: "info", SAKIT: "acc", ALPA: "bad",
    OPEN:   "ok", CLOSED:"", SCHEDULED:"", MISSED:"bad",
    ACTIVE: "ok", LOST:"bad", INACTIVE:"",
  };
  return <Pill tone={map[status] ?? ""}>{status}</Pill>;
}

function Sidebar({ role, route, onNav, counts = {} }) {
  const itemsByRole = {
    guru: [
      { id:"teacher-dash", label:"Dasbor", icon: Icon.Home, section:"UTAMA" },
      { id:"class-input",  label:"Input Presensi Kelas", icon: Icon.CheckSquare, section:"UTAMA", count: counts.sesi },
      { id:"teacher-rekap",label:"Rekap Ampuan", icon: Icon.FileText, section:"UTAMA" },
      { id:"teacher-me",   label:"Kehadiran Saya", icon: Icon.User, section:"PRIBADI" },
    ],
    admin: [
      { id:"admin-dash",   label:"Dasbor", icon: Icon.LayoutDash, section:"UTAMA" },
      { id:"anomaly",      label:"Papan Anomali", icon: Icon.Flag, section:"UTAMA", count: counts.anomaly },
      { id:"live-monitor", label:"Live Monitor", icon: Icon.Radar, section:"UTAMA" },
      { id:"history",      label:"Riwayat Absen", icon: Icon.Book, section:"OPERASIONAL" },
      { id:"schedule",     label:"Jadwal & Sesi", icon: Icon.Calendar, section:"OPERASIONAL" },
      { id:"cards",        label:"Smart Card", icon: Icon.CreditCard, section:"PERANGKAT" },
      { id:"settings",     label:"Pengaturan", icon: Icon.Settings, section:"SISTEM" },
    ],
  };
  const items = itemsByRole[role] || itemsByRole.admin;
  const grouped = items.reduce((a, it) => { (a[it.section] ||= []).push(it); return a; }, {});

  const roleMap = { guru: { label:"Guru Mapel", name: DATA.TEACHER.nama, initials: "RH" }, admin: { label:"Admin/TU", name:"Hj. Nurhasanah, S.E.", initials:"NH" } };
  const u = roleMap[role];

  return (
    <aside className="side">
      <div className="brand">
        <div className="brand-mark">e·H</div>
        <div style={{lineHeight:1.2}}>
          <div className="brand-name">e-Hadir</div>
          <div className="brand-sub">MAN 1 ROHUL</div>
        </div>
      </div>

      {Object.entries(grouped).map(([sec, its]) => (
        <React.Fragment key={sec}>
          <div className="nav-section">{sec}</div>
          {its.map(it => {
            const Ico = it.icon;
            return (
              <div key={it.id} className={"nav-item " + (route===it.id?"active":"")} onClick={() => onNav(it.id)}>
                <Ico />
                <span>{it.label}</span>
                {it.count != null && <span className="count">{it.count}</span>}
              </div>
            );
          })}
        </React.Fragment>
      ))}

      <div className="side-foot">
        <div className="row" style={{ padding: "8px 6px", gap: 10 }}>
          <Avatar name={u.name} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--fg-dim)" }}>{u.label}</div>
          </div>
          <button className="btn icon ghost" title="Keluar" onClick={() => onNav("__logout")}><Icon.LogOut/></button>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ crumbs, onCommand }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const timeStr = now.toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false });
  const dateStr = now.toLocaleDateString("id-ID", { weekday:"long", day:"numeric", month:"long" });

  return (
    <div className="topbar">
      <div className="crumb">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            <span className={i === crumbs.length-1 ? "now" : ""}>{c}</span>
            {i < crumbs.length-1 && <span className="sep"><Icon.ChevronR size={12}/></span>}
          </React.Fragment>
        ))}
      </div>
      <div className="top-spacer" />
      <div className="searchbox">
        <Icon.Search size={14} />
        <span>Cari siswa, sesi, flag…</span>
        <kbd>⌘K</kbd>
      </div>
      <div className="chip"><Icon.Clock size={12} /> <span>{dateStr}</span> · <span style={{color:"var(--fg)"}}>{timeStr}</span></div>
      <button className="btn icon ghost" title="Notifikasi"><Icon.Bell/></button>
      <ThemeToggle />
    </div>
  );
}

function SparkBars({ data, tone="" }) {
  const max = Math.max(...data, 1);
  const color = {
    ok: "var(--ok)", warn:"var(--warn)", bad:"var(--bad)",
  }[tone] || "var(--accent)";
  return (
    <svg className="spark" width="80" height="30" viewBox="0 0 80 30">
      {data.map((v,i) => {
        const h = Math.max(3, (v/max) * 26);
        return <rect key={i} x={i*11} y={30-h} width="7" height={h} rx="1.5" fill={color} opacity={0.35 + 0.65*(i/(data.length-1))} />;
      })}
    </svg>
  );
}

function StatCard({ k, v, sub, tone, spark }) {
  return (
    <div className="stat">
      <div className="stat-label">{k}</div>
      <div className="stat-num">{v}</div>
      <div className={"stat-delta " + (tone === "ok" ? "up" : tone === "bad" ? "down" : "")}>{sub}</div>
      {spark && <SparkBars data={spark} tone={tone} />}
    </div>
  );
}

Object.assign(window, { Pill, Avatar, Btn, ThemeToggle, StatusPill, Sidebar, TopBar, SparkBars, StatCard });
