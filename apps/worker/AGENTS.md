# Worker DOX

## Purpose
BullMQ/Redis worker for scheduled attendance reconciliation and auto-missed session processing.

## Ownership
- Bootstrap and queue lifecycle: `src/index.js`.
- Repeatable-job repair and scheduling helpers: `src/repeatable-scheduler.js`.
- Node test suites: `test/*.test.js`.

## Local Contracts
- Worker posts to API internal reconciliation and session endpoints under `API_BASE_URL`, defaulting to `http://api:3000/api/v1`.
- Worker signing sends `x-worker-token`, timestamp, nonce, HMAC signature, and `x-worker-job`; API and worker canonical signing must change together.
- Production requires configured `WORKER_TOKEN` of at least 32 characters and `REDIS_URL`; do not weaken startup validation or log token values.
- BullMQ repeatable jobs `auto-missed` and `reconciliation` use bounded repair/retry behavior and dead-letter queue handling.
- Health state writes to configured `WORKER_HEALTH_FILE`; treat its output as generated local runtime data.

## Work Guidance
- Preserve graceful shutdown for worker, queues, and queue events.
- Test scheduler semantics when changing repeat intervals, repair, retries, or job identity.
- Keep worker/API endpoint paths and signing payload construction synchronized.
- Do not replace Redis/BullMQ scheduling with process-local intervals for production behavior.

## Verification
Run from repository root:

- `npm run test --prefix apps/worker`
- `npm run lint --prefix apps/worker`
- Use `npm run test:integration` or `npm run test:outbox-sse` only for changed cross-service behavior and approved infrastructure.

## Child DOX Index
No child DOX. `src/` and `test/` follow this contract.
