# Web DOX

## Purpose
React browser application for SIAB2 operational attendance workflows.

## Ownership
- Bootstrap: `src/main.tsx`; root app: `src/App.tsx`; application composition begins at `src/app/SchoolHubApp`.
- Browser UI, routing, styles, assets, and Playwright suites belong here.
- Public roles, capabilities, and API error codes consume `@schoolhub/shared`.

## Local Contracts
- App runs under `BrowserRouter`; retain client route behavior when adding navigation.
- Optional WorkOS provider activates only when `VITE_SSO_ENABLED === 'true'` and `VITE_WORKOS_CLIENT_ID` exists.
- API behavior must match API `/api/v1` contracts and shared authorization constants.
- `/admin/account-security` is only for `ADMIN_TU` and `DEVELOPER`; it may inspect or clear login-limiter state with an audit reason, never passwords.
- Android reader UI presents only four server-pinned production targets. It requests one-time activation codes from `POST /api/v1/device-readers/:id/android/provision-code`; do not expose reader secrets, signing material, or legacy/free-form reader provisioning through this flow.
- Student import UI uses `/academic/students/import/file/preview` and `/academic/students/import/file/commit`, sends the selected academic-year code, and must not fall back to identity/staff import. Download returned credentials once, then discard `credentialRows`/`slips` before React state; do not offer repeat plaintext download.
- CSV exports that may contain user-controlled values must neutralize spreadsheet formula prefixes `=`, `+`, `-`, `@`, tab, and carriage return before CSV quoting.
- Never place secrets in browser code, build-time variables, screenshots, fixtures, or test artifacts.
- Preserve TypeScript strictness and existing Vite/Tailwind patterns.

## Work Guidance
- Locate feature code under `src/app/` before creating parallel application structure.
- Reuse `@schoolhub/shared` public values; do not duplicate role/capability/error-code literals.
- Keep accessibility and browser tests aligned with changed interaction, route, or visual behavior. Activation-code UI must be short-lived, operator-only, and absent from fixtures, screenshots, logs, and persisted browser state.
- Do not commit `qa-screenshots/`, Playwright reports, or generated output.

## Verification
Run from repository root:

- `npm run test --prefix apps/web`
- `npm run typecheck --prefix apps/web`
- `npm run lint --prefix apps/web`
- `npm run build --prefix apps/web`
- E2E scope: `npm run test:e2e --prefix apps/web`; use root `npm run test:a11y` or `npm run test:visual` only when scope requires them.

## Child DOX Index
No child DOX. Source application and test folders follow this contract.
