#!/usr/bin/env bash
set -euo pipefail

OUT_PATH="${1:-artifacts/performance/vps-hardware-profile.json}"
mkdir -p "$(dirname "$OUT_PATH")"

python3 - "$OUT_PATH" <<'PY'
import json, re, subprocess, sys
from pathlib import Path

out_path = Path(sys.argv[1])

def run(cmd, timeout=15):
    try:
        p = subprocess.run(cmd, shell=True, text=True, capture_output=True, timeout=timeout)
        return {"ok": p.returncode == 0, "stdout": p.stdout.strip(), "stderr": "" if p.returncode == 0 else "command_failed"}
    except Exception:
        return {"ok": False, "stdout": "", "stderr": "command_failed"}

def parse_lscpu(text):
    data = {}
    for line in text.splitlines():
        if ':' in line:
            key, value = line.split(':', 1)
            data[key.strip()] = value.strip()
    return data

def parse_free(text):
    data = {}
    for line in text.splitlines():
        parts = line.split()
        if parts and parts[0].rstrip(':') in {'Mem', 'Swap'}:
            key = parts[0].rstrip(':')
            data[key] = {
                'totalBytes': int(parts[1]),
                'usedBytes': int(parts[2]),
                'freeBytes': int(parts[3]),
                'availableBytes': int(parts[6]) if key == 'Mem' and len(parts) > 6 else None,
            }
    return data

def parse_docker_stats(text):
    services = {}
    for line in text.splitlines():
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except Exception:
            continue
        name = (item.get('Name') or item.get('Container') or '').lower()
        service = 'other'
        for candidate in ['postgres', 'redis', 'api', 'worker', 'web', 'reverse-proxy', 'nginx', 'caddy']:
            if candidate in name:
                service = 'reverse-proxy' if candidate in {'nginx', 'caddy', 'reverse-proxy'} else candidate
                break
        services.setdefault(service, []).append({
            'cpuPercent': item.get('CPUPerc'),
            'memory': item.get('MemUsage'),
            'memoryPercent': item.get('MemPerc'),
            'pids': item.get('PIDs'),
        })
    return services

commands = {
    'collectedAtUtc': "date -u +%Y-%m-%dT%H:%M:%SZ",
    'lscpu': 'lscpu',
    'freeBytes': 'free -b',
    'freeHuman': 'free -h',
    'lsblk': 'lsblk -b -o NAME,TYPE,SIZE,ROTA,FSTYPE,MOUNTPOINTS --json',
    'df': 'df -B1 --output=fstype,size,used,avail,pcent,target / /opt 2>/dev/null | tail -n +2',
    'dfInodes': 'df -iP / /opt 2>/dev/null | tail -n +2',
    'dockerVersion': "docker version --format '{{json .}}' 2>/dev/null || true",
    'dockerCompose': 'docker compose version --short 2>/dev/null || true',
    'dockerInfo': "docker info --format '{{json .}}' 2>/dev/null || true",
    'dockerStats': "docker stats --no-stream --format '{{json .}}' 2>/dev/null || true",
    'virt': 'systemd-detect-virt 2>/dev/null || true',
    'uname': 'uname -srmo',
    'uptime': 'uptime',
    'cgroup': 'stat -fc %T /sys/fs/cgroup 2>/dev/null || true',
}
raw = {key: run(cmd) for key, cmd in commands.items()}
lscpu = parse_lscpu(raw['lscpu']['stdout'])
free = parse_free(raw['freeBytes']['stdout'])
try:
    docker_info = json.loads(raw['dockerInfo']['stdout'] or '{}')
except Exception:
    docker_info = {}
try:
    docker_version = json.loads(raw['dockerVersion']['stdout'] or '{}')
except Exception:
    docker_version = {}
try:
    block_devices = json.loads(raw['lsblk']['stdout'] or '{}').get('blockdevices', [])
except Exception:
    block_devices = []

rota = []
filesystems = []
total_disk = 0

def walk(items):
    global total_disk
    for item in items:
        if item.get('type') == 'disk':
            rota.append(int(item.get('rota') or 0))
            total_disk += int(item.get('size') or 0)
        if item.get('fstype'):
            filesystems.append(item.get('fstype'))
        walk(item.get('children') or [])
walk(block_devices)

profile = {
    'schemaVersion': 1,
    'sanitized': True,
    'hardwareClass': 'dedicated-vps',
    'collectedAtUtc': raw['collectedAtUtc']['stdout'],
    'cpu': {
        'model': lscpu.get('Model name'),
        'logicalCpus': int(lscpu.get('CPU(s)', '0') or 0),
        'physicalCores': (int(lscpu.get('Core(s) per socket', '0') or 0) * int(lscpu.get('Socket(s)', '0') or 0)) or None,
        'threadsPerCore': int(lscpu.get('Thread(s) per core', '0') or 0) or None,
        'minMhz': lscpu.get('CPU min MHz'),
        'maxMhz': lscpu.get('CPU max MHz'),
    },
    'virtualization': {'type': raw['virt']['stdout'] or 'unknown'},
    'memory': {
        'totalBytes': free.get('Mem', {}).get('totalBytes'),
        'availableBytes': free.get('Mem', {}).get('availableBytes'),
        'swapTotalBytes': free.get('Swap', {}).get('totalBytes'),
        'swapUsedBytes': free.get('Swap', {}).get('usedBytes'),
        'freeHuman': raw['freeHuman']['stdout'],
    },
    'storage': {
        'class': 'rotational' if any(rota) else 'ssd_or_nvme',
        'rotational': bool(any(rota)),
        'filesystems': sorted(set(filesystems)),
        'totalDiskBytesByBlockDevices': total_disk,
    },
    'docker': {
        'serverVersion': (docker_version.get('Server') or {}).get('Version'),
        'clientVersion': (docker_version.get('Client') or {}).get('Version'),
        'composeVersion': raw['dockerCompose']['stdout'],
        'cgroupVersion': docker_info.get('CgroupVersion') or raw['cgroup']['stdout'],
        'containerCount': docker_info.get('Containers'),
    },
    'kernel': raw['uname']['stdout'],
    'loadAverage': raw['uptime']['stdout'].split('load average:')[-1].strip() if 'load average:' in raw['uptime']['stdout'] else raw['uptime']['stdout'],
    'currentContainers': parse_docker_stats(raw['dockerStats']['stdout']),
    'redactions': ['hostname', 'ip_address', 'username', 'mac_address', 'serial', 'uuid', 'secret_paths', 'environment_values'],
}
out_path.write_text(json.dumps(profile, indent=2, sort_keys=True) + '\n')
print(json.dumps({'ok': True, 'output': str(out_path), 'logicalCpus': profile['cpu']['logicalCpus'], 'ramBytes': profile['memory']['totalBytes']}, indent=2))
PY
