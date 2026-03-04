import { StabilizedRepCounter } from '../calibrationStabilization';
import { squatFrame } from './fixtures/frameBuilders';
import type { ExerciseAnalyzer, PoseFrame } from '../repCounter';

class AlwaysRepAnalyzer implements ExerciseAnalyzer {
  readonly exerciseId = 'squat';
  readonly requiredLandmarks = [23, 24, 25, 26, 27, 28];
  processFrame(frame: PoseFrame, _sessionMs: number) {
    return { durationMs: 1200, formScore: 100, flags: [], auditSnapshot: [frame[23].x, frame[23].y] };
  }
  reset() {}
}

function setSource(frame: PoseFrame, source: 'real' | 'mock' | 'disconnected'): PoseFrame {
  return Object.assign(frame, { source }) as PoseFrame;
}

describe('StabilizedRepCounter calibration', () => {
  it('accepts calibration when ROM range reaches threshold', () => {
    const counter = new StabilizedRepCounter(new AlwaysRepAnalyzer(), 5, {
      requiredFrames: 12,
      maxFrames: 30,
      criteriaByExercise: { squat: { readyWindowMs: 200 } },
    });
    for (let i = 0; i < 12; i++) {
      const angle = i < 6 ? 170 - i * 10 : 120 + (i - 6) * 10;
      counter.processFrame(setSource(squatFrame(angle), 'real'), i * 33);
    }
    expect(counter.getCalibrationState().status).toBe('READY');
  });

  it('rejects calibration when movement range is insufficient by maxFrames', () => {
    const counter = new StabilizedRepCounter(new AlwaysRepAnalyzer(), 5, { requiredFrames: 12, maxFrames: 20 });
    for (let i = 0; i < 20; i++) {
      counter.processFrame(setSource(squatFrame(170), 'real'), i * 33);
    }
    const state = counter.getCalibrationState();
    expect(state.status).toBe('REJECTED');
    expect(state.reason).toBe('NO_SIGNAL');
  });
});

describe('StabilizedRepCounter occlusion recovery', () => {
  it('resumes only after configured clear frames following disconnected input', () => {
    const counter = new StabilizedRepCounter(new AlwaysRepAnalyzer(), 5, {
      requiredFrames: 12,
      maxFrames: 30,
      occlusionRecoveryFrames: 3,
    });

    let t = 0;
    // calibrate to READY
    for (let i = 0; i < 12; i++) {
      const angle = i < 6 ? 170 - i * 10 : 120 + (i - 6) * 10;
      counter.processFrame(setSource(squatFrame(angle), 'real'), t);
      t += 100;
    }

    // warmup inner RepCounter + first accepted rep
    for (let i = 0; i < 11; i++) {
      counter.processFrame(setSource(squatFrame(170), 'real'), t);
      t += 600;
    }
    expect(counter.getSession().completedReps).toBe(1);

    // occlusion event
    counter.processFrame(setSource(squatFrame(170), 'disconnected'), t);
    t += 600;

    // 2 recovery frames -> still blocked
    counter.processFrame(setSource(squatFrame(170), 'real'), t); t += 600;
    counter.processFrame(setSource(squatFrame(170), 'real'), t); t += 600;
    expect(counter.getSession().completedReps).toBe(1);

    // 3rd recovery frame resumes and can count
    counter.processFrame(setSource(squatFrame(170), 'real'), t);
    expect(counter.getSession().completedReps).toBe(2);
  });
});
