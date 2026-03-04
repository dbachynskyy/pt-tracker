import { CameraFrame, LandmarkAdapter } from './types';

let registered: LandmarkAdapter | null = null;

export function registerLandmarkAdapter(adapter: LandmarkAdapter) {
  registered = adapter;
}

export function getLandmarkAdapter(): LandmarkAdapter | null {
  return registered;
}

/**
 * Real-source only default: no mock landmarks are synthesized.
 * If no adapter has been registered (native pose plugin missing), we return null.
 */
export const nullLandmarkAdapter: LandmarkAdapter = {
  id: 'none',
  async estimate(_frame: CameraFrame) {
    return null;
  },
};
