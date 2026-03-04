import { getFrameSource } from './frameSource';
import { getLandmarkAdapter, nullLandmarkAdapter } from './landmarkAdapter';
import { stepForExercise } from './exerciseAnalyzers';
import { emitCvEvent } from './instrumentation';
import { ConfidenceFlag, Detector, DetectorOutput, ExerciseType, RepResult } from './types';

const TICK_MS = 300;
const METRICS_WINDOW_FRAMES = 10;

function calcFormScore(reps: RepResult[], fallback = 100): number {
  if (!reps.length) return fallback;
  return Math.round(reps.reduce((s, r) => s + r.formScore, 0) / reps.length);
}

function output(exerciseType: ExerciseType, reps: RepResult[], confidence: number, elapsedMs: number, flags: ConfidenceFlag[], formScoreFallback = 100): DetectorOutput {
  return {
    exerciseType,
    repCount: reps.length,
    formScore: calcFormScore(reps, formScoreFallback),
    confidence,
    flags,
    reps: [...reps],
    elapsedMs,
  };
}

export function isMockCvEnabled(): boolean {
  return false;
}

export function createDetector(exerciseType: ExerciseType): Detector {
  let timer: ReturnType<typeof setInterval> | null = null;
  let reps: RepResult[] = [];
  let startedMs = 0;
  let phase: 'up' | 'down' = 'up';

  let windowFrames = 0;
  let windowDisconnected = 0;
  let windowConfidence = 0;
  let windowStartMs = 0;

  function trackMetrics(confidence: number, disconnected: boolean) {
    windowFrames += 1;
    windowConfidence += confidence;
    if (disconnected) windowDisconnected += 1;

    if (windowFrames >= METRICS_WINDOW_FRAMES) {
      const elapsed = Math.max(1, Date.now() - windowStartMs);
      const fps = Number(((windowFrames * 1000) / elapsed).toFixed(2));
      const avgConfidence = Number((windowConfidence / windowFrames).toFixed(3));
      const disconnectRate = Number((windowDisconnected / windowFrames).toFixed(3));
      emitCvEvent({
        type: 'cv_metrics',
        exerciseType,
        fps,
        avgConfidence,
        disconnectRate,
      });
      windowFrames = 0;
      windowDisconnected = 0;
      windowConfidence = 0;
      windowStartMs = Date.now();
    }
  }

  return {
    exerciseType,
    start(onFrame) {
      if (timer) return;
      startedMs = Date.now();
      windowStartMs = startedMs;

      timer = setInterval(async () => {
        const source = getFrameSource();
        const elapsedMs = Date.now() - startedMs;
        if (!source) {
          trackMetrics(0, true);
          onFrame(output(exerciseType, reps, 0, elapsedMs, ['LOW_CONFIDENCE']));
          return;
        }

        const frame = await source.readFrame();
        if (!frame) {
          trackMetrics(0, true);
          onFrame(output(exerciseType, reps, 0, elapsedMs, ['LOW_CONFIDENCE']));
          return;
        }

        const adapter = getLandmarkAdapter() ?? nullLandmarkAdapter;
        const pose = await adapter.estimate(frame);
        if (!pose) {
          trackMetrics(0, true);
          onFrame(output(exerciseType, reps, 0, elapsedMs, ['LOW_CONFIDENCE']));
          return;
        }

        const stepFn = stepForExercise(exerciseType);
        if (!stepFn) {
          trackMetrics(pose.confidence, true);
          onFrame(output(exerciseType, reps, pose.confidence, elapsedMs, ['LOW_CONFIDENCE']));
          return;
        }

        const step = stepFn(pose, { phase, repStartMs: startedMs });
        phase = step.state.phase;

        if (step.didRep) {
          reps.push({
            repNumber: reps.length + 1,
            formScore: step.formScore,
            durationMs: elapsedMs,
            flags: step.flags,
          });
        }

        trackMetrics(pose.confidence, pose.confidence === 0);
        onFrame(output(exerciseType, reps, pose.confidence, elapsedMs, step.flags, step.formScore));
      }, TICK_MS);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    reset() {
      this.stop();
      reps = [];
      startedMs = 0;
      phase = 'up';
      windowFrames = 0;
      windowDisconnected = 0;
      windowConfidence = 0;
      windowStartMs = 0;
    },
  };
}
