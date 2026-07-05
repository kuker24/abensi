# PR127 Attendance Live UAT Pack

Status: draft for operator UAT before real daily attendance rollout.
Scope: read-only readiness checks, field checklist, and evidence expectations for gate, prayer, class attendance, override, reconciliation, and reporting.

## Safety Gate

Do not run any of these without explicit owner approval:

- Production deploy/restart/rebuild.
- Migration.
- Import ulang.
- QR generate/regenerate or QR payload format change.
- Password reset or forced password-change mass update.
- APK Update Center or Android Reader changes.
- Live gate/class scan mutation using real students.

The automated script in this PR is read-only. It only:

- Uses GET requests for public/protected API readiness.
- Optionally uses an existing operator cookie for GET-only checks.
- Optionally runs SELECT-only aggregate SQL through production Docker Compose.
- Prints only sanitized statuses and aggregate counts.

It does not call `reader-scan`, `qr-reader-scan`, `gate/tap`, override review/create, policy update, import, QR generation, or password endpoints.

## Automated Readiness Script

From a machine with Node.js 18+ and network access to production:

```bash
npm run uat:attendance-live
```

On the VPS/app directory, if Node.js is available and Docker Compose can reach production containers, include read-only aggregate DB checks:

```bash
ALLOW_DOCKER_READONLY=true npm run uat:attendance-live
```

On the VPS/app directory without Node.js, run the shell-only DB aggregate checker instead:

```bash
bash scripts/attendance_live_uat_db_readonly.sh
```

For protected read-only API checks, provide a cookie from an already logged-in trusted operator session. Do not paste it in chat or commit it anywhere:

```bash
AUTH_COOKIE_HEADER='schoolhub_access_token=REDACTED' npm run uat:attendance-live
```

Optional sanitized JSON evidence from the Node.js checker:

```bash
ALLOW_DOCKER_READONLY=true \
OUTPUT_JSON=artifacts/uat/attendance-live-readiness-$(date -u +%Y%m%dT%H%M%SZ).json \
npm run uat:attendance-live
```

Expected current production readiness highlights after PR126:

- Active student/teacher without active QR: `0`.
- Classes without active enrollment: `0`.
- Active students without active enrollment: `0`.
- Active students without NIS: `0`.
- Active teachers without NIP: `0`.
- Attendance policy exists.
- Geofence policy exists.
- Outbox failed: `0`.

Current known blockers before real live attendance rollout:

- Active reader inventory must be greater than `0`. The PR127 read-only check is expected to fail this if all reader devices are still revoked/not provisioned.
- Active readers must have encrypted signing secrets and hashed API keys before any gate/prayer scan UAT.

Known non-blocking warning to track separately:

- Legacy audit entries without hash may be non-zero until the audit-chain boundary/backfill PR is completed.

## Manual Field UAT Matrix

Run these only after explicit owner approval for a controlled live UAT window. Use test/disposable cards first when possible.

| Area | Scenario | Expected Result | Evidence |
|---|---|---|---|
| Gate IN | Valid active student card scans IN once | Accepted, one gate log, no duplicate warning | Count-only gate log evidence |
| Gate IN duplicate | Same card scans IN again inside duplicate window | Idempotent/duplicate response, no second attendance effect | Sanitized duplicate result |
| Gate OUT without IN | Student scans OUT without prior IN | Rejected or flagged according to policy | Rejection/flag count only |
| Prayer scan | Valid student scans Dhuha/Dzuhur/Ashar in allowed window | Prayer log created once | Count-only prayer log evidence |
| Prayer duplicate | Same prayer scan repeated | Idempotent duplicate, no duplicate record | Count-only evidence |
| QR revoked/inactive | Revoked QR/card attempts scan | Rejected, no attendance mutation | Rejected count only |
| Reader replay | Reuse a prior nonce/signature | Rejected replay/nonce | Rejected count only |
| Class attendance | Guru opens class and marks roster student | Only roster students accepted | Session + aggregate count only |
| Out-of-roster | Attempt non-roster student in class | Rejected/blocked | Rejection count only |
| Class eligibility | Required gate/prayer missing | Student locked or warning per policy | Sanitized eligibility result |
| Override create | Piket/admin creates override with valid reason | Pending/approved state according to SOP | Override count/status only |
| Override approve | Different authorized reviewer approves | Approved, actor/reason audited | Audit action count only |
| Override revoke | Authorized reviewer revokes | Revoked, no stale eligibility bypass | Override count/status only |
| Reconciliation | Run/observe reconciliation after UAT data | Flags missing/override/anomaly cases | Flag counts by type/status |
| Reporting | Export/preview report after UAT | Shows override/correction/missing-evidence labels | Export metadata/checksum only |

Never paste student names, NIS/NIP, full QR payloads, cookies, tokens, PINs, passwords, raw API bodies, or full report contents into evidence.

## Operator Evidence Template

```text
UAT window:
Owner approval phrase:
Operator:
Environment commit:
Readiness artifact:

Pre-UAT counts:
- users:
- active QR:
- gate logs:
- prayer logs:
- student attendance:
- overrides:
- outbox failed:

Scenarios run:
- Gate IN valid:
- Duplicate IN:
- OUT without IN:
- Prayer valid:
- Replay/nonce rejection:
- Class roster attendance:
- Out-of-roster rejection:
- Override approve/revoke:
- Reconciliation/report labels:

Post-UAT counts:
- gate logs delta:
- prayer logs delta:
- student attendance delta:
- overrides delta:
- rejected scans delta:
- reconciliation flags delta:
- outbox failed:

Sanitized final verdict:
```

## Open Follow-up PRs

- Audit-chain legacy boundary/backfill for existing un-hashed entries.
- First-login password-change policy for imported/slip accounts, if owner approves that product policy.
- Reporting labels/checksum hardening if live UAT finds missing override/anomaly evidence in official reports.

## PR127 Read-only Production Probe Result

A read-only shell DB probe against current production after PR126 returned:

- PASS for imported data readiness: target QR coverage, class enrollment, student NIS, teacher NIP, policy, geofence, APK inventory, Android reader version inventory, and outbox failed count.
- FAIL for live reader readiness: active readers `0`, active readers with encrypted signing secret `0`, active readers with hashed API key `0`.
- Observed reader inventory: total readers `16`, revoked readers `16`.
- WARN for legacy audit-chain boundary: un-hashed audit entries `9`.
- Observed attendance usage baseline: student attendance `0`, gate logs `0`, prayer logs `0`, overrides `0`, open reconciliation flags `0`.

Conclusion: card/QR/data readiness is good, but real live attendance UAT must stay blocked until at least one reader is explicitly provisioned/activated with signing secret and hashed API key under owner approval.
