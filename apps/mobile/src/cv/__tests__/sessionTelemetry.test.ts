import { SessionTelemetryTracker } from '../sessionTelemetry';

describe('SessionTelemetryTracker', () => {
  it('captures per-exercise start/ready/count and disconnected frames', () => {
    const tr = new SessionTelemetryTracker();
    tr.startExercise('squat', 0);
    tr.onFrame('squat', 'CALIBRATING', 100, false);
    tr.onFrame('squat', 'READY', 200, false, 'READY_THRESHOLD_MET');
    tr.onFrame('squat', 'READY', 300, true, 'READY_THRESHOLD_MET');
    tr.onRep('squat', 2);

    const s = tr.getExercise('squat')!;
    expect(s.startedAtMs).toBe(0);
    expect(s.readyAtMs).toBe(200);
    expect(s.completedReps).toBe(2);
    expect(s.disconnectedFrames).toBe(1);
    expect(s.calibrationStatus).toBe('READY');
    expect(s.readinessReason).toBe('READY_THRESHOLD_MET');
  });
});
