# Shared Package DOX

## Purpose
Public SchoolHub authorization constants and API error codes shared by API and web.

## Ownership
- Runtime ESM entry: `index.mjs`.
- Runtime CommonJS entry: `index.cjs`.
- TypeScript public declarations: `index.d.ts`.
- Package export map: `package.json`.

## Local Contracts
- Public API exports `ROLES`, `CAPABILITIES`, `ROLE_CAPABILITIES`, `API_ERROR_CODES`, and `hasCapability`.
- ESM, CommonJS, and declaration surfaces must remain behaviorally and type-equivalent.
- Roles/capabilities must stay aligned with API authorization and Prisma role enum before changing public values.
- Package declares `sideEffects: false`; preserve import-safe, side-effect-free module initialization.

## Work Guidance
- Treat exported values and type unions as cross-service contract changes.
- Update `index.mjs`, `index.cjs`, and `index.d.ts` together. Do not edit consumer copies instead.
- Avoid adding dependencies or build tooling without repository-level decision.

## Verification
- Run API and web checks for consumers: `npm run typecheck:all`, `npm run test:api`, and `npm run test:web` as scope requires.
- Inspect both ESM and CommonJS imports when altering exports.

## Child DOX Index
No child DOX.
