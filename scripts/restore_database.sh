#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/schoolhub}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
BACKUP_FILE="${1:-}"
TARGET_DB="${TARGET_DB:-}"
CONFIRM="${CONFIRM_RESTORE:-}"
CONFIRM_DROP_TARGET="${CONFIRM_DROP_TARGET:-}"

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "Usage: $0 /path/to/schoolhub-YYYYMMDD-HHMMSS.sql.gz" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

if [[ "$CONFIRM" != "YES_RESTORE" ]]; then
  echo "Refusing restore without CONFIRM_RESTORE=YES_RESTORE" >&2
  echo "Set TARGET_DB to restore into a non-production database for testing." >&2
  exit 1
fi

cd "$ROOT_DIR"

COMPOSE=(docker compose -f docker-compose.production.yml --env-file "$ENV_FILE")

validate_db_name() {
  local db_name="$1"
  if [[ ! "$db_name" =~ ^[A-Za-z0-9_][A-Za-z0-9_-]*$ ]]; then
    echo "Unsafe database name: $db_name" >&2
    exit 1
  fi
}

database_exists() {
  local db_name="$1"
  validate_db_name "$db_name"
  "${COMPOSE[@]}" exec -T postgres \
    sh -lc 'psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '\''$1'\''"' sh "$db_name" | tr -d '[:space:]'
}

drop_database() {
  local db_name="$1"
  validate_db_name "$db_name"
  "${COMPOSE[@]}" exec -T postgres sh -lc '
    psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\''$1'\'' AND pid <> pg_backend_pid();" >/dev/null
    dropdb -U "$POSTGRES_USER" "$1"
  ' sh "$db_name"
}

create_database() {
  local db_name="$1"
  validate_db_name "$db_name"
  "${COMPOSE[@]}" exec -T postgres sh -lc 'createdb -U "$POSTGRES_USER" "$1"' sh "$db_name"
}

restore_into_database() {
  local db_name="$1"
  validate_db_name "$db_name"
  dump_stream | zcat | "${COMPOSE[@]}" exec -T postgres \
    sh -lc 'psql -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" "$1" >/dev/null' sh "$db_name"
}

stop_app_services_for_production_restore() {
  echo "Stopping app services before production restore..." >&2
  "${COMPOSE[@]}" stop reverse-proxy worker api >/dev/null
}

start_app_services_after_production_restore() {
  echo "Starting app services after production restore..." >&2
  "${COMPOSE[@]}" up -d api worker reverse-proxy >/dev/null
}

prepare_empty_database() {
  local db_name="$1"
  local exists
  exists="$(database_exists "$db_name")"
  if [[ -n "$exists" ]]; then
    if [[ "$CONFIRM_DROP_TARGET" != "YES_DROP_TARGET" ]]; then
      echo "Refusing to restore into existing database '$db_name' without CONFIRM_DROP_TARGET=YES_DROP_TARGET" >&2
      exit 1
    fi
    drop_database "$db_name"
  fi
  create_database "$db_name"
}

dump_stream() {
  if [[ "$BACKUP_FILE" == *.enc ]]; then
    : "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required for encrypted backup}";
    openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_PASSPHRASE -in "$BACKUP_FILE"
  else
    cat "$BACKUP_FILE"
  fi
}

dump_stream | gunzip -t

if [[ -n "$TARGET_DB" ]]; then
  prepare_empty_database "$TARGET_DB"
  restore_into_database "$TARGET_DB"
  echo "Restore completed into database: $TARGET_DB"
else
  PRODUCTION_DB="$("${COMPOSE[@]}" exec -T postgres sh -lc 'printf "%s" "$POSTGRES_DB"')"
  validate_db_name "$PRODUCTION_DB"
  echo "WARNING: production restore will drop and recreate database '$PRODUCTION_DB'." >&2
  if [[ "$CONFIRM_DROP_TARGET" != "YES_DROP_TARGET" ]]; then
    echo "Refusing production restore without CONFIRM_DROP_TARGET=YES_DROP_TARGET" >&2
    echo "Safer option: set TARGET_DB and verify the restore first." >&2
    exit 1
  fi
  stop_app_services_for_production_restore
  prepare_empty_database "$PRODUCTION_DB"
  restore_into_database "$PRODUCTION_DB"
  start_app_services_after_production_restore
  echo "Production restore completed into fresh database and app services restarted."
fi
