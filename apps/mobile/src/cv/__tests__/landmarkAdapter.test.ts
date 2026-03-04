import { LandmarkAdapter, type RawPoseSample, CvLandmarkBridge, type PoseProvider } from '../landmarkAdapter';

function sampleAt(x: number, visibility = 0.99): RawPoseSample {
  return {
    landmarks: Array.from({ length: 33 }, () => ({ x, y: 0.5, z: 0, visibility })),
    source: 'real',
  };
}

describe('LandmarkAdapter smoothing', () => {
  it('applies deterministic EMA smoothing', () => {
    const adapter = new LandmarkAdapter({ smoothing: { method: 'ema', alpha: 0.5, windowSize: 3 } as any });
    const f1 = adapter.adapt(sampleAt(0));
    const f2 = adapter.adapt(sampleAt(1));
    const f3 = adapter.adapt(sampleAt(1));

    expect(f1[0].x).toBeCloseTo(0, 6);
    expect(f2[0].x).toBeCloseTo(0.5, 6);
    expect(f3[0].x).toBeCloseTo(0.75, 6);
  });

  it('applies deterministic moving-window smoothing', () => {
    const adapter = new LandmarkAdapter({ smoothing: { method: 'window', windowSize: 3, alpha: 0.35 } as any });
    const f1 = adapter.adapt(sampleAt(0));
    const f2 = adapter.adapt(sampleAt(1));
    const f3 = adapter.adapt(sampleAt(1));

    expect(f1[0].x).toBeCloseTo(0, 6);
    expect(f2[0].x).toBeCloseTo(0.5, 6);
    expect(f3[0].x).toBeCloseTo(2 / 3, 6);
  });
});

describe('LandmarkAdapter occlusion gating', () => {
  it('marks source disconnected after occlusion streak crosses threshold', () => {
    const adapter = new LandmarkAdapter({ occlusion: { visibilityThreshold: 0.5, minVisibleLandmarks: 10, maxConsecutiveOccludedFrames: 3 } as any });

    const out1 = adapter.adapt(sampleAt(0.5, 0.1));
    const out2 = adapter.adapt(sampleAt(0.5, 0.1));
    const out3 = adapter.adapt(sampleAt(0.5, 0.1));
    const out4 = adapter.adapt(sampleAt(0.5, 0.1));

    expect(out1.source).toBe('real');
    expect(out2.source).toBe('real');
    expect(out3.source).toBe('real');
    expect(out4.source).toBe('disconnected');
  });

  it('clears disconnected source after visibility recovers', () => {
    const adapter = new LandmarkAdapter({ occlusion: { visibilityThreshold: 0.5, minVisibleLandmarks: 10, maxConsecutiveOccludedFrames: 1 } as any });
    adapter.adapt(sampleAt(0.5, 0.1));
    const locked = adapter.adapt(sampleAt(0.5, 0.1));
    const recovered = adapter.adapt(sampleAt(0.5, 0.99));

    expect(locked.source).toBe('disconnected');
    expect(recovered.source).toBe('real');
  });
});

describe('CvLandmarkBridge provider injection', () => {
  it('injects provider and emits adapted PoseFrame through callback', async () => {
    const frames: any[] = [];
    const provider: PoseProvider = {
      start(onSample) { onSample(sampleAt(0.25)); },
      stop() { return; },
    };
    const bridge = new CvLandmarkBridge(provider, new LandmarkAdapter(), (frame) => frames.push(frame));
    await bridge.start();
    await bridge.stop();

    expect(frames).toHaveLength(1);
    expect(frames[0].source).toBe('real');
    expect(frames[0][0].x).toBeCloseTo(0.25, 6);
  });
});
