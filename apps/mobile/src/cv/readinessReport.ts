import type { ExerciseId } from './exerciseRegistry';
import type { ExerciseTelemetry } from './sessionTelemetry';
import { writeFileSync } from 'fs';

export function writeOrionReadinessArtifact(path: string, snapshots: SessionTelemetrySnapshot[]): void {
  writeFileSync(path, renderReadinessFailureReportJson(snapshots), 'utf8');
}


export interface SessionTelemetrySnapshot {
  sessionId: string;
  exercises: ExerciseTelemetry[];
}

export interface ReadinessFailureReport {
  schemaVersion: 'orion.readiness.v1';
  generatedAt: string;
  totals: {
    sessions: number;
    exercisesObserved: number;
    failures: number;
  };
  byExercise: Record<ExerciseId, {
    failures: number;
    reasons: Record<string, number>;
  }>;
}

export function aggregateReadinessFailures(snapshots: SessionTelemetrySnapshot[]): ReadinessFailureReport {
  const byExercise = Object.create(null) as ReadinessFailureReport['byExercise'];
  const ids: ExerciseId[] = [
    'squat','pushup','sit_to_stand','lunge','calf_raise','glute_bridge','shoulder_abduction','heel_raise','knee_extension','plank_hold',
  ];
  for (const id of ids) byExercise[id] = { failures: 0, reasons: {} };

  let observed = 0;
  let failures = 0;

  for (const s of snapshots) {
    for (const ex of s.exercises) {
      observed += 1;
      const reason = ex.readinessReason;
      if (reason) {
        failures += 1;
        const bucket = byExercise[ex.exerciseId];
        bucket.failures += 1;
        bucket.reasons[reason] = (bucket.reasons[reason] ?? 0) + 1;
      }
    }
  }

  return {
    schemaVersion: 'orion.readiness.v1',
    generatedAt: new Date(0).toISOString(),
    totals: { sessions: snapshots.length, exercisesObserved: observed, failures },
    byExercise,
  };
}

export function renderReadinessFailureReportJson(snapshots: SessionTelemetrySnapshot[]): string {
  return JSON.stringify(aggregateReadinessFailures(snapshots), null, 2);
}
