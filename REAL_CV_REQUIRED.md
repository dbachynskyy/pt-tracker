# REAL_CV_REQUIRED Acceptance Checklist

**Purpose:** Prevent shipping/operator sign-off when CV is running in mock/simulation mode by default.

## Gate policy

- **Hard stop:** any default that enables mock/simulation CV mode is a release blocker.
- **Required state:** production/default CV source must be **real/live**.

## Automated gate (CI)

- Workflow: `.github/workflows/ci.yml` → `cv-quality-gate`
- Step: **Enforce REAL_CV_REQUIRED gate**
- Command:

```bash
bash scripts/check-real-cv-default.sh pt-helios
```

This step must pass before CV quality metrics are considered.

## Operator acceptance checklist

Mark each item **PASS** before release approval.

- [ ] **Default CV mode OFF for mock toggle**
      Confirm `apps/mobile/src/screens/SessionScreen.tsx` does **not** default `mockMode` to `true`.
- [ ] **No mock/simulation fallback defaults** in production mobile config.
- [ ] **CI REAL_CV_REQUIRED gate passed** in the current candidate run.
- [ ] **Manual smoke (device):** launch session without toggling anything; verify live camera/CV path is used.
- [ ] **Evidence captured:** attach CI link + screenshot/log of live CV session to release ticket.

## Local verification

From `pt-orion` root:

```bash
# if pt-helios is in /tmp/pt-helios
HELIOS_DIR=/tmp/pt-helios bash scripts/check-real-cv-default.sh
```

Exit codes:

- `0` PASS (real CV required by default)
- `1` FAIL (mock/sim default detected)
- `2` ERROR (missing Helios path/files)
