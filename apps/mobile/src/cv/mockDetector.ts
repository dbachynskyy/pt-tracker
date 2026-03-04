import { getFrameSource } from './frameSource';
import { getLandmarkAdapter, nullLandmarkAdapter } from './landmarkAdapter';
import { pushupStep, sitToStandStep, squatStep } from './exerciseAnalyzers';
import { ConfidenceFlag, Detector, DetectorOutput, ExerciseType, RepResult } from './types';

const TICK_MS = 300;

function calcFormScore(reps: RepResult[]): number {
  if (!reps.length) return 100;
  return Math.round(reps.reduce((s, r) => s + r.formScore, 0) / reps.length);
}

function output(exerciseType: ExerciseType, reps: RepResult[], confidence: number, elapsedMs: number, flags: ConfidenceFlag[]): DetectorOutput {
  return {
    exerciseType,
    repCount: reps.length,
    formScore: calcFormScore(reps),
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

  return {
    exerciseType,
    start(onFrame) {
      if (timer) return;
      startedMs = Date.now();
      timer = setInterval(async () => {
        const source = getFrameSource();
        const elapsedMs = Date.now() - startedMs;
        if (!source) {
          onFrame(output(exerciseType, reps, 0, elapsedMs, ['LOW_CONFIDENCE']));
          return;
        }

        const frame = await source.readFrame();
        if (!frame) {
          onFrame(output(exerciseType, reps, 0, elapsedMs, ['LOW_CONFIDENCE']));
          return;
        }

        const adapter = getLandmarkAdapter() ?? nullLandmarkAdapter;
        const pose = await adapter.estimate(frame);
        if (!pose) {
          onFrame(output(exerciseType, reps, 0, elapsedMs, ['LOW_CONFIDENCE']));
          return;
        }

        if (!['squat', 'pushup', 'sit_to_stand'].includes(exerciseType)) {
          onFrame(output(exerciseType, reps, pose.confidence, elapsedMs, ['LOW_CONFIDENCE']));
          return;
        }

        const prevState = { phase, repStartMs: reps.length ? reps[reps.length - 1].durationMs : startedMs };
        const step =
          exerciseType === 'squat'
            ? squatStep(pose, prevState)
            : exerciseType === 'pushup'
              ? pushupStep(pose, prevState)
              : sitToStandStep(pose, prevState);

        phase = step.state.phase;
        if (step.didRep) {
          reps.push({
            repNumber: reps.length + 1,
            formScore: step.formScore,
            durationMs: elapsedMs,
            flags: step.flags,
          });
        }

        onFrame(output(exerciseType, reps, pose.confidence, elapsedMs, step.flags));
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
    },
  };
}
