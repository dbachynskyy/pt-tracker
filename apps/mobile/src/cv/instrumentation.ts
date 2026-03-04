import { ExerciseType } from './types';

export type CvEvent =
  | { type: 'cv_provider_initialized'; providerId: string; available: boolean }
  | { type: 'cv_provider_init_error'; error: string }
  | { type: 'cv_detector_started'; exerciseType: ExerciseType }
  | { type: 'cv_detector_stopped'; exerciseType: ExerciseType }
  | { type: 'cv_metrics'; exerciseType: ExerciseType; fps: number; avgConfidence: number; disconnectRate: number };

let sink: ((event: CvEvent) => void) | null = null;

export function registerCvEventSink(nextSink: ((event: CvEvent) => void) | null) {
  sink = nextSink;
}

export function emitCvEvent(event: CvEvent) {
  sink?.(event);
}
