# Trusted Proxy and Rate Limiting Policy

## Direct Docker Compose deployment

- The bundled Nginx reverse proxy uses `$binary_remote_addr` for `limit_req_zone` keys.
- Incoming client-supplied `X-Forwarded-For` is never used as the rate-limit key.
- Nginx overwrites `X-Forwarded-For` with `$remote_addr` before proxying to the API instead of appending untrusted values.
- Oversized or malformed forwarding headers are rejected at Nginx before proxying where possible.

## Host Caddy (VPS topology) real IP

Production VPS topology terminates TLS on host Caddy and proxies to Docker Nginx at `127.0.0.1:8080` with `X-Real-IP` set to the client address (`ops/caddy/Caddyfile.schoolhub.example`).

Repository Nginx configs therefore enable a **loopback-only** real IP restore:

- `set_real_ip_from 127.0.0.1` and `::1` only
- `real_ip_header X-Real-IP`
- `real_ip_recursive off`

This keeps rate-limit keys on the real reader/public IP when traffic arrives via Caddy. Do **not** add public internet CIDRs to `set_real_ip_from` unless a reviewed external load balancer deployment requires it.

## API actor IP

- The API uses Express `request.ip` for actor/audit/throttle identity.
- Raw `X-Forwarded-For` values are preserved only as diagnostic `proxyChain` metadata and are not used as the actor IP.
- Express trust-proxy is disabled unless `TRUSTED_PROXY_CIDRS` is explicitly set.

## Trusted external load balancer deployment

If TLS/real client IP is terminated by a trusted external load balancer, set `TRUSTED_PROXY_CIDRS` to the exact proxy CIDRs or Express trust-proxy names that are allowed to set forwarding headers. Do not use raw client-provided forwarding headers from the public internet.

Nginx `real_ip_header`/`set_real_ip_from` must only be added in a deployment-specific config when those trusted proxy CIDRs are known and reviewed. The repository default config intentionally does not enable `real_ip_header`.
