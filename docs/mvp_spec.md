# PT Adherence MVP — Product Spec

**Version:** 0.1 | **Status:** In Development | **Date:** 2026-03-02

---

## Problem

~65% of patients prescribed home PT fail to complete their program. Key barriers: no real-time feedback on form, low motivation without accountability, and friction in logging sessions.

## Goal

Ship a focused MVP that measurably improves completion and consistency for home rehab exercises. Target: ≥70% weekly exercise completion rate among active users in the first 30 days.

---

## Users

| Persona | Description |
|---|---|
| **Patient** | Post-injury/surgery adult doing home PT. Primary actor. |
| **PT Clinician** | Assigns plans, reviews weekly summaries. Read-only in MVP. |

---

## Scope

### In MVP

| # | Feature | Priority |
|---|---|---|
| 1 | Onboarding — collect injury context, assign template plan | P0 |
| 2 | Rehab plan — view assigned exercises with reps/sets/instructions | P0 |
| 3 | Session tracking — log completion of each exercise per session | P0 |
| 4 | Form feedback — basic rep count and motion quality signal (phone camera) | P1 |
| 5 | Streak & adherence dashboard — daily/weekly view | P1 |
| 6 | Weekly summary export — PDF emailed to patient + PT | P2 |

### Out of Scope (MVP)

- Live video coaching
- Insurance/EMR integration
- Multi-clinician accounts
- Wearable device integration
- Real-time clinician alerts

---

## User Flows

### Onboarding
1. Patient creates account (email + password)
2. Enters injury type, surgery date (optional), mobility constraints
3. Assigned a template plan; can be edited by PT later
4. Prompted to enable camera permission for form detection

### Daily Session
1. Open app → Today's session shown (exercises + sets/reps)
2. Tap "Start" on exercise → camera activates
3. System counts reps and flags poor form (posture deviation)
4. On completion: log saved, next exercise shown
5. Session ends → streak updated, progress bar refreshed

### Weekly Summary
- Auto-generated every Monday 08:00 local time
- Shows: completion %, exercises done, missed days, form quality score
- PDF emailed; viewable in app

---

## Success Metrics

| Metric | Target (30-day) |
|---|---|
| D7 retention | ≥ 55% |
| Weekly exercise completion rate | ≥ 70% |
| Session logging latency | < 500 ms p95 |
| Form feedback latency | < 2 s p95 |
| Weekly summary delivery success | ≥ 99% |

---

## Tech Assumptions

- Mobile: React Native (iOS + Android)
- Backend: Node.js / Fastify, PostgreSQL, Redis (session cache)
- ML: on-device pose estimation (MediaPipe or TFLite)
- Auth: JWT with refresh tokens
- Email: Resend or SendGrid
- Storage: S3-compatible for session artifacts
