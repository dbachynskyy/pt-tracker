# Test Fixtures — CV Rep-Tracking

This directory holds synthetic pose-landmark JSON files used by unit and
integration tests. No real video is stored here.

---

## File Format

Each fixture is a JSON array of `PoseFrame` objects (33 landmarks):

```jsonc
// fixtures/squat_good_form_5reps.json
[
  // frame 0 — standing (UP phase)
  [
    { "x": 0.50, "y": 0.42, "z": -0.05, "visibility": 0.99 }, // landmark 0
    // ... 32 more landmarks
  ],
  // frame 1 …
]
```

---

## Planned Fixtures

### Squat

| File | Description | Expected reps | Expected flags |
|------|-------------|---------------|----------------|
| `squat_good_form_5reps.json` | Clean 5-rep set, full depth, ~1.5 s/rep | 5 | none |
| `squat_partial_depth_3reps.json` | Knees only reach ~110° | 3 | `INSUFFICIENT_DEPTH` each |
| `squat_asymmetric_hips.json` | L/R knee angle delta > 15° | 3 | `ASYMMETRIC_HIPS` each |
| `squat_too_fast_5reps.json` | All reps < 400 ms (jitter simulation) | 0 | `TOO_FAST` → discarded |
| `squat_occlusion_mid_set.json` | Landmarks drop below 0.5 visibility frames 20–25 | 4 | `OCCLUSION` |
| `squat_double_count_attempt.json` | Phase jitter near UP threshold; debounce test | 3 | — |

### Pushup

| File | Description | Expected reps | Expected flags |
|------|-------------|---------------|----------------|
| `pushup_good_form_5reps.json` | Clean 5-rep set, elbows to 90°, hips neutral | 5 | none |
| `pushup_hip_sag_3reps.json` | Hip-shoulder-ankle angle > 195° | 3 | `LOWER_BACK_ROUNDING` |
| `pushup_elbow_flare_3reps.json` | L/R elbow asymmetry > 45° | 3 | `ELBOW_FLARE` |
| `pushup_partial_rom_5reps.json` | Elbows only reach 120° | 5 | `PARTIAL_ROM` each |
| `pushup_too_fast_5reps.json` | All reps < 400 ms | 0 | `TOO_FAST` → discarded |

### Anti-Cheat Edge Cases

| File | Description | Asserts |
|------|-------------|---------|
| `anticheat_warmup_skip.json` | Valid rep in first 10 frames | rep NOT counted |
| `anticheat_session_gap.json` | > 10 s gap with no frames | session auto-paused |
| `anticheat_phase_lock.json` | Two consecutive UP detections without DOWN | second UP discarded |
| `anticheat_low_confidence.json` | Model confidence < 0.6 for 6 frames | counting suspended |

---

## Generating Fixtures

Fixtures are generated offline by `scripts/generate_fixtures.ts` (TODO),
which replays pre-labelled body-tracking CSV exports through the MediaPipe
WASM model and serialises the landmark stream to JSON.

Until that script exists, hand-craft minimal fixtures by:
1. Choose 2–3 key frames per phase (UP → DOWN → UP).
2. Set landmark positions that produce the desired joint angles.
3. Set `visibility: 0.99` for all required landmarks unless testing occlusion.

---

## Running Tests

```bash
# From repo root
pnpm --filter mobile test cv
```

Tests live alongside source in `apps/mobile/src/cv/__tests__/`.
