#!/usr/bin/env bash
# shellcheck disable=SC2016
set -euo pipefail
mkdir -p artifacts/security artifacts/sbom
if ! command -v trivy >/dev/null 2>&1; then
  echo '{"ok":false,"reason":"trivy not installed"}' | tee artifacts/security/trivy-fs.json
  exit 1
fi

trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --format json --output artifacts/security/trivy-fs.json .

if ! command -v docker >/dev/null 2>&1; then
  echo '{"ok":false,"reason":"docker not installed for production image scan"}' | tee artifacts/security/trivy-images.json
  exit 1
fi

images=(
  "schoolhub-api-security:ci apps/api/Dockerfile ."
  "schoolhub-web-security:ci apps/web/Dockerfile ."
  "schoolhub-worker-security:ci apps/worker/Dockerfile ."
)
summary='[]'
for item in "${images[@]}"; do
  read -r tag dockerfile context <<<"$item"
  docker build -t "$tag" -f "$dockerfile" "$context"
  safe_name=${tag//[:\/]/-}
  trivy image --scanners vuln,secret,misconfig --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --format json --output "artifacts/security/trivy-image-${safe_name}.json" "$tag"
  trivy image --format cyclonedx --output "artifacts/sbom/${safe_name}.cdx.json" "$tag"
  summary=$(node -e 'const current=JSON.parse(process.argv[1]); current.push({image:process.argv[2], trivy:`artifacts/security/trivy-image-${process.argv[3]}.json`, sbom:`artifacts/sbom/${process.argv[3]}.cdx.json`}); console.log(JSON.stringify(current));' "$summary" "$tag" "$safe_name")
done
node -e 'console.log(JSON.stringify({ok:true, images:JSON.parse(process.argv[1])}, null, 2))' "$summary" > artifacts/security/trivy-images.json
