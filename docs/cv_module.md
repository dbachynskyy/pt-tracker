# CV / Rep-Tracking Module Spec

## Overview

The computer-vision rep-tracking module uses the device camera and a pose-estimation
model (MediaPipe Pose or BlazePose WASM) to count exercise repetitions and flag form
deviations in real time. It runs entirely on-device — no video is sent to a server.

---

## Architecture

```
Camera Feed (MediaPipe)
       │
       ▼
  PoseLandmarks (33 keypoints, world + image coords)
       │
       ▼
  ExerciseAnalyzer (per-exercise plugin)
  ├── jointAngleCalc()      — compute hinge angles from landmarks
  ├── phaseDetector()       — classify DOWN / TRANSITION / UP phases
  ├── repCounter()          — increment when full phase cycle complete
  └── formChecker()         — emit FormEvent[] per frame
       │
       ▼
  RepSession (accumulates reps, timing, form events)
       │
       ▼
  UI overlay + haptic feedback
```

---

## Core Types

```typescript
/** Normalized 3-D landmark from MediaPipe (x, y, z ∈ [0,1], z depth-relative). */
interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number; // 0–1
}

type PoseFrame = Landmark[]; // 33 landmarks, indices per MediaPipe spec

type ExercisePhase = "UP" | "DOWN" | "TRANSITION" | "IDLE";

interface RepEvent {
  repIndex: number;       // 1-based
  durationMs: number;     // time for this rep
  phase: ExercisePhase;
  formScore: number;      // 0–100
  flags: FormFlag[];
}

type FormFlag =
  | "KNEES_CAVING"
  | "INSUFFICIENT_DEPTH"
  | "ASYMMETRIC_HIPS"
  | "ELBOW_FLARE"
  | "LOWER_BACK_ROUNDING"
  | "PARTIAL_ROM"
  | "TOO_FAST"
  | "TOO_SLOW"
  | "OCCLUSION";          // landmark visibility < threshold

interface RepSession {
  exerciseId: string;
  targetReps: number;
  completedReps: number;
  events: RepEvent[];
  startedAt: number;      // epoch ms
  endedAt?: number;
}
```

---

## Exercise Plugin Interface

Each exercise must implement `ExerciseAnalyzer`:

```typescript
interface ExerciseAnalyzer {
  readonly exerciseId: string;
  readonly requiredLandmarks: number[]; // MediaPipe indices

  /** Called once per camera frame (~30 fps). */
  processFrame(frame: PoseFrame, sessionMs: number): RepEvent | null;

  /** Reset internal state between sets. */
  reset(): void;
}
```

---

## Anti-Cheat Heuristics Checklist

These heuristics guard against inadvertent OR deliberate inflation of rep counts.

### Kinematic Sanity

- [ ] **Minimum range-of-motion gate** — require joint angle to cross both a HIGH threshold
      and a LOW threshold within the same rep; no rep counted if ROM is < 60% of target arc.
- [ ] **Phase-lock sequencing** — only accept UP → DOWN → UP cycles; two consecutive "UP"
      detections without a "DOWN" in between discards the duplicate.
- [ ] **Velocity ceiling** — flag reps completed in < 400 ms (physically implausible for
      most rehab movements); do not count toward session total until therapist review.
- [ ] **Minimum rep duration floor** — discard reps shorter than exercise-specific minimum
      (e.g., squat < 800 ms, pushup < 600 ms).
- [ ] **Bilateral symmetry check** — if left/right joint angle asymmetry > 15°, flag
      `ASYMMETRIC_HIPS` / `ELBOW_FLARE` and reduce form score; still count the rep.

### Visibility & Occlusion

- [ ] **Landmark visibility gate** — if any required landmark drops below `visibility < 0.5`
      for > 3 consecutive frames, pause counting and emit `OCCLUSION` flag.
- [ ] **Camera angle guard** — if the sagittal-plane projection ratio falls outside expected
      range, warn user to reposition camera; do not count until corrected.
- [ ] **Full-body-in-frame check** — verify bounding box of required landmarks occupies
      20–90% of frame height; reject frames outside this range.

### Temporal Consistency

- [ ] **Debounce window** — enforce a minimum 500 ms inter-rep gap to prevent double-counts
      on noisy landmark jitter near phase transition thresholds.
- [ ] **Session continuity** — if a gap of > 10 s with no valid frames is detected, auto-pause
      the session rather than accumulating stale state.
- [ ] **Monotonic rep clock** — rep timestamps must be strictly increasing; reject any
      synthesized or replayed frame sequences.

### Model Confidence

- [ ] **Low-confidence lockout** — if pose model confidence < 0.6 for > 5 frames, emit
      `LOW_CONFIDENCE` system event and suspend rep counting.
- [ ] **Warmup frames** — discard first 10 frames of a session to allow model stabilization.

### Audit Trail

- [ ] **Per-rep landmark snapshot** — store a hashed, compact (10-keypoint) snapshot for
      each counted rep to enable async backend audit.
- [ ] **Form-score floor for counting** — reps with formScore < 40 are flagged for therapist
      review and annotated in the session summary; counted but visually distinguished.
- [ ] **Session summary integrity hash** — compute HMAC-SHA256 over (userId, sessionId,
      repEvents[]) so the summary cannot be silently edited client-side before sync.

