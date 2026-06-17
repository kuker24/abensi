# ADR: Worker queue

Status: Proposed — not implemented in this slice

Process-local `setInterval` is not safe for multiple replicas. The selected direction is BullMQ/Redis repeatable jobs with deterministic job IDs, idempotent handlers, retry/backoff, dead-letter queues, metrics, and graceful shutdown. This remains a production blocker until implemented and tested with multiple worker replicas.
