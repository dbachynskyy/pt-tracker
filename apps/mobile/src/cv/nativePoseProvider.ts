import { NativeModules, Platform } from 'react-native';
import { LandmarkAdapter, LandmarkName, PoseLandmarks } from './types';
import {
  clearPoseProviderRuntimeError,
  PoseProvider,
  ProviderErrorCode,
  setPoseProviderRuntimeError,
} from './poseProvider';

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
  0: 'nose', 11: 'left_shoulder', 12: 'right_shoulder', 13: 'left_elbow', 14: 'right_elbow',
  15: 'left_wrist', 16: 'right_wrist', 23: 'left_hip', 24: 'right_hip', 25: 'left_knee',
  26: 'right_knee', 27: 'left_ankle', 28: 'right_ankle', 31: 'left_foot', 32: 'right_foot',
};

const NAME_NORMALIZE: Record<string, LandmarkName> = {
  nose: 'nose',
  left_shoulder: 'left_shoulder', right_shoulder: 'right_shoulder',
  left_elbow: 'left_elbow', right_elbow: 'right_elbow',
  left_wrist: 'left_wrist', right_wrist: 'right_wrist',
  left_hip: 'left_hip', right_hip: 'right_hip',
  left_knee: 'left_knee', right_knee: 'right_knee',
  left_ankle: 'left_ankle', right_ankle: 'right_ankle',
  left_foot: 'left_foot', right_foot: 'right_foot',
};

function fail(code: ProviderErrorCode, reason: string): null {
  setPoseProviderRuntimeError({ code, reason });
  return null;
}

function mapNativeLandmarks(raw: NativeLandmark[]): PoseLandmarks['landmarks'] {
  const mapped = [] as PoseLandmarks['landmarks'];
  for (const point of raw) {
    const byName = point.name ? NAME_NORMALIZE[point.name.toLowerCase()] : undefined;
    const byIndex = typeof point.index === 'number' ? INDEX_TO_NAME[point.index] : undefined;
    const name = byName ?? byIndex;
    if (!name) continue;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
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

function validateFrameTimestamp(timestampMs: number): ProviderErrorCode | null {
  if (!Number.isFinite(timestampMs)) return 'BAD_TIMESTAMP';
  const delta = Math.abs(Date.now() - timestampMs);
  if (delta > 60_000) return 'BAD_TIMESTAMP';
  return null;
}

export function createNativePoseProvider(moduleOverride?: NativePoseModule | null): PoseProvider {
  const nativeModule = moduleOverride ?? (NativeModules.AtlasPoseModule as NativePoseModule | undefined);

  return {
    id: `atlas-native-${Platform.OS}`,
    async initialize() {},
    async isAvailable() {
      if (!nativeModule || typeof nativeModule.estimatePose !== 'function') {
        setPoseProviderRuntimeError({ code: 'MODULE_MISSING', reason: 'Native module AtlasPoseModule missing estimatePose' });
        return false;
      }
      if (nativeModule.isAvailable) return nativeModule.isAvailable();
      return true;
    },
    createAdapter(): LandmarkAdapter {
      return {
        id: 'atlas-native-adapter',
        async estimate(frame) {
          if (!nativeModule || typeof nativeModule.estimatePose !== 'function') {
            return fail('MODULE_MISSING', 'Native module AtlasPoseModule missing estimatePose');
          }

          const timestampErr = validateFrameTimestamp(frame.timestampMs);
          if (timestampErr) return fail(timestampErr, `Bad frame timestamp: ${frame.timestampMs}`);

          const result = await nativeModule.estimatePose(frame);
          if (!result || !Array.isArray(result.landmarks)) {
            return fail('BAD_PAYLOAD_SHAPE', 'estimatePose returned null or non-array landmarks');
          }

          if (result.confidence !== undefined && !Number.isFinite(result.confidence)) {
            return fail('BAD_CONFIDENCE', 'estimatePose confidence is non-numeric');
          }

          if (result.landmarks.length < 4 || result.landmarks.length > 64) {
            return fail('BAD_LANDMARKS', `landmark count out of range: ${result.landmarks.length}`);
          }

          const mapped = mapNativeLandmarks(result.landmarks);
          if (mapped.length < 4) {
            return fail('BAD_LANDMARKS', `mapped landmarks too sparse: ${mapped.length}`);
          }

          clearPoseProviderRuntimeError();
          return {
            confidence: result.confidence ?? 0,
            landmarks: mapped,
          };
        },
      };
    },
  };
}

export const __testables = { mapNativeLandmarks, validateFrameTimestamp };
