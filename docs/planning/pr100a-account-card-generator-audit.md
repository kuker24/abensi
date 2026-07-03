# PR100A — Audit & Plan Generator Identitas dan Lembar Akun Login

Status: `PLANNING_READY_NO_RUNTIME_CHANGE`
Tanggal: 2026-07-03
Scope: docs-only planning/data diagnosis untuk PR #100
Owner target: Admin/TU, Developer, Operator IT sesuai keputusan produk/security

## 1. Ringkasan Keputusan

Generator internal hasil PR #99 akan dikembangkan menjadi **Generator Identitas & Akun** di area:

> Data Sekolah → Akun & Data Sekolah

Dua mode resmi:

1. **Kartu Tanda Pengenal Resmi**
2. **Lembar Akun Login**

Keputusan password MVP:

- Password awal boleh dibuat/generate oleh ADMIN_TU.
- Password awal boleh dicetak pada **Lembar Akun Login**.
- User boleh login memakai password awal.
- **Ganti password setelah login pertama tidak wajib** untuk MVP ini.
- Teks UI harus menggunakan anjuran, bukan kewajiban:
  - `Disarankan mengganti password setelah login pertama.`
  - `Jika lupa password, hubungi ADMIN_TU untuk reset password.`
- Jika user lupa password, pemulihan dilakukan dengan reset/generate ulang oleh ADMIN_TU.
- Email recovery, self-service forgot password, dan activation code ditunda.

Alasan:

- Sistem belum punya email recovery/self-service forgot password.
- Force password change berisiko mengunci user jika lupa password awal/baru.
- Operasional sekolah lebih realistis memakai admin reset dulu.

## 2. Current Production Baseline

PR #99 sudah production stable:

- Generator sudah internal.
- Akses utama dari **Data Sekolah → Akun & Data Sekolah**.
- Server-side protection: `Nginx auth_request + backend role-check`.
- Allowed roles generator saat ini: `ADMIN_TU`, `DEVELOPER`, `OPERATOR_IT`.
- Route lama `/id-card-generator/` tidak lagi public.

Relevant files audited:

