# ADR-0002 — CV Simulation Boundaries

**Status:** Accepted
**Date:** 2026-03-02
**Deciders:** Orion (AI agent), Engineering lead

---

## Context

The MVP includes a computer-vision (CV) feature that uses the phone camera to
count exercise reps and signal form quality in real time (MVP spec feature F4,
priority P1).

Shipping a production-quality on-device ML pipeline in an MVP introduces
significant risk:

- On-device ML (MediaPipe, CoreML) requires device testing across a wide range
  of hardware, OS versions, and lighting conditions.
- False positives/negatives in form feedback could undermine user trust or,
  worse, encourage unsafe movement patterns in patients recovering from injury.
- Integration with live camera frames adds latency, battery drain, and
  permission-handling complexity.

We need to decide how much of the CV pipeline to build for MVP versus
simulate.

---

## Decision

**The MVP CV feature runs in a mock/simulation mode by default.**

Specifically:

1. **RepCounter engine** (`apps/mobile/src/cv/repCounter.ts`) is implemented
   in full, including the phase state machine (UP → SEEKING_DOWN → DOWN → UP),
   anti-cheat checks, form scoring (0–100), and rep flagging.
2. **Exercise plugins** for squats and push-ups
   (`apps/mobile/src/cv/exercises/{squat,pushup}.ts`) are implemented in full.
3. **Pose data source is mocked.** A `mockSimulation.ts` driver replays
   pre-computed pose landmark sequences via `setInterval`, replacing the live
   MediaPipe Pose stream. The session screen exposes a toggle to switch between
   mock and live mode.
4. **Live MediaPipe integration is deferred to post-MVP.** The `ExerciseAnalyzer`
   interface is defined and documented; the live adapter will implement it
   without touching the core engine.

---

## Rationale

### Why simulate pose data at MVP?

- **Decouples correctness from hardware.** The rep-counting logic can be fully
  unit-tested with deterministic pose fixtures, giving high confidence before
  any device is involved.
- **Eliminates a class of ship-blockers.** Camera permission flows, MediaPipe
  WASM loading, and device-specific frame rates are each potential release
  blockers. Mock mode removes them from the MVP critical path.
- **Allows clinical feedback on the UX pattern.** Clinicians and beta users
  can evaluate whether real-time rep feedback is actually useful — the most
  important hypothesis — without betting on ML accuracy simultaneously.
- **Keeps the test surface small.** 35 unit tests cover the engine end-to-end
  in < 1 s with zero native dependencies. A live camera pipeline would require
  manual device testing on every change.

### Why implement the full engine (not just a stub)?

- The engine is the riskiest and most novel part of the CV feature. Building
  and testing it now means the post-MVP live integration is a data-source swap,
  not a logic rewrite.
- Unit tests give us a regression safety net for the state machine, anti-cheat
  constants, and form-score formula.

---

## Boundaries

| Component | MVP status | Post-MVP |
|---|---|---|
| `RepCounter` state machine | **Implemented, tested** | No change needed |
| Exercise plugins (squat, push-up) | **Implemented, tested** | Add more exercises |
| `mockSimulation.ts` driver | **Implemented** | Replaced by live adapter |
| `ExerciseAnalyzer` interface | **Defined** | Implemented by live adapter |
| MediaPipe Pose integration | **Deferred** | Live adapter implements this |
| Camera permission flow | **Deferred** | Handled in live adapter setup |
| On-device model bundling | **Deferred** | Part of live adapter |
| Anti-cheat (velocity, partial ROM) | **Implemented in engine** | No change needed |

---

## Consequences

### Accepted trade-offs

| Trade-off | Mitigation |
|---|---|
| Mock mode does not reflect real user behaviour (lighting, body variation, camera angle). | Explicit UI label "Simulation Mode" so users are not misled. Beta users know it is not production CV. |
| Form feedback is deterministic in mock, which may give false confidence in the engine. | Engine is tested with adversarial fixtures (partial ROM, bouncing, rapid cadence). |
| Post-MVP live integration requires device testing from scratch. | `ExerciseAnalyzer` interface is designed to be easy to swap; mock driver documents expected data shape. |

### Migration path (post-MVP)

1. Implement `LiveExerciseAnalyzer` that wraps MediaPipe Pose in an
   `ExerciseAnalyzer` adapter.
2. Wire live camera frames into `RepCounter` via the same `onFrame` callback
   the mock driver uses.
3. Run the same unit test suite against recorded real frame sequences to verify
   the engine behaves correctly on non-simulated data.
4. Remove the mock-mode toggle from the production build.

---

## Alternatives considered

| Option | Rejected because |
|---|---|
| **Full live MediaPipe at MVP** | Too many simultaneous unknowns (device compat, model accuracy, latency); high risk of MVP slip. |
| **Full stub (no engine logic)** | Defers the hardest engineering work; post-MVP live integration becomes a full rewrite with no test coverage. |
| **Server-side CV (video upload + inference)** | Adds 2–10 s latency; requires significant backend infrastructure; incompatible with real-time rep counting UX. |
