#!/usr/bin/env bash
# Sync ACTIVE_RELEASE_SHA, ACTIVE_API_RELEASE_TAG, and SCHOOLHUB_IMAGE_TAG to one release SHA.
# Safe for production operator use: does not print secrets.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/schoolhub_release_pins.sh
source "$SCRIPT_DIR/lib/schoolhub_release_pins.sh"

ROOT_DIR="${ROOT_DIR:-/opt/schoolhub}"
# Capture explicit env-var overrides only. Derived paths are resolved after argument
# parsing so --root actually drives them; baking them in here made --root a no-op.
ENV_FILE_EXPLICIT="${ENV_FILE:-}"
ACTIVE_RELEASE_FILE_EXPLICIT="${ACTIVE_RELEASE_FILE:-}"
ACTIVE_API_FILE_EXPLICIT="${ACTIVE_API_FILE:-}"
ENV_FILE_CLI=""
TARGET_SHA=""
SOURCE="running"
DRY_RUN="false"
UPDATE_ENV="true"

usage() {
  cat >&2 <<'EOF'
Usage: bash scripts/sync_release_pins.sh [--sha SHA | --from-running | --from-git] [options]

Options:
  --sha SHA           Pin all markers to this git SHA
  --from-running      Detect SHA from running schoolhub-* containers (default if no --sha)
  --from-git          Use git rev-parse HEAD in current directory / ROOT_DIR/current
  --root DIR          Default /opt/schoolhub
  --env-file FILE     Default ROOT/.env
  --skip-env          Do not rewrite SCHOOLHUB_IMAGE_TAG in env file
  --dry-run           Print planned changes only
  -h, --help          Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha) TARGET_SHA="${2:-}"; SOURCE="explicit"; shift 2 ;;
    --from-running) SOURCE="running"; shift ;;
    --from-git) SOURCE="git"; shift ;;
    --root) ROOT_DIR="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE_CLI="${2:-}"; shift 2 ;;
    --skip-env) UPDATE_ENV="false"; shift ;;
    --dry-run) DRY_RUN="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

[[ -n "$ROOT_DIR" ]] || { echo "--root requires a value" >&2; exit 2; }

# Precedence: CLI flag > explicit env var > derived from ROOT_DIR.
ACTIVE_RELEASE_FILE="${ACTIVE_RELEASE_FILE_EXPLICIT:-$ROOT_DIR/ACTIVE_RELEASE_SHA}"
ACTIVE_API_FILE="${ACTIVE_API_FILE_EXPLICIT:-$ROOT_DIR/ACTIVE_API_RELEASE_TAG}"
if [[ -n "$ENV_FILE_CLI" ]]; then
  ENV_FILE="$ENV_FILE_CLI"
elif [[ -n "$ENV_FILE_EXPLICIT" ]]; then
  ENV_FILE="$ENV_FILE_EXPLICIT"
else
  ENV_FILE="$ROOT_DIR/.env"
fi

resolve_target() {
  case "$SOURCE" in
    explicit)
      [[ -n "$TARGET_SHA" ]] || { echo "--sha requires a value" >&2; return 1; }
      ;;
    running)
      TARGET_SHA="$(schoolhub_detect_running_image_tag)" || {
        echo "Could not detect a git-sha image tag from running containers." >&2
        return 1
      }
      ;;
    git)
      if git rev-parse HEAD >/dev/null 2>&1; then
        TARGET_SHA="$(git rev-parse HEAD)"
      elif [[ -d "$ROOT_DIR/current/.git" ]]; then
        TARGET_SHA="$(git -C "$ROOT_DIR/current" rev-parse HEAD)"
      else
        echo "No git checkout available for --from-git" >&2
        return 1
      fi
      ;;
  esac
  TARGET_SHA="$(schoolhub_trim "$TARGET_SHA")"
  schoolhub_is_git_sha "$TARGET_SHA" || {
    echo "Refusing non-git-sha pin value: ${TARGET_SHA:0:12}..." >&2
    return 1
  }
}

before_release="$(schoolhub_read_pin_file "$ACTIVE_RELEASE_FILE" || true)"
before_api="$(schoolhub_read_pin_file "$ACTIVE_API_FILE" || true)"
before_env_tag=""
if [[ -f "$ENV_FILE" ]]; then
  before_env_tag="$(schoolhub_env_get "$ENV_FILE" SCHOOLHUB_IMAGE_TAG || true)"
fi

resolve_target

echo "SchoolHub release pin sync"
echo "  source:          $SOURCE"
echo "  targetSha:       $TARGET_SHA"
echo "  ACTIVE_RELEASE:  ${before_release:-<missing>} -> $TARGET_SHA"
echo "  ACTIVE_API_TAG:  ${before_api:-<missing>} -> $TARGET_SHA"
if [[ "$UPDATE_ENV" == "true" ]]; then
  echo "  SCHOOLHUB_IMAGE_TAG: ${before_env_tag:-<missing>} -> $TARGET_SHA  ($ENV_FILE)"
else
  echo "  SCHOOLHUB_IMAGE_TAG: skipped"
fi

if [[ "$DRY_RUN" == "true" ]]; then
  jq -n \
    --arg source "$SOURCE" \
    --arg targetSha "$TARGET_SHA" \
    --arg beforeRelease "${before_release}" \
    --arg beforeApi "${before_api}" \
    --arg beforeEnvTag "${before_env_tag}" \
    --argjson updateEnv "$([ "$UPDATE_ENV" == "true" ] && echo true || echo false)" \
    --argjson dryRun true \
    '{ok:true,dryRun:$dryRun,source:$source,targetSha:$targetSha,before:{activeRelease:$beforeRelease,activeApi:$beforeApi,imageTag:$beforeEnvTag},updateEnv:$updateEnv}'
  exit 0
fi

schoolhub_write_pin_file "$ACTIVE_RELEASE_FILE" "$TARGET_SHA"
schoolhub_write_pin_file "$ACTIVE_API_FILE" "$TARGET_SHA"
if [[ "$UPDATE_ENV" == "true" ]]; then
  schoolhub_env_upsert "$ENV_FILE" "SCHOOLHUB_IMAGE_TAG" "$TARGET_SHA"
fi

after_release="$(schoolhub_read_pin_file "$ACTIVE_RELEASE_FILE")"
after_api="$(schoolhub_read_pin_file "$ACTIVE_API_FILE")"
after_env_tag=""
if [[ -f "$ENV_FILE" ]]; then
  after_env_tag="$(schoolhub_env_get "$ENV_FILE" SCHOOLHUB_IMAGE_TAG || true)"
fi

aligned="false"
if [[ "$after_release" == "$TARGET_SHA" && "$after_api" == "$TARGET_SHA" ]]; then
  if [[ "$UPDATE_ENV" != "true" || "$after_env_tag" == "$TARGET_SHA" ]]; then
    aligned="true"
  fi
fi

jq -n \
  --arg source "$SOURCE" \
  --arg targetSha "$TARGET_SHA" \
  --arg afterRelease "$after_release" \
  --arg afterApi "$after_api" \
  --arg afterEnvTag "$after_env_tag" \
  --argjson aligned "$aligned" \
  --argjson updateEnv "$([ "$UPDATE_ENV" == "true" ] && echo true || echo false)" \
  '{ok:$aligned,source:$source,targetSha:$targetSha,after:{activeRelease:$afterRelease,activeApi:$afterApi,imageTag:$afterEnvTag},updateEnv:$updateEnv,aligned:$aligned}'

[[ "$aligned" == "true" ]]
