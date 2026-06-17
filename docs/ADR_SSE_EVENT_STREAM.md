# ADR: SSE event stream

Status: Proposed — not implemented in this slice

Per-client database polling should be replaced by a transactional outbox plus Redis Streams/pub-sub fan-out. SSE events must include event IDs, `Last-Event-ID` resume, heartbeat, authorization, capability checks, connection limits, and no sensitive payloads. This remains a production blocker until implemented and load tested.
