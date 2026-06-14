#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts/sbom
npx cyclonedx-npm --output-file artifacts/sbom/root-node.cdx.json --output-format JSON --omit dev
(cd apps/api && npx cyclonedx-npm --output-file ../../artifacts/sbom/api-node.cdx.json --output-format JSON --omit dev)
(cd apps/web && npx cyclonedx-npm --output-file ../../artifacts/sbom/web-node.cdx.json --output-format JSON --omit dev)
(cd apps/worker && npx cyclonedx-npm --output-file ../../artifacts/sbom/worker-node.cdx.json --output-format JSON --omit dev)
if [[ -f apps/android-reader/gradlew ]]; then
  (cd apps/android-reader && ./gradlew --no-daemon :app:dependencies --configuration debugRuntimeClasspath > ../../artifacts/sbom/android-debug-runtime-dependencies.txt)
  node <<'NODE'
const fs = require('fs');
const text = fs.readFileSync('artifacts/sbom/android-debug-runtime-dependencies.txt', 'utf8');
const components = [...new Set([...text.matchAll(/---\s+([^\s:]+:[^\s:]+:[^\s]+)/g)].map((match) => match[1]))]
  .sort()
  .map((purl) => ({ type: 'library', name: purl, version: purl.split(':').pop() }));
const bom = { bomFormat: 'CycloneDX', specVersion: '1.5', version: 1, metadata: { component: { type: 'application', name: 'schoolhub-android-reader' } }, components };
fs.writeFileSync('artifacts/sbom/android-debug-runtime.cdx.json', JSON.stringify(bom, null, 2));
NODE
fi
node <<'NODE'
const fs = require('fs');
const required = ['root-node.cdx.json', 'api-node.cdx.json', 'web-node.cdx.json', 'worker-node.cdx.json'];
const missing = required.filter((file) => !fs.existsSync(`artifacts/sbom/${file}`));
const invalid = [];
for (const file of required.filter((file) => !missing.includes(file))) {
  const json = JSON.parse(fs.readFileSync(`artifacts/sbom/${file}`, 'utf8'));
  if (!json.components || !Array.isArray(json.components)) invalid.push(file);
}
const android = fs.existsSync('artifacts/sbom/android-debug-runtime.cdx.json');
const ok = missing.length === 0 && invalid.length === 0 && android;
const report = { ok, missing, invalid, androidSbom: android };
fs.writeFileSync('artifacts/sbom/summary.json', JSON.stringify(report, null, 2));
if (!ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
NODE
