import { createDetector, isMockCvEnabled } from '../mockDetector';
import { registerFrameSource } from '../frameSource';
import { stepForExercise } from '../exerciseAnalyzers';
import { ExerciseType } from '../types';

jest.useFakeTimers();

describe('detector wiring (real-source only)', () => {
  afterEach(() => {
    registerFrameSource(null);
  });

  it('does not run mock mode', () => {
    expect(isMockCvEnabled()).toBe(false);
  });

  it('emits low-confidence output when no frame source is registered', () => {
    const frames: any[] = [];
    const det = createDetector('squat');
    det.start((o) => frames.push(o));
    jest.advanceTimersByTime(350);
    det.stop();

    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0].confidence).toBe(0);
    expect(frames[0].flags).toContain('LOW_CONFIDENCE');
  });
});

describe('exercise routing map', () => {
  const supported: ExerciseType[] = [
    'squat',
    'pushup',
    'sit_to_stand',
    'plank',
    'lunge',
    'glute_bridge',
    'knee_extension',
    'heel_raise',
    'calf_raise',
    'shoulder_abduction',
  ];

  it('routes all 10 supported exercises to analyzers', () => {
    for (const ex of supported) {
      expect(stepForExercise(ex)).toBeTruthy();
    }
  });
});
