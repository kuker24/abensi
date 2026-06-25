# Post-deploy Smoke Checks

Use the Node.js smoke script after a production deploy to catch health, SPA routing, audit serialization, device-reader, and report-preview regressions quickly.

## Public checks only

```bash
TARGET_BASE_URL=https://absensi.man1rokanhulu.cloud npm run smoke:post-deploy
```

or explicitly skip authenticated checks:

```bash
SKIP_AUTH_SMOKE=true TARGET_BASE_URL=https://absensi.man1rokanhulu.cloud npm run smoke:post-deploy
```

## Authenticated read-only checks

```bash
TARGET_BASE_URL=https://absensi.man1rokanhulu.cloud \
ADMIN_USERNAME=... \
ADMIN_PASSWORD=... \
npm run smoke:post-deploy
```

Authenticated checks use cookie-based login and do not print tokens, cookies, passwords, or response bodies. They only perform read-only API checks by default.

## Optional enum checks on VPS

When running from the VPS app directory with Docker Compose available:

```bash
EXPECT_ROLE_KEPALA_SEKOLAH=true \
EXPECT_ANDROID_MODE_GERBANG=true \
TARGET_BASE_URL=https://absensi.man1rokanhulu.cloud \
npm run smoke:post-deploy
```

These checks verify the runtime Prisma client inside the API container exposes `Role.KEPALA_SEKOLAH` and `AndroidReaderMode.GERBANG`. If Docker Compose is unavailable, they are marked `SKIP`.

## Safety

- No DB writes by default
- No Redis clear
- No user creation
- No secret/token/cookie printing
- Optional principal export-deny check only runs if `PRINCIPAL_USERNAME` and `PRINCIPAL_PASSWORD` are provided
