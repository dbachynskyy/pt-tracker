# CI Quality Gates — CV Detector

**Owner:** Orion (AI agent) — reviewed by engineering lead before sign-off
**Updated:** 2026-03-03
**Scope:** Helios CV module — `apps/mobile/src/cv/`
**Workflow:** `.github/workflows/ci.yml` → `cv-quality-gate` job

---

## Overview

Every pull request targeting `main` runs the full CV detector test matrix through the
`cv-quality-gate` CI job. The job enforces three hard thresholds. If any threshold is
violated the job exits non-zero, blocking the PR merge. Diagnostics artifacts are
uploaded on every run — pass or fail — so failures can be triaged without re-running CI.

---

## Hard Thresholds

| ID | Threshold | Required | Measured by |
|---|---|---|---|
| **ACCURACY_FLOOR** | Scenario pass rate | 100% (all describe-blocks must pass) | `scripts/cv-generate-artifacts.js` |
| **FALSE_POSITIVE_CAP** | False-positive guard test failures | 0 failures | Tests whose title contains `"does NOT flag"`, `"NOT flagged"`, `"good form"`, etc. |
| **LOCKOUT_CORRECTNESS** | Anti-cheat block pass rate | 100% | Describe-blocks matching `velocity ceiling`, `debounce window`, `warmup gate`, `occlusion gating`, `session continuity` |

### Threshold rationale

**ACCURACY_FLOOR (100%)** — The CV module drives clinical rep counting. A single
failing describe-block means at least one exercise scenario produces incorrect results
for real patients. There is no acceptable partial-pass rate.

**FALSE_POSITIVE_CAP (0 failures)** — Tests that assert the system does *not* flag
clean, correct reps protect against regressions that would wrongly penalise patients
performing exercises correctly. A single false-positive regression is a patient safety
issue.

**LOCKOUT_CORRECTNESS (100%)** — Anti-cheat guards (velocity ceiling, debounce window,
warmup gate, occlusion gating, session continuity) prevent rep inflation. If any of
these fail, the integrity of session data used for clinical decision-making is
compromised.

---

## Artifacts

Three artifacts are written to `./artifacts/` and uploaded as
`cv-quality-gate-<run_id>` on every run (pass or fail). Retention: 30 days.

### `summary.json`

Machine-readable gate verdict. Top-level fields:

```jsonc
{
  "timestamp": "2026-03-03T00:00:00.000Z",
  "gate": "PASS" | "FAIL",
  "thresholds": {
    "ACCURACY_FLOOR":      { "required": "100%", "status": "PASS" | "FAIL" },
    "FALSE_POSITIVE_CAP":  { "required": "0 failures", "status": "PASS" | "FAIL" },
    "LOCKOUT_CORRECTNESS": { "required": "100%", "status": "PASS" | "FAIL" }
  },
  "metrics": {
    "totalScenarios": 40,  "passedScenarios": 40, "failedScenarios": 0,
    "totalTests":     81,  "passedTests":     81,  "failedTests":     0
  },
  "violations": [],          // populated when gate = FAIL
  "scenarios": [...]         // per-describe-block status array
}
```

Use `summary.json` in downstream automation (e.g. release dashboard, Slack alerts).

### `junit.xml`

JUnit-format XML. One `<testsuite>` per test file; one `<testcase>` per test.
Failed tests contain a `<failure message="..."/>` child element.

Import into GitHub Checks, Datadog CI Visibility, or any JUnit-compatible CI tool.

### `quality-report.md`

Human-readable markdown report. Contains:
- Gate verdict + per-threshold status table
- Full scenario matrix (file, describe-block, PASS/FAIL, test count)
- Violation detail and triage steps (only on FAIL)

---

## Branch Protection Setup

1. Go to **Settings → Branches → Branch protection rules** on the pt-orion GitHub repo.
2. Add a rule for `main` with:
   - ✅ **Require status checks to pass before merging**
   - Required check name: `CV detector quality gate`
     *(this is the `name:` field of the `cv-quality-gate` job)*
   - ✅ **Require branches to be up to date before merging**
3. Click **Save changes**.

After the first CI run on a PR, the check name will appear in the autocomplete
dropdown of the status checks field.

### Repository variables and secrets required

| Name | Type | Value |
|---|---|---|
| `HELIOS_REPO` | Variable | `your-org/pt-helios` (GitHub repo slug) |
| `HELIOS_REF` | Variable | `feat/helios-cv` (branch to check out) |
| `HELIOS_GITHUB_TOKEN` | Secret | PAT with `repo:read` scope on pt-helios |

