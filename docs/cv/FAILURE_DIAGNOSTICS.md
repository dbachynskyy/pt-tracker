# CV Failure Diagnostics

Use after a failed matrix run.

```bash
node scripts/cv-diagnose-failures.js jest-cv-results.local.json
```

Classifier buckets:
- `false-positive`: clean-form / NOT-flag regressions
- `lockout`: anti-cheat or gating regressions
- `calibration`: angle/landmark sensitivity regressions
- `functional`: remaining analyzer behavior issues

## Triage flow

1. Read `artifacts/summary.json` violations.
2. Run diagnostics script and group by bucket.
3. Reproduce failing test file in Helios with `npx jest --testPathPattern="<exercise>" --verbose`.
4. Validate calibration assumptions (camera plane, jitter, landmark visibility).
5. Re-run `bash scripts/run-cv-matrix.sh`.
