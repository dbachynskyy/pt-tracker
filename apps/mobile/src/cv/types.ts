export type ExerciseType =
  | 'squat'
  | 'pushup'
  | 'sit_to_stand'
  | 'plank'
  | 'lunge'
  | 'glute_bridge'
  | 'knee_extension'
  | 'heel_raise'
  | 'calf_raise'
  | 'shoulder_abduction';

export const EXERCISE_LABELS: Record<ExerciseType, string> = {
  squat: 'Squat',
  pushup: 'Push-up',
  sit_to_stand: 'Sit-to-Stand',
  plank: 'Plank',
  lunge: 'Lunge',
  glute_bridge: 'Glute Bridge',
  knee_extension: 'Knee Extension',
  heel_raise: 'Heel Raise',
  calf_raise: 'Calf Raise',
  shoulder_abduction: 'Shoulder Abduction',
};

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
  formScore: number;
  durationMs: number;
  flags: ConfidenceFlag[];
}

export interface DetectorOutput {
  exerciseType: ExerciseType;
  repCount: number;
  formScore: number;
  confidence: number;
  flags: ConfidenceFlag[];
  reps: RepResult[];
  elapsedMs: number;
}

export interface Detector {
  readonly exerciseType: ExerciseType;
  start(onFrame: (output: DetectorOutput) => void): void;
  stop(): void;
  reset(): void;
}

export type LandmarkName =
  | 'left_shoulder'
  | 'right_shoulder'
  | 'left_elbow'
  | 'right_elbow'
  | 'left_wrist'
  | 'right_wrist'
  | 'left_hip'
  | 'right_hip'
  | 'left_knee'
  | 'right_knee'
  | 'left_ankle'
  | 'right_ankle'
  | 'left_foot'
  | 'right_foot'
  | 'nose';

export interface Landmark {
  name: LandmarkName;
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface PoseLandmarks {
  landmarks: Landmark[];
  confidence: number;
}

export interface CameraFrame {
  width: number;
  height: number;
  base64: string;
  timestampMs: number;
}

export interface LandmarkAdapter {
  readonly id: string;
  estimate(frame: CameraFrame): Promise<PoseLandmarks | null>;
}

export interface FrameSource {
  readFrame(): Promise<CameraFrame | null>;
}
