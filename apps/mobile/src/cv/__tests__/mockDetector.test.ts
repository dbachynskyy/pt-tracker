import { createDetector, isMockCvEnabled } from '../mockDetector';
import { registerFrameSource } from '../frameSource';

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
