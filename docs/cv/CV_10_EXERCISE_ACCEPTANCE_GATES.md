# CV Acceptance Gates — 10 Exercise Rollout

Owner: Orion QA integration

Release is blocked unless **all 10 exercises** have passing scenario coverage in CI.

## Required exercises

1. squat
2. pushup
3. plank
4. sitToStand
5. lunge
6. bridge
7. clamshell
8. heelRaise
9. shoulderAbduction
10. birdDog

Gate is enforced by `scripts/cv-generate-artifacts.js` using `schemas/cv/exercise-gates.json`.

## Acceptance rule

- Every required exercise must appear in Jest CV output via analyzer alias match.
- Every scenario under that exercise must pass.
- Any missing exercise or failing scenario => `EXERCISE_COVERAGE` fail.

## Operator command

```bash
bash scripts/run-cv-matrix.sh
cat artifacts/summary.json | jq '.thresholds, .coverage'
```

PASS only when:
- `thresholds.EXERCISE_COVERAGE.status == "PASS"`
- `coverage.missingExercises == []`
- `coverage.failingExercises == []`
