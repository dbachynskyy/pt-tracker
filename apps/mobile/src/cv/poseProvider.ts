import { emitCvEvent } from './instrumentation';
import { LandmarkAdapter } from './types';
import { registerLandmarkAdapter } from './landmarkAdapter';

export interface PoseProvider {
  readonly id: string;
  initialize(): Promise<void>;
  isAvailable(): Promise<boolean>;
  createAdapter(): LandmarkAdapter;
}

export type PoseProviderStatus = 'idle' | 'ready' | 'unavailable' | 'error';

interface ProviderRuntimeState {
  status: PoseProviderStatus;
  providerId: string;
  error?: string;
}

const unavailableProvider: PoseProvider = {
  id: 'unavailable',
  async initialize() {},
  async isAvailable() { return false; },
  createAdapter() {
    return {
      id: 'unavailable-adapter',
      async estimate() { return null; },
    };
  },
};

let provider: PoseProvider = unavailableProvider;
let state: ProviderRuntimeState = { status: 'idle', providerId: unavailableProvider.id };

export function registerPoseProvider(next: PoseProvider) {
  provider = next;
  state = { status: 'idle', providerId: next.id };
}

export async function initializePoseProvider() {
  try {
    await provider.initialize();
    const available = await provider.isAvailable();
    if (!available) {
      state = { status: 'unavailable', providerId: provider.id };
      registerLandmarkAdapter(provider.createAdapter());
      emitCvEvent({ type: 'cv_provider_initialized', providerId: provider.id, available: false });
      return state;
    }

    registerLandmarkAdapter(provider.createAdapter());
    state = { status: 'ready', providerId: provider.id };
    emitCvEvent({ type: 'cv_provider_initialized', providerId: provider.id, available: true });
    return state;
  } catch (error: unknown) {
    state = {
      status: 'error',
      providerId: provider.id,
      error: error instanceof Error ? error.message : 'Unknown provider error',
    };
    emitCvEvent({ type: 'cv_provider_init_error', error: state.error });
    return state;
  }
}

export function getPoseProviderState(): ProviderRuntimeState {
  return state;
}
