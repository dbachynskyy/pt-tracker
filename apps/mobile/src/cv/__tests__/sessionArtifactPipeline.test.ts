import { readFileSync } from 'fs';
import { join } from 'path';
import { SessionTelemetryTracker } from '../sessionTelemetry';
import { ReadinessArtifactPipeline, buildSessionSnapshot } from '../sessionArtifactPipeline';

describe('ReadinessArtifactPipeline', () => {
  it('builds per-session snapshot with all 10 exercises represented', () => {
    const tracker = new SessionTelemetryTracker();
    tracker.startExercise('squat', 100);
    tracker.onFrame('squat', 'REJECTED', 300, true, 'NO_SIGNAL');

    const snap = buildSessionSnapshot('session-1', tracker);
    expect(snap.exercises).toHaveLength(10);
    const squat = snap.exercises.find((x) => x.exerciseId === 'squat')!;
    const pushup = snap.exercises.find((x) => x.exerciseId === 'pushup')!;
    expect(squat.readinessReason).toBe('NO_SIGNAL');
    expect(pushup.calibrationStatus).toBe('UNCALIBRATED');
  });

  it('emits deterministic Orion readiness JSON matching fixture artifact', () => {
    const tracker = new SessionTelemetryTracker();
    tracker.startExercise('squat', 100);
    tracker.onFrame('squat', 'REJECTED', 300, true, 'NO_SIGNAL');
    tracker.startExercise('pushup', 200);
    tracker.onFrame('pushup', 'REJECTED', 400, false, 'INSUFFICIENT_ROM');

    const pipeline = new ReadinessArtifactPipeline();
    const out = pipeline.endSession({ sessionId: 'session-1', tracker });

    const fixturePath = join(__dirname, 'fixtures', 'orion_readiness_session_fixture.json');
    const fixture = readFileSync(fixturePath, 'utf8');
    expect(out.json.trim()).toBe(fixture.trim());
  });
});
