# PR100G Generator Static UI Fix Notes

## Scope

Focused cleanup for PR100F P2 findings on the Generator Kartu Tanda Pengenal static route only.

## Root cause

- The generator CSS imported Google Fonts from `fonts.googleapis.com`.
- Production CSP allows `style-src 'self' 'unsafe-inline'`, so the external stylesheet was blocked.
- Browser audit saw this as one console error plus one failed request on the generator static routes.
- Mobile screenshots also needed a clearer standalone return affordance because the generator is served as a protected static app outside the main SIAB2 shell.

## Fix

- Removed the external Google Fonts import from `DataSekolah/generator-tanda-pengenal/src/index.css`.
- Switched generator font stacks to local/system fonts in `src/index.css` and `tailwind.config.js`.
- Added a fixed `Kembali ke SIAB2` link in the generator layout pointing to `/admin/master-data`.
- Rebuilt and copied the generator static bundle into `apps/web/public/id-card-generator/`.

## Safety

- No deploy/restart/migration/.env changes.
- No auth/API/DB/schema changes.
- No QR payload logic changes.
- No account slip/delete flow changes.
- No production data mutation.
