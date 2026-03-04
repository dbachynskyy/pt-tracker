import { getLandmarkAdapter } from '../landmarkAdapter';
import { registerCvEventSink } from '../instrumentation';
import { getPoseProviderState, initializePoseProvider, registerPoseProvider } from '../poseProvider';

describe('pose provider runtime', () => {
  afterEach(() => {
    registerCvEventSink(null);
  });

  it('sets unavailable state when provider reports unavailable', async () => {
    registerPoseProvider({
      id: 'fake-provider',
      async initialize() {},
      async isAvailable() { return false; },
      createAdapter() { return { id: 'fake-adapter', async estimate() { return null; } }; },
    });

    const state = await initializePoseProvider();
    expect(state.status).toBe('unavailable');
    expect(getLandmarkAdapter()?.id).toBe('fake-adapter');
  });

  it('sets ready state when provider is available', async () => {
    registerPoseProvider({
      id: 'ok-provider',
      async initialize() {},
      async isAvailable() { return true; },
      createAdapter() { return { id: 'ok-adapter', async estimate() { return null; } }; },
    });

    await initializePoseProvider();
    expect(getPoseProviderState().status).toBe('ready');
    expect(getLandmarkAdapter()?.id).toBe('ok-adapter');
  });

  it('captures provider initialization errors', async () => {
    const events: any[] = [];
    registerCvEventSink((e) => events.push(e));

    registerPoseProvider({
      id: 'boom-provider',
      async initialize() { throw new Error('native module missing'); },
      async isAvailable() { return true; },
      createAdapter() { return { id: 'none', async estimate() { return null; } }; },
    });

    const state = await initializePoseProvider();
    expect(state.status).toBe('error');
    expect(state.error).toContain('native module missing');
    expect(events.find((e) => e.type === 'cv_provider_init_error')).toBeTruthy();
  });
});
