import { NativeModules, Platform } from 'react-native';
import { LandmarkAdapter, LandmarkName, PoseLandmarks } from './types';
import { PoseProvider } from './poseProvider';

interface NativeLandmark {
  index?: number;
  name?: string;
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

interface NativePoseResult {
  confidence?: number;
  landmarks: NativeLandmark[];
}

interface NativePoseModule {
  isAvailable?: () => Promise<boolean>;
  estimatePose: (input: { base64: string; width: number; height: number; timestampMs: number }) => Promise<NativePoseResult | null>;
}

const INDEX_TO_NAME: Partial<Record<number, LandmarkName>> = {
  0: 'nose',
  11: 'left_shoulder',
  12: 'right_shoulder',
  13: 'left_elbow',
  14: 'right_elbow',
  15: 'left_wrist',
  16: 'right_wrist',
  23: 'left_hip',
  24: 'right_hip',
  25: 'left_knee',
  26: 'right_knee',
  27: 'left_ankle',
  28: 'right_ankle',
  31: 'left_foot',
  32: 'right_foot',
};

const NAME_NORMALIZE: Record<string, LandmarkName> = {
  nose: 'nose',
  left_shoulder: 'left_shoulder',
  right_shoulder: 'right_shoulder',
  left_elbow: 'left_elbow',
  right_elbow: 'right_elbow',
  left_wrist: 'left_wrist',
  right_wrist: 'right_wrist',
  left_hip: 'left_hip',
  right_hip: 'right_hip',
  left_knee: 'left_knee',
  right_knee: 'right_knee',
  left_ankle: 'left_ankle',
  right_ankle: 'right_ankle',
  left_foot: 'left_foot',
  right_foot: 'right_foot',
};

function mapNativeLandmarks(raw: NativeLandmark[]): PoseLandmarks['landmarks'] {
  const mapped = [] as PoseLandmarks['landmarks'];
  for (const point of raw) {
    const byName = point.name ? NAME_NORMALIZE[point.name.toLowerCase()] : undefined;
    const byIndex = typeof point.index === 'number' ? INDEX_TO_NAME[point.index] : undefined;
    const name = byName ?? byIndex;
    if (!name) continue;
    mapped.push({
      name,
      x: point.x,
      y: point.y,
      z: point.z,
      visibility: point.visibility,
    });
  }
  return mapped;
}

export function createNativePoseProvider(moduleOverride?: NativePoseModule | null): PoseProvider {
  const nativeModule = moduleOverride ?? (NativeModules.AtlasPoseModule as NativePoseModule | undefined);

  return {
    id: `atlas-native-${Platform.OS}`,
    async initialize() {
      // no-op currently; module init is native-side.
    },
    async isAvailable() {
      if (!nativeModule || typeof nativeModule.estimatePose !== 'function') return false;
      if (nativeModule.isAvailable) return nativeModule.isAvailable();
      return true;
    },
    createAdapter(): LandmarkAdapter {
      return {
        id: 'atlas-native-adapter',
        async estimate(frame) {
          if (!nativeModule || typeof nativeModule.estimatePose !== 'function') return null;
          const result = await nativeModule.estimatePose(frame);
          if (!result || !Array.isArray(result.landmarks)) return null;
          return {
            confidence: result.confidence ?? 0,
            landmarks: mapNativeLandmarks(result.landmarks),
          };
        },
      };
    },
  };
}

export const __testables = { mapNativeLandmarks };
