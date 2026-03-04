import type { ExerciseAnalyzer, PoseFrame, RepCandidate } from '../repCounter';
import { CalfRaiseAnalyzer } from './calfRaise';

export class HeelRaiseAnalyzer implements ExerciseAnalyzer {
  readonly exerciseId = 'heel_raise';
  readonly requiredLandmarks = new CalfRaiseAnalyzer().requiredLandmarks;
  private inner = new CalfRaiseAnalyzer();
  processFrame(frame: PoseFrame, sessionMs: number): RepCandidate | null { return this.inner.processFrame(frame, sessionMs); }
  reset(): void { this.inner.reset(); }
}
