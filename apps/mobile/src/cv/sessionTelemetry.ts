import type { ExerciseId } from './exerciseRegistry';

export interface ExerciseTelemetry {
  exerciseId: ExerciseId;
  startedAtMs: number;
  readyAtMs?: number;
  calibrationStatus: string;
  completedReps: number;
  disconnectedFrames: number;
}

export class SessionTelemetryTracker {
  private byExercise = new Map<ExerciseId, ExerciseTelemetry>();

  startExercise(exerciseId: ExerciseId, startedAtMs: number): void {
    this.byExercise.set(exerciseId, {
      exerciseId,
      startedAtMs,
      calibrationStatus: 'UNCALIBRATED',
      completedReps: 0,
      disconnectedFrames: 0,
    });
  }

  onFrame(exerciseId: ExerciseId, status: string, sessionMs: number, disconnected: boolean): void {
    const t = this.byExercise.get(exerciseId);
    if (!t) return;
    t.calibrationStatus = status;
    if (!t.readyAtMs && status === 'READY') t.readyAtMs = sessionMs;
    if (disconnected) t.disconnectedFrames += 1;
  }

  onRep(exerciseId: ExerciseId, repIndex: number): void {
    const t = this.byExercise.get(exerciseId);
    if (!t) return;
    t.completedReps = Math.max(t.completedReps, repIndex);
  }

  getExercise(exerciseId: ExerciseId): ExerciseTelemetry | undefined {
    const t = this.byExercise.get(exerciseId);
    return t ? { ...t } : undefined;
  }

  summary(): ExerciseTelemetry[] {
    return Array.from(this.byExercise.values()).map((x) => ({ ...x }));
  }
}
