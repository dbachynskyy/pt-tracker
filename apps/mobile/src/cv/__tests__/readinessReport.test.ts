import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { aggregateReadinessFailures, renderReadinessFailureReportJson, validateOrionReadinessArtifact, writeOrionReadinessArtifact } from '../readinessReport';

describe('readiness failure aggregation', () => {
  const snapshots = [
    {
      sessionId: 's1',
      exercises: [
        { exerciseId: 'squat', startedAtMs: 0, calibrationStatus: 'REJECTED', readinessReason: 'NO_SIGNAL', completedReps: 0, disconnectedFrames: 4, sampleCount: 10, confidenceP50: 0.7, confidenceP90: 0.8, repSignalPresent: false, statusReason: 'NO_SIGNAL' },
        { exerciseId: 'pushup', startedAtMs: 0, calibrationStatus: 'READY', completedReps: 3, disconnectedFrames: 0, sampleCount: 20, confidenceP50: 0.9, confidenceP90: 0.95, repSignalPresent: true, statusReason: 'READY' },
      ],
    },
    {
      sessionId: 's2',
      exercises: [
        { exerciseId: 'squat', startedAtMs: 0, calibrationStatus: 'REJECTED', readinessReason: 'INSUFFICIENT_ROM', completedReps: 0, disconnectedFrames: 2, sampleCount: 8, confidenceP50: 0.65, confidenceP90: 0.75, repSignalPresent: false, statusReason: 'INSUFFICIENT_ROM' },
        { exerciseId: 'plank_hold', startedAtMs: 0, calibrationStatus: 'REJECTED', readinessReason: 'INSUFFICIENT_SIGNAL', completedReps: 0, disconnectedFrames: 6, sampleCount: 0, confidenceP50: 0, confidenceP90: 0, repSignalPresent: false, statusReason: 'INSUFFICIENT_SIGNAL' },
      ],
    },
  ] as any;

  it('aggregates reasons and quality gate fields per exercise', () => {
    const report = aggregateReadinessFailures(snapshots);
    expect(report.schemaVersion).toBe('orion.readiness.v1');
    expect(report.threshold_profile_version).toBe('readiness-thresholds.v1');
    expect(report.generatedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(report.totals).toEqual({ sessions: 2, exercisesObserved: 4, failures: 3 });

    expect(report.byExercise.squat.failures).toBe(2);
    expect(report.byExercise.squat.reasons.NO_SIGNAL).toBe(1);
    expect(report.byExercise.squat.reasons.INSUFFICIENT_ROM).toBe(1);
    expect(report.byExercise.squat.quality.sample_count).toBe(18);
    expect(report.byExercise.squat.quality.rep_signal_present).toBe(false);

    expect(report.byExercise.pushup.failures).toBe(0);
    expect(report.byExercise.pushup.quality.gate_pass).toBe(true);
  });


  it('validator fails when an exercise or required quality fields are missing', () => {
    const report = aggregateReadinessFailures(snapshots);
    delete (report.byExercise as any).squat;
    const bad = validateOrionReadinessArtifact(report as any);
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((e) => e.startsWith('MISSING_EXERCISE:squat'))).toBe(true);
  });

  it('validates quality-field completeness and writes Orion artifact', () => {
    const report = aggregateReadinessFailures(snapshots);
    const verdict = validateOrionReadinessArtifact(report);
    expect(verdict.ok).toBe(true);

    const json = renderReadinessFailureReportJson(snapshots);
    const dir = mkdtempSync(join(tmpdir(), 'orion-readiness-'));
    const file = join(dir, 'readiness-summary.json');
    writeOrionReadinessArtifact(file, snapshots);
    const written = readFileSync(file, 'utf8');
    expect(written).toBe(json);
  });
});
