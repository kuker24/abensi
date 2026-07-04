#!/usr/bin/env python3
"""
Sistem Informasi Akademik Berkarakter — APK Builder GUI
Web-based build interface for Android Reader APK.
Zero dependencies — uses Python's built-in http.server.

Usage:
    python3 apk_builder_gui.py [--port 8765]

Then open http://localhost:8765 in browser.
"""

import http.server
import json
import os
import queue
import re
import shutil
import signal
import socketserver
import subprocess
import sys
import textwrap
import threading
import time
import argparse
from pathlib import Path
from urllib.parse import parse_qs, urlparse

# ── Paths ──
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent.parent  # apk-builder/ -> tools/ -> scripts/ -> Absensi/
ANDROID_DIR = REPO_ROOT / "apps" / "android-reader"
GRADLE_PROPS = ANDROID_DIR / "gradle.properties"
OUTPUT_DIR = ANDROID_DIR / "output"
LOCAL_PROPS = ANDROID_DIR / "local.properties"

# ── State ──
build_log_queue: queue.Queue = queue.Queue()
current_build_process: subprocess.Popen | None = None
build_lock = threading.Lock()

def find_jdk():
    """Find JDK 17 or 21 on the system."""
    candidates = [
        "/usr/lib/jvm/java-17-openjdk",
        "/usr/lib/jvm/java-21-openjdk",
        Path.home() / ".local/jdks/jdk-17",
        Path.home() / ".local/jdks/jdk-21",
        Path.home() / ".gradle/jdks/eclipse_adoptium-17-amd64-linux.2",
        Path.home() / ".gradle/jdks/eclipse_adoptium-21-amd64-linux.2",
        Path.home() / "android-studio/jbr",
    ]
    for d in candidates:
        java = Path(d) / "bin" / "java"
        if java.exists():
            try:
                out = subprocess.check_output([str(java), "-version"], stderr=subprocess.STDOUT, text=True)
                if '"17.' in out or '"21.' in out:
                    return str(d)
            except Exception:
                pass
    # Fallback: check system java
    java_sys = shutil.which("java")
    if java_sys:
        try:
            out = subprocess.check_output([java_sys, "-version"], stderr=subprocess.STDOUT, text=True)
            if '"17.' in out or '"21.' in out:
                # Get JAVA_HOME from readlink
                real = Path(java_sys).resolve()
                # /usr/lib/jvm/java-17-openjdk/bin/java -> /usr/lib/jvm/java-17-openjdk
                return str(real.parent.parent)
        except Exception:
            pass
    return None

def find_android_sdk():
    """Find Android SDK on the system."""
    env_home = os.environ.get("ANDROID_HOME", "")
    env_root = os.environ.get("ANDROID_SDK_ROOT", "")
    candidates = [env_home, env_root, str(Path.home() / "Android/Sdk"), "/opt/android-sdk", "/usr/lib/android-sdk"]
    for d in candidates:
        if d and Path(d).is_dir() and (Path(d) / "platforms").is_dir():
            return d
    return None

def read_gradle_props():
    """Read gradle.properties and return dict."""
    props = {}
    if GRADLE_PROPS.exists():
        for line in GRADLE_PROPS.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                props[k.strip()] = v.strip()
    return props

def write_gradle_props(props: dict):
    """Write gradle.properties from dict."""
    lines = []
    if GRADLE_PROPS.exists():
        for line in GRADLE_PROPS.read_text().splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("#") and "=" in stripped:
                k = stripped.split("=", 1)[0].strip()
                if k in props:
                    lines.append(f"{k}={props[k]}")
                    continue
            lines.append(line)
    else:
        for k, v in props.items():
            lines.append(f"{k}={v}")
    GRADLE_PROPS.write_text("\n".join(lines) + "\n")

