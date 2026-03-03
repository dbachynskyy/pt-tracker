# Risk Register

**Version:** 0.1 | **Date:** 2026-03-02
**Legend — Likelihood:** L=Low, M=Medium, H=High | **Impact:** L=Low, M=Medium, H=High

---

## Technical Risks

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| T-01 | On-device pose model accuracy poor for target exercises | M | H | Benchmark MediaPipe vs TFLite on 5 key movements pre-launch; set minimum form score threshold with graceful fallback (manual rep count) | ML Lead |
| T-02 | Camera latency degrades on low-end Android devices | M | M | Test on Android mid-range (Snapdragon 6xx) in CI; cap frame rate, reduce model precision if needed | Mobile Lead |
| T-03 | Backend cold start latency under session-start load | L | M | Use persistent DB connection pool; Redis for session state; load test at 500 concurrent users before launch | Backend Lead |
| T-04 | PDF generation fails or delays weekly email | L | M | Async queue (BullMQ); retry x3; fallback to in-app view with send-later | Backend Lead |
| T-05 | JWT refresh race condition logs users out mid-session | M | H | Implement proactive refresh 60s before expiry; queue requests during refresh | Mobile Lead |

---

## Product / UX Risks

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| P-01 | Onboarding friction causes high drop-off before first session | H | H | Keep onboarding ≤ 3 screens; defer non-critical fields to profile; track `onboarding_dropped` by step | Product |
| P-02 | Form feedback false positives cause patient frustration | M | H | Conservative thresholds at launch (flag only >30% deviation); add "Dismiss / Report" option; review weekly false-positive rate | ML Lead |
| P-03 | Streak gamification feels punitive after a missed day | M | M | Grace period: 1 missed day per week doesn't break streak; communicate clearly in UI | Product |
| P-04 | Patients don't engage with weekly summary email | M | M | A/B test subject lines; include one actionable recommendation; track open + click rate | Product |

---

## Regulatory / Compliance Risks

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R-01 | HIPAA compliance gap (PHI in logs or analytics) | M | H | PII/PHI scrubbed from all analytics events; logs retention ≤ 90 days; BAA with vendors that touch PHI | Eng Lead |
| R-02 | App classified as SaMD (Software as a Medical Device) by FDA | L | H | Scope MVP to wellness/coaching only; no diagnostic claims in copy; legal review before launch | CEO / Legal |
| R-03 | GDPR right-to-deletion not implemented | M | M | Build `DELETE /users/{userId}` cascade in backend; document data map before launch | Backend Lead |

---

## Operational Risks

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| O-01 | No on-call rotation at launch causing silent outages | M | H | PagerDuty integration; P1 alert on session write failure and email delivery failure; runbook written pre-launch | Eng Lead |
| O-02 | Third-party email provider outage | L | M | Queue emails with retry; secondary provider config documented | Backend Lead |
| O-03 | App store rejection delays launch | M | M | Submit for review 2 weeks before target launch; use internal TestFlight/Play Internal track for beta | Mobile Lead |

---

## Risk Summary

| Severity | Count |
|---|---|
| High Impact | 6 |
| Medium Impact | 7 |
| Low Impact | 1 |

**Top 3 priorities to resolve before launch:** T-01, P-01, R-01
