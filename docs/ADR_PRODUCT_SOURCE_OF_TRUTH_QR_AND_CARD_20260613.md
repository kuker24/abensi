# ADR — Product Source of Truth: Card Gate + Official Android QR Reader

Status: Accepted  
Date: 2026-06-13

## Decision

The canonical product baseline is:

1. **Classroom attendance** remains manual input by authorized teachers only.
2. **Students never self-submit classroom attendance.**
3. **Gate attendance** supports the original smart-card/RFID reader path and the accepted later official Android QR reader path.
4. The public/legacy manual QR endpoint remains a controlled admin/operator fallback and is disabled by default in production via `legacyQrScanEnabled=false`.
5. Official Android QR reader traffic must use HMAC signed reader endpoints and the canonical signature contract documented in `docs/ADR_ANDROID_QR_READER_ENDPOINT.md` and `docs/QR_SECURITY_MODEL.md`.

## Why this reconciles PRD and README

`prd-ehadir-v2_2.md` describes the baseline as card-gate primary and QR as an extension point. Later accepted ADR/history introduced the official Android QR reader as a production reader adapter without changing the non-negotiable product model: QR is still a **reader/device path**, not student self-attendance and not a classroom input method.

Therefore, PRD v2.2 remains valid with this amendment: **Android QR reader is an accepted production gate/prayer reader adapter alongside smart card hardware.**

## Threat model

- Browser/client role claims are untrusted.
- Reader identity is verified by server-side `DeviceReader` status/type/mode and HMAC headers.
- Nonce replay, timestamp skew, body hash mismatch, inactive/revoked reader, inactive/lost card, and invalid QR credential are rejected and persisted as rejected scans where applicable.
- Raw reader secrets/API keys must not be stored or logged.

## Rollout

1. Provision reader through admin/device flow.
2. Store `apiKeyHash`, prefix/last4, and encrypted reader secret only.
3. Return raw secret exactly once during provision/rotation.
4. Deploy Android reader with HMAC signature contract test vectors.
5. Keep legacy manual QR disabled in production except approved emergency operation.

## Rollback

- Disable affected reader (`DeviceReader.status=REVOKED`/`INACTIVE`).
- Rotate reader secret.
- Disable `legacyQrScanEnabled`.
- Fall back to smart-card gate reader or authorized manual gate override with reason/audit.

## Acceptance criteria

- No student classroom self-check-in route.
- Reader requests without valid HMAC are rejected.
- Duplicate event IDs are idempotent.
- Inactive/revoked readers/cards are rejected.
- Manual fallback requires authorized role, reason, and audit entry.