---

## Supported Exercises (MVP)

| ID        | Plugin file               | Key joints                        |
|-----------|---------------------------|-----------------------------------|
| `squat`   | `exercises/squat.ts`      | hip, knee, ankle angles           |
| `pushup`  | `exercises/pushup.ts`     | elbow, shoulder, hip angles       |

---

## Testing Strategy

See `apps/mobile/src/cv/__tests__/` for:

- **Unit tests** — `repCounter.test.ts`: mock frame sequences → assert rep counts.
- **Exercise fixtures** — `fixtures/README.md`: describes landmark JSON files that
  simulate good-form and bad-form reps (generated offline from recorded videos).
- **Anti-cheat unit tests** — one test per heuristic in the checklist above.
- **Integration smoke test** — `session.integration.test.ts`: full session lifecycle
  with synthetic pose stream.

---

## Calibration + Stabilization (Helios v2)

A pre-count calibration phase now runs before rep counting starts (via `StabilizedRepCounter`).
It estimates a per-user baseline and verifies minimum observed movement range before enabling counting.

Recommended minimum calibration ranges (default `minRangeByExercise`):

- `squat`: **35°** knee-angle span
- `pushup`: **30°** elbow-angle span
- `sit_to_stand`: **35°** knee-angle span
- `lunge`: **30°** knee-angle span
- `calf_raise`: **0.03** ankle-foot vertical delta
- `glute_bridge`: **0.03** hip-height delta (normalized Y)
- `shoulder_abduction`: **25°** arm-abduction span
- `heel_raise`: **0.03** ankle-foot vertical delta
- `knee_extension`: **35°** knee-angle span
- `plank_hold`: **8°** alignment-angle span

Stabilization policy:

- Temporal smoothing should be enabled in the adapter (EMA default, optional moving window).
- If frame source becomes `disconnected`, counting is paused.
- Resume requires `occlusionRecoveryFrames` consecutive clear (`real`) frames before forwarding frames to rep counting.

Fallback guidance:

- If calibration fails (`REJECTED`), keep session in prep mode and prompt guided setup:
  - "Move through one full comfortable rep"
  - "Step back so full body is visible"
  - "Increase lighting / reduce occlusion"
- If native CV provider is unavailable, inject a mock provider and keep source as `disconnected` to safely avoid false counts.

## Runtime Exercise ID Contract (Selector + CV)

Runtime selector/mapping now supports and normalizes the full 10-exercise contract:

- squat
- pushup
- sit_to_stand
- lunge
- calf_raise
- glute_bridge
- shoulder_abduction
- heel_raise
- knee_extension
- plank_hold

Compatibility rule: legacy incoming id `plank` is normalized to `plank_hold` before analyzer selection.

## Readiness Failure Aggregation (Orion Harness)

Added helper module: `apps/mobile/src/cv/readinessReport.ts`

- `aggregateReadinessFailures(snapshots)`
  - Aggregates readiness failure reasons across session snapshots, grouped by exercise.
  - Tracks canonical reasons (`NO_SIGNAL`, `INSUFFICIENT_ROM`) and any future custom reasons.
- `renderReadinessFailureReportJson(snapshots)`
  - Produces stable JSON for downstream tooling.
- `writeOrionReadinessArtifact(path, snapshots)`
  - Writes a harness-consumable artifact with schema version `orion.readiness.v1`.

Artifact shape highlights:

- `schemaVersion`
- `generatedAt`
- `totals` (`sessions`, `exercisesObserved`, `failures`)
- `byExercise[exerciseId].failures`
- `byExercise[exerciseId].reasons[reason]`

### Automatic emission in end-of-session pipeline

`SessionScreen` now wires `ReadinessArtifactPipeline.endSession(...)` at session end.
If `ORION_READINESS_ARTIFACT_PATH` is set, the Orion JSON artifact is written automatically.
Regardless of path availability, an in-memory session snapshot is always added to the batch aggregator.

## Orion Quality Gate Fields (`orion.readiness.v1`)

Per exercise, artifact now includes a `quality` block:

- `sample_count` — number of confidence samples observed.
- `confidence_p50` — median confidence over observed frames.
- `confidence_p90` — p90 confidence over observed frames.
- `rep_signal_present` — true if any rep/hold signal was emitted.
- `status_reason` — terminal readiness status/reason (`READY`, `NO_SIGNAL`, `INSUFFICIENT_ROM`, etc.).
- `gate_pass` — deterministic gate verdict.
- `gate_fail_reasons[]` — machine-readable fail reasons.

Current acceptance thresholds for gate pass:

- `sample_count > 0`
- `confidence_p50 > 0`
- `confidence_p90 > 0`
- `rep_signal_present = true`
- `status_reason = READY`

Validator enforces:

- all 10 canonical exercises present,
- each exercise has required quality fields,
- schema version is `orion.readiness.v1`.

### Threshold profile config

Canonical quality-gate thresholds are defined in:
`apps/mobile/src/cv/readinessThresholds.ts`

Artifact field `threshold_profile_version` is emitted in every `orion.readiness.v1` report.
Validator enforces both:
- complete 10-exercise threshold coverage,
- complete 10-exercise artifact quality payload.
