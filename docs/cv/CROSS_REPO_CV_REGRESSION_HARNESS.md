# Cross-Repo CV Regression Harness (Real Camera CV, 10 Exercises)

This harness validates for each of the 10 PT exercises:
1. **Selector exposure** (Atlas)
2. **Analyzer routing** (Helios app wiring)
3. **Minimum test coverage signal** (Helios CV tests)

## Commands

```bash
# CI-safe fixture mode (no external creds / sibling checkout required)
bash scripts/run-cross-repo-cv-regression-harness.sh fixtures

# Strict live mode (uses local sibling repos)
ATLAS_DIR=/tmp/pt-atlas HELIOS_DIR=/tmp/pt-helios \
  bash scripts/run-cross-repo-cv-regression-harness.sh live

# Auto mode: tries live, falls back to fixtures with explicit blocker note
bash scripts/run-cross-repo-cv-regression-harness.sh auto
```

## Artifacts

- `artifacts/cross-repo-cv-regression.json`
- `artifacts/cross-repo-cv-regression.md`

## Exit codes

- `0` PASS
- `1` FAIL (one or more exercise checks failed)
- `2` BLOCKED (live mode and required repos/contracts/tests missing)

## Blocker taxonomy

- `MISSING_REPO` — required repository path missing
- `MISSING_CONTRACT` — required contract file/folder missing
- `MISSING_SELECTOR_EXPOSURE` — exercise missing from Atlas selector exposure set
- `MISSING_ANALYZER_ROUTING` — exercise missing from Helios analyzer routing source
- `MISSING_TEST_SIGNAL` — exercise missing minimum test coverage signal

## Fallback options

- In CI: use `fixtures` mode for deterministic no-creds checks.
- In release-candidate validation: use `live` mode with explicit `ATLAS_DIR` and `HELIOS_DIR`.
- In mixed environments: use `auto` and fail only if strict live gating is required by release policy.


## Evidence fields in JSON artifact

Each result row includes:

- `evidence.selectorExposure[]`
- `evidence.analyzerRouting[]`
- `evidence.minimumTestCoverageSignal[]`

Each evidence item has:
- `file`
- `line`
- `pattern`
- `snippet`

This is used to audit why a check passed (or why evidence is missing).

## Parser unit test

```bash
node scripts/__tests__/cross-repo-harness-parser.test.js
```