def get_env():
    """Get environment variables for build."""
    jdk = find_jdk()
    sdk = find_android_sdk()
    env = os.environ.copy()
    if jdk:
        env["JAVA_HOME"] = jdk
        env["PATH"] = f"{jdk}/bin:{env.get('PATH', '')}"
    if sdk:
        env["ANDROID_HOME"] = sdk
        env["ANDROID_SDK_ROOT"] = sdk
    # Write local.properties
    if sdk:
        LOCAL_PROPS.write_text(f"sdk.dir={sdk}\n")
    return env, jdk, sdk

def list_output_apks():
    """List built APKs in output directory."""
    apks = []
    if OUTPUT_DIR.exists():
        for f in sorted(OUTPUT_DIR.glob("*.apk"), key=lambda p: p.stat().st_mtime, reverse=True):
            size_mb = f.stat().st_size / (1024 * 1024)
            mtime = time.strftime("%Y-%m-%d %H:%M", time.localtime(f.stat().st_mtime))
            apks.append({"name": f.name, "size": f"{size_mb:.1f} MB", "mtime": mtime, "path": str(f)})
    return apks

def run_build(task: str, build_type: str = "debug"):
    """Run build in background thread."""
    global current_build_process
    with build_lock:
        if current_build_process and current_build_process.poll() is None:
            build_log_queue.put({"type": "error", "msg": "Build sedang berjalan. Tunggu selesai atau batalkan."})
            return

    def _run():
        global current_build_process
        env, jdk, sdk = get_env()

        if not jdk:
            build_log_queue.put({"type": "error", "msg": "JDK 17/21 tidak ditemukan! Install: sudo pacman -S jdk17-openjdk"})
            build_log_queue.put({"type": "done", "success": False})
            return
        if not sdk:
            build_log_queue.put({"type": "error", "msg": "Android SDK tidak ditemukan! Install Android Studio atau cmdline-tools."})
            build_log_queue.put({"type": "done", "success": False})
            return

        build_log_queue.put({"type": "info", "msg": f"JDK: {jdk}"})
        build_log_queue.put({"type": "info", "msg": f"Android SDK: {sdk}"})
        build_log_queue.put({"type": "info", "msg": f"Task: {task}"})
        build_log_queue.put({"type": "start", "task": task})

        gradle_task = "assembleDebug" if build_type == "debug" else "assembleRelease"
        if task == "test":
            gradle_task = "testDebugUnitTest"
        elif task == "clean":
            gradle_task = "clean"

        cmd = ["./gradlew", gradle_task, "--no-daemon", "--console=plain"]

        try:
            proc = subprocess.Popen(
                cmd,
                cwd=str(ANDROID_DIR),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            current_build_process = proc

            for line in iter(proc.stdout.readline, ""):
                line = line.rstrip("\n")
                if line:
                    build_log_queue.put({"type": "log", "msg": line})

            proc.wait()
            success = proc.returncode == 0

            if success and task in ("debug", "release"):
                # Copy APK to output
                OUTPUT_DIR.mkdir(exist_ok=True)
                props = read_gradle_props()
                vname = props.get("SCHOOLHUB_VERSION_NAME", "1.2.0")
                vcode = props.get("SCHOOLHUB_VERSION_CODE", "4")

                if build_type == "debug":
                    src = ANDROID_DIR / "app/build/outputs/apk/debug/app-debug.apk"
                    suffix = "debug"
                else:
                    src_release = ANDROID_DIR / "app/build/outputs/apk/release/app-release.apk"
                    src_unsigned = ANDROID_DIR / "app/build/outputs/apk/release/app-release-unsigned.apk"
                    src = src_release if src_release.exists() else src_unsigned
                    suffix = "release" if src_release.exists() else "release-unsigned"

                if src.exists():
                    dst = OUTPUT_DIR / f"Absensi-MAN-1-Rokan-Hulu-v{vname}-code{vcode}-{suffix}.apk"
                    shutil.copy2(str(src), str(dst))
                    build_log_queue.put({"type": "success", "msg": f"APK siap: {dst.name}"})
                else:
                    build_log_queue.put({"type": "warn", "msg": f"Build sukses tapi APK tidak ditemukan di {src}"})

            build_log_queue.put({"type": "done", "success": success})

        except Exception as e:
            build_log_queue.put({"type": "error", "msg": str(e)})
            build_log_queue.put({"type": "done", "success": False})
        finally:
            current_build_process = None

    t = threading.Thread(target=_run, daemon=True)
    t.start()

def cancel_build():
    """Cancel running build."""
    global current_build_process
    with build_lock:
        if current_build_process and current_build_process.poll() is None:
            current_build_process.terminate()
            build_log_queue.put({"type": "warn", "msg": "Build dibatalkan."})
            build_log_queue.put({"type": "done", "success": False})
            return True
    return False


# ── HTML/CSS/JS ──
HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SIAB2 APK Builder</title>
<style>
  :root {
    --bg: #16181C; --bg2: #1E2025; --bg3: #232529;
    --surface: #1E2025; --surface2: #26282F; --surface3: #343741;
    --border: rgba(255,255,255,0.06); --border2: rgba(255,255,255,0.10);
    --fg: #F0EDE8; --fg2: #C8C4BD; --fg-muted: #A8A29E; --fg-dim: #78716C;
    --amber: #F59E0B; --amber2: #FBBF24; --amber-dim: rgba(245,158,11,0.15);
    --sky: #0EA5E9; --ok: #34D399; --warn: #F97316; --bad: #F87171; --info: #60A5FA;
    --radius: 12px; --radius-lg: 16px;
    --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--fg); font-family: var(--font-sans); font-size: 14px; min-height: 100vh; }
  .container { max-width: 900px; margin: 0 auto; padding: 24px 20px; }
  h1 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
  h1 span { color: var(--amber); }
  .subtitle { color: var(--fg-muted); font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; gap: 16px; }
  .grid-2 { grid-template-columns: 1fr 1fr; }
  @media (max-width: 640px) { .grid-2 { grid-template-columns: 1fr; } }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; transition: border-color 0.2s; }
  .card:hover { border-color: var(--border2); }
  .card-title { font-weight: 600; font-size: 15px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .card-title .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .dot-ok { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
  .dot-bad { background: var(--bad); box-shadow: 0 0 8px var(--bad); }
  .dot-warn { background: var(--warn); box-shadow: 0 0 8px var(--warn); }
  .dot-amber { background: var(--amber); box-shadow: 0 0 8px var(--amber); }
  .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
  .info-row:last-child { border-bottom: none; }
  .info-label { color: var(--fg-muted); }
  .info-value { color: var(--fg); font-family: var(--font-mono); font-size: 12px; text-align: right; word-break: break-all; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 18px; border-radius: var(--radius); border: 1px solid transparent; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.18s; font-family: inherit; min-height: 42px; }
  .btn:hover { transform: translateY(-1px); }
  .btn:active { transform: translateY(0) scale(0.98); }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; }
  .btn-primary { background: var(--amber); color: #1C1917; }
  .btn-primary:hover { background: var(--amber2); box-shadow: 0 4px 12px rgba(245,158,11,0.25); }
  .btn-secondary { background: transparent; border-color: var(--border2); color: var(--fg2); }
  .btn-secondary:hover { background: var(--surface2); }
  .btn-danger { background: var(--bad); color: white; }
  .btn-danger:hover { box-shadow: 0 4px 12px rgba(248,113,113,0.25); }
  .btn-sm { padding: 6px 12px; font-size: 12px; min-height: 34px; }
  .btn-group { display: flex; gap: 8px; flex-wrap: wrap; }
  .log-box { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; font-family: var(--font-mono); font-size: 12px; line-height: 1.6; max-height: 400px; overflow-y: auto; color: var(--fg2); white-space: pre-wrap; word-break: break-all; }
  .log-box .log-info { color: var(--fg-muted); }
  .log-box .log-success { color: var(--ok); }
  .log-box .log-error { color: var(--bad); }
  .log-box .log-warn { color: var(--warn); }
  .log-box .log-start { color: var(--amber); font-weight: 600; }
  .progress-bar { height: 4px; background: var(--bg3); border-radius: 2px; overflow: hidden; margin-top: 12px; }
  .progress-bar-fill { height: 100%; background: var(--amber); border-radius: 2px; transition: width 0.3s; }
  .progress-bar-fill.running { animation: progress-pulse 1.5s ease infinite; }
  @keyframes progress-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
  .status-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge-ok { background: rgba(52,211,153,0.15); color: var(--ok); border: 1px solid rgba(52,211,153,0.2); }
  .badge-bad { background: rgba(248,113,113,0.15); color: var(--bad); border: 1px solid rgba(248,113,113,0.2); }
  .badge-run { background: var(--amber-dim); color: var(--amber); border: 1px solid rgba(245,158,11,0.2); }
  .badge-idle { background: rgba(255,255,255,0.05); color: var(--fg-dim); border: 1px solid var(--border); }
  .apk-list { list-style: none; }
  .apk-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 8px; transition: all 0.15s; }
  .apk-item:hover { border-color: var(--border2); background: var(--surface2); }
  .apk-name { font-size: 13px; font-weight: 500; color: var(--fg); }
  .apk-meta { font-size: 11px; color: var(--fg-dim); font-family: var(--font-mono); }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 18px; font-weight: 700; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
  .section-title::before { content: ''; width: 3px; height: 18px; background: var(--amber); border-radius: 2px; }
  .toast { position: fixed; top: 20px; right: 20px; padding: 12px 18px; border-radius: var(--radius); font-size: 13px; font-weight: 500; z-index: 1000; animation: toast-in 0.3s ease; max-width: 380px; backdrop-filter: blur(12px); }
  .toast-ok { background: rgba(52,211,153,0.9); color: #fff; border: 1px solid var(--ok); }
  .toast-err { background: rgba(248,113,113,0.9); color: #fff; border: 1px solid var(--bad); }
  @keyframes toast-in { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
  .form-group { margin-bottom: 12px; }
  .form-label { display: block; font-size: 12px; font-weight: 600; color: var(--fg-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.06em; }
  .form-input { width: 100%; padding: 8px 12px; background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--fg); font-size: 13px; font-family: var(--font-mono); transition: border-color 0.2s; }
  .form-input:focus { outline: none; border-color: var(--amber); box-shadow: 0 0 0 3px rgba(245,158,11,0.15); }
  .footer { text-align: center; padding: 20px 0; color: var(--fg-dim); font-size: 12px; border-top: 1px solid var(--border); margin-top: 32px; }
</style>
</head>
<body>
<div class="container">
  <h1>SIAB2 <span>APK Builder</span></h1>
  <p class="subtitle">Build & manage Android Reader APK &mdash; Dark Nocturne Edition</p>

  <!-- Status -->
  <div class="section">
    <div class="section-title">Environment</div>
    <div class="grid grid-2">
      <div class="card">
        <div class="card-title"><span class="dot {{JDK_DOT}}"></span> JDK</div>
        <div class="info-row"><span class="info-label">Status</span><span class="info-value">{{JDK_STATUS}}</span></div>
        <div class="info-row"><span class="info-label">Path</span><span class="info-value">{{JDK_PATH}}</span></div>
        <div class="info-row"><span class="info-label">Version</span><span class="info-value">{{JDK_VERSION}}</span></div>
      </div>
      <div class="card">
        <div class="card-title"><span class="dot {{SDK_DOT}}"></span> Android SDK</div>
        <div class="info-row"><span class="info-label">Status</span><span class="info-value">{{SDK_STATUS}}</span></div>
        <div class="info-row"><span class="info-label">Path</span><span class="info-value">{{SDK_PATH}}</span></div>
        <div class="info-row"><span class="info-label">Platforms</span><span class="info-value">{{SDK_PLATFORMS}}</span></div>
      </div>
    </div>
  </div>

  <!-- Config -->
  <div class="section">
    <div class="section-title">Config</div>
    <div class="card">
      <div class="card-title"><span class="dot dot-amber"></span> gradle.properties</div>
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">App Name</label>
          <input class="form-input" id="cfg-name" value="{{APP_NAME}}">
        </div>
        <div class="form-group">
          <label class="form-label">Version</label>
          <input class="form-input" id="cfg-version" value="{{VERSION}}">
        </div>
        <div class="form-group">
          <label class="form-label">Server URL</label>
          <input class="form-input" id="cfg-server" value="{{SERVER_URL}}">
        </div>
        <div class="form-group">
          <label class="form-label">Version Code</label>
          <input class="form-input" id="cfg-code" value="{{VERSION_CODE}}">
        </div>
      </div>
      <div class="btn-group" style="margin-top: 12px;">
        <button class="btn btn-secondary btn-sm" onclick="saveConfig()">Simpan Config</button>
      </div>
    </div>
  </div>

  <!-- Build -->
  <div class="section">
    <div class="section-title">Build</div>
    <div class="card">
      <div class="card-title"><span class="dot" id="build-dot"></span> Build Status <span class="status-badge badge-idle" id="build-badge">Idle</span></div>
      <div class="btn-group">
        <button class="btn btn-primary" id="btn-debug" onclick="startBuild('debug')">Build Debug APK</button>
        <button class="btn btn-secondary" id="btn-release" onclick="startBuild('release')">Build Release APK</button>
        <button class="btn btn-secondary" id="btn-test" onclick="startBuild('test')">Run Tests</button>
        <button class="btn btn-secondary" id="btn-clean" onclick="startBuild('clean')">Clean</button>
        <button class="btn btn-danger btn-sm" id="btn-cancel" onclick="cancelBuild()" style="display:none;">Batalkan</button>
      </div>
      <div class="progress-bar"><div class="progress-bar-fill" id="progress" style="width:0%"></div></div>
      <div class="log-box" id="log" style="margin-top: 12px;">Menunggu perintah build...</div>
    </div>
  </div>

  <!-- Output -->
  <div class="section">
    <div class="section-title">Output APK</div>
    <div class="card">
      <div class="card-title"><span class="dot dot-amber"></span> APK Files</div>
      <ul class="apk-list" id="apk-list">{{APK_LIST}}</ul>
      <div id="no-apk" style="color: var(--fg-dim); font-size: 13px; {{NO_APK_DISPLAY}}">Belum ada APK. Jalankan build terlebih dahulu.</div>
      <div class="btn-group" style="margin-top: 12px;">
        <button class="btn btn-secondary btn-sm" onclick="refreshApks()">Refresh</button>
      </div>
    </div>
  </div>

  <div class="footer">Sistem Informasi Akademik Berkarakter &mdash; APK Builder &mdash; MAN 1 Rokan Hulu</div>
</div>

<script>
let building = false;
let evtSource = null;

function toast(msg, ok) {
  const el = document.createElement('div');
  el.className = 'toast ' + (ok ? 'toast-ok' : 'toast-err');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function saveConfig() {
  fetch('/api/config', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      name: document.getElementById('cfg-name').value,
      version: document.getElementById('cfg-version').value,
      code: document.getElementById('cfg-code').value,
      server: document.getElementById('cfg-server').value,
    })
  }).then(r => r.json()).then(d => {
    toast(d.ok ? 'Config tersimpan!' : ('Error: ' + d.error), d.ok);
  }).catch(e => toast('Error: ' + e, false));
}

function startBuild(type) {
  if (building) return;
  building = true;
  const log = document.getElementById('log');
  log.innerHTML = '';
  setBuildState('running', 'Building...');
  document.getElementById('btn-cancel').style.display = '';

  evtSource = new EventSource('/api/build/' + type);
  evtSource.onmessage = function(e) {
    const data = JSON.parse(e.data);
    appendLog(data);
    if (data.type === 'done') {
      building = false;
      evtSource.close();
      document.getElementById('btn-cancel').style.display = 'none';
      setBuildState(data.success ? 'ok' : 'bad', data.success ? 'Berhasil' : 'Gagal');
      if (data.success) refreshApks();
    }
  };
  evtSource.onerror = function() {
    if (building) {
      building = false;
      document.getElementById('btn-cancel').style.display = 'none';
      setBuildState('bad', 'Error');
      toast('Koneksi terputus', false);
    }
  };
}

function cancelBuild() {
  fetch('/api/cancel', {method: 'POST'}).then(r => r.json()).then(d => {
    if (!d.ok) toast('Tidak ada build yang berjalan', false);
  });
}

function appendLog(data) {
  const log = document.getElementById('log');
  const cls = 'log-' + data.type;
  const line = document.createElement('div');
  line.className = cls;
  line.textContent = data.msg;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function setBuildState(state, label) {
  const dot = document.getElementById('build-dot');
  const badge = document.getElementById('build-badge');
  const prog = document.getElementById('progress');
  dot.className = 'dot';
  if (state === 'running') { dot.classList.add('dot-amber'); badge.className = 'status-badge badge-run'; prog.style.width = '100%'; prog.className = 'progress-bar-fill running'; }
  else if (state === 'ok') { dot.classList.add('dot-ok'); badge.className = 'status-badge badge-ok'; prog.style.width = '100%'; prog.className = 'progress-bar-fill'; prog.style.background = 'var(--ok)'; }
  else if (state === 'bad') { dot.classList.add('dot-bad'); badge.className = 'status-badge badge-bad'; prog.style.width = '100%'; prog.className = 'progress-bar-fill'; prog.style.background = 'var(--bad)'; }
  else { badge.className = 'status-badge badge-idle'; prog.style.width = '0%'; prog.className = 'progress-bar-fill'; prog.style.background = 'var(--amber)'; }
  badge.textContent = label;
}

function refreshApks() {
  fetch('/api/apks').then(r => r.json()).then(data => {
    const list = document.getElementById('apk-list');
    const noApk = document.getElementById('no-apk');
    list.innerHTML = '';
    if (data.length === 0) {
      noApk.style.display = '';
    } else {
      noApk.style.display = 'none';
      data.forEach(apk => {
        const li = document.createElement('li');
        li.className = 'apk-item';
        li.innerHTML = '<div><div class="apk-name">' + apk.name + '</div><div class="apk-meta">' + apk.size + ' &middot; ' + apk.mtime + '</div></div>';
        list.appendChild(li);
      });
    }
  });
}

// Auto-refresh on load
document.addEventListener('DOMContentLoaded', refreshApks);
</script>
</body>
</html>"""


class BuilderHandler(http.server.BaseHTTPRequestHandler):
    """HTTP request handler for APK Builder GUI."""

    def log_message(self, format, *args):
        pass  # Suppress default logging

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/" or path == "/index.html":
            self._serve_index()
        elif path == "/api/apks":
            self._serve_json(list_output_apks())
        elif path.startswith("/api/build/"):
            build_type = path.split("/")[-1]
            self._serve_build_stream(build_type)
        else:
            self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len).decode() if content_len > 0 else "{}"

        if path == "/api/config":
            self._handle_config(body)
        elif path == "/api/cancel":
            ok = cancel_build()
            self._serve_json({"ok": ok})
        else:
            self.send_error(404)

    def _serve_index(self):
        env, jdk, sdk = get_env()
        props = read_gradle_props()

        # JDK info
        jdk_ok = jdk is not None
        jdk_version = ""
        if jdk:
            try:
                jdk_version = subprocess.check_output(
                    [f"{jdk}/bin/java", "-version"], stderr=subprocess.STDOUT, text=True
                ).split("\n")[0].strip()
            except Exception:
                jdk_version = "unknown"

        # SDK info
        sdk_ok = sdk is not None
        sdk_platforms = ""
        if sdk:
            platforms_dir = Path(sdk) / "platforms"
            if platforms_dir.exists():
                sdk_platforms = ", ".join(sorted(p.name for p in platforms_dir.iterdir() if p.is_dir()))

        # APK list
        apks = list_output_apks()
        apk_html = ""
        for apk in apks:
            apk_html += f'<li class="apk-item"><div><div class="apk-name">{apk["name"]}</div><div class="apk-meta">{apk["size"]} &middot; {apk["mtime"]}</div></div></li>\n'

        html = HTML_TEMPLATE
        html = html.replace("{{JDK_DOT}}", "dot-ok" if jdk_ok else "dot-bad")
        html = html.replace("{{JDK_STATUS}}", "Terinstall" if jdk_ok else "Tidak ditemukan")
        html = html.replace("{{JDK_PATH}}", jdk or "-")
        html = html.replace("{{JDK_VERSION}}", jdk_version or "-")
        html = html.replace("{{SDK_DOT}}", "dot-ok" if sdk_ok else "dot-bad")
        html = html.replace("{{SDK_STATUS}}", "Terinstall" if sdk_ok else "Tidak ditemukan")
        html = html.replace("{{SDK_PATH}}", sdk or "-")
        html = html.replace("{{SDK_PLATFORMS}}", sdk_platforms or "-")
        html = html.replace("{{APP_NAME}}", props.get("SCHOOLHUB_APP_NAME", "SIAB2 Reader"))
        html = html.replace("{{VERSION}}", props.get("SCHOOLHUB_VERSION_NAME", "1.2.0"))
        html = html.replace("{{VERSION_CODE}}", props.get("SCHOOLHUB_VERSION_CODE", "4"))
        html = html.replace("{{SERVER_URL}}", props.get("SCHOOLHUB_SERVER_BASE_URL", ""))
        html = html.replace("{{APK_LIST}}", apk_html)
        html = html.replace("{{NO_APK_DISPLAY}}", "display:none;" if apks else "")

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode())

    def _serve_json(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _handle_config(self, body):
        try:
            data = json.loads(body)
            props = read_gradle_props()
            if "name" in data:
                props["SCHOOLHUB_APP_NAME"] = data["name"]
            if "version" in data:
                props["SCHOOLHUB_VERSION_NAME"] = data["version"]
            if "code" in data:
                props["SCHOOLHUB_VERSION_CODE"] = data["code"]
            if "server" in data:
                props["SCHOOLHUB_SERVER_BASE_URL"] = data["server"]
            write_gradle_props(props)
            self._serve_json({"ok": True})
        except Exception as e:
            self._serve_json({"ok": False, "error": str(e)})

    def _serve_build_stream(self, build_type):
        """SSE endpoint for build streaming."""
        # Clear queue
        while not build_log_queue.empty():
            try:
                build_log_queue.get_nowait()
            except queue.Empty:
                break

        # Start build
        task = build_type
        if build_type in ("debug", "release"):
            run_build(task, build_type)
        else:
            run_build(task, "debug")

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        try:
            while True:
                try:
                    msg = build_log_queue.get(timeout=1)
                    data = json.dumps(msg, ensure_ascii=False)
                    self.wfile.write(f"data: {data}\n\n".encode())
                    self.wfile.flush()
                    if msg.get("type") == "done":
                        break
                except queue.Empty:
                    # Send keepalive
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    parser = argparse.ArgumentParser(description="SIAB2 APK Builder GUI")
    parser.add_argument("--port", type=int, default=8765, help="Port (default: 8765)")
    args = parser.parse_args()

    server = ThreadedHTTPServer(("127.0.0.1", args.port), BuilderHandler)

    def shutdown(sig, frame):
        print("\nShutting down...")
        server.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print(f"\n  SIAB2 APK Builder")
    print(f"  http://localhost:{args.port}")
    print(f"  Press Ctrl+C to stop\n")

    server.serve_forever()


if __name__ == "__main__":
    main()
