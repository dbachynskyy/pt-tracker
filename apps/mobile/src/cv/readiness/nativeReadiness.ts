import fs from 'fs';
import path from 'path';
import { createNativePoseProvider } from '../nativePoseProvider';
import { clearPoseProviderRuntimeError, getPoseProviderState, ProviderErrorCode } from '../poseProvider';
import { ExerciseType } from '../types';

export const CANONICAL_EXERCISES: ExerciseType[] = [
  'squat', 'pushup', 'sit_to_stand', 'plank', 'lunge',
  'glute_bridge', 'knee_extension', 'heel_raise', 'calf_raise', 'shoulder_abduction',
];

type NativePoseResult = { confidence?: number; landmarks: Array<{ index?: number; name?: string; x: number; y: number; z?: number; visibility?: number }>; };

export interface ReplayFrame {
  base64: string;
  timestampMs: number;
  expectedExercise: ExerciseType;
  nativePoseResult?: NativePoseResult | null;
  nativeError?: { code?: string; message?: string };
}
export interface ExerciseCaptureBundle { exercise: ExerciseType; frames: ReplayFrame[]; source?: string; }
export interface NativeReadinessBundle { version: 'atlas.native.capture.v1'; generatedAt: string; captures: ExerciseCaptureBundle[]; }
export interface ExerciseReadiness { exercise: ExerciseType; status: 'ready' | 'blocked'; reason: string; frameCount: number; successFrames: number; lastErrorCode?: ProviderErrorCode; }
export interface NativeReadinessArtifact { version: 'atlas.native-readiness.v1'; generatedAt: string; exercises: ExerciseReadiness[]; }

export async function evaluateBundle(bundle: NativeReadinessBundle): Promise<NativeReadinessArtifact> {
  const exercises: ExerciseReadiness[] = [];

  for (const exercise of CANONICAL_EXERCISES) {
    const capture = bundle.captures.find((c) => c.exercise === exercise);
    if (!capture || capture.frames.length === 0) {
      exercises.push({ exercise, status: 'blocked', reason: 'missing_capture_frames', frameCount: capture?.frames.length ?? 0, successFrames: 0 });
      continue;
    }

    const queue = [...capture.frames];
    const provider = createNativePoseProvider({
      isAvailable: async () => true,
      estimatePose: async () => {
        const next = queue.shift();
        if (!next) return null;
        if (next.nativeError) throw next.nativeError;
        return next.nativePoseResult ?? null;
      },
    });

    const adapter = provider.createAdapter();
    let successFrames = 0;
    let reason = 'ok';
    let lastError: ProviderErrorCode | undefined;

    for (const frame of capture.frames) {
      clearPoseProviderRuntimeError();
      const pose = await adapter.estimate({ base64: frame.base64, width: 1, height: 1, timestampMs: frame.timestampMs });
      const state = getPoseProviderState();
      if (pose) successFrames += 1;
      if (state.errorCode) {
        lastError = state.errorCode;
        reason = state.error ?? String(state.errorCode);
      }
    }

    exercises.push({
      exercise,
      status: successFrames > 0 ? 'ready' : 'blocked',
      reason: successFrames > 0 ? 'ok' : reason,
      frameCount: capture.frames.length,
      successFrames,
      lastErrorCode: lastError,
    });
  }

  return { version: 'atlas.native-readiness.v1', generatedAt: new Date().toISOString(), exercises };
}

export async function writeNativeReadinessArtifact(bundlePath: string, outPath: string) {
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8')) as NativeReadinessBundle;
  const artifact = await evaluateBundle(bundle);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifact;
}
