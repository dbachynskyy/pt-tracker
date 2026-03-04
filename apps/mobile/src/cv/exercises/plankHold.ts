import type { ExerciseAnalyzer, PoseFrame, RepCandidate } from '../repCounter';
import { PlankAnalyzer } from './plank';

export class PlankHoldAnalyzer implements ExerciseAnalyzer {
  readonly exerciseId = 'plank_hold';
  readonly requiredLandmarks = new PlankAnalyzer().requiredLandmarks;
  private inner = new PlankAnalyzer();
  processFrame(frame: PoseFrame, sessionMs: number): RepCandidate | null { return this.inner.processFrame(frame, sessionMs); }
  reset(): void { this.inner.reset(); }
}
