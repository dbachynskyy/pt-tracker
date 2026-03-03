# MVP Acceptance Report

**Product:** PT Adherence MVP
**Version:** <!-- e.g. v1.0.0 -->
**Report date:** <!-- YYYY-MM-DD -->
**Prepared by:** <!-- Engineer name / role -->
**Reviewed by:** <!-- Engineering lead / PM -->
**Status:** <!-- PASS · CONDITIONAL PASS · FAIL -->

---

## 1. Executive summary

<!-- 3–5 sentences. State overall launch decision, list any open conditions,
     and identify who must sign off before the binary decision is finalised. -->

---

## 2. Release gate results (P0)

All P0 gates must be PASS for an unconditional launch. Any FAIL blocks release.

| Gate | Description | Result | Evidence |
|---|---|---|---|
| G-01 | Session logging E2E (iOS + Android) | <!-- PASS / FAIL / SKIP --> | <!-- Link to run or screenshot --> |
| G-02 | Rehab plan renders for all template plans | <!-- PASS / FAIL / SKIP --> | |
| G-03 | Zero open P0/P1 bugs in production build | <!-- PASS / FAIL / SKIP --> | `gh issue list` output |
| G-04 | Load test — 500 VUs, p95 < 500 ms | <!-- PASS / FAIL / SKIP --> | k6 summary link |
| G-05 | PHI scrub audit | <!-- PASS / FAIL / SKIP --> | Audit log link |
| G-06 | App store builds approved (iOS + Android) | <!-- PASS / FAIL / SKIP --> | App Store Connect / Play Console links |
| G-07 | On-call runbook + PagerDuty alerts live | <!-- PASS / FAIL / SKIP --> | Alert rule screenshots |

**P0 gate summary:** <!-- X / 7 PASS -->

---

## 3. P1 recommendations

Items marked FAIL here are strongly recommended fixes; they do not block release
but must have a documented mitigation or scheduled follow-up.

| Item | Description | Result | Mitigation / follow-up |
|---|---|---|---|
| P1-01 | JWT refresh race condition hardened | <!-- PASS / FAIL --> | |
| P1-02 | Offline session cache + sync | <!-- PASS / FAIL --> | |
| P1-03 | Weekly summary PDF correct | <!-- PASS / FAIL --> | |
| P1-04 | Background job retry logic | <!-- PASS / FAIL --> | |
| P1-05 | HTTPS + HSTS enforced | <!-- PASS / FAIL --> | |

**P1 summary:** <!-- X / 5 PASS -->

---

## 4. Automated test results

| Test suite | Command | Result | Notes |
|---|---|---|---|
| Release artefact check | `python3 scripts/check_release_readiness.py` | <!-- PASS / FAIL --> | |
| API smoke test | `bash scripts/smoke-test.sh` | <!-- PASS / FAIL --> | |
| JSON schema validation | `node scripts/test-api-schemas.js` | <!-- PASS / FAIL --> | |
| OpenAPI lint | `npx @redocly/cli lint docs/openapi.yaml` | <!-- PASS / FAIL --> | |
| Analytics event validation | `node scripts/validate-event.js` (fixtures) | <!-- PASS / FAIL --> | |
| ShellCheck | `shellcheck scripts/*.sh` | <!-- PASS / FAIL --> | |
| CI workflow run | GitHub Actions `ci-gate` | <!-- PASS / FAIL --> | Link to run |
| Release-readiness workflow | GitHub Actions `release-readiness.yml` | <!-- PASS / FAIL --> | Link to run |

---

## 5. Manual test summary

| Test | Tester | Device / OS | Result | Notes |
|---|---|---|---|---|
| Onboarding flow — new user registration | | | <!-- PASS / FAIL --> | |
| Rehab plan display — all template plans | | | <!-- PASS / FAIL --> | |
| Session start → exercise log → complete | | iOS <!-- version --> | <!-- PASS / FAIL --> | |
| Session start → exercise log → complete | | Android <!-- version --> | <!-- PASS / FAIL --> | |
| Streak increments after session completion | | | <!-- PASS / FAIL --> | |
| CV mock-mode rep counting (squat, push-up) | | | <!-- PASS / FAIL --> | |
| Weekly summary email received | | | <!-- PASS / FAIL --> | |
| Offline session → reconnect → sync | | | <!-- PASS / FAIL --> | |
| App launch cold-start latency < 3 s | | | <!-- PASS / FAIL --> | |

---

## 6. Performance summary

| Metric | Target | Measured | Source |
|---|---|---|---|
| Session write latency p95 | < 500 ms | <!-- ms --> | k6 run |
| Form feedback latency p95 (mock mode) | < 2 s | <!-- ms --> | Manual timing |
| Weekly summary delivery success rate | ≥ 99 % | <!-- % --> | SES / Mailtrap metrics |
| App cold-start time | < 3 s | <!-- s --> | Manual |

---

## 7. Open issues at time of report

List any known bugs, regressions, or risks that are open at the time of writing
this report. For each item state severity and the decision made.

| # | Title | Severity | Decision | Owner |
|---|---|---|---|---|
| | | | <!-- Ship with known issue / Fix before launch / Block launch --> | |

---

## 8. ADR compliance

Confirm that the shipped build conforms to accepted architectural decisions.

| ADR | Decision | Compliant? | Notes |
|---|---|---|---|
| ADR-0001 | In-memory storage | <!-- Yes / No --> | |
| ADR-0002 | CV simulation mode | <!-- Yes / No --> | |
| ADR-0003 | JWT + sha256_crypt auth | <!-- Yes / No --> | |

---

## 9. Sign-off

| Role | Name | Signature / date | Decision |
|---|---|---|---|
| Engineering lead | | | <!-- Approve / Conditional / Block --> |
| Product manager | | | <!-- Approve / Conditional / Block --> |
| QA lead | | | <!-- Approve / Conditional / Block --> |
| Clinical advisor (if applicable) | | | <!-- Approve / N/A --> |

---

## 10. Post-launch checklist (first 48 hours)

- [ ] Error rate < 1 % in Sentry (production project)
- [ ] No P0 alerts fired in PagerDuty
- [ ] D1 retention data available in analytics warehouse
- [ ] Weekly summary job ran successfully for first cohort
- [ ] App store ratings / reviews monitored
- [ ] Rollback procedure confirmed ready if needed
