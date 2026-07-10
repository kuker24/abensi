# Private Artifact Guardrails

## Purpose

These guardrails reduce the chance that local school exports or generated private evidence are added to Git. They are intentionally limited to known private output structures and path categories; they do not inspect file contents.

## Files that must stay outside Git

Do not commit:

- staff or student PII spreadsheets;
- account exports or credential-bearing exports;
- named card images or card exports;
- private reports and scan evidence;
- private archives containing any of the above.

The repository must contain source, fixtures, documentation, and deliberately reviewed assets only. Private operational output belongs in an approved access-controlled storage location.

## Recommended local output locations

Keep private exports in a directory outside the repository, such as a separately protected local workspace or an approved encrypted storage location. Do not use a repository subdirectory as a private data vault. If a local workflow must write beneath the repository, use the narrowly scoped ignored private-output directory documented in `.gitignore` and run the guard before staging.

Never put credentials, passwords, tokens, raw QR payloads, cookies, sessions, private keys, or unredacted PII in the repository or in issue/PR text.

## Running the guard

Check the tracked tree:

```bash
npm run security:private-artifacts
```

Check staged paths before committing:

```bash
node scripts/private_artifact_guard.mjs --staged
```

The guard can also validate a null-delimited synthetic path list:

```bash
node scripts/private_artifact_guard.mjs --paths-file /secure/temp/path-list
```

The output is sanitized JSON containing only counts and policy IDs. A result with `ok: false` exits with status `1`. Invalid arguments, malformed paths, or unreadable input exit with status `2`.

## Running regression tests

```bash
npm run test:private-artifacts
```

The regression suite uses synthetic path names and verifies legitimate source/fixture assets, private categories, separator normalization, case normalization, traversal rejection, sanitized output, and exit codes.

## Handling false positives

Do not weaken a policy based on a single local convenience. First move the private output outside the repository. If a legitimate reviewed fixture or asset is incorrectly matched, document why it is safe, choose a structural path that separates it from private output, and update the guard and synthetic regression test together. Do not replace the policies with global extension blocks.

## Limits of `.gitignore` and the guard

`.gitignore` is not access control. It does not protect data already tracked, prevent intentional `git add -f`, secure a workstation, or remove data from existing Git history. The guard is a preventive CI and staging check based on path policy; it is not a content scanner or a substitute for repository permissions, secret scanning, encryption, or data-governance controls.

## History purge is separate

Removing private blobs from existing Git history is a separate, destructive security procedure. It requires explicit approval, a verified secure backup, impact analysis, credential review/rotation where applicable, coordinated remote-repository handling, and post-operation verification. This change does not rewrite history, delete backup refs, expire reflogs, run garbage collection, prune objects, or remove any existing private commit.
