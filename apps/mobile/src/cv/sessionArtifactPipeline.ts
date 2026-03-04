import { EXERCISE_IDS, type ExerciseId } from './exerciseRegistry';
import { aggregateReadinessFailures, buildCompactGateSummary, renderReadinessFailureReportJson, writeOrionReadinessArtifact, type SessionTelemetrySnapshot } from './readinessReport';
import type { ExerciseTelemetry, SessionTelemetryTracker } from './sessionTelemetry';
import { writeFileSync } from 'fs';

function emptyTelemetry(exerciseId: ExerciseId): ExerciseTelemetry {
  return {
    exerciseId,
    startedAtMs: 0,
    calibrationStatus: 'UNCALIBRATED',
    completedReps: 0,
    disconnectedFrames: 0,
    sampleCount: 0,
    confidenceP50: 0,
    confidenceP90: 0,
    repSignalPresent: false,
    statusReason: 'UNCALIBRATED',
  };
}

export function buildSessionSnapshot(sessionId: string, tracker: SessionTelemetryTracker): SessionTelemetrySnapshot {
  const map = new Map<ExerciseId, ExerciseTelemetry>();
  for (const row of tracker.summary()) map.set(row.exerciseId, row);
  return {
    sessionId,
    exercises: EXERCISE_IDS.map((id) => map.get(id) ?? emptyTelemetry(id)),
  };
}

export class ReadinessArtifactPipeline {
  private readonly snapshots: SessionTelemetrySnapshot[] = [];

  endSession(params: { sessionId: string; tracker: SessionTelemetryTracker; outputPath?: string }) {
    const snapshot = buildSessionSnapshot(params.sessionId, params.tracker);
    this.snapshots.push(snapshot);

    const report = aggregateReadinessFailures(this.snapshots);
    const json = renderReadinessFailureReportJson(this.snapshots);
    const compact = buildCompactGateSummary(report);
    const compactJson = JSON.stringify(compact, null, 2);

    if (params.outputPath) {
      writeOrionReadinessArtifact(params.outputPath, this.snapshots);
      writeFileSync(`${params.outputPath}.gate-summary.json`, `${compactJson}\n`, 'utf8');
    }

    return { snapshot, report, json, compact, compactJson };
  }

  getSnapshots(): SessionTelemetrySnapshot[] {
    return this.snapshots.map((s) => ({ ...s, exercises: s.exercises.map((e) => ({ ...e })) }));
  }
}