- `prisma/schema.prisma`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/jwt.strategy.ts`
- `apps/api/src/modules/identity/identity.controller.ts`
- `apps/api/src/modules/identity/identity.service.ts`
- `apps/api/src/modules/identity/identity.dto.ts`
- `apps/api/src/modules/qr-credentials/qr-credentials.controller.ts`
- `apps/api/src/modules/qr-credentials/qr-credentials.service.ts`
- `apps/api/src/modules/qr-credentials/qr-code.util.ts`
- `packages/shared/index.mjs`
- `Data Akun/generator-tanda-pengenal/src/store/useStore.js`
- `Data Akun/generator-tanda-pengenal/src/utils/identityCard.js`
- `Data Akun/generator-tanda-pengenal/src/utils/siab2Cards.js`
- `docs/adr/0002-stable-student-card-qr.md`
- `docs/QR_SECURITY_MODEL.md`
- `docs/CETAK_KARTU_EHADIR.md`
- `docs/SOP_OPERATOR_KARTU_SISWA.md`

## 3. Password Policy

| Item | PR100A Diagnosis | PR100 Recommendation |
|---|---|---|
| Force change first login | Existing system supports and enforces `mustChangePassword` | Do **not** use for Account Slip MVP |
| Optional change | Existing `/auth/change-password` exists | Keep optional/disarankan |
| Forgot password | No self-service recovery found | ADMIN_TU reset/generate ulang |
| Admin reset | Existing `PATCH /identity/users/:id` can update password, but sets `mustChangePassword: true` | Add dedicated generate endpoint for one-time slip with `mustChangePassword: false` |
| Email recovery | Not found | Future only |
| Activation code | No token/claim model found | Future only, likely migration |

### Critical Finding: Existing User Create/Update Forces Password Change

Current `IdentityService` behavior:

- `createUser(...)` sets `mustChangePassword: true`.
- `updateUser(...)` with password sets `passwordChangedAt: null` and `mustChangePassword: true`.
- `commitUsersImport(...)` sets `mustChangePassword: true`.
- `JwtStrategy` blocks most authenticated routes when `mustChangePassword === true`, allowing only auth/change-password/logout style routes.

Implication:

- PR100C must **not reuse existing password update path as-is** for account slips if product decision remains “optional password change”.
- Either add a new dedicated account-slip credential generation service method, or extend existing identity password update with an explicit safe flag and tests.
- Recommended: dedicated endpoint/service to avoid weakening existing admin user management semantics.

## 4. Account Model Diagnosis

| Area | Finding |
|---|---|
| User model | `User` in Prisma |
| Username | `User.username` unique |
| Password hash | `User.passwordHash` |
| Role | `User.role` enum: `ADMIN_TU`, `KEPALA_SEKOLAH`, `GURU_MAPEL`, `GURU_PIKET`, `SISWA`, `OPERATOR_IT`, `DEVELOPER` |
| Active status | `User.active` boolean |
| Card status | `User.cardStatus` enum `ACTIVE`, `LOST`, `INACTIVE` |
| Session invalidation | `User.sessionVersion` and `AuthSession.revokedAt` are used |
| Password changed marker | `User.passwordChangedAt` exists |
| Force password field | `User.mustChangePassword` exists |
| Auth sessions | `AuthSession` model exists |
| Audit | `AuditEntry` and `writeAudit(...)` exist |
| Password reset token model | Not found |
| Email recovery | Not found |
| Activation/claim token model | Not found |

### Existing Auth Flow

- Login: `POST /api/v1/auth/login`
- Current user: `GET /api/v1/auth/me`
- Change own password: `POST /api/v1/auth/change-password`
- Logout: `POST /api/v1/auth/logout`
- Logout all: `POST /api/v1/auth/logout-all`
- JWT/session validation uses httpOnly cookie `schoolhub_access_token`.
- If `mustChangePassword` is true, `JwtStrategy` returns `PASSWORD_CHANGE_REQUIRED` for normal protected routes.

### Existing Admin/User Flow

- List users: `GET /api/v1/identity/users`
- Create user: `POST /api/v1/identity/users`
- Update user: `PATCH /api/v1/identity/users/:id`
- Import preview/commit users: `/identity/users/import/...`
- Permanent delete limited to `DEVELOPER`.

Important constraints:

- `OPERATOR_IT` has `devices.manage`, but not `users.manage` in shared capabilities.
- `ADMIN_TU` has `users.manage` and `devices.manage`.
- `DEVELOPER` has all capabilities.

## 5. Person Data Diagnosis

Current `User` table is the primary person/account record. Dedicated biodata fields are not present in Prisma schema:

- No dedicated `nisn` field found.
- No dedicated `nip` field found.
- No dedicated `ttl`, `tempat_lahir`, `tanggal_lahir` fields found.
- No dedicated `alamat` field found.
- Student class membership exists through `ClassEnrollment` → `SchoolClass`.
- Role/job-like display can be derived from `User.role` and contextual mappings.

Implication:

- Account slip MVP can be built from existing `User` without migration.
- Official card mode can continue using existing `QrCredential.exportCards(...)` for stable card data.
- If official card must print NISN/NIP/TTL/alamat from DB, a future schema decision/migration is needed.

## 6. Card Mode — Kartu Tanda Pengenal Resmi

### Official Source

Use DB-backed sources only:

- `User`
- `ClassEnrollment`
- `SchoolClass`
- `QrCredential`
- `SmartCard` if needed for physical card state

Existing QR/card endpoints:

- `POST /api/v1/qr-credentials/bulk-generate`
- `GET /api/v1/qr-credentials/readiness`
- `GET /api/v1/qr-credentials/export/cards`
- `GET /api/v1/qr-credentials/export/class/:classId/cards`
- `GET /api/v1/qr-credentials/export/users/:userId/card`
- `POST /api/v1/qr-credentials/users/:userId/rotate`
- `POST /api/v1/qr-credentials/:id/revoke`

### QR Payload Rule

QR kartu identitas:

- must be opaque only: `schoolhub:qr:v1:QR_...`
- must not contain password
- must not contain login token
- must not contain session/cookie
- must not contain full biodata
- scan performs backend lookup

Existing QR model supports this:

- `QrCredential.codeHash`
- encrypted `codeCiphertext`
- `qrCodeHash(...)`
- `formatSchoolHubQr(...)`
- `redactQr(...)`

### CSV Draft Rule

- CSV/manual data can remain draft/import helper only.
- Production official card should require DB record and official QR.
- If DB record is missing, do not call it official card.

## 7. Account Slip Mode — Lembar Akun Login

### Recommended First Step: Option A — Initial Password Slip

Flow:

1. ADMIN_TU selects existing users/accounts from database.
2. Backend generates random password server-side.
3. Backend hashes password and updates `User.passwordHash`.
4. Backend revokes active sessions / increments `sessionVersion`.
5. Backend keeps `mustChangePassword: false` for PR100 MVP.
6. Backend writes audit event without plaintext password.
7. Plaintext password is returned once to frontend response.
8. Frontend keeps plaintext in memory only.
9. PDF slip is exported.
10. `Hapus Data Lokal` clears state; refresh loses passwords.
11. If user forgets password, ADMIN_TU generates a new one.

### Slip Fields

- `RAHASIA / CONFIDENTIAL`
- Nama
- Role
- Username
- Password awal / password sementara
- URL login: `https://absensi.man1rokanhulu.cloud`
- Instruksi: `Gunakan username dan password ini untuk login.`
- Anjuran: `Disarankan mengganti password setelah login pertama.`
- Bantuan: `Jika lupa password, hubungi ADMIN_TU untuk reset password.`

