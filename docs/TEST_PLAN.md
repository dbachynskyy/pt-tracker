# Test Plan — PT Adherence MVP

**Version:** 1.0 | **Updated:** 2026-03-02 | **Owner:** Orion

This document maps every MVP acceptance criterion to one or more concrete
test cases. Tests are grouped as **automated** (runnable via CLI) or
**manual** (requires device or human judgement). All P0 launch gates
(G-01 … G-07) must reach PASS before a production release is cut.

---

## Quick reference

| Command | Purpose |
|---|---|
| `python3 scripts/check_release_readiness.py` | Gate: required artefacts and tools present |
| `bash scripts/smoke-test.sh` | API happy-path coverage (7 groups) |
| `node scripts/test-api-schemas.js` | API payload JSON Schema validation |
| `node scripts/validate-event.js <file>` | Single analytics event schema check |
| `bash scripts/qa-checklist.sh --non-interactive` | Print all P0 criteria (CI-friendly) |
| `bash scripts/qa-checklist.sh` | Interactive go/no-go sign-off |
| `npx @redocly/cli lint docs/openapi.yaml` | OpenAPI spec correctness |

---

## Acceptance criteria → test mapping

The table below cross-references each success metric from `docs/mvp_spec.md`
with the tests that verify it.

| Metric | Target | Covered by |
|---|---|---|
| D7 retention | ≥ 55% | Manual-07 (onboarding flow); post-launch analytics |
| Weekly exercise completion rate | ≥ 70% | Auto-04, Manual-04 (session flow end-to-end) |
| Session logging latency | < 500 ms p95 | Auto-11 (load test — G-04) |
| Form feedback latency | < 2 s p95 | Manual-06 (on-device form detection) |
| Weekly summary delivery success | ≥ 99% | Auto-09, Manual-09 (summary email) |

---

## Automated tests

Run these in CI on every commit and before any release build.

### Auto-01 — Release artefact readiness

```bash
python3 scripts/check_release_readiness.py
```

**Validates:**
- All required docs, schema files, and scripts exist and are non-empty.
- All required CLI tools (`curl`, `jq`, `node`) are on `$PATH`.
- API payload schemas exist and parse as valid JSON.
- Shell scripts have executable permission.

**Pass criteria:** Exit code 0.

---

### Auto-02 — API smoke test (local)

```bash
bash scripts/smoke-test.sh
```

**Covers:** G-01, G-02

Exercises the following route groups against `http://localhost:3000/v1`:

| Group | Routes tested |
|---|---|
| Health | `GET /health` → 200 |
| Auth | `POST /auth/register` → 201, `POST /auth/login` → 200, `POST /auth/refresh` → 200 |
| Onboarding | `PUT /users/{id}/profile` → 200 |
| Plan | `GET /users/{id}/plan` → 200 or PLAN_NOT_ASSIGNED skip; `GET /users/{id}/plan/today` |
| Session | `POST /sessions` → 201; `PATCH /sessions/{id}/exercises/{id}`; `POST /sessions/{id}/complete` → 200; idempotency → 400 SESSION_ALREADY_COMPLETE |
| Dashboard | `GET /users/{id}/adherence` → 200 |
| Summary | `GET /users/{id}/summary/{weekOf}` → 200 or skip |

**Pass criteria:** Exit code 0; FAIL count = 0.

---

### Auto-03 — API smoke test (staging)

```bash
API_BASE_URL=https://staging.ptadherence.app/v1 bash scripts/smoke-test.sh
```

Run this after every staging deploy. Same checks as Auto-02 against the
real staging environment.

**Pass criteria:** Exit code 0; FAIL count = 0.

---

### Auto-04 — API payload schema validation

```bash
node scripts/test-api-schemas.js
node scripts/test-api-schemas.js --verbose   # show individual test names
```

Runs 28 fixture-based tests across the five key request schemas:

| Schema | Valid fixtures | Invalid fixtures |
|---|---|---|
| `auth.register.request` | 1 | 4 |
| `auth.login.request` | 1 | 3 |
| `user.profile.request` | 3 | 3 |
| `session.start.request` | 1 | 4 |
| `session.exercise_log.request` | 3 | 5 |

Each invalid fixture tests a distinct violation (missing required field,
wrong type, out-of-range value, extra property, bad format).

**Pass criteria:** Exit code 0; FAIL count = 0.

---

### Auto-05 — Analytics event schema validation

```bash
# Validate a known-good event
echo '{"event":"user_registered","userId":null,"sessionId":null,"timestamp":"2026-03-02T10:00:00Z","platform":"ios","appVersion":"1.0.0","properties":{"method":"email"}}' \
  | node scripts/validate-event.js

# Validate all event fixtures in the test directory (if present)
for f in test/fixtures/events/*.json; do
  node scripts/validate-event.js "$f" || echo "Schema violation in $f"
done
```

**Pass criteria:** All events print `VALID`; exit code 0 for each file.

---

### Auto-06 — OpenAPI spec lint

