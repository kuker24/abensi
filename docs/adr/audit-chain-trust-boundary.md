# ADR: Explicit Audit Chain Trust Boundary

- Status: Proposed
- Date: 2026-07-12
- Owner: SchoolHub maintainers

## Context

Production investigation identified a cryptographically valid trusted lineage through sequence 520, followed by a historical segment where lineage cannot be trusted end-to-end. The investigation did not establish human tampering or direct database mutation. Historical rehashing, resequencing, or edits would destroy forensic evidence and create a false claim of uninterrupted integrity.

Historical entries 521–964 are preserved unchanged. Their lineage is explicitly classified as untrusted. No historical integrity metadata is rewritten.

## Decision

Adopt Option B: preserve history and declare an explicit trust boundary.

The data model adds:

- `AuditChainEpoch`: ordered trusted generations with an active epoch;
- `AuditIntegrityIncident`: append-only approved incident declaration, sanitized incident code, fixed sanitized reason code `HISTORICAL_CHAIN_INTEGRITY_LOSS`, approved range, boundary commitment, and approval reference;
- PostgreSQL insert guards reject overlapping incident and epoch ranges without installing database extensions; incident rows reject update and delete operations. Epoch rows reject delete and every update except one controlled `ACTIVE_TRUSTED` to `TRUSTED` close transition that sets `endSequence` and `closedAt` once. Epoch identity, sequence range start, lineage, and creation timestamp remain immutable.
- `AuditChainState.activeEpochId`: current writer epoch.

Global `AuditEntry.sequence` remains monotonic. Existing audit rows receive no new fields and no mutations. A structural migration creates only metadata tables, constraints, indexes, and an append-only incident trigger. It does not bootstrap production metadata or create a boundary.

## Trust semantics

- Epoch 1 is trusted only through the approved last trusted sequence.
- Historical incident range is retained and reported as `HISTORICAL_UNTRUSTED`; its mismatches remain visible.
- Epoch 2 begins with an explicit `AUDIT_TRUST_BOUNDARY` audit entry. Its `prevHash` is a commitment derived internally from the persisted historical tip and canonical boundary descriptor.
- Later epoch-2 entries hash-chain normally from the boundary entry.
- New mismatch, unexpected genesis, duplicate/gap, missing incident, overlapping epoch, or chain-state disagreement fails verification.
- Admin list classifications are metadata declarations only: `DECLARED_TRUSTED_EPOCH`, `DECLARED_HISTORICAL_UNTRUSTED`, `BOUNDARY_MARKER`, `LEGACY_METADATA_PENDING`, or `INVALID_UNEXPECTED`. They do not assert per-row cryptographic validation. Full verifier status remains separate.

Successful verification is either `PASS` or `PASS_WITH_APPROVED_HISTORICAL_BOUNDARY`. The latter is not a claim that historical lineage is cryptographically trustworthy.

## Writer and approval workflow

Normal audit writes use existing advisory transaction locking and active epoch metadata. Fresh empty chains may lazily create epoch 1. Existing chains with no epoch metadata first require strict verification; broken chains fail closed. Normal writes never create an extra genesis or an empty active epoch.

Before every append, writer loads bounded active-epoch range from its start marker through `AuditChainState` tip and recomputes canonical payload hashes, hash version, exact sequence continuity, and predecessor links. It validates boundary marker through shared validator and requires persisted tip to equal chain state. Payload, hash, link, material, or version drift fails closed. This is deliberately O(active epoch entries) per write for immediate forensic correctness. Future checkpoint optimization needs separate design, must be cryptographically equivalent, and cannot weaken full lineage verification.

`npm run audit:approve-trust-boundary` is separate from normal runtime behavior:

1. defaults to `--dry-run=true`;
2. requires incident code, expected latest sequence, expected last trusted sequence, a strict sanitized ticket/change reference, and explicit confirmation for writes;
3. takes advisory lock in serializable transaction;
4. rechecks persisted tip and trusted segment;
5. scans complete persisted sequence for a concrete anomaly, requires declared historical start to equal earliest anomaly, and refuses to declare a healthy suffix untrusted;
6. creates epoch 1 metadata, append-only incident, epoch 2, explicit boundary entry, and state update atomically;
7. never changes historical `AuditEntry` rows.

No production approval command runs without owner approval, maintenance planning, fresh verified backup, and independent review.

## Readiness and visibility

Verifier, production readiness, and post-migration checks expose sanitized status, trusted-through sequence, historical range, active epoch, and issue codes only. Raw payloads and hashes are not emitted. Admin audit list omits hash material; an integrity-summary endpoint exposes only allowlisted state.

## Rollback and forensics

Before approval, deployment rollback removes application support but does not touch historical rows. After approval, rollback must preserve boundary metadata and audit entry; deleting it would damage forensic continuity. Recovery uses reviewed forward remediation, not history rewrite.

The boundary does not prove why historical lineage broke. It records approved interpretation and trust scope using `HISTORICAL_CHAIN_INTEGRITY_LOSS`, not an attribution of human tampering or direct database mutation. Monitoring must alert on any post-boundary verification failure, active-epoch inconsistency, unexpected genesis, sequence continuity failure, or range-overlap rejection.

## Limitation

PostgreSQL trigger guards prevent future overlapping metadata inserts but cannot create a database exclusion constraint without adding `btree_gist`. The verifier independently rejects every metadata overlap and all deployments remain gated on that verification. The epoch range trigger also validates the one permitted close transition, excluding same-row comparison so that closing epoch 1 before creating epoch 2 remains valid.

`npm run test:audit-trust-boundary:local` is opt-in integration coverage. It requires an explicitly supplied `AUDIT_BOUNDARY_TEST_DATABASE_URL` targeting a disposable test-named PostgreSQL database plus `AUDIT_BOUNDARY_TEST_CONFIRM=RUN_LOCAL_DESTRUCTIVE_TEST`. It never reads `.env`. URL query routing overrides (`host`, `hostaddr`, `service`, `servicefile`) and unknown query parameters are rejected. Before any reset, DNS must resolve every hostname address to loopback and connected PostgreSQL `inet_server_addr()` must also be loopback. It first applies all migrations before `0041`, seeds synthetic audit rows, then applies `0041` to prove structural migration preserves those rows byte-for-byte. It separately tests the empty database path, metadata triggers, overlap rejection, and database-backed competing approvals. It is not production coverage.

## Consequences

Positive:

- Forensic history remains intact.
- Future audit entries regain explicit trusted lineage.
- Production readiness distinguishes approved historical loss from new integrity regressions.

Negative:

- Verification remains intentionally non-green for historical findings, represented by boundary status.
- Approval is operationally sensitive and needs owner review.
- Current implementation supports one historical incident boundary; additional incidents require separate architecture review.