### Do Not Persist

Never store generated plaintext password in:

- database
- localStorage
- activity log
- audit log
- server logs
- URL query/hash
- QR code

## 8. Access Model

Existing generator route access after PR #99:

- Nginx auth_request allows `ADMIN_TU`, `DEVELOPER`, `OPERATOR_IT` to load generator static bundle.

Recommended credential generation access:

- `ADMIN_TU`
- `DEVELOPER`

Do not allow `OPERATOR_IT` for credential generation by default because:

- It grants ability to reset/generate login passwords.
- `OPERATOR_IT` currently lacks `users.manage` capability.
- Password slip generation is account provisioning, not just device/QR management.

If product decides OPERATOR_IT must be allowed, require explicit risk acceptance and audit event.

## 9. API Plan

### Important Route Naming Note

The user-proposed endpoint prefix is:

```http
/api/v1/internal/account-generator/...
```

But PR #99 Nginx intentionally blocks broad public `/api/v1/internal/` and only allows the exact internal `auth_request` endpoint. Browser-called app APIs should therefore use a normal protected API path unless Nginx is intentionally changed.

Recommended browser API prefix:

```http
/api/v1/account-generator/...
```

Controller can still be “internal/admin-only” by using `JwtAuthGuard`, `RolesGuard`, and `CapabilitiesGuard`.

### 9.1 People/Account Source Endpoint

```http
GET /api/v1/account-generator/people
```

Purpose:

- List existing accounts from database.
- Filter by role/person type.
- Search name/username/class.
- Pagination.
- Show account status.

Minimum response fields:

- `id`
- `fullName`
- `username`
- `role`
- `active`
- `cardStatus`
- `className` if student enrollment exists
- `hasActiveQrCredential`
- `lastPasswordChangedAt` as metadata only; never password

Access:

- Read-only people list: `ADMIN_TU`, `DEVELOPER`; possibly `OPERATOR_IT` only for card mode/read-only.

### 9.2 Credential Preview Endpoint

```http
POST /api/v1/account-generator/credentials/preview
```

Purpose:

- Validate selected account IDs.
- Preview slip rows without generating password.
- Never return old password.

Response:

- user/account metadata
- warnings for inactive/missing accounts
- `passwordStatus: "not_generated"`

### 9.3 Generate Initial Password Endpoint

```http
POST /api/v1/account-generator/credentials/generate
```

Purpose:

- Accept selected `userIds`.
- Generate random initial passwords server-side.
- Hash and update `User.passwordHash`.
- Increment `sessionVersion` / revoke active sessions.
- Set `mustChangePassword: false` for MVP.
- Return plaintext only once for PDF.
- Audit metadata without password.

Recommended DTO:

```ts
{
  userIds: string[];
  reason: string; // min length, e.g. "Cetak lembar akun login awal"
}
```

Response:

```ts
{
  generatedAt: string;
  expiresInMemoryOnly: true;
  items: Array<{
    userId: string;
    fullName: string;
    role: Role;
    username: string;
    initialPassword: string; // one-time response only
    loginUrl: string;
  }>;
}
```

Server logs/audit must not include `initialPassword`.

### 9.4 Card Generator Endpoint

For official cards, continue or wrap existing QR export endpoints:

- Existing: `/api/v1/qr-credentials/export/...`
- Future wrapper optional: `/api/v1/account-generator/cards/export/...`

No password data may be returned by card endpoints.

## 10. UI Plan

Rename UX heading from only card-oriented wording to:

> Generator Identitas & Akun

Tabs:

1. `Kartu Tanda Pengenal`
2. `Lembar Akun Login`

### Tab: Kartu Tanda Pengenal

- Uses DB official card export endpoints.
- CSV/manual only shown as draft/import helper.
- Warn if QR fallback exists.
- Do not allow password fields in QR or card payload.

