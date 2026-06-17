# Final Production Gaps Baseline

Date recorded: 2026-06-14T00:21:56+07:00
Branch: `fix/full-production-readiness`
Starting HEAD: `0e7e157518e6048fc6ef39aa5a384bb8889e47d1`
Base branch commit: `6a11e0c2c17709a619e879381687943621ec7215`
Latest successful CI cited by task: run `27466888023` (`validate`, `docker`, and `codeql` green)

## Toolchain

- Node: `v26.2.0`
- npm: `11.16.0`
- Java: OpenJDK `17.0.19+10`
- Gradle wrapper: `8.7` (Kotlin `1.9.22`, Groovy `3.0.17`)
- Android SDK: `ANDROID_HOME` and `ANDROID_SDK_ROOT` are not set in this local shell; Android SDK version could not be confirmed locally.

## Migration State

- Prisma migrations present locally: `0001_init` through `0020_user_must_change_password`.
- Local command `npx prisma migrate status --schema prisma/schema.prisma` could not reach the configured PostgreSQL host `postgres:5432` in this shell (`P1001`). No migration was applied during baseline recording.

## Baseline Suite Run Before Edits

Command executed before source changes:

```bash
npm run typecheck:all && npm run lint:all && npm run lint --prefix apps/worker && npm run test:api && npm run test:web && npm run build:all
```

Result: PASS.

Counts observed:

- API Jest: 14 suites passed, 82 tests passed.
- Web Vitest: 2 files passed, 7 tests passed.
- Build: API TypeScript build passed; web Vite production build passed.
- E2E: not run in this baseline command; existing repository scripts only expose `npm run test:e2e`/`apps/web` Playwright at this commit.

## Remaining Functional/Security/Operational Gaps To Close

The following gaps are the remaining mission scope and must be treated as unresolved until implemented and proven by tests/CI:

1. Role/capability contract contradiction on reporting routes, especially `SISWA` on `/reports/my-attendance` and `OPERATOR_IT` on broad report routes.
2. Hardcoded/fake teacher geolocation (`lat: 0.923`, `lng: 100.31`) and incomplete browser geolocation failure handling.
3. Untrusted `X-Forwarded-For` handling in Nginx/API rate limiting and audit identity.
4. Gate idempotency not enforced by database business-date uniqueness.
5. Prayer outside-window scans not rejected with stable metadata/audit semantics.
6. Business logic still depends on process/browser timezone primitives instead of one Asia/Jakarta time module.
7. Session generation idempotency/conflict protections are not fully database-enforced.
8. Session roster is not snapshotted for historical immutability.
9. Default `ALPA` rows count as reviewed/progress-complete without explicit confirmation.
10. Sensitive mutations and audit entries are not universally atomic in one audited transaction.
11. Password-change frontend UX must immediately clear local auth state and redirect to login.
12. Real full-stack Playwright E2E with PostgreSQL/Redis/CSRF/cookies is incomplete.
13. Production HTTPS/TLS entrypoint and verification are incomplete.
14. Worker and live monitor need multi-replica-safe Redis/BullMQ/pubsub architecture.
15. Android reader CI/security/release checks are incomplete.
16. Frontend route registry, typed API client, accessibility, and visual regression coverage are incomplete.
17. CI/supply-chain/repository hygiene gaps remain, including pinned actions, scans, coverage, SBOM, backup-tree cleanup, and the `exceljs -> uuid` moderate dependency path.
