# ADR-0003 — Authentication Model

**Status:** Accepted
**Date:** 2026-03-02
**Deciders:** Orion (AI agent), Engineering lead

---

## Context

The API must authenticate mobile clients and protect all routes that access
patient health data. Requirements:

- Stateless authentication compatible with a single-server deployment (no
  shared session store in MVP).
- Mobile-friendly: tokens must survive app backgrounding and device sleep.
- Safe enough for a healthcare-adjacent application containing PHI
  (injury type, surgery date, session logs).
- Simple to implement and audit with a small team.

---

## Decision

**Use short-lived JWT access tokens + long-lived refresh tokens, with
password hashing via `sha256_crypt`.**

### Token design

| Token | Algorithm | Expiry | Storage (mobile) |
|---|---|---|---|
| Access token | HS256 JWT, signed with `JWT_SECRET` | 1 hour | In-memory (React Native state / AsyncStorage) |
| Refresh token | Opaque random UUID, stored in-memory store | 30 days | AsyncStorage (persisted across app restarts) |

### Password hashing

Passwords are hashed with `passlib`'s `sha256_crypt` scheme before storage.
`bcrypt` was considered but rejected due to version compatibility issues with
`passlib` and `bcrypt` on Python 3.9+ (see Consequences below).

### Auth flow

```
POST /auth/register  →  201 { user, token, refreshToken }
POST /auth/login     →  200 { token, refreshToken, user }
POST /auth/refresh   →  200 { token, refreshToken }        # rotates both tokens
```

All other routes require `Authorization: Bearer <token>` header.
Token validation uses `python-jose` in FastAPI `Depends(get_current_user)`.

---

## Rationale

### Why JWT?

- **Stateless.** No session store needed; the token is self-contained. Works
  correctly with the MVP's in-memory API store (ADR-0001) — no extra service
  needed.
- **Standard.** Well-understood by mobile SDKs; easy to inspect with `jwt.io`
  during development.
- **Composable.** Claims (`sub`, `exp`, `iat`) are explicit and auditable.

### Why short-lived access tokens (1 hour)?

- Limits the blast radius of a stolen token. If a token leaks from a log or
  network capture it is valid for at most 1 hour.
- 1 hour is long enough to survive typical mobile app sessions without
  requiring a mid-session refresh.

### Why refresh tokens?

- Allows users to stay logged in for 30 days without re-entering credentials,
  which is critical for habit-forming health apps.
- Refresh tokens are opaque UUIDs stored server-side; they can be revoked
  immediately (e.g., on logout or password change) without waiting for token
  expiry.

### Why `sha256_crypt` over `bcrypt`?

- `bcrypt` requires a native `bcrypt` C extension that conflicts with certain
  `passlib` versions on Python 3.9+, causing `AttributeError` at startup.
- `sha256_crypt` is a well-regarded iterative hash included in `passlib` with
  no native-extension dependency. It is not the industry default but is
  cryptographically sound for a closed beta.
- Post-MVP: migrate to `argon2` (via `passlib[argon2]`) which has better
  memory-hardness properties. The migration requires only a one-time hash
  upgrade on next login (transparent to users).

### Why not OAuth2 / OIDC?

- Adds third-party provider dependency (Auth0, Cognito, etc.) — infrastructure
  cost and complexity not justified for a closed beta with < 500 users.
- Custom identity gives us full control over the user table and PHI handling
  without configuring provider data retention policies.
- OAuth2 social login (Google, Apple) is a natural post-MVP addition once the
  core product is validated; the current `/auth` routes are compatible with
  adding it later.

---

## Security notes

1. `JWT_SECRET` must be at least 32 random bytes in staging and production.
   It is injected via environment variable and never logged or committed.
2. Passwords are never stored in plaintext or returned in any API response.
3. Refresh tokens must be invalidated on logout (`DELETE /auth/session`),
   password change, and account deletion.
4. HTTPS is enforced in staging and production (plain HTTP permitted only on
   localhost). HSTS header (`Strict-Transport-Security`) is a P1 requirement
   before production launch (see `docs/RELEASE_CRITERIA.md` P1-05).
5. JWT tokens should not contain PHI fields (injury type, surgery date).
   Claims are limited to `sub` (userId), `exp`, `iat`.

---

## Consequences

### Accepted trade-offs

| Trade-off | Mitigation |
|---|---|
| `sha256_crypt` is less memory-hard than `argon2`. | Acceptable for closed beta. Plan to migrate to `argon2` post-MVP with transparent re-hash. |
| No token revocation for access tokens (short-lived). | 1-hour window is an accepted risk. Post-MVP: add a deny-list in Redis or the DB. |
| Refresh token stored in AsyncStorage on mobile (not keychain). | Acceptable for beta. Post-MVP: migrate to Expo SecureStore (iOS Keychain / Android Keystore). |
| P1-01: JWT refresh race condition not fully hardened at MVP. | Documented as P1-01 in `docs/RELEASE_CRITERIA.md`. Fix before sustained production load. |

### Migration path (post-MVP)

1. **Stronger hashing:** Add `argon2` to requirements; re-hash on next login.
2. **Token revocation:** Persist refresh tokens in DB; implement deny-list for
   access tokens.
3. **Secure storage:** Switch mobile from `AsyncStorage` to `expo-secure-store`.
4. **Social login:** Add OAuth2 providers as additional `/auth/oauth/{provider}`
   routes; existing email/password flow remains.

---

## Alternatives considered

| Option | Rejected because |
|---|---|
| **Session cookies** | Stateful; requires session store; CSRF protection adds complexity; non-standard for mobile APIs. |
| **Auth0 / AWS Cognito** | Third-party dependency; vendor lock-in; overkill for closed beta; PHI data residency concerns. |
| **API keys (static)** | No per-user identity; no expiry; revocation requires key rotation with user coordination. |
| **mTLS** | Complex certificate provisioning for mobile clients; no standard Expo support. |