Set via **Settings → Secrets and variables → Actions**.

---

## Failure Triage

### Step 1 — Download artifacts

In the failed CI run:
1. Click the **Summary** tab of the GitHub Actions run.
2. Scroll to **Artifacts** → download `cv-quality-gate-<run_id>`.
3. Unzip to get `summary.json`, `junit.xml`, `quality-report.md`.

### Step 2 — Identify failing threshold

Open `quality-report.md` and look at the **Threshold Enforcement** table.

```
| Threshold           | Required    | Status   | Detail                          |
|---------------------|-------------|----------|---------------------------------|
| ACCURACY_FLOOR      | 100%        | ❌ FAIL  | 1 failing describe-block: "..." |
| FALSE_POSITIVE_CAP  | 0 failures  | ✅ PASS  | —                               |
| LOCKOUT_CORRECTNESS | 100%        | ✅ PASS  | —                               |
```

### Step 3 — Find the failing tests in junit.xml

```bash
# Quick triage: find all failure elements
grep -A2 '<failure' artifacts/junit.xml

# Count failures by suite
grep 'failures=' artifacts/junit.xml | grep -v 'failures="0"'
```

Example output:
```xml
<testcase name="plank > good form (3 × 1 500 ms) > should count 3 reps" time="0.012">
  <failure message="Expected 3, received 2"/>
</testcase>
```

### Step 4 — Check summary.json violations array

```bash
node -e "
  const s = JSON.parse(require('fs').readFileSync('artifacts/summary.json','utf8'));
  console.log(JSON.stringify(s.violations, null, 2));
"
```

### Step 5 — Reproduce locally

```bash
# From pt-orion root (requires pt-helios alongside)
bash scripts/run-cv-matrix.sh

# Verbose Jest output for a specific file
cd /path/to/pt-helios/apps/mobile
npx jest --testPathPattern="plank" --verbose
```

---

## Common Failure Scenarios

### ACCURACY_FLOOR fails — one describe-block regresses

**Symptom:** `summary.json` → `metrics.failedScenarios > 0`

**Fix workflow:**
1. Note the failing describe-block name from `quality-report.md` Scenario Matrix.
2. Run the specific test file locally in pt-helios:
   ```bash
   cd apps/mobile && npx jest --testPathPattern="<exercise>" --verbose
   ```
3. Fix the regression in the Helios CV module.
4. Push to the Helios branch; pt-orion CI will re-run automatically on the next PR update.

### FALSE_POSITIVE_CAP fails — "good form" or "NOT flagged" test fails

**Symptom:** `violations[].threshold === "FALSE_POSITIVE_CAP"`

**Likely cause:** A form-flag threshold was tightened or an angle calculation changed,
causing false flags on geometrically clean pose sequences.

**Fix workflow:**
1. Identify the failing test from `violations[].detail` (includes test title).
2. Check recent changes to exercise plugin constants (`LOWER_BACK_ROUNDING_TOL_DEG`,
   `ASYMMETRIC_HIPS_Y_TOL`, etc.) in pt-helios.
3. Restore the constant or fix the angle computation.
4. Run `npx jest --testPathPattern="<exercise>" --verbose` to confirm clean.

### LOCKOUT_CORRECTNESS fails — anti-cheat regression

**Symptom:** `violations[].threshold === "LOCKOUT_CORRECTNESS"`

**Likely cause:** A change to `RepCounter` constants (`WARMUP_FRAME_COUNT`,
`VELOCITY_CEIL_MS`, `DEBOUNCE_MS`) or session-continuity logic.

**Fix workflow:**
1. Identify the failing block from `violations[].detail`.
2. Check `ANTI_CHEAT` object in `repCounter.ts` for changed constants.
3. Restore anti-cheat constants or fix the regression.
4. All anti-cheat blocks in `repCounter.test.ts` must pass before re-pushing.

---

## Relationship to CV_QUALITY_GATE.md

`docs/CV_QUALITY_GATE.md` documents the *clinical acceptance criteria* for each
exercise (human-readable scenarios and thresholds). This document (`ci-quality-gates.md`)
documents the *CI enforcement mechanism* — how those criteria are checked automatically
on every PR and what to do when they fail.

Both documents must be kept in sync when new exercises or thresholds are added.
