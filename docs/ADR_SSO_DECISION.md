# ADR: SSO decision

Status: Accepted

Until a complete WorkOS authorization-code callback exists, SSO must not be advertised as enabled. `/auth/sso/config` returns `enabled=false` with `SSO_NOT_IMPLEMENTED`; the callback returns HTTP 501 with a stable error code. Credentials alone cannot enable the frontend SSO button.

Implementation commit: `fix: complete password change and truthful SSO behavior`.
