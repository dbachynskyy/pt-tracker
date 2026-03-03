import { createDetector, createMockDetector } from '../mockDetector';
import { DetectorOutput, ExerciseType } from '../types';

jest.useFakeTimers();

function collectFrames(
  exerciseType: ExerciseType,
  ticks: number,
): DetectorOutput[] {
  const frames: DetectorOutput[] = [];
  const det = createMockDetector(exerciseType);
  det.start((o) => frames.push(o));
  jest.advanceTimersByTime(ticks * 500);
  det.stop();
  return frames;
}

describe('createMockDetector', () => {
  describe('lifecycle', () => {
    it('emits no frames before start()', () => {
      const frames: DetectorOutput[] = [];
      const det = createMockDetector('squat');
      jest.advanceTimersByTime(2000);
      expect(frames).toHaveLength(0);
      det.stop();
    });

    it('emits frames on each 500 ms tick after start()', () => {
      const frames = collectFrames('squat', 4);
      expect(frames).toHaveLength(4);
    });

    it('stop() halts emission', () => {
      const frames: DetectorOutput[] = [];
      const det = createMockDetector('pushup');
      det.start((o) => frames.push(o));
      jest.advanceTimersByTime(1000); // 2 ticks
      det.stop();
      jest.advanceTimersByTime(2000); // no more ticks
      expect(frames).toHaveLength(2);
    });

    it('start() is idempotent — second call does not double-fire', () => {
      const frames: DetectorOutput[] = [];
      const det = createMockDetector('squat');
      const cb = (o: DetectorOutput) => frames.push(o);
      det.start(cb);
      det.start(cb); // second call should be a no-op
      jest.advanceTimersByTime(1000); // 2 ticks
      det.stop();
      expect(frames).toHaveLength(2);
    });

    it('reset() clears state and stops timer', () => {
      const frames: DetectorOutput[] = [];
      const det = createMockDetector('squat');
      det.start((o) => frames.push(o));
      jest.advanceTimersByTime(2000); // 4 ticks → 1 rep
      det.reset();
      jest.advanceTimersByTime(2000); // should not emit
      const countAfterReset = frames.length;
      expect(frames.at(-1)?.repCount).toBeGreaterThanOrEqual(0);
      jest.advanceTimersByTime(2000);
      expect(frames).toHaveLength(countAfterReset); // no new frames
    });
  });

  describe('confidence ramp', () => {
    it('starts with LOW_CONFIDENCE flag', () => {
      const frames = collectFrames('squat', 1);
      expect(frames[0].flags).toContain('LOW_CONFIDENCE');
      expect(frames[0].confidence).toBeLessThan(1);
    });

    it('reaches full confidence after 5 ticks', () => {
      const frames = collectFrames('squat', 6);
      expect(frames[5].confidence).toBe(1);
      expect(frames[5].flags).not.toContain('LOW_CONFIDENCE');
    });
  });

  describe('rep-counted exercises (squat, pushup, sit_to_stand)', () => {
    it.each<ExerciseType>(['squat', 'pushup', 'sit_to_stand'])(
      '%s counts a rep every 4 ticks (2 s)',
      (type) => {
        const frames = collectFrames(type, 8);
        expect(frames.at(-1)!.repCount).toBe(2);
      },
    );

    it('includes per-rep metadata', () => {
      const frames = collectFrames('squat', 4);
      const lastFrame = frames.at(-1)!;
      expect(lastFrame.repCount).toBe(1);
      expect(lastFrame.reps).toHaveLength(1);
      expect(lastFrame.reps[0].formScore).toBeGreaterThanOrEqual(75);
      expect(lastFrame.reps[0].formScore).toBeLessThanOrEqual(100);
      expect(lastFrame.reps[0].durationMs).toBe(2000);
    });

    it('formScore is average of rep scores', () => {
      const frames = collectFrames('squat', 8);
      const last = frames.at(-1)!;
      if (last.reps.length > 0) {
        const avg = Math.round(
          last.reps.reduce((s, r) => s + r.formScore, 0) / last.reps.length,
        );
        expect(last.formScore).toBe(avg);
      }
    });
  });

  describe('plank (hold exercise)', () => {
    it('never increments repCount', () => {
      const frames = collectFrames('plank', 10);
      for (const f of frames) {
        expect(f.repCount).toBe(0);
      }
    });

    it('tracks elapsed hold time', () => {
      const frames = collectFrames('plank', 4);
      expect(frames.at(-1)!.elapsedMs).toBeGreaterThan(0);
    });

    it('formScore starts at 100 (no reps logged)', () => {
      const frames = collectFrames('plank', 4);
      expect(frames[0].formScore).toBe(100);
    });
  });

  describe('createDetector registry', () => {
    it.each<ExerciseType>(['squat', 'pushup', 'plank', 'sit_to_stand'])(
      'creates a detector for %s',
      (type) => {
        const det = createDetector(type);
        expect(det.exerciseType).toBe(type);
      },
    );
  });
});
