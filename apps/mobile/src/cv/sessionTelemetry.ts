import type { ExerciseId } from './exerciseRegistry';

export interface ExerciseTelemetry {
  exerciseId: ExerciseId;
  startedAtMs: number;
  readyAtMs?: number;
  calibrationStatus: string;
  readinessReason?: string;
  completedReps: number;
  disconnectedFrames: number;
  sampleCount: number;
  confidenceP50: number;
  confidenceP90: number;
  repSignalPresent: boolean;
  statusReason: string;
}

interface MutableExerciseTelemetry extends ExerciseTelemetry {
  confidenceSamples: number[];
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

export class SessionTelemetryTracker {
  private byExercise = new Map<ExerciseId, MutableExerciseTelemetry>();

  startExercise(exerciseId: ExerciseId, startedAtMs: number): void {
    this.byExercise.set(exerciseId, {
      exerciseId,
      startedAtMs,
      calibrationStatus: 'UNCALIBRATED',
      completedReps: 0,
      disconnectedFrames: 0,
      sampleCount: 0,
      confidenceP50: 0,
      confidenceP90: 0,
      repSignalPresent: false,
      statusReason: 'UNCALIBRATED',
      confidenceSamples: [],
    });
  }

  onFrame(
    exerciseId: ExerciseId,
    status: string,
    sessionMs: number,
    disconnected: boolean,
    readinessReason?: string,
    frameConfidence?: number,
  ): void {
    const t = this.byExercise.get(exerciseId);
    if (!t) return;
    t.calibrationStatus = status;
    t.readinessReason = readinessReason;
    t.statusReason = readinessReason ?? status;
    if (!t.readyAtMs && status === 'READY') t.readyAtMs = sessionMs;
    if (disconnected) t.disconnectedFrames += 1;

    if (typeof frameConfidence === 'number') {
      t.confidenceSamples.push(frameConfidence);
      t.sampleCount = t.confidenceSamples.length;
      const sorted = [...t.confidenceSamples].sort((a, b) => a - b);
      t.confidenceP50 = quantile(sorted, 0.5);
      t.confidenceP90 = quantile(sorted, 0.9);
    }
  }

  onRep(exerciseId: ExerciseId, repIndex: number): void {
    const t = this.byExercise.get(exerciseId);
    if (!t) return;
    t.completedReps = Math.max(t.completedReps, repIndex);
    t.repSignalPresent = t.completedReps > 0;
  }

  getExercise(exerciseId: ExerciseId): ExerciseTelemetry | undefined {
    const t = this.byExercise.get(exerciseId);
    return t ? this.project(t) : undefined;
  }

  summary(): ExerciseTelemetry[] {
    return Array.from(this.byExercise.values()).map((x) => this.project(x));
  }

  private project(t: MutableExerciseTelemetry): ExerciseTelemetry {
    return {
      exerciseId: t.exerciseId,
      startedAtMs: t.startedAtMs,
      readyAtMs: t.readyAtMs,
      calibrationStatus: t.calibrationStatus,
      readinessReason: t.readinessReason,
      completedReps: t.completedReps,
      disconnectedFrames: t.disconnectedFrames,
      sampleCount: t.sampleCount,
      confidenceP50: t.confidenceP50,
      confidenceP90: t.confidenceP90,
      repSignalPresent: t.repSignalPresent,
      statusReason: t.statusReason,
    };
  }
}