```bash
npx @redocly/cli lint docs/openapi.yaml
```

**Pass criteria:** No errors reported (warnings acceptable).

---

### Auto-07 — Zero open P0/P1 bugs

```bash
gh issue list --label p0 --state open --json number,title
gh issue list --label p1 --state open --json number,title
```

**Covers:** G-03

**Pass criteria:** Both commands return `[]`.

---

### Auto-08 — PHI scrub (log grep)

```bash
grep -rE '"injuryType"|"surgeryDate"|"email"' logs/ \
  | grep -v '\.example\.' \
  | grep -v 'smoke.*test' \
  && echo "PHI FOUND — FAIL" || echo "CLEAN"
```

**Covers:** G-05

Also spot-check 100 raw analytics events from the data warehouse for PII
strings (names, email addresses, date-of-birth values).

**Pass criteria:** `CLEAN` output; no PHI strings in events table; BAA
signed with all third-party vendors.

---

### Auto-09 — Weekly summary email delivery

```bash
# Trigger and queue check
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE_URL/users/$USER_ID/summary/$WEEK_OF/send" | jq .queued
```

**Pass criteria:** Response body contains `"queued": true`; email arrives
in the patient inbox within 5 minutes; PDF attachment is a valid PDF.

---

### Auto-10 — JWT refresh correctness

```bash
# After login, capture refreshToken:
REFRESH=$(curl -s -X POST \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"SecurePass1!"}' \
  "$API_BASE_URL/auth/login" | jq -r '.refreshToken')

# Refresh twice concurrently — only one should succeed with the same token:
curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH\"}" "$API_BASE_URL/auth/refresh" &
curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH\"}" "$API_BASE_URL/auth/refresh" &
wait
```

**Covers:** P1-01

**Pass criteria:** Exactly one call returns 200 with new tokens; the other
returns 401 (token rotation / single-use enforcement).

---

### Auto-11 — Load test (500 VUs)

```bash
k6 run load-tests/session-flow.js \
  --vus 500 \
  --duration 60s \
  -e API_BASE_URL=https://staging.ptadherence.app/v1
```

**Covers:** G-04

**Pass criteria:** `http_req_duration p(95) < 500ms`; `http_req_failed rate < 1%`.

---

### Auto-12 — HTTPS enforcement

```bash
curl -s -I https://api.ptadherence.app/v1/health | grep -i strict-transport
```

**Covers:** P1-05

**Pass criteria:** `Strict-Transport-Security` header present with `max-age ≥ 31536000`.

---

## Manual tests

These require a physical device, human observation, or third-party tooling
that cannot be automated in the current CI pipeline.

### Manual-01 — Full iOS session flow (G-01)

**Device:** Physical iPhone, iOS 16 or later.

**Steps:**
1. Install the TestFlight build.
2. Register a new patient account.
3. Complete onboarding: enter injury type, optional surgery date, one constraint.
4. On the home screen, verify today's exercises are listed.
5. Tap **Start** on the first exercise → camera activates.
6. Complete all 3 sets. Confirm rep count increments on screen.
7. Tap **Done** → exercise marked complete; next exercise shown.
8. Complete all exercises for the session.
9. Tap **Finish Session** → streak counter increments; progress bar updates.
10. Navigate to the Dashboard → confirm today's session is reflected.

**Pass criteria:** All steps complete without crash or error message;
streak increments by 1; `POST /sessions/{id}/complete` returns 200.

---

### Manual-02 — Full Android session flow (G-01)

Identical steps to Manual-01 on a physical Android device, Android 10 or
later.

**Pass criteria:** Identical to Manual-01.

---

### Manual-03 — Rehab plan rendering — all template plans (G-02)

**Steps:**
1. For each template plan in the system (e.g., ACL-early, rotator-cuff-basic):
   a. Assign that plan to a test patient via the admin or seeding script.
   b. Open the app and navigate to **Today's Plan**.
   c. Verify all exercises display: name, sets, reps, rest time, video clip
      thumbnail, and written instructions.
   d. Tap the video thumbnail → instructional clip plays without buffering.

**Pass criteria:** No missing fields; no broken video URLs; instructions
render correctly on both iOS and Android.

---

### Manual-04 — Adherence dashboard accuracy

**Steps:**
1. Complete sessions on 5 consecutive days using the test account.
2. Skip one day.
3. Open the **Dashboard** screen.
4. Verify: streak shows 5; weekly completion rate ≈ 71 % (5/7); the missed
   day appears with a distinct visual indicator.
5. Cross-check with `GET /users/{id}/adherence?from=...&to=...`.

**Pass criteria:** UI matches API response; streak resets to 0 after 2
consecutive missed days (verify on day 3 with no session).

---

### Manual-05 — Offline session caching and sync (P1-02)

**Steps:**
1. Enable airplane mode on the test device.
2. Start a session and log one exercise (3 sets, all reps).
3. Tap **Finish Session** → app should show a "pending sync" indicator.
4. Restore network connectivity.
5. Confirm the session syncs: Dashboard updates; `GET /users/{id}/adherence`
   returns the session.

