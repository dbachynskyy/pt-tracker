# CV Calibration Protocol (Real-CV)

## Goal
Ensure camera setup and pose quality are stable before counting reps.

## Pre-session calibration (required)

1. Camera at movement plane (sagittal for squat/STS/lunge, frontal for shoulderAbduction).
2. Full body in frame; key landmarks visible for 3 seconds.
3. Lighting check: no silhouette/backlight.
4. Distance check: shoulders + hips + ankles fit with margin.
5. Run 5-second dry-run; verify no persistent occlusion warnings.

## Calibration acceptance

- Landmark visibility >= 95% over first 150 frames.
- Occlusion streak >3 frames must be < 2 occurrences in dry-run.
- Angle jitter (standing still) p95 < 4° for monitored joints.

## Re-calibration triggers

- camera moved,
- sudden lighting change,
- repeated false flags in first set,
- session continuity auto-pause due to tracking loss.

## Evidence
Attach calibration summary to release candidate note:
- device model
- exercise profile
- visibility %, jitter p95, occlusion count
