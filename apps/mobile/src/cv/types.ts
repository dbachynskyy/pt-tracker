/**
 * Shared CV detector types for Atlas mobile.
 *
 * Helios CV lane plugs real detector implementations here;
 * Atlas ships mock detectors so UI flows work independently.
 */

export type ExerciseType = 'squat' | 'pushup' | 'plank' | 'sit_to_stand';

export const EXERCISE_LABELS: Record<ExerciseType, string> = {
  squat: 'Squat',
  pushup: 'Push-up',
  plank: 'Plank',
  sit_to_stand: 'Sit-to-Stand',
};

/** Plank is a timed hold; the others are rep-counted. */
export const HOLD_EXERCISES = new Set<ExerciseType>(['plank']);

export type ConfidenceFlag =
  | 'INSUFFICIENT_DEPTH'
  | 'PARTIAL_ROM'
  | 'POOR_FORM'
  | 'LOW_CONFIDENCE';

export const FLAG_LABELS: Record<ConfidenceFlag, string> = {
  INSUFFICIENT_DEPTH: 'Insufficient depth',
  PARTIAL_ROM: 'Partial range of motion',
  POOR_FORM: 'Poor form',
  LOW_CONFIDENCE: 'Low confidence',
};

export interface RepResult {
  repNumber: number;
  /** 0–100 */
  formScore: number;
  durationMs: number;
  flags: ConfidenceFlag[];
}

export interface DetectorOutput {
  exerciseType: ExerciseType;
  /** For hold exercises (plank) this is always 0; use elapsedMs for hold time. */
  repCount: number;
  /** 0–100 rolling average over all reps; 100 when no reps yet. */
  formScore: number;
  /** 0–1 pose confidence estimate. */
  confidence: number;
  flags: ConfidenceFlag[];
  reps: RepResult[];
  elapsedMs: number;
}

export interface Detector {
  readonly exerciseType: ExerciseType;
  /** Begin detection; calls onFrame on every output update. */
  start(onFrame: (output: DetectorOutput) => void): void;
  stop(): void;
  reset(): void;
}
