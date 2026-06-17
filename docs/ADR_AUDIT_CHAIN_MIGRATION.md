# ADR: Audit chain migration

Status: Accepted

Audit sequence values must follow the existing hash-chain topology (`prevHash -> entryHash`), not chronological order. Migration `0027_audit_chain_safe_resequence` validates a single genesis, unique hashes, no branch, no orphan, no cycle/disconnect, supported hash version, and payload/hash presence before resequencing. Broken chains abort migration and require forensic review.

Verification command: `npm run audit:verify-chain`.
