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

# Release gate (strict, requires live mode and 10/10 pass)
ATLAS_DIR=/tmp/pt-atlas HELIOS_DIR=/tmp/pt-helios \
  bash scripts/run-cross-repo-cv-regression-harness.sh live --strict-gate

# Auto mode: tries live, falls back to fixtures with explicit blocker note
bash scripts/run-cross-repo-cv-regression-harness.sh auto

# Optional: ingest Atlas/Helios readiness reasons and trend against previous summary
ATLAS_READINESS_FILE=schemas/cv/native-readiness.atlas.fixture.json \
HELIOS_READINESS_FILE=schemas/cv/native-readiness.helios.fixture.json \
  bash scripts/run-cross-repo-cv-regression-harness.sh live
```

## Artifacts

- `artifacts/cross-repo-cv-regression.json`
- `artifacts/cross-repo-cv-regression.md`
- `artifacts/cross-repo-cv-regression-summary.json`
- `artifacts/cross-repo-cv-regression-summary.md`

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


## CI usage (exact command)

```bash
bash scripts/run-cross-repo-cv-regression-harness.sh fixtures
```

## Release gate usage (exact command)

```bash
ATLAS_DIR=/tmp/pt-atlas HELIOS_DIR=/tmp/pt-helios \
  bash scripts/run-cross-repo-cv-regression-harness.sh live --strict-gate
```

## Trend-friendly summary fields

`cross-repo-cv-regression-summary.json` includes:
- `generatedAt`
- `atlas_git_sha`
- `helios_git_sha`
- `pass_count`
- `blocked_count`
- strict-gate status fields
- readiness columns per exercise (`atlasReadiness`, `atlasReadinessReason`, `heliosReadiness`, `heliosReadinessReason`)
- `failFast.categories[]` with camera/auth/credits blocker classes and fallback suggestions
- `trend` with `pass_delta`, `fail_delta`, `blocked_delta`, status-change flags


## Optional inputs

- `--atlas-readiness-file <path>`: optional Atlas readiness reasons (array/object format).
- `--helios-readiness-file <path>`: optional Helios readiness reasons (array/object format).
- `--previous-summary <path>`: summary JSON used for trend diff (defaults to the same output summary path).


## Native readiness ingestion

Pass optional readiness outputs from Atlas/Helios:

```bash
ATLAS_READINESS_FILE=schemas/cv/native-readiness.atlas.fixture.json \
HELIOS_READINESS_FILE=schemas/cv/native-readiness.helios.fixture.json \
bash scripts/run-cross-repo-cv-regression-harness.sh fixtures
```

Readiness fields are included per exercise in `readiness_matrix`:
- `atlasReadiness`, `atlasReadinessReason`
- `heliosReadiness`, `heliosReadinessReason`

## Fail-fast classification

Summary includes fail-fast categories:
- `CAMERA_BLOCKER`
- `AUTH_BLOCKER`
- `CREDITS_BLOCKER`

Each category includes exact fallback suggestions.

## Trend diff

Summary tracks deltas vs previous summary artifact:
- `trend.pass_delta`
- `trend.fail_delta`
- `trend.blocked_delta`
- status change flags


## Manual CI workflow (live strict gate)

Workflow: `.github/workflows/cross-repo-live-strict-gate.yml`

Run from Actions → **Cross-Repo Live Strict Gate** with `workflow_dispatch` inputs:
- `atlas_dir`
- `helios_dir`
- `atlas_readiness_file`
- `helios_readiness_file`
- `previous_summary_artifact` (optional)

Policy enforcement:
- Run fails on `FAIL_FAST`
- Run fails on `AUTH_BLOCKER`
- Run fails on `CREDITS_BLOCKER`
- Run fails on strict gate non-pass statuses (`FAIL/BLOCKED/NOT_LIVE`)

Published artifacts:
- full: `cross-repo-cv-regression.{json,md}`
- summary: `cross-repo-cv-regression-summary.{json,md}`
- trend diff: `cross-repo-cv-regression-trend.{json,md}`


## Strict-mode readiness requirements

In `live --strict-gate`, the harness now fails if:
- Atlas readiness artifact is absent or unparseable
- Helios readiness artifact is absent or unparseable
- Any of the 10 canonical exercises is missing from either readiness artifact

New blocker codes:
- `MISSING_READINESS_ARTIFACT`
- `UNPARSEABLE_READINESS_ARTIFACT`
- `MISSING_READINESS_EXERCISE`

Each blocker in summary JSON includes a `fallback` suggestion.


## RealCV rollout gate wrapper

```bash
ATLAS_DIR=/tmp/pt-atlas HELIOS_DIR=/tmp/pt-helios \
ATLAS_READINESS_FILE=schemas/cv/native-readiness.atlas.fixture.json \
HELIOS_READINESS_FILE=schemas/cv/native-readiness.helios.fixture.json \
bash scripts/run-realcv-rollout-gate.sh
```

Outputs:
- `artifacts/cross-repo-cv-regression-summary.json`
- `artifacts/realcv-rollout-status.json`

`realcv-rollout-status.json` fields:
- `exercise_coverage`
- `blockers`
- `tests_passed`
- `next_actions`

Fallback behavior:
- Missing readiness file -> `MISSING_READINESS_ARTIFACT` + fallback action in status
- Unparseable readiness file -> `UNPARSEABLE_READINESS_ARTIFACT` + fallback action
- Missing canonical readiness entries -> `MISSING_READINESS_EXERCISE` + regenerate readiness outputs


## Master readiness truth source

Build unified master readiness from Atlas + Helios + Orion summary:

```bash
node scripts/build-realcv-master-readiness.js   atlas.native-readiness.v1.json   artifacts/helios.native-readiness.v1.json   artifacts/cross-repo-cv-regression-summary.json   artifacts/realcv-master-readiness.json
```

Output sections:
- `exercise_coverage`
- `lane_status` (`atlas` / `helios` / `orion`)
- `blockers`
- `tests_passed`
- `next_actions`
- `generated_at`

Fallback behavior:
- Unparseable input JSON -> `UNPARSEABLE_*` blocker with lane-specific fix guidance.
- Partial exercise coverage (<10) -> `PARTIAL_*_COVERAGE` blocker with backfill guidance.
