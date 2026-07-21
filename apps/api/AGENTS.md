# API DOX

## Purpose
NestJS HTTP API for SIAB2 attendance, identity, academic, device-reader, reporting, audit, notification, reconciliation, and health domains.

## Ownership
- Bootstrap: `src/main.ts`; root module: `src/app.module.ts`.
- Feature modules live under `src/modules/`; shared HTTP/security utilities live under `src/common/`.
- Prisma integration lives under `src/prisma/`; shared roles, capabilities, and API error codes come from `@schoolhub/shared`.

## Local Contracts
- All controller routes receive root prefix `/api/v1`; health endpoints are `/api/v1/health/live` and `/api/v1/health/ready`.
- Keep global Helmet, CSRF, CORS, request ID, and strict `ValidationPipe` behavior intact unless security design changes deliberately.
- DTOs must tolerate global `whitelist`, `transform`, and `forbidNonWhitelisted` behavior.
- Production Android scans call `POST /api/v1/attendance/qr-reader-scan`; validate activation and reader headers: device ID, timestamp, nonce, body hash, and HMAC signature.
- Android activation is capped at four server-pinned targets: `READER_DEV_TEST_01` is Dev Test Identitas with `CHECK_ONLY`; `READER_IDENTITY_01` permits test-only `GATE_IN`, `GATE_OUT`, and `MUSHOLA` validation without attendance writes; `READER_GATE_PRAYER_01` and `READER_GATE_PRAYER_02` record those modes normally. `POST /api/v1/device-readers/:id/android/provision-code` issues only a short-lived, one-time code for those targets; completion preserves target device ID and server-assigned modes. `recordQrAndroidGateScan` honors an explicit `GATE_IN`/`GATE_OUT` request instead of guessing direction from scan order; legacy `GERBANG` requests still fall back to first/second-scan auto-detect for older APK builds.
- `POST /api/v1/attendance/qr-scan` is legacy/manual authenticated scanning. Do not substitute it for device-reader flow.
- `GET /api/v1/auth/admin/login-lockout` and `POST /api/v1/auth/admin/login-lockout/clear` allow only `ADMIN_TU` or `DEVELOPER` to inspect or clear failed-login limiter state. Clear requires an audit reason and must never change password or bypass authentication.
- Authorization changes must align Prisma `Role` values and `@schoolhub/shared` capabilities/types. Preserve audit metadata where existing services require it.
- Student import endpoints under `/academic/students/import` require an exact active academic-year code and exactly one active semester with complete bounds. Ignore every source password field, generate temporary passwords server-side, set `mustChangePassword`, create finite semester enrollment, and reject period changes between preview and commit.
- Student NKD is separate from NIS/NISN and QR credentials: exactly four digits, SISWA-only, unique, immutable after issuance, and non-reusable through `StudentNkdRegistry`. Card export must send `nisn` and `nkd` separately and keep the opaque QR value unchanged.
- Do not log raw credentials, signed headers, QR payloads, tokens, or personal data.

## Work Guidance
- Add behavior inside owning feature module; avoid bypassing guards, DTO validation, service boundaries, or Prisma module.
- Keep controller paths and signed canonical request paths synchronized with Android reader and tests. Preserve one-time activation-code handling, target mapping, activation limits, and secret redaction together.
- Run `npm run prisma:generate` after Prisma schema changes or stale client types. Review migration impact before `npm run prisma:migrate`.
- Avoid editing generated `dist/` output.

## Verification
Run from repository root:

- `npm run test --prefix apps/api`
- `npm run typecheck --prefix apps/api`
- `npm run lint --prefix apps/api`
- QR/API integration scope: `npm run test:backend-contract`, `npm run test:integration`, or `npm run test:outbox-sse` when relevant and environment allows.

## Child DOX Index
No child DOX. Feature modules follow this contract.
