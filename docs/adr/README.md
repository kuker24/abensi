# Architecture Decision Records

Use this folder for new Architecture Decision Records (ADRs) that document significant project decisions.

Existing legacy ADRs also live as `docs/ADR_*.md`; keep them for history. Prefer this folder for new ADRs so future decisions are easier to index.

## When to create an ADR

Create an ADR for decisions that materially affect:
- system architecture or service boundaries,
- database schema or migration strategy,
- authentication, authorization, or security model,
- deployment/runtime/infrastructure,
- public API contracts,
- major refactors,
- local quality gates or engineering workflow.

Do not create ADRs for routine bug fixes or small implementation details.

## Records

- [0001: Local Quality Gates](0001-local-quality-gates.md)
- [0002: Stable Student Card QR and Digital Madrasah Card Workflow](0002-stable-student-card-qr.md)

## Template

Copy `0000-template.md` to a numbered file such as `0001-decision-title.md`.
