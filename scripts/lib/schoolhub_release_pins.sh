#!/usr/bin/env bash
# Shared helpers for SchoolHub release pin / image-tag hygiene.
# Intended to be sourced by ops scripts. Never prints secret values from env files.

schoolhub_trim() {
  local value="${1-}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

schoolhub_is_git_sha() {
  [[ "${1-}" =~ ^[0-9a-fA-F]{7,64}$ ]]
}

# Read KEY=value from an env file without exporting other secrets.
schoolhub_env_get() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 0
  awk -v key="$key" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    index($0, key "=") == 1 {
      value = substr($0, length(key) + 2)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      if (value ~ /^".*"$/ || value ~ /^'\''.*'\''$/) value = substr(value, 2, length(value) - 2)
      print value
      exit
    }
  ' "$file"
}

# Upsert KEY=value in place, preserve mode/owner, never dump file contents.
schoolhub_env_upsert() {
  local file="$1"
  local key="$2"
  local value="$3"
  local mode owner group tmp dir

  [[ -f "$file" ]] || { echo "Env file not found: $file" >&2; return 1; }
  [[ -n "$key" ]] || { echo "env key required" >&2; return 1; }
  [[ -n "$value" ]] || { echo "env value required for $key" >&2; return 1; }

  mode="$(stat -c '%a' "$file")"
  owner="$(stat -c '%u' "$file")"
  group="$(stat -c '%g' "$file")"
  dir="$(dirname "$file")"
  tmp="$(mktemp "$dir/.schoolhub-env-upsert.XXXXXX")"

  awk -v key="$key" -v value="$value" '
    BEGIN { done = 0 }
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { print; next }
    index($0, key "=") == 1 {
      if (!done) {
        print key "=" value
        done = 1
      }
      next
    }
    { print }
    END {
      if (!done) print key "=" value
    }
  ' "$file" >"$tmp"

  chmod "$mode" "$tmp"
  chown "$owner:$group" "$tmp" 2>/dev/null || true
  mv "$tmp" "$file"
}

schoolhub_write_pin_file() {
  local file="$1"
  local value="$2"
  local tmp dir mode owner group

  [[ -n "$value" ]] || { echo "pin value required for $file" >&2; return 1; }
  dir="$(dirname "$file")"
  mkdir -p "$dir"
  tmp="$(mktemp "$dir/.schoolhub-pin.XXXXXX")"
  printf '%s\n' "$value" >"$tmp"
  if [[ -f "$file" ]]; then
    mode="$(stat -c '%a' "$file")"
    owner="$(stat -c '%u' "$file")"
    group="$(stat -c '%g' "$file")"
    chmod "$mode" "$tmp"
    chown "$owner:$group" "$tmp" 2>/dev/null || true
  else
    chmod 600 "$tmp"
  fi
  mv "$tmp" "$file"
}

schoolhub_read_pin_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  schoolhub_trim "$(tr -d '\r\n' <"$file")"
}

# Best-effort: prefer running schoolhub-api image tag, else web/worker.
schoolhub_detect_running_image_tag() {
  local tag=""
  local name repo_tag
  for name in current-api-1 schoolhub-api schoolhub-web schoolhub-worker; do
    repo_tag="$(docker inspect -f '{{.Config.Image}}' "$name" 2>/dev/null || true)"
    [[ -n "$repo_tag" ]] || continue
    tag="${repo_tag##*:}"
    if schoolhub_is_git_sha "$tag"; then
      printf '%s' "$tag"
      return 0
    fi
  done
  return 1
}

schoolhub_running_service_tags_json() {
  python3 - <<'PY'
import json, subprocess, re
names = ["current-api-1", "schoolhub-api", "schoolhub-web", "schoolhub-worker", "schoolhub-nginx"]
out = {}
sha_re = re.compile(r"^[0-9a-fA-F]{7,64}$")
for name in names:
    try:
        img = subprocess.check_output(
            ["docker", "inspect", "-f", "{{.Config.Image}}", name],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        continue
    tag = img.rsplit(":", 1)[-1] if img else ""
    out[name] = {"image": img, "tag": tag, "isGitSha": bool(sha_re.match(tag))}
print(json.dumps(out))
PY
}
