import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { aggregateReadinessFailures, renderReadinessFailureReportJson, writeOrionReadinessArtifact } from '../readinessReport';

describe('readiness failure aggregation', () => {
  const snapshots = [
    {
      sessionId: 's1',
      exercises: [
        { exerciseId: 'squat', startedAtMs: 0, calibrationStatus: 'REJECTED', readinessReason: 'NO_SIGNAL', completedReps: 0, disconnectedFrames: 4 },
        { exerciseId: 'pushup', startedAtMs: 0, calibrationStatus: 'READY', completedReps: 3, disconnectedFrames: 0 },
      ],
    },
    {
      sessionId: 's2',
      exercises: [
        { exerciseId: 'squat', startedAtMs: 0, calibrationStatus: 'REJECTED', readinessReason: 'INSUFFICIENT_ROM', completedReps: 0, disconnectedFrames: 2 },
        { exerciseId: 'plank_hold', startedAtMs: 0, calibrationStatus: 'REJECTED', readinessReason: 'INSUFFICIENT_SIGNAL', completedReps: 0, disconnectedFrames: 6 },
      ],
    },
  ] as any;

  it('aggregates NO_SIGNAL / INSUFFICIENT_ROM and new reasons per exercise', () => {
    const report = aggregateReadinessFailures(snapshots);
    expect(report.schemaVersion).toBe('orion.readiness.v1');
    expect(report.generatedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(report.totals).toEqual({ sessions: 2, exercisesObserved: 4, failures: 3 });

    expect(report.byExercise.squat.failures).toBe(2);
    expect(report.byExercise.squat.reasons.NO_SIGNAL).toBe(1);
    expect(report.byExercise.squat.reasons.INSUFFICIENT_ROM).toBe(1);

    expect(report.byExercise.plank_hold.failures).toBe(1);
    expect(report.byExercise.plank_hold.reasons.INSUFFICIENT_SIGNAL).toBe(1);
    expect(report.byExercise.pushup.failures).toBe(0);
  });

  it('renders stable JSON and writes Orion-consumable artifact', () => {
    const json = renderReadinessFailureReportJson(snapshots);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe('orion.readiness.v1');

    const dir = mkdtempSync(join(tmpdir(), 'orion-readiness-'));
    const file = join(dir, 'readiness-summary.json');
    writeOrionReadinessArtifact(file, snapshots);
    const written = readFileSync(file, 'utf8');
    expect(written).toBe(json);
  });
});
