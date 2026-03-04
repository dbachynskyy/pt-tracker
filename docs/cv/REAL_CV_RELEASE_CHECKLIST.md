# Real CV Release Checklist

- [ ] REAL_CV_REQUIRED gate passes (`scripts/check-real-cv-default.sh`).
- [ ] CV matrix gate passes (`scripts/run-cv-matrix.sh`).
- [ ] `EXERCISE_COVERAGE` PASS for all 10 required exercises.
- [ ] Calibration protocol executed on iOS + Android reference devices.
- [ ] No open P0/P1 CV defects.
- [ ] Failure diagnostics artifact reviewed for last 3 CI runs.
- [ ] Release criteria (`docs/RELEASE_CRITERIA.md`) all P0 PASS.
