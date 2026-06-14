#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts/sbom
npx cyclonedx-npm --output-file artifacts/sbom/root-node.cdx.json --output-format JSON --omit dev
(cd apps/api && npx cyclonedx-npm --output-file ../../artifacts/sbom/api-node.cdx.json --output-format JSON --omit dev)
(cd apps/web && npx cyclonedx-npm --output-file ../../artifacts/sbom/web-node.cdx.json --output-format JSON --omit dev)
(cd apps/worker && npx cyclonedx-npm --output-file ../../artifacts/sbom/worker-node.cdx.json --output-format JSON --omit dev)
if [[ -f apps/android-reader/gradlew ]]; then
  (cd apps/android-reader && ./gradlew --no-daemon dependencies > ../../artifacts/sbom/android-dependencies.txt)
fi