### Tab: Lembar Akun Login

Filters:

- siswa
- guru
- kepala sekolah
- karyawan/operator
- active/inactive
- search by nama/username/class

Actions:

- `Generate Password Awal`
- `Export PDF Lembar Akun`
- `Hapus Data Lokal`

Required warning:

> Password hanya ditampilkan sekali. Simpan PDF dengan aman. Jika user lupa password, ADMIN_TU dapat generate ulang.

Required recommendation text:

> Disarankan mengganti password setelah login pertama. Jika lupa password, hubungi ADMIN_TU untuk reset.

Forbidden text for MVP:

> Wajib mengganti password saat login pertama.

## 11. Local Storage / Privacy Plan

Current generator persists card users/settings to `localStorage` key:

```text
id-card-generator-storage
```

For account slip mode:

- Do not reuse persisted `users` state for credential results containing password.
- Store generated credential results in a separate in-memory-only store/slice.
- Ensure `partialize(...)` never includes passwords or credential results.
- `clearLocalData()` should clear both persisted card data and in-memory credential data.
- On refresh, generated passwords must be gone.
- Passwords must not be included in activity log.

Tests:

- After generate, `localStorage[id-card-generator-storage]` does not contain password.
- After export + clear, generated passwords are gone.
- After reload, generated passwords cannot be recovered.
- Console/server logs do not include password.

## 12. Security Test Plan

Backend:

- unauth request blocked.
- unauthorized role blocked.
- `ADMIN_TU` allowed.
- `DEVELOPER` allowed.
- `OPERATOR_IT` blocked for credential generation unless explicitly approved.
- generated password is hashed.
- `mustChangePassword` remains false for MVP endpoint.
- sessionVersion increments / sessions revoked.
- old password no longer works after generate/reset.
- response returns plaintext only for generate response.
- preview endpoint never returns password.
- audit log contains IDs/count/reason only, no plaintext password.

Web/generator:

- tab appears for allowed role.
- credential warning appears.
- slip PDF renders.
- password not in QR.
- password not in localStorage.
- Hapus Data Lokal clears state.
- refresh loses generated password.
- mobile 390 safe.

Manual smoke with dummy account only:

- Generate password for dummy account.
- Export PDF slip.
- Login with generated password.
- Verify no forced password-change lock.
- Generate a second password for dummy account.
- Old password no longer works.
- New password works.

## 13. Roadmap

### PR100A — Planning/Data Diagnosis

- This document.
- No runtime implementation.
- No migration.
- No deploy.

### PR100B — DB-backed Official Card Source

- Make official card mode clearly DB-only.
- Keep CSV/manual as draft.
- Confirm QR token/verification URL story.
- Resolve whether NISN/NIP/TTL/alamat require schema changes.

### PR100C — Account Login Slip Generator

- Add protected account-generator API.
- Add server-side password generation.
- Add in-memory-only frontend credential state.
- Add PDF slip export.
- Add tests.
- No force password change.

### PR100D — Optional User Change Password UX

- Make voluntary password change discoverable.
- Keep recovery through ADMIN_TU until self-service exists.

### PR100E — Future Activation/Recovery Flow

- Activation/claim codes.
- Expiry + single-use token model.
- Email/SMS recovery if approved.
- Requires migration and separate deployment plan.

## 14. Open Decisions Before PR100C

1. Should credential generation include `OPERATOR_IT` or only `ADMIN_TU` + `DEVELOPER`?
   - Recommendation: `ADMIN_TU` + `DEVELOPER` only.
2. Should generated password length/format be numeric-friendly for school operations or high-entropy alphanumeric?
   - Recommendation: readable high-entropy, e.g. grouped alphanumeric, avoid ambiguous characters.
3. Should slips be auto-cleared immediately after successful PDF export?
   - Recommendation: yes, with confirmation and clear warning.
4. Are NISN/NIP/TTL/alamat already available from an external import source that is not modeled in DB?
   - If official card must print them from DB, plan migration separately.

## 15. Final Verdict

Fastest safe MVP:

- Keep PR #99 server-side generator protection.
- Add two tabs in generator UX.
- Use DB-backed official cards for identity/QR.
- Add account login slip generation with admin-generated initial password.
- Store only password hash in database.
- Return plaintext password once for PDF, in memory only.
- Do not set `mustChangePassword` for this MVP.
- Make password change optional/disarankan until recovery is ready.

This avoids public exposure, avoids QR credential/password mixing, avoids localStorage leakage, and avoids locking users behind a force-change flow without recovery.