**Pass criteria:** Session data is not lost; sync completes within 30 s of
reconnection.

---

### Manual-06 — Form feedback latency and accuracy (P1 feature)

**Steps:**
1. On a physical device with good lighting, start a session for an ACL
   squat exercise.
2. Perform 5 reps while in correct form → confirm form score ≥ 0.75.
3. Perform 5 reps with intentional posture deviation (lean too far forward)
   → confirm form score drops below 0.60 and a feedback message appears.
4. Measure time from rep completion to feedback display (screen recording
   or manual timer).

**Pass criteria:** Feedback appears within 2 s p95; false-positive rate
< 10 % on a 20-rep clean-form set.

---

### Manual-07 — Onboarding drop-off (all steps)

**Steps:**
1. Open the app as a new user.
2. Record the completion rate for each onboarding step:
   - Account creation (email + password)
   - Injury info form
   - Camera permission prompt
   - Plan review screen

**Pass criteria:** No step has a UI bug that blocks forward progress; each
screen has a **Back** affordance.

---

### Manual-08 — Weekly summary PDF (P1-03)

**Steps:**
1. Ensure a test patient has at least one full week of session data.
2. Call `POST /users/{id}/summary/{weekOf}/send`.
3. Open the email in a mail client → download the PDF.
4. Verify the PDF contains: week date range, completion rate, exercise
   list with counts, form quality score, missed days.
5. Open `GET /users/{id}/summary/{weekOf}` → confirm `pdfUrl` returns
   a pre-signed URL that opens the same PDF.

**Pass criteria:** PDF generates within 60 s; content matches API response;
URL expires after 24 h (verify with a stale URL).

---

### Manual-09 — App store build validation (G-06)

| Platform | Tool | Required status |
|---|---|---|
| iOS | App Store Connect → TestFlight | Processing → Ready to Submit |
| Android | Google Play Console → Internal Testing | Published |

**Checks:**
- App binary size ≤ 80 MB (with ML model bundled).
- Minimum OS version enforced: iOS 16+, Android 10+.
- Privacy manifest / permission strings accurate.
- App Store screenshots match the current build UI.

---

### Manual-10 — On-call alert and runbook (G-07)

**Steps:**
1. Trigger a PagerDuty test alert:
   ```bash
   curl -s -X POST https://events.pagerduty.com/v2/enqueue \
     -H 'Content-Type: application/json' \
     -d '{
       "routing_key": "'"$PAGERDUTY_SERVICE_KEY"'",
       "event_action": "trigger",
       "payload": {
         "summary": "Pre-launch test alert — PT Adherence",
         "severity": "info",
         "source": "qa-checklist.sh"
       }
     }'
   ```
2. Confirm the on-call engineer receives and acknowledges within 5 minutes.
3. Review alert rules in monitoring dashboards:
   - Session write failure rate > 1 % for 5 min → PagerDuty page.
   - Email delivery failure (weekly summary job) → PagerDuty page.
   - API p95 latency > 1 s for 5 min → PagerDuty page.
4. Confirm the runbook link in PagerDuty is accessible and up to date.

**Pass criteria:** Alert acknowledged within SLA; all three rules active.

---

## Release gate summary

| Gate | Auto test | Manual test | P-level |
|---|---|---|---|
| G-01 Session logging E2E | Auto-02, Auto-03 | Manual-01, Manual-02 | P0 |
| G-02 Plan renders correctly | Auto-02 §Plan | Manual-03 | P0 |
| G-03 Zero P0/P1 bugs | Auto-07 | — | P0 |
| G-04 Load test at 500 VUs | Auto-11 | — | P0 |
| G-05 PHI scrub | Auto-08 | Spot-check events | P0 |
| G-06 App store builds | Auto-01 (artefact check) | Manual-09 | P0 |
| G-07 On-call alerts live | Auto-12 | Manual-10 | P0 |
| P1-01 JWT refresh hardened | Auto-10 | — | P1 |
| P1-02 Offline sync | — | Manual-05 | P1 |
| P1-03 Summary PDF | Auto-09 | Manual-08 | P1 |
| P1-04 Background retry | — | Kill worker mid-job, observe retry | P1 |
| P1-05 HTTPS + HSTS | Auto-12 | — | P1 |

---

## Running automated tests in CI

Add the following steps to your CI workflow (GitHub Actions example):

```yaml
- name: Release readiness check
  run: python3 scripts/check_release_readiness.py --no-color

- name: API schema tests
  run: node scripts/test-api-schemas.js

- name: OpenAPI lint
  run: npx --yes @redocly/cli lint docs/openapi.yaml

- name: Smoke test (staging)
  env:
    API_BASE_URL: https://staging.ptadherence.app/v1
  run: bash scripts/smoke-test.sh
```

All steps must exit 0 before any release candidate tag is pushed.
