# HTTPS production entrypoint

Status: implemented as trusted external TLS termination with explicit smoke tests.

## Model

SchoolHub runs Nginx/API/Web on the private application network. Public TLS terminates at a trusted load balancer or reverse proxy in front of `ops/nginx/reverse-proxy.conf`.

Required edge behavior:

1. valid certificate for `PUBLIC_APP_ORIGIN`;
2. redirect public HTTP to HTTPS;
3. forward only sanitized `X-Forwarded-For` and `X-Forwarded-Proto`;
4. set `X-Forwarded-Proto: https` for TLS requests;
5. restrict origin access to the app Nginx from trusted proxy CIDRs only.

The app Nginx returns `308` when a trusted proxy sends `X-Forwarded-Proto: http` and emits HSTS only when `X-Forwarded-Proto: https` is present. This prevents accidental HSTS on plain local health checks while enforcing HTTPS at the public entrypoint.

## Verification

```bash
HTTPS_BASE_URL=https://ehadir.example.sch.id \
ADMIN_USERNAME=admin.tu \
ADMIN_PASSWORD='...' \
npm run test:https-smoke
```

The smoke test verifies HTTP redirect, HTTPS live/ready, HSTS, Secure/HttpOnly cookies, `auth/me`, CSRF mutation, SSE headers, and that known internal endpoints are not publicly exposed.

## Certificate renewal

Use the owner-managed load-balancer certificate automation (ACME/managed cert). Renew at least 14 days before expiry and run `npm run test:https-smoke` after renewal.

## Rollback

If TLS deployment fails, rollback the edge proxy/certificate configuration. Do not disable Secure cookies or trusted-proxy validation in the app. Use a previously validated certificate or route traffic to the previous image while keeping database migrations forward-only.
