import type { ExerciseId } from './exerciseRegistry';

export interface ExerciseReadinessThreshold {
  minSamples: number;
  minConfidenceP50: number;
  minConfidenceP90: number;
  requireRepSignal: boolean;
  allowedStatus: string[];
}

export const THRESHOLD_PROFILE_VERSION = 'readiness-thresholds.v1';

export const READINESS_THRESHOLDS: Record<ExerciseId, ExerciseReadinessThreshold> = {
  squat: { minSamples: 1, minConfidenceP50: 0.6, minConfidenceP90: 0.7, requireRepSignal: true, allowedStatus: ['READY'] },
  pushup: { minSamples: 1, minConfidenceP50: 0.6, minConfidenceP90: 0.7, requireRepSignal: true, allowedStatus: ['READY'] },
  sit_to_stand: { minSamples: 1, minConfidenceP50: 0.6, minConfidenceP90: 0.7, requireRepSignal: true, allowedStatus: ['READY'] },
  lunge: { minSamples: 1, minConfidenceP50: 0.6, minConfidenceP90: 0.7, requireRepSignal: true, allowedStatus: ['READY'] },
  calf_raise: { minSamples: 1, minConfidenceP50: 0.55, minConfidenceP90: 0.65, requireRepSignal: true, allowedStatus: ['READY'] },
  glute_bridge: { minSamples: 1, minConfidenceP50: 0.55, minConfidenceP90: 0.65, requireRepSignal: true, allowedStatus: ['READY'] },
  shoulder_abduction: { minSamples: 1, minConfidenceP50: 0.6, minConfidenceP90: 0.7, requireRepSignal: true, allowedStatus: ['READY'] },
  heel_raise: { minSamples: 1, minConfidenceP50: 0.55, minConfidenceP90: 0.65, requireRepSignal: true, allowedStatus: ['READY'] },
  knee_extension: { minSamples: 1, minConfidenceP50: 0.6, minConfidenceP90: 0.7, requireRepSignal: true, allowedStatus: ['READY'] },
  plank_hold: { minSamples: 1, minConfidenceP50: 0.6, minConfidenceP90: 0.7, requireRepSignal: true, allowedStatus: ['READY'] },
};
