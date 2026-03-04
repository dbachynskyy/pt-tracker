# Merge Plan — atlas + helios integration (safe path)

## Objective
Integrate Atlas exercise definitions with Helios analyzer outputs without regressing real-CV safety gates.

## Strategy

1. **Contract freeze**
   - Lock shared exercise IDs and enum names.
   - Add mapping table (atlas exercise ID -> helios analyzer ID).

2. **Compatibility layer**
   - Introduce translation adapter in integration branch.
   - Reject unknown exercise IDs at runtime (hard error, not silent fallback).

3. **Dual-run validation**
   - For 1 release candidate, run old mapping + new mapping in shadow mode.
   - Compare rep counts/form flags; alert if delta > configured tolerance.

4. **Gate sequencing**
   - Merge Atlas schema updates first.
   - Merge Helios analyzer updates second.
   - Enable adapter flag last after CI + staging pass.

5. **Rollback plan**
   - Feature flag `CV_MAPPING_V2` default OFF.
   - Single-command rollback by flipping flag to OFF.

## Required checks before final merge

- CI `cv-quality-gate` PASS (including EXERCISE_COVERAGE).
- Staging smoke sessions for all 10 exercises PASS.
- No mismatch in atlas<->helios ID mapping table.
- `artifacts/summary.json` attached to merge PR.
