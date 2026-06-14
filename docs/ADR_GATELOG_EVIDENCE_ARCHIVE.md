# ADR: GateLog duplicate evidence archive

Status: Accepted

Accepted GateLog rows are forensic evidence. Duplicate cleanup must archive the complete original row before deleting a duplicate. `GateLogArchive` stores original/corrected business dates, reader/device/signature/nonce/body-hash fields, and a full JSON snapshot. Canonical selection is deterministic: `tappedAt`, then `serverReceivedAt`, then `id` ascending.

Corrective migrations: `0025_gate_log_archive`, `0026_correct_jakarta_business_dates`.
