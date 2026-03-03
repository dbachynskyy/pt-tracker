# Launch Checklist

**Target Launch:** TBD | **Last Updated:** 2026-03-02

Track each item: `[ ]` = open · `[x]` = done · `[~]` = blocked

---

## 1. Product Completeness

- [ ] Onboarding flow (3 screens) complete and QA'd on iOS + Android
- [ ] Rehab plan view renders all exercise fields (sets, reps, video, instructions)
- [ ] Session logging: start → exercise → set logging → complete flow works end-to-end
- [ ] Form feedback: pose model integrated, rep counter functional, feedback UI shown
- [ ] Streak logic correct after missed days (grace period applied)
- [ ] Adherence dashboard shows daily/weekly completion rates
- [ ] Weekly summary PDF generates correctly with all fields
- [ ] Weekly summary email sends and renders in Gmail, Apple Mail, Outlook

---

## 2. API & Backend

- [ ] All v1 endpoints implemented and returning correct shapes (validated against `api_contract.md`)
- [ ] Auth: register, login, refresh, JWT expiry all tested
- [ ] Session write latency < 500 ms p95 under load test (500 concurrent)
- [ ] `DELETE /users/{userId}` cascade tested (GDPR)
- [ ] Background job queue (weekly summaries) monitored and retrying correctly
- [ ] Database migrations tested on staging; rollback script ready
- [ ] S3 pre-signed URL expiry set to 24 h and verified

---

## 3. Analytics & Observability

- [ ] All events in `events_schema.md` firing in production with correct envelope
- [ ] Dashboard shows: D7 retention, completion rate, onboarding funnel
- [ ] Sentry (or equivalent) capturing mobile + backend errors
- [ ] PagerDuty alerts configured: session write failure, email delivery failure, API p95 > 1 s
- [ ] On-call runbook written and shared
- [ ] Logs retention policy set to ≤ 90 days; no PHI in logs confirmed

---

## 4. Security & Compliance

- [ ] PHI scrub audit: no patient data in analytics events or application logs
- [ ] BAA signed with all vendors that may touch PHI (email, storage, error tracking)
- [ ] HTTPS enforced on all endpoints; HSTS header set
- [ ] Rate limiting active on auth endpoints (login, register, refresh)
- [ ] Secrets in environment variables only; no secrets in codebase or CI logs
- [ ] Legal review completed: no diagnostic claims in app copy
- [ ] Privacy policy and terms of service live on website

---

## 5. Mobile

- [ ] iOS app submitted to App Store (target: 2 weeks before launch)
- [ ] Android app submitted to Google Play (target: 2 weeks before launch)
- [ ] Minimum OS versions confirmed: iOS 16+, Android 10+
- [ ] Camera permission UX tested: granted, denied, and "ask again" flows
- [ ] Offline grace: session data cached and synced on reconnect
- [ ] App size ≤ 80 MB (with model bundled)
- [ ] TestFlight / Play Internal Track beta tested with ≥ 10 real users

---

## 6. Data & Infrastructure

- [ ] Production database backups configured (daily, 30-day retention)
- [ ] Staging environment mirrors production schema
- [ ] Horizontal scaling tested: backend scales to 2 replicas under load
- [ ] CDN configured for exercise video assets
- [ ] Feature flags set up for form feedback kill-switch post-launch

---

## 7. Go / No-Go Criteria

All P0 items must pass. Launch is blocked if any of these fail.

| # | Criterion | Status |
|---|---|---|
| G-01 | Session logging end-to-end works on iOS and Android | [ ] |
| G-02 | Rehab plan renders correctly for all template plans | [ ] |
| G-03 | No P0/P1 open bugs in production build | [ ] |
| G-04 | Load test passed at 500 concurrent users | [ ] |
| G-05 | PHI scrub audit passed | [ ] |
| G-06 | App store builds approved | [ ] |
| G-07 | On-call runbook and alerts live | [ ] |

---

## 8. Post-Launch (Week 1)

- [ ] Monitor D1 retention daily
- [ ] Review `onboarding_dropped` by step — fix friction if > 40% drop at any step
- [ ] Review false-positive form feedback rate — adjust thresholds if needed
- [ ] Confirm weekly summary emails delivered Sunday night / Monday morning
- [ ] 30-day retention and completion rate review scheduled
