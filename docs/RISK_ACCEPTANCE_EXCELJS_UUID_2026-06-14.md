# Time-limited risk acceptance: ExcelJS transitive UUID advisory

Status: Accepted until 2026-09-14
Owner: MAN 1 Rokan Hulu SchoolHub maintainer
Review date: 2026-08-14
Expiry: 2026-09-14

## Advisory

`npm audit --prefix apps/api` reports a moderate advisory on direct dependency `exceljs` via transitive `uuid`:

```json
{
  "name": "exceljs",
  "severity": "moderate",
  "isDirect": true,
  "via": ["uuid"],
  "range": ">=3.5.0",
  "fixAvailable": { "name": "exceljs", "version": "3.4.0", "isSemVerMajor": true }
}
```

The suggested fix is a semver-major downgrade to `exceljs@3.4.0`, which risks breaking report exports and does not represent a safe production hardening change.

## Exposure and controls

- Excel generation is server-side only.
- Export endpoints require authenticated roles and `reports.export` capability.
- Generated workbook IDs are not used as cryptographic secrets, access tokens, session IDs, password reset tokens, or authorization decisions.
- Exports are audited with actor, filters, and checksum.
- Nginx and API rate limits reduce abuse potential.

## Decision

Accept this moderate risk temporarily while monitoring upstream `exceljs` for a non-breaking release that removes the advisory. High/critical audits still fail CI.

## Required follow-up

- Re-check monthly or sooner if `exceljs` publishes a safe upgrade.
- Remove this acceptance and upgrade/replace `exceljs` before 2026-09-14.
- If exploitability changes to affect server-side report confidentiality/integrity, revoke this acceptance immediately.
