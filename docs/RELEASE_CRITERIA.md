# Release Criteria

**Version:** MVP 1.0
**Updated:** 2026-03-02
**Owner:** Orion (AI agent) — reviewed by engineering lead before sign-off

Launch is **BLOCKED** until every P0 criterion is verified PASS.
P1 items are strongly recommended before ship; P2 items are post-launch.

---

## Quick Commands

```bash
# Smoke-test local server (requires server running on :3000)
bash scripts/smoke-test.sh

# Smoke-test staging
API_BASE_URL=https://staging.ptadherence.app/v1 bash scripts/smoke-test.sh

# Interactive go/no-go checklist (run before every release)
bash scripts/qa-checklist.sh

# Print criteria without prompts (CI-friendly)
bash scripts/qa-checklist.sh --non-interactive

# Validate a single analytics event payload (zero deps, Node.js ≥ 16)
node scripts/validate-event.js path/to/event.json
echo '{"event":"user_registered","userId":null,"sessionId":null,"timestamp":"2026-03-02T10:00:00Z","platform":"ios","appVersion":"1.0.0","properties":{"method":"email"}}' \
  | node scripts/validate-event.js

# List all known event names
node scripts/validate-event.js --help
```

---

## P0 — Launch Blockers (all must be PASS)

### G-01 — Session logging end-to-end on iOS and Android

**Verify:**
```bash
# Automated smoke test covers the happy path
bash scripts/smoke-test.sh

# Manual: on physical iOS 16+ and Android 10+ device
# start session → log 1 exercise (3 sets) → complete → confirm streak increments
```

**Pass criteria:** Smoke test exits 0; manual test shows completion in dashboard.

---

### G-02 — Rehab plan renders correctly for all template plans

**Verify:**
```bash
# Check plan endpoint returns all required fields
bash scripts/smoke-test.sh   # section [4/7] Plan must PASS

# Or manually
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE_URL/users/$USER_ID/plan" | jq '.plan | {id,name,exercises: (.exercises | length)}'
```

**Pass criteria:** Response includes `id`, `name`, `createdAt`, and at least one exercise with `id`, `name`, `sets`, `reps`, `restSeconds`, `videoUrl`, `instructions`.

---

### G-03 — No P0/P1 open bugs in production build

**Verify:**
```bash
# GitHub CLI
gh issue list --label p0 --state open --json number,title
gh issue list --label p1 --state open --json number,title

# Both commands must return an empty array: []
```

**Pass criteria:** Zero issues labeled `p0` or `p1` with state `open` against the production build tag.

---

### G-04 — Load test at 500 concurrent users

**Verify:**
```bash
# Requires k6 (https://k6.io) — brew install k6
k6 run load-tests/session-flow.js \
  --vus 500 \
  --duration 60s \
  -e API_BASE_URL=https://staging.ptadherence.app/v1

# Acceptable thresholds (set in load-tests/session-flow.js):
#   http_req_duration p(95) < 500ms   (session write SLA)
#   http_req_failed rate < 1%
```

**Pass criteria:** k6 summary shows all thresholds green; p95 session write latency ≤ 500 ms.

---

### G-05 — PHI scrub audit

**Verify:**
```bash
# 1. Confirm no PHI fields appear in application logs
grep -rE '"injuryType"|"surgeryDate"|"email"' logs/ \
  | grep -v '\.example\.' \
  | grep -v 'smoke.*test' \
  && echo "PHI FOUND — FAIL" || echo "CLEAN"

# 2. Confirm analytics events contain no PHI
# Pull a sample of 100 events from your warehouse or Segment debugger
# and run each through the validator — it only validates schema, not content,
# so also manually spot-check for PII strings (names, emails, DOB).

# 3. Run the validator on your event fixtures
for f in test/fixtures/events/*.json; do
  node scripts/validate-event.js "$f" || echo "Schema violation in $f"
done
```

**Pass criteria:** No PHI strings in logs; no `email`, `name`, or `surgeryDate` values in events table; BAA signed with all third-party vendors.

---

### G-06 — App store builds approved

**Verify (manual):**

| Platform | Location | Required status |
|---|---|---|
| iOS | App Store Connect → TestFlight → Build | Processing → Ready to Submit |
| Android | Google Play Console → Internal Testing | Published |

Minimum OS versions confirmed: iOS 16+, Android 10+.
App size ≤ 80 MB (with model bundled).

---

### G-07 — On-call runbook and PagerDuty alerts live

**Verify:**
```bash
# 1. Trigger a PagerDuty test alert and confirm it routes to the on-call engineer
# PagerDuty API (replace SERVICE_KEY with your integration key)
curl -s -X POST https://events.pagerduty.com/v2/enqueue \
  -H 'Content-Type: application/json' \
  -d '{
    "routing_key": "'"$PAGERDUTY_SERVICE_KEY"'",
    "event_action": "trigger",
    "payload": {
      "summary": "Smoke-test alert — PT Adherence pre-launch check",
      "severity": "info",
      "source": "qa-checklist.sh"
    }
  }' | jq .

# 2. Confirm the following alert rules exist in PagerDuty / CloudWatch / Grafana:
#   - Session write failure rate > 1% for 5 min
#   - Email delivery failure (weekly summary job)
#   - API p95 latency > 1 s for 5 min
```

**Pass criteria:** Test alert received and acknowledged within 5 minutes; all three alert rules active.

---

## P1 — Strongly Recommended Before Ship

| # | Item | Verify |
|---|---|---|
| P1-01 | JWT refresh race condition hardened | Integration test: two concurrent refresh calls → only one succeeds |
| P1-02 | Offline session data cached and synced on reconnect | Airplane mode test: log session, restore network, confirm sync |
| P1-03 | Weekly summary PDF generates correctly | `GET /users/{id}/summary/{weekOf}` → `pdfUrl` opens valid PDF |
| P1-04 | Background job queue retries correctly | Kill worker mid-job; confirm retry within 60 s |
| P1-05 | HTTPS enforced + HSTS header | `curl -I https://api.ptadherence.app/v1/health \| grep Strict-Transport` |

---

## P2 — Post-Launch (Week 1)

```bash
# Monitor D1 retention daily (Segment / warehouse query)
# SELECT count(distinct userId) FROM events
#   WHERE event = 'user_logged_in'
#   AND DATE(timestamp) = CURRENT_DATE - 1

# Flag onboarding drop-off > 40% at any step
# SELECT step, count(*) FROM events WHERE event = 'onboarding_dropped' GROUP BY step

# Flag false-positive form feedback rate
# SELECT feedbackType, avg(formScore) FROM events
#   WHERE event = 'form_feedback_shown' GROUP BY feedbackType
```

---

## Validation Tooling Reference

| Tool | Command | Purpose |
|---|---|---|
| `scripts/smoke-test.sh` | `bash scripts/smoke-test.sh` | API health + session flow |
| `scripts/qa-checklist.sh` | `bash scripts/qa-checklist.sh` | Interactive G-01…G-07 sign-off |
| `scripts/validate-event.js` | `node scripts/validate-event.js <file>` | Analytics event schema check |
| `docs/openapi.yaml` | `npx @redocly/cli lint docs/openapi.yaml` | OpenAPI spec lint |
| `schemas/events.schema.json` | `npx ajv validate -s schemas/events.schema.json -d <file>` | JSON Schema validation |
