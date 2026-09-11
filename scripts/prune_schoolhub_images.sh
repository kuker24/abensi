#!/usr/bin/env bash
# Prune unused schoolhub-* image tags while keeping currently running tags and the newest N tags.
set -Eeuo pipefail

KEEP_PER_REPO="${KEEP_PER_REPO:-2}"
DRY_RUN="false"
INCLUDE_BUILD_CACHE="false"
REPOS_CSV="schoolhub-api,schoolhub-web,schoolhub-worker"

usage() {
  cat >&2 <<'EOF'
Usage: bash scripts/prune_schoolhub_images.sh [options]

Options:
  --keep N              Keep newest N tags per schoolhub repo (default 2) plus running tags
  --include-build-cache Also run: docker builder prune -f
  --dry-run             Show reclaim plan only
  -h, --help            Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep) KEEP_PER_REPO="${2:-5}"; shift 2 ;;
    --include-build-cache) INCLUDE_BUILD_CACHE="true"; shift ;;
    --dry-run) DRY_RUN="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

if ! [[ "$KEEP_PER_REPO" =~ ^[0-9]+$ ]] || (( KEEP_PER_REPO < 1 )); then
  echo "--keep must be a positive integer" >&2
  exit 2
fi

for cmd in docker python3 jq; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Required command missing: $cmd" >&2; exit 1; }
done

PLAN_JSON="$(
  KEEP_PER_REPO="$KEEP_PER_REPO" REPOS="$REPOS_CSV" python3 - <<'PY'
import os, subprocess, json
from collections import defaultdict

keep_n = int(os.environ["KEEP_PER_REPO"])
repos = [r for r in os.environ.get("REPOS", "").split(",") if r]

running_ids = set()
running_tags = set()
ps = subprocess.check_output(["docker", "ps", "-a", "--format", "{{.ID}} {{.Image}}"], text=True)
for line in ps.splitlines():
    parts = line.strip().split(None, 1)
    if len(parts) != 2:
        continue
    cid, image = parts
    try:
        iid = subprocess.check_output(
            ["docker", "inspect", "-f", "{{.Image}}", cid],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        running_ids.add(iid)
    except Exception:
        pass
    if ":" in image:
        repo, tag = image.rsplit(":", 1)
        if repo in repos:
            running_tags.add(f"{repo}:{tag}")

images = subprocess.check_output(
    ["docker", "images", "--format", "{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}"],
    text=True,
)
by_repo = defaultdict(list)
for line in images.splitlines():
    repo, tag, iid, created = line.split("\t", 3)
    if repo not in repos:
        continue
    by_repo[repo].append((created, repo, tag, iid))

keep = set(running_tags)
delete = []
for repo, rows in by_repo.items():
    rows_sorted = sorted(rows, key=lambda r: r[0], reverse=True)
    kept = 0
    for _created, repo, tag, iid in rows_sorted:
        ref = f"{repo}:{tag}"
        if tag == "<none>":
            if iid not in running_ids:
                delete.append({"ref": ref, "id": iid, "reason": "dangling"})
            continue
        if tag == "latest":
            keep.add(ref)
            continue
        if ref in running_tags or iid in running_ids:
            keep.add(ref)
            continue
        if kept < keep_n:
            keep.add(ref)
            kept += 1
            continue
        delete.append({"ref": ref, "id": iid, "reason": f"beyond-keep-{keep_n}"})

print(json.dumps({
    "keepCount": len(keep),
    "deleteCount": len(delete),
    "keep": sorted(keep),
    "delete": delete,
    "runningTags": sorted(running_tags),
    "keepPerRepo": keep_n,
}))
PY
)"

echo "SchoolHub image prune plan"
echo "$PLAN_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  keepPerRepo:", d["keepPerRepo"])
print("  running:", len(d["runningTags"]))
print("  keep:", d["keepCount"])
print("  delete:", d["deleteCount"])
for x in d["delete"][:40]:
    print("   -", x["ref"], "(" + x["reason"] + ")")
if d["deleteCount"] > 40:
    print("   ...")
'

if [[ "$DRY_RUN" == "true" ]]; then
  echo "$PLAN_JSON" | jq --argjson dryRun true '. + {ok:true, dryRun:$dryRun, deleted:[]}'
  exit 0
fi

deleted_json='[]'
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  ref="$(printf '%s' "$line" | cut -f1)"
  id="$(printf '%s' "$line" | cut -f2)"
  removed="false"
  if docker image rm "$ref" >/dev/null 2>&1; then
    removed="true"
  elif [[ -n "$id" ]] && docker image rm "$id" >/dev/null 2>&1; then
    removed="true"
  else
    echo "  skip (in use or missing): $ref" >&2
  fi
  if [[ "$removed" == "true" ]]; then
    deleted_json="$(jq -c --arg ref "$ref" '. + [$ref]' <<<"$deleted_json")"
  fi
done < <(echo "$PLAN_JSON" | jq -r '.delete[] | [.ref, .id] | @tsv')

builder_note="skipped"
if [[ "$INCLUDE_BUILD_CACHE" == "true" ]]; then
  if docker builder prune -f >/tmp/schoolhub-builder-prune.txt 2>&1; then
    builder_note="pruned"
  else
    builder_note="failed"
  fi
fi

df_json="$(df -Pk / | awk 'NR==2 {gsub(/%/,"",$5); printf "{\"usedPercent\":%s,\"availableKb\":%s}", $5, $4}')"
docker_df="$(docker system df --format '{{json .}}' 2>/dev/null | jq -s '.' 2>/dev/null || printf '[]')"

jq -n \
  --argjson plan "$PLAN_JSON" \
  --argjson deleted "$deleted_json" \
  --argjson disk "$df_json" \
  --argjson dockerDf "$docker_df" \
  --arg builder "$builder_note" \
  --argjson includeBuildCache "$([ "$INCLUDE_BUILD_CACHE" == "true" ] && echo true || echo false)" \
  '{ok:true,dryRun:false,plan:$plan,deleted:$deleted,deletedCount:($deleted|length),disk:$disk,dockerSystemDf:$dockerDf,includeBuildCache:$includeBuildCache,builderPrune:$builder}'
