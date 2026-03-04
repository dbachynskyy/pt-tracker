import { StabilizedRepCounter } from '../calibrationStabilization';
import type { ExerciseAnalyzer, PoseFrame } from '../repCounter';
import { squatFrame } from './fixtures/frameBuilders';
import { normalizeExerciseId } from '../exerciseRegistry';

class AlwaysRepAnalyzer implements ExerciseAnalyzer {
  readonly exerciseId = 'squat';
  readonly requiredLandmarks = [23,24,25,26,27,28];
  processFrame(frame: PoseFrame) { return { durationMs: 1200, formScore: 100, flags: [], auditSnapshot: [frame[23].x, frame[23].y] }; }
  reset() {}
}

const src = (f: PoseFrame, source: 'real'|'mock'|'disconnected') => Object.assign(f, { source }) as PoseFrame;

describe('runtime stabilized flow e2e', () => {
  it('calibrate -> ready -> rep count -> occlusion pause/resume', () => {
    const c = new StabilizedRepCounter(new AlwaysRepAnalyzer(), 10, { requiredFrames: 12, maxFrames: 30, occlusionRecoveryFrames: 3 });
    let t = 0;

    // calibration phase with ROM
    for (let i=0;i<12;i++) {
      const angle = i < 6 ? 170 - i*10 : 120 + (i-6)*10;
      c.processFrame(src(squatFrame(angle), 'real'), t);
      t += 100;
    }
    expect(c.getCalibrationState().status).toBe('READY');

    // warmup + first accepted rep
    for (let i=0;i<11;i++) { c.processFrame(src(squatFrame(170), 'real'), t); t += 600; }
    expect(c.getSession().completedReps).toBe(1);

    // occlusion pause
    c.processFrame(src(squatFrame(170), 'disconnected'), t); t += 600;
    c.processFrame(src(squatFrame(170), 'real'), t); t += 600;
    c.processFrame(src(squatFrame(170), 'real'), t); t += 600;
    expect(c.getSession().completedReps).toBe(1);

    // recovery frame then count resumes
    c.processFrame(src(squatFrame(170), 'real'), t);
    expect(c.getSession().completedReps).toBe(2);
  });

  it('normalizes plank id contract to plank_hold', () => {
    expect(normalizeExerciseId('plank')).toBe('plank_hold');
    expect(normalizeExerciseId('plank_hold')).toBe('plank_hold');
  });
});
