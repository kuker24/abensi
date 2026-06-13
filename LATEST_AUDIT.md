# Latest Branch Audit — SchoolHub e-Hadir

Date: 2026-06-13
Requested repository: `https://github.com/kuker24/abensi`

## Branch discovery

| Item | Value |
|---|---|
| Target remote configured | `origin=https://github.com/kuker24/abensi.git` |
| Remote fetch result | `origin/main` fetched successfully. Existing stale `schoolhub-new` fetch failed with repository-not-found. |
| Latest remote branch on target repo | `origin/main` |
| Latest remote commit | `be1d257` |
| Latest remote commit date | `2026-04-24T04:25:11+00:00` |
| Local latest hardening branch | `fix/complete-production-hardening` from prior `fix/production-hardening` |
| Local latest commit audited | `004621b4ab66b6c31ac8f10b3685a73d99164a2d` |
| Local latest commit date | `2026-06-13T12:54:32+07:00` |
| Merge-base with `origin/main` | none; histories differ/unrelated in this working copy |
| Comparison used | local `main..fix/complete-production-hardening` for previous pushed hardening review; `origin/main` noted as target repo baseline mismatch |
| CI status | No GitHub Actions runs listed for `kuker24/abensi` via `gh run list`; no `.github/workflows` in this branch before this phase. |
| Commits not yet merged to local main | `8304193`, `1fbaf60`, `3e69cfb`, `0fc35a1`, `951b0c8`, `938c9ed`, `4e5adaa`, `004621b` |

## Changed files versus local main

See `git diff --name-only main...HEAD`. Major areas changed: audit docs, API auth/env/device/reporting code, canonical Prisma schema and migration `0015`, web auth tests/API client, worker dependency update.

## Previous finding verification

| ID | Severity | Area | Finding | Current Status | Evidence | Required Fix |
|----|----------|------|---------|----------------|----------|--------------|
| 1 | Critical | Student attendance | Student self-check-in was removed. | PARTIALLY_FIXED | `rg` finds no production `/siswa/check-in`, `StudentCheckInPage`, or `Mulai Absen Masuk`; `apps/web/src/App.test.tsx` adds a regression test. | Keep regression tests; ensure route cannot be reintroduced through route config/capabilities. |
| 2 | Critical | Student attendance | Fake local attendance receipts were removed. | FIXED | No production `simulated receipt`/receipt generation found by source search. | None currently. |
| 3 | Critical | Production data | Production fallback and mock session data were removed. | PARTIALLY_FIXED | No student self-attendance fallback found; broader app still has helper fallbacks/defaults and E2E mocks isolated to tests. | Continue removing production silent fallbacks and add error+retry states per page. |
| 4 | Critical | Authentication UX | Default login credentials were removed. | PARTIALLY_FIXED | Login presets are empty in `SchoolHubApp.tsx`; no prefilled password in test. Env examples still contain placeholder text by design and seed scripts can set passwords from env. | Remove predictable password examples and ensure production seeds never reset existing passwords. |
| 5 | Critical | Secrets | Weak default secrets were removed. | PARTIALLY_FIXED | `env.validation.ts` rejects weak production `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `WORKER_TOKEN`, and `READER_SECRET_ENCRYPTION_KEY`; env examples no longer include `Admin#12345`/predictable passwords. Development fallback remains for non-production only. | Add secret scanning CI and rotate any previously exposed real tokens outside code. |
| 6 | Critical | Frontend auth | JWT was removed from localStorage. | FIXED | `rg` finds no `schoolhub_access_token`, `Bearer`, or token localStorage usage in `apps/web/src`/`apps/web/e2e`. `apiFetch` uses `credentials: include`. | Keep E2E real-cookie auth in future tests. |
| 7 | Critical | Auth sessions | Server-side sessions and refresh-token rotation were implemented. | PARTIALLY_FIXED | `AuthSession` exists with `refreshTokenHash`, `issuedAt`, `expiresAt`, `revokedAt`, `lastUsedAt`, `createdIp`, `lastIp`, `userAgent`; login/refresh set HttpOnly cookies; CSRF double-submit was added; JWT now uses issuer/audience/jti/HS256. Password-change/first-login and full refresh-token reuse detection are still incomplete. | Add password-change/first-login flow and explicit refresh-token reuse family revocation tests. |
| 8 | Critical | Authorization | Role capabilities were centralized. | PARTIALLY_FIXED | Backend `common/capabilities.ts`, `CapabilitiesGuard`, and table-driven tests were added; critical attendance/device controllers now use capabilities. Some controllers still rely only on `@Roles`. | Roll out `@Capabilities` to every protected controller method and add escalation integration tests. |
| 9 | Critical | Frontend authorization | Frontend menus match backend permissions. | PARTIALLY_FIXED | Frontend capability matrix and route/nav filtering were added. It mirrors backend but is not yet generated from a single shared package. | Move matrix to a shared package/import used by both API and web. |
| 10 | Critical | Attendance integrity | Attendance enrollment validation was implemented. | PARTIALLY_FIXED | `attendance-class.service.ts` checks roster and logs `attendance.class.rejected_out_of_roster`; tests cover out-of-roster. Active academic period scoping and all edge cases are incomplete. | Add active-period enrollment constraints/tests. |
| 11 | Critical | Attendance state | Session state transitions were protected. | PARTIALLY_FIXED | Existing service has status checks; audit still lacks proven conditional concurrency/idempotency tests for all transitions. | Implement strict conditional state-machine updates and concurrency tests. |
| 12 | Critical | Device credentials | Device credentials were hashed. | PARTIALLY_FIXED | `0015_device_reader_hashed_keys` adds `apiKeyHash` and nulls plaintext `apiKey`; service redacts hash. Reader HMAC secret remains encrypted. | Remove plaintext `apiKey` column in a later safe migration after deploy compatibility window. |
| 13 | Critical | Device gate flow | A real reader-authenticated gate endpoint was implemented. | PARTIALLY_FIXED | Added `POST /api/v1/device/gate/events`, `GateLog.deviceEventId`, `RejectedDeviceScan`, HMAC validation using existing device signature service, nonce protection, duplicate `eventId` handling, and rejection persistence. Dedicated endpoint integration tests and metrics are still incomplete. | Add integration tests for duplicate/inactive/lost/replay/concurrency and metrics. |
| 14 | Critical | Live monitor | Live-monitor tokens were removed from URLs. | PARTIALLY_FIXED | `reporting.controller.ts` no longer accepts `token` query; cookie auth is used. Still per-connection DB polling, no Redis pub/sub, no connection limits/metrics. | Add Redis event fan-out, heartbeat, Last-Event-ID, connection limits, metrics. |
| 15 | High | Tests | Backend tests were added. | PARTIALLY_FIXED | Added capability matrix unit tests; API tests pass locally. CSRF/device event integration tests and real PostgreSQL tests are still pending. | Add real integration tests for auth cookies/CSRF/device events/concurrency. |
| 16 | High | CI/CD | GitHub Actions CI was added. | PARTIALLY_FIXED | Added `.github/workflows/ci.yml` with install, Prisma, typecheck, lint, unit tests, build, audit, and Docker config/build jobs. It has not run on GitHub yet. | Add Playwright browser job, CodeQL, secret scanning, container scanning, and required branch protection. |
| 17 | High | Infra | Docker and Nginx were hardened. | PARTIALLY_FIXED | API Dockerfile uses `USER node`; no compose `read_only`, `cap_drop`, resource limits; Docker CLI unavailable locally. | Add hardening options and validate on Docker-capable runner. |
