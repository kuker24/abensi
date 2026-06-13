#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: $ENV_FILE"
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "Neither 'docker compose' nor 'docker-compose' is available."
  exit 1
fi

"${COMPOSE_CMD[@]}" -f docker-compose.production.yml --env-file "$ENV_FILE" up -d --build --remove-orphans
# Recreate reverse proxy after API/Web replacement so nginx resolves fresh container IPs.
"${COMPOSE_CMD[@]}" -f docker-compose.production.yml --env-file "$ENV_FILE" up -d --force-recreate --no-deps reverse-proxy
"${COMPOSE_CMD[@]}" -f docker-compose.production.yml --env-file "$ENV_FILE" ps

echo "Health checks:"
curl -fsS http://localhost/health/live
echo
curl -fsS http://localhost/health/ready
echo

if "${COMPOSE_CMD[@]}" -f docker-compose.production.yml --env-file "$ENV_FILE" run --rm --no-deps api node dist/scripts/ensure-developer.js; then
  echo "Developer account check: OK"
else
  echo "Developer account check failed"
  exit 1
fi
