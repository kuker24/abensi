#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts/security
node <<'NODE' > artifacts/security/license-policy.json
const fs = require('fs');
const forbidden = new Set(['GPL-3.0', 'AGPL-3.0', 'LGPL-3.0']);
function scanLock(path) {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  const bad = [];
  for (const [name, pkg] of Object.entries(data.packages || {})) {
    const license = pkg.license;
    if (license && forbidden.has(String(license))) bad.push({ name, license });
  }
  return bad;
}
const files = ['package-lock.json','apps/api/package-lock.json','apps/web/package-lock.json','apps/worker/package-lock.json'].filter(fs.existsSync);
const bad = files.flatMap(file => scanLock(file).map(item => ({ file, ...item })));
console.log(JSON.stringify({ ok: bad.length === 0, forbidden: Array.from(forbidden), bad }, null, 2));
if (bad.length) process.exit(1);
NODE
