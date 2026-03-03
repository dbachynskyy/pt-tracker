/**
 * Mock CV detectors for plank and sit-to-stand (plus squat/pushup stubs).
 *
 * These drive Atlas UI integration points while Helios builds real detectors.
 * Swap createMockDetector() calls for real detector factories once ready.
 */

import {
  ConfidenceFlag,
  Detector,
  DetectorOutput,
  ExerciseType,
  HOLD_EXERCISES,
  RepResult,
} from './types';

const TICK_MS = 500;
/** Emit a new rep every N ticks (every 2 s at 500 ms/tick). */
const REP_EVERY_TICKS = 4;
/** Confidence ramps up over the first few ticks. */
const CONFIDENCE_RAMP_TICKS = 5;

function calcConfidence(ticks: number): number {
  return Math.min(1, ticks / CONFIDENCE_RAMP_TICKS);
}

function calcFormScore(reps: RepResult[]): number {
  if (reps.length === 0) return 100;
  return Math.round(reps.reduce((s, r) => s + r.formScore, 0) / reps.length);
}

function collectFlags(ticks: number, reps: RepResult[]): ConfidenceFlag[] {
  const flags = new Set<ConfidenceFlag>();
  if (ticks < CONFIDENCE_RAMP_TICKS) flags.add('LOW_CONFIDENCE');
  for (const r of reps) {
    for (const f of r.flags) flags.add(f);
  }
  return Array.from(flags);
}

/**
 * Create a mock detector for any ExerciseType.
 *
 * - Rep exercises (squat, pushup, sit_to_stand): emits a rep every 2 s.
 * - Hold exercises (plank): emits hold-time updates; repCount stays 0.
 */
export function createMockDetector(exerciseType: ExerciseType): Detector {
  let timerId: ReturnType<typeof setInterval> | null = null;
  let ticks = 0;
  let reps: RepResult[] = [];
  let startMs = 0;

  function buildOutput(): DetectorOutput {
    return {
      exerciseType,
      repCount: reps.length,
      formScore: calcFormScore(reps),
      confidence: calcConfidence(ticks),
      flags: collectFlags(ticks, reps),
      reps: [...reps],
      elapsedMs: Date.now() - startMs,
    };
  }

  function tick(onFrame: (o: DetectorOutput) => void) {
    ticks += 1;
    const isHold = HOLD_EXERCISES.has(exerciseType);
    if (!isHold && ticks % REP_EVERY_TICKS === 0) {
      // Occasionally inject a partial-ROM flag for realistic variation.
      const repFlags: ConfidenceFlag[] =
        Math.random() < 0.25 ? ['PARTIAL_ROM'] : [];
      reps.push({
        repNumber: reps.length + 1,
        formScore: 75 + Math.floor(Math.random() * 25),
        durationMs: REP_EVERY_TICKS * TICK_MS,
        flags: repFlags,
      });
    }
    onFrame(buildOutput());
  }

  return {
    exerciseType,

    start(onFrame) {
      if (timerId != null) return; // idempotent
      startMs = Date.now();
      timerId = setInterval(() => tick(onFrame), TICK_MS);
    },

    stop() {
      if (timerId != null) {
        clearInterval(timerId);
        timerId = null;
      }
    },

    reset() {
      this.stop();
      ticks = 0;
      reps = [];
      startMs = 0;
    },
  };
}

/** Detector registry — replace entries with real detector factories. */
export const detectorRegistry: Record<
  ExerciseType,
  (type: ExerciseType) => Detector
> = {
  squat: createMockDetector,
  pushup: createMockDetector,
  plank: createMockDetector,
  sit_to_stand: createMockDetector,
};

export function createDetector(exerciseType: ExerciseType): Detector {
  return detectorRegistry[exerciseType](exerciseType);
}
