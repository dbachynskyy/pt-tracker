# PT Adherence MVP

MVP for home rehab adherence with form-aware exercise tracking and adaptive coaching.

## Goal
Build a focused MVP that improves completion and consistency for rehab exercises done at home.

## Initial Scope
- User onboarding + simple rehab plan
- Session tracking for a small set of movements
- Basic form/repetition feedback
- Streaks + adherence dashboard
- Exportable weekly summary

---

## Executable Guardrails

### Smoke Test
Exercises API health and the full session flow (register → onboard → plan → session → complete → adherence).

```bash
# Local server (default: http://localhost:3000/v1)
bash scripts/smoke-test.sh

# Against staging
API_BASE_URL=https://staging.ptadherence.app/v1 bash scripts/smoke-test.sh
```

Requires: `curl`, `jq` (`brew install jq`)

### Go/No-Go QA Checklist
Walks through the 7 P0 launch criteria interactively and prints a signed-off report.

```bash
# Interactive (prompts for each criterion)
bash scripts/qa-checklist.sh

# Print criteria only (CI-friendly, no prompts)
bash scripts/qa-checklist.sh --non-interactive
```

Exit codes: `0` = all pass · `1` = one or more FAIL (launch blocked) · `2` = skips present

### Event Validator
Validates an analytics/audit event JSON against the envelope and per-event property rules.
Zero external dependencies — requires Node.js ≥ 16.

```bash
# Validate a file
node scripts/validate-event.js path/to/event.json

# Validate from stdin
echo '{
  "event": "user_registered",
  "userId": null,
  "sessionId": null,
  "timestamp": "2026-03-02T10:00:00Z",
  "platform": "ios",
  "appVersion": "1.0.0",
  "properties": { "method": "email" }
}' | node scripts/validate-event.js

# List all 25 known event names
node scripts/validate-event.js --help
```

### OpenAPI Spec
Full OpenAPI 3.0.3 specification covering all v1 routes.

```bash
# Lint the spec (requires @redocly/cli)
npx @redocly/cli lint docs/openapi.yaml

# Preview interactive docs
npx @redocly/cli preview-docs docs/openapi.yaml
```

### JSON Schema (Events)
Reference schema for all analytics events. Compatible with ajv and most JSON Schema tooling.

```bash
# Validate with ajv (npm install -g ajv-cli)
npx ajv validate -s schemas/events.schema.json -d path/to/event.json
```

---

## Documentation

| File | Purpose |
|---|---|
| `docs/mvp_spec.md` | Product specification and success metrics |
| `docs/api_contract.md` | Human-readable API contract (source of truth for `openapi.yaml`) |
| `docs/openapi.yaml` | Machine-readable OpenAPI 3.0.3 spec |
| `docs/events_schema.md` | Analytics event catalogue (source of truth for `schemas/events.schema.json`) |
| `docs/launch_checklist.md` | Full pre-launch checklist |
| `docs/RELEASE_CRITERIA.md` | P0 go/no-go criteria with exact verification commands |
| `docs/risk_register.md` | Risk register with mitigations |
| `schemas/events.schema.json` | JSON Schema draft-07 for all analytics events |



### CV Matrix + Diagnostics
Run full CV gates, emit artifacts, and print categorized failure diagnostics on regressions:

```bash
bash scripts/run-cv-matrix.sh
node scripts/cv-diagnose-failures.js jest-cv-results.local.json
```

See `docs/cv/` for 10-exercise acceptance gates, calibration protocol, merge plan, and release checklist.


### Atlas+Helios Integration Validation Pack

```bash
# CI-ready (no external creds): fixture-based parity smoke
bash scripts/run-atlas-helios-smoke-matrix.sh fixtures

# Live parity check (fails on missing contracts/paths with blocker report)
ATLAS_DIR=/tmp/pt-atlas HELIOS_DIR=/tmp/pt-helios   node scripts/check-atlas-helios-exercise-parity.js --mode live
```

Artifacts:
- `artifacts/atlas-helios-parity.json`
- `artifacts/atlas-helios-parity.md`


### Cross-Repo CV Regression Harness

```bash
# CI-safe
bash scripts/run-cross-repo-cv-regression-harness.sh fixtures

# Live strict mode
ATLAS_DIR=/tmp/pt-atlas HELIOS_DIR=/tmp/pt-helios \
  bash scripts/run-cross-repo-cv-regression-harness.sh live
```

See `docs/cv/CROSS_REPO_CV_REGRESSION_HARNESS.md` for blocker taxonomy and fallback options.
