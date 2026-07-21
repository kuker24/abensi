# School Identity-Card Generator DOX

## Purpose
React/Vite source bundle for SIAB2 production identity-card generator. Build output is copied to `apps/web/public/id-card-generator/` and served by web runtime; it is not an independently deployed service.

## Ownership
- Browser bootstrap: `src/main.jsx`; hash-route shell: `src/App.jsx`.
- Pages: `src/pages/`; card components/config: `src/components/cards/`; layout components and barrel: `src/components/layout/`.
- Shared browser state: `src/store/useStore.js`; import, card, export, and CSRF helpers: `src/utils/`.
- Deployed static target: `../../../apps/web/public/id-card-generator/`; production protection: `../../../ops/nginx/reverse-proxy.conf`.

## Local Contracts
- `package.json` runs React 19, React Router DOM 7, Zustand, Vite 8, Tailwind, `papaparse`, `html2canvas`, `jspdf`, and `qrcode.react`.
- `vite.config.js` sets `base: './'`; preserve relative asset paths for deployed static bundle.
- Hash routes are `/`, `/import`, `/users`, `/generate`, and `/export`; add pages through `src/pages/index.js` and `src/App.jsx` together.
- `useStore` uses Zustand `persist`: only `users` and `activityLog` are persisted under `id-card-generator-storage`; selected users and UI loading/error state stay transient. Preserve this boundary when changing store actions.
- Node test runner covers `src/components/cards/cardConfig.test.js`, `src/utils/csrf.test.js`, and `src/utils/backendQr.test.js`; keep `package.json` test command aligned with this security and card-contract scope.
- Official API card import may first request `/api/v1/qr-credentials/bulk-generate` for missing QR values, then load `/api/v1/qr-credentials/export/cards` with authenticated browser cookies. Mutations must fail closed without a CSRF token and send `x-csrf-token`; treat both calls and exported card fields as API coupling.
- Card display resolves student class or staff role level from official export fields. Student cards render `NISN` and dedicated four-digit `NKD` as separate lines without username fallback; staff cards use NIP. Keep printed labels and opaque official QR payload handling synchronized with API export contract.
- Production source-to-runtime flow: run `npm run build`, then copy build output to `apps/web/public/id-card-generator/` before deploying web. No generator sync script is declared in root `package.json`.
- Nginx guards both `/id-card-generator/` and `/admin/master-data/id-card-generator/` with `auth_request /api/v1/internal/access/id-card-generator`; API allows `ADMIN_TU`, `DEVELOPER`, and `OPERATOR_IT` through `JwtAuthGuard`.
- Imported school data and exports may contain personal information. Avoid logging raw rows or committing generated card/export files. Private batch output belongs in ignored `Data Akun/simpanakun/<class>/` with opaque filenames, directory mode `700`, and PNG mode `600`.
- Batch card capture must isolate and screenshot the `.id-card` element, not the generator viewport. Before replacing existing output, verify exact class/card counts, 972×1542 dimensions, nonblank pixel composition, QR dark/light module structure, and exact QR-module match to active API export; swap only after staging passes.

## Work Guidance
- Keep functional components focused. Use PascalCase for page/component files, camelCase for utility modules/functions, and existing SCREAMING_SNAKE_CASE style for constants.
- Keep external imports before local modules. In `src/main.jsx`, retain global `index.css` before `App`; match nearby file ordering for other imports.
- Use `useStore` for shared users, selection, activity, and UI state. Validate import and card-configuration data before state updates or export; keep persisted fields limited to store `partialize` contract. Do not persist authenticated API responses, QR credential values beyond required card data, or any credential fields.
- Use Tailwind utilities and existing `primary`, `warm`, and `ink` tokens. Preserve `darkMode: 'class'` behavior.
- ESLint applies recommended JavaScript, React Hooks, and React Refresh Vite rules; unused variables are errors except names matching `^[A-Z_]`. Run lint before handoff.
- Add page: create `src/pages/PageName.jsx`, export it from `src/pages/index.js`, then add hash route in `src/App.jsx`.
- Add component: place card components in `src/components/cards/` or shell components in `src/components/layout/`; update `src/components/layout/index.js` when layout consumers need a named export.
- After source changes, rebuild and synchronize static bundle. Do not change bundle path, protected routes, or access coupling without coordinated web, Nginx, and API work.

## Verification
From this directory:

- `npm run lint`
- `npm run test`
- `npm run build`
- Copy build output to `../../../apps/web/public/id-card-generator/` before web deployment.
- `npm run dev` or `npm run preview` for manual browser verification; verify authorized and unauthorized protected-route access when access/proxy behavior changes.

## Child DOX Index
No child DOX.
