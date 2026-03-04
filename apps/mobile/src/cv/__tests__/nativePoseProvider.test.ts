import { createNativePoseProvider, __testables } from '../nativePoseProvider';
import { getPoseProviderState } from '../poseProvider';

describe('nativePoseProvider contract guard', () => {
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

  it('flags MODULE_MISSING', async () => {
    const provider = createNativePoseProvider(null);
    expect(await provider.isAvailable()).toBe(false);
    expect(getPoseProviderState().errorCode).toBe('MODULE_MISSING');
  });

  it('flags BAD_TIMESTAMP', async () => {
    const provider = createNativePoseProvider({
      isAvailable: async () => true,
      estimatePose: async () => ({ confidence: 0.9, landmarks: [{ index: 11, x: 0.1, y: 0.2 }, { index: 12, x: 0.2, y: 0.3 }, { index: 23, x: 0.3, y: 0.4 }, { index: 24, x: 0.4, y: 0.5 }] }),
    });
    await provider.createAdapter().estimate({ base64: 'x', width: 1, height: 1, timestampMs: 1 });
    expect(getPoseProviderState().errorCode).toBe('BAD_TIMESTAMP');
  });

  it('flags BAD_PAYLOAD_SHAPE', async () => {
    const provider = createNativePoseProvider({
      isAvailable: async () => true,
      estimatePose: async () => null,
    });
    await provider.createAdapter().estimate({ base64: 'x', width: 1, height: 1, timestampMs: Date.now() });
    expect(getPoseProviderState().errorCode).toBe('BAD_PAYLOAD_SHAPE');
  });

  it('flags BAD_CONFIDENCE', async () => {
    const provider = createNativePoseProvider({
      isAvailable: async () => true,
      estimatePose: async () => ({ confidence: Number.NaN, landmarks: [{ index: 11, x: 0.1, y: 0.2 }, { index: 12, x: 0.2, y: 0.3 }, { index: 23, x: 0.3, y: 0.4 }, { index: 24, x: 0.4, y: 0.5 }] }),
    });
    await provider.createAdapter().estimate({ base64: 'x', width: 1, height: 1, timestampMs: Date.now() });
    expect(getPoseProviderState().errorCode).toBe('BAD_CONFIDENCE');
  });

  it('flags BAD_LANDMARKS', async () => {
    const provider = createNativePoseProvider({
      isAvailable: async () => true,
      estimatePose: async () => ({ confidence: 0.7, landmarks: [{ index: 99, x: 0.1, y: 0.2 }] }),
    });
    await provider.createAdapter().estimate({ base64: 'x', width: 1, height: 1, timestampMs: Date.now() });
    expect(getPoseProviderState().errorCode).toBe('BAD_LANDMARKS');
  });

  it('happy path returns pose', async () => {
    const provider = createNativePoseProvider({
      isAvailable: async () => true,
      estimatePose: async () => ({
        confidence: 0.88,
        landmarks: [
          { index: 11, x: 0.2, y: 0.3 },
          { index: 12, x: 0.2, y: 0.3 },
          { index: 23, x: 0.2, y: 0.3 },
          { index: 24, x: 0.2, y: 0.3 },
        ],
      }),
    });

    const pose = await provider.createAdapter().estimate({ base64: 'x', width: 1, height: 1, timestampMs: Date.now() });
    expect(pose?.confidence).toBe(0.88);
    expect(pose?.landmarks.length).toBe(4);
    expect(getPoseProviderState().status).toBe('ready');
  });
});
