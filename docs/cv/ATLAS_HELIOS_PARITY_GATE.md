# Atlas+Helios Exercise-ID Parity Gate

Ensures Atlas exercise-id contract matches Helios analyzer `exerciseId` list at **10/10**.

## Commands

```bash
# Live gate (strict): parses Atlas + Helios from local sibling repos
ATLAS_DIR=/tmp/pt-atlas HELIOS_DIR=/tmp/pt-helios   node scripts/check-atlas-helios-exercise-parity.js --mode live

# Fixture smoke (CI-ready, no external creds)
bash scripts/run-atlas-helios-smoke-matrix.sh fixtures
```

## What the gate checks

1. Atlas ID set == Helios ID set
2. Both sets match `schemas/cv/exercise-parity-target.json`
3. Required count is exactly 10

## Reports

- `artifacts/atlas-helios-parity.json`
- `artifacts/atlas-helios-parity.md`

## Blockers

In `--mode live`, missing paths/contracts return **exit 2** and include exact blockers:
- missing `ATLAS_DIR` / `HELIOS_DIR`
- missing Atlas contract files (`TODO_EXERCISES.md` and/or plan types)
- missing Helios exercises directory
- zero IDs parsed from either side
