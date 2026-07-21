# Account Identity-Card Generator DOX

## Purpose
Separate React/Vite account-card generator source. Root DOX confirms `DataSekolah/generator-tanda-pengenal/`, not this directory, as source for deployed `apps/web/public/id-card-generator/` bundle; do not assume this source is independently served or production-bundle source without deployment evidence.

## Ownership
- Browser bootstrap: `src/main.jsx`; hash-route shell: `src/App.jsx`.
- Pages: `src/pages/`; card components and barrel: `src/components/cards/`; layout components and barrel: `src/components/layout/`.
- Shared browser state: `src/store/useStore.js`; card template, identity, CSV, SIAB2-card, SVG, import, and export helpers: `src/utils/`.

## Local Contracts
- `package.json` runs React 19, React Router DOM 7, Zustand, Vite 7, Tailwind, `papaparse`, `html2canvas`, `jspdf`, and `qrcode.react`.
- `vite.config.js` sets `base: './'`; preserve relative asset paths unless deployment evidence defines another target.
- Hash routes are `/`, `/import`, `/users`, `/generate`, and `/export`; add pages through `src/pages/index.js` and `src/App.jsx` together.
- `useStore` uses Zustand `persist` with storage key `id-card-generator-storage`, migration/sanitization, and restricted `partialize` output. Users, activity log, and card settings are sanitized before persistence; selection and UI loading/error state remain transient.
- Card utilities have Node test coverage: `src/utils/identityCard.test.js`, `src/utils/csvParser.test.js`, `src/utils/siab2Cards.test.js`, and `src/utils/svgGenerator.test.js`.
- Official SIAB2 card mapping uses actual `nis` for students and actual `nip` for teachers/employees. Never fall back to username, short code, NISN, or a cross-role identity; render an empty labeled value when the role-specific number is missing.
- Official card role labels are `SISWA`, `GURU`, and `PEGAWAI`. Card header has no `KARTU TANDA PENGENAL RESMI` title or `RESMI` badge; footer reads `KARTU TANDA PENGENAL SIAB2` and `MAN 1 ROKAN HULU`.
- PNG/SVG export filenames are opaque sequence names such as `kartu-siab2-001.png`; never include names, NIS, NIP, QR values, or other personal identifiers in filenames.
- Display-name normalization decodes nested HTML entities and removes accidental leading apostrophe-like characters while preserving punctuation inside names. Keep React preview and generated SVG/PNG behavior aligned.
- Imported account data and generated cards may contain personal information and QR credentials. Avoid logging raw rows, committing export output, or placing output outside an ignored private directory; preserve `clearLocalData` and sanitization behavior when changing storage.

## Work Guidance
- Keep functional components focused. Use PascalCase for page/component files, camelCase for utility modules/functions, and existing SCREAMING_SNAKE_CASE style for constants.
- Keep external imports before local modules. In `src/main.jsx`, retain global `index.css` before `App`; match nearby file ordering for other imports.
- Use `useStore` for shared data. Validate and sanitize imports before state updates, exports, or persistence; use local component state for component-only behavior.
- Use Tailwind utilities and existing `primary` palette tokens.
- ESLint applies recommended JavaScript, React Hooks, and React Refresh Vite rules; unused variables are errors except names matching `^[A-Z_]`. Run lint before handoff.
- Add page: create `src/pages/PageName.jsx`, export it from `src/pages/index.js`, then add hash route in `src/App.jsx`.
- Add component: place it in `src/components/cards/` or `src/components/layout/`, export it through corresponding `index.js`, then consume named export.
- Do not assert or create production deployment, route, API, or proxy coupling for this source without verified integration decision.
- Local sensitive card output belongs in ignored `Data Akun/simpanakun/`, with directory mode `700` and file mode `600`; do not archive, commit, push, or publish it without explicit approval.

## Verification
From this directory:

- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run dev` or `npm run preview` for manual browser verification.

## Child DOX Index
No child DOX.
