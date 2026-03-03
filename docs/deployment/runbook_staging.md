# Runbook — Staging Environment

**Project:** PT Adherence MVP
**Updated:** 2026-03-02

Procedures for deploying to staging, validating the deployment, running the
pre-release gate, and rolling back if needed.

---

## Overview

Staging tracks `main` HEAD and is rebuilt automatically on every merge.
It is the only environment where the full release-readiness workflow (`release-readiness.yml`)
is run before promoting to production.

**Staging base URL:** `https://staging.ptadherence.app/v1`

---

## 1. Automatic deploy (on merge to `main`)

GitHub Actions runs `.github/workflows/ci.yml` on every push to `main`.
If the `ci-gate` job passes, the staging server is rebuilt.

To watch the deploy:

```bash
gh run list --workflow=ci.yml --branch=main --limit=5
gh run watch <run-id>
```

---

## 2. Manual deploy (emergency or out-of-band)

```bash
# SSH into the staging host (replace with your infra tooling)
ssh deploy@staging.ptadherence.app

# Pull latest main
cd /opt/pt-adherence
git fetch origin && git checkout main && git pull origin main

# Restart the API server (systemd example)
sudo systemctl restart pt-api

# Verify health
curl -s https://staging.ptadherence.app/v1/health | jq .
# Expected: { "status": "ok", "version": "1.0.0" }
```

---

## 3. Post-deploy smoke test

Run from any machine with `curl` and `jq` installed:

```bash
export API_BASE_URL=https://staging.ptadherence.app/v1
bash scripts/smoke-test.sh
```

All 7 smoke-test groups must exit PASS before proceeding.

---

## 4. Pre-release gate (before tagging a release)

Trigger the `release-readiness` workflow manually:

```bash
gh workflow run release-readiness.yml \
  --ref main \
  --field environment=staging
```

Or from the GitHub Actions UI: **Actions → Release Readiness → Run workflow → staging**.

Review the workflow summary — every step must be green.

Then run the interactive QA checklist on staging:

```bash
export API_BASE_URL=https://staging.ptadherence.app/v1
bash scripts/qa-checklist.sh
```

All G-0x gates must be signed off before cutting the production tag.

---

## 5. Load test (G-04)

```bash
# Requires k6 — brew install k6
k6 run load-tests/session-flow.js \
  --vus 500 \
  --duration 60s \
  -e API_BASE_URL=https://staging.ptadherence.app/v1
```

Acceptance thresholds (set in `load-tests/session-flow.js`):

| Metric | Threshold |
|---|---|
| `http_req_duration` p(95) | < 500 ms |
| `http_req_failed` rate | < 1 % |

---

## 6. Promoting to production

Once all G-0x gates are green:

```bash
# Tag the release
git tag v1.0.0
git push origin v1.0.0

# The release-readiness workflow triggers automatically on the tag push
# Monitor it:
gh run list --workflow=release-readiness.yml --limit=3
```

Production deploy is a **manual, deliberate step** — the tag push does not
auto-deploy to production. Follow the production deploy SOP (out of scope for
this runbook).

---

## 7. Rollback

Staging is ephemeral and reset nightly — rollback means deploying the
previous `main` commit:

```bash
# Find the previous good commit
git log --oneline -10

# Deploy previous commit (replace <sha>)
ssh deploy@staging.ptadherence.app
cd /opt/pt-adherence
git checkout <sha>
sudo systemctl restart pt-api

# Verify health
curl -s https://staging.ptadherence.app/v1/health | jq .
```

After rollback, open a GitHub issue labelled `p0` describing the regression
before re-attempting the release.

---

## 8. Environment variables on staging

Managed via the staging host's environment or secret manager.

| Variable | Expected value |
|---|---|
| `PORT` | `3000` |
| `JWT_SECRET` | Rotated secret — do not log |
| `JWT_EXPIRY_SECONDS` | `3600` |
| `REFRESH_TOKEN_EXPIRY_DAYS` | `30` |
| `SEGMENT_WRITE_KEY` | Segment staging write key |
| `SES_FROM_ADDRESS` | `no-reply@staging.ptadherence.app` |
| `LOG_LEVEL` | `INFO` |
| `SENTRY_DSN` | Sentry staging project DSN |
| `EXPO_PUBLIC_API_URL` | `https://staging.ptadherence.app/v1` |

---

## Alerts and on-call

Staging alerts are informational only — they do not page on-call.
Errors visible in Sentry staging project (`pt-adherence-staging`).
For production on-call procedures see `docs/RELEASE_CRITERIA.md` G-07.
