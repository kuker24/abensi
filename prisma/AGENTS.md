# Prisma DOX

## Purpose
PostgreSQL persistence contract for SIAB2: Prisma schema, migration history, fixtures, and development seed.

## Ownership
- Authoritative Prisma schema: `schema.prisma`.
- Ordered database migrations: `migrations/`.
- Seed process: `seed.ts`.
- Test/support records: `fixtures/`.

## Local Contracts
- Datasource is PostgreSQL; database URLs come from environment variables. Do not read, print, or embed their values.
- `Role` enum must remain compatible with API and `@schoolhub/shared` authorization contract.
- `User.nkd` is nullable for non-students but, once issued to a SISWA, must remain four-digit, unique, and immutable. `StudentNkdRegistry` permanently reserves issued NKD values so deletion cannot make them reusable; preserve schema, migration, API, and import enforcement together.
- Student enrollment created by academic import is finite and tied to exact `AcademicYear`/`Semester` bounds; do not reintroduce open-ended enrollment reuse.
- Schema changes affect API-generated client types, migration history, seed behavior, and possibly Android/API integration semantics.
- Migrations are immutable deployment history. Never edit an applied migration; create reviewed migration steps for new changes.
- Seed requires environment inputs and may create sensitive-like test data. Do not run it against unknown or production data sources.

## Work Guidance
- Model schema constraints, indexes, relation behavior, and enum changes deliberately. Inspect runtime queries before changing fields or relations.
- Add or update migration with schema changes. Run Prisma generation before API typechecks.
- Keep `seed.ts` compatible with schema and avoid hard-coded credentials. Preserve existing environment validation.
- Apply migrations only with approved target environment and backup/rollback plan.

## Verification
Run from repository root:

- `npm run prisma:generate`
- `npm run typecheck --prefix apps/api`
- `npm run test:api`
- Migration/infrastructure scope, authorized environment only: `npm run prisma:migrate`, `npm run test:upgrade-migrations`, or `npm run verify:post-migration`.

## Child DOX Index
No child DOX. Migrations, fixtures, and seed follow this contract.
