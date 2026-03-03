# Environment Matrix

**Project:** PT Adherence MVP
**Updated:** 2026-03-02

Defines the three runtime environments, their configuration, and the promotion path between them.

---

## Environments at a glance

| Property | Local | Staging | Production |
|---|---|---|---|
| **Purpose** | Active development, fast iteration | Pre-release QA, load tests, stakeholder demos | Live users |
| **API base URL** | `http://localhost:3000/v1` | `https://staging.ptadherence.app/v1` | `https://api.ptadherence.app/v1` |
| **Mobile `EXPO_PUBLIC_API_URL`** | `http://localhost:3000/v1` | `https://staging.ptadherence.app/v1` | `https://api.ptadherence.app/v1` |
| **Data store** | In-memory (process lifetime) | In-memory / ephemeral DB | Persistent DB (TBD — see ADR-0001) |
| **Auth** | JWT, short-lived (1 h), any secret | JWT, short-lived (1 h), rotated secret | JWT, short-lived (1 h), HSM-backed secret |
| **Analytics** | Disabled / dry-run | Segment staging source | Segment production source |
| **Email (weekly summary)** | No-op / logged to stdout | Sandbox (Mailtrap or SES sandbox) | SES production |
| **Push notifications** | Disabled | APNS sandbox, FCM test project | APNS production, FCM production |
| **Crash reporting** | Disabled | Sentry staging project | Sentry production project |
| **Branch** | Feature branches | `main` HEAD | Tagged release (e.g., `v1.0.0`) |
| **Deploy trigger** | Manual (`uvicorn` / Expo Go) | Merge to `main` (CI/CD) | Manual promotion from staging tag |
| **Teardown** | Process exit | Nightly reset at 04:00 UTC | Persistent; blue/green roll-forward only |

---

## Configuration variables

All environment-specific values are injected via environment variables — never hardcoded.

### API server

| Variable | Local example | Staging | Production |
|---|---|---|---|
| `PORT` | `3000` | `3000` | `3000` |
| `JWT_SECRET` | `dev-secret-do-not-use` | Injected from secret manager | Injected from HSM |
| `JWT_EXPIRY_SECONDS` | `3600` | `3600` | `3600` |
| `REFRESH_TOKEN_EXPIRY_DAYS` | `30` | `30` | `30` |
| `SEGMENT_WRITE_KEY` | *(unset / dry-run)* | `staging_xxx` | `prod_xxx` |
| `SES_FROM_ADDRESS` | *(unset)* | `no-reply@staging.ptadherence.app` | `no-reply@ptadherence.app` |
| `LOG_LEVEL` | `DEBUG` | `INFO` | `WARNING` |
| `SENTRY_DSN` | *(unset)* | `https://...@sentry.io/staging` | `https://...@sentry.io/prod` |

### Mobile (Expo)

| Variable | Local | Staging | Production |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://localhost:3000/v1` | `https://staging.ptadherence.app/v1` | `https://api.ptadherence.app/v1` |
| `EXPO_PUBLIC_SENTRY_DSN` | *(unset)* | Sentry staging DSN | Sentry prod DSN |
| `EXPO_PUBLIC_SEGMENT_KEY` | *(unset)* | Segment staging key | Segment prod key |

---

## Promotion path

```
feature branch  ──PR──►  main  ──tag vX.Y.Z-rcN──►  staging QA  ──sign-off──►  v X.Y.Z  ──►  production
```

1. **Feature → main**: PR must pass the `ci-gate` check (all CI jobs green).
2. **main → staging**: Automatic on merge; staging server redeploys from `main` HEAD.
3. **Staging → production**: Manual. Engineer runs `release-readiness` workflow, verifies all G-0x gates, tags `vX.Y.Z`, and triggers production deploy.

---

## Networking notes

- All inter-service calls use HTTPS in staging and production; plain HTTP is permitted only on `localhost`.
- Staging and production share no state — staging data is ephemeral and reset nightly.
- CORS: API allows `http://localhost:*` in local and staging; production allows only the production app origin and `https://*.ptadherence.app`.
