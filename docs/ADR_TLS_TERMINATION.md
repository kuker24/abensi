# ADR: TLS termination

Status: Proposed — not verified in this slice

The preferred production model is trusted external TLS termination in front of the Nginx/API stack, with strict trusted-proxy CIDRs, HTTP-to-HTTPS redirect at the edge, HSTS on HTTPS, and Secure cookies. A verified HTTPS smoke test is still required before merge.
