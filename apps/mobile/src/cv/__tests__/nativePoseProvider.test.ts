import { createNativePoseProvider, __testables } from '../nativePoseProvider';

describe('nativePoseProvider mapping', () => {
  it('maps native indexed landmarks into Atlas names', () => {
    const mapped = __testables.mapNativeLandmarks([
      { index: 0, x: 0.1, y: 0.1 },
      { index: 11, x: 0.2, y: 0.3 },
      { index: 25, x: 0.4, y: 0.5 },
      { index: 32, x: 0.6, y: 0.7 },
    ]);

    expect(mapped.find((l) => l.name === 'nose')).toBeTruthy();
    expect(mapped.find((l) => l.name === 'left_shoulder')).toBeTruthy();
    expect(mapped.find((l) => l.name === 'left_knee')).toBeTruthy();
    expect(mapped.find((l) => l.name === 'right_foot')).toBeTruthy();
  });

  it('returns unavailable when native module missing', async () => {
    const provider = createNativePoseProvider(null);
    expect(await provider.isAvailable()).toBe(false);
    const estimate = await provider.createAdapter().estimate({ base64: 'x', width: 1, height: 1, timestampMs: 1 });
    expect(estimate).toBeNull();
  });

  it('adapts native estimatePose payload', async () => {
    const provider = createNativePoseProvider({
      isAvailable: async () => true,
      estimatePose: async () => ({
        confidence: 0.88,
        landmarks: [{ index: 11, x: 0.2, y: 0.3 }],
      }),
    });

    expect(await provider.isAvailable()).toBe(true);
    const pose = await provider.createAdapter().estimate({ base64: 'x', width: 1, height: 1, timestampMs: 1 });
    expect(pose?.confidence).toBe(0.88);
    expect(pose?.landmarks[0].name).toBe('left_shoulder');
  });
});
