import type { ExerciseId } from './exerciseRegistry';

export interface ExerciseReadinessCriteria {
  minVisibleLandmarks: number;
  minLandmarkConfidence: number;
  minFrameConfidence: number;
  minRange: number;
  calibrationFrames: number;
  maxCalibrationFrames: number;
}

export const READINESS_CRITERIA: Record<ExerciseId, ExerciseReadinessCriteria> = {
  squat: { minVisibleLandmarks: 6, minLandmarkConfidence: 0.55, minFrameConfidence: 0.6, minRange: 35, calibrationFrames: 24, maxCalibrationFrames: 90 },
  pushup: { minVisibleLandmarks: 8, minLandmarkConfidence: 0.55, minFrameConfidence: 0.6, minRange: 30, calibrationFrames: 24, maxCalibrationFrames: 90 },
  sit_to_stand: { minVisibleLandmarks: 6, minLandmarkConfidence: 0.55, minFrameConfidence: 0.6, minRange: 35, calibrationFrames: 24, maxCalibrationFrames: 90 },
  lunge: { minVisibleLandmarks: 6, minLandmarkConfidence: 0.55, minFrameConfidence: 0.6, minRange: 30, calibrationFrames: 24, maxCalibrationFrames: 90 },
  calf_raise: { minVisibleLandmarks: 4, minLandmarkConfidence: 0.5, minFrameConfidence: 0.55, minRange: 0.03, calibrationFrames: 20, maxCalibrationFrames: 80 },
  glute_bridge: { minVisibleLandmarks: 6, minLandmarkConfidence: 0.5, minFrameConfidence: 0.55, minRange: 0.03, calibrationFrames: 20, maxCalibrationFrames: 80 },
  shoulder_abduction: { minVisibleLandmarks: 6, minLandmarkConfidence: 0.55, minFrameConfidence: 0.6, minRange: 25, calibrationFrames: 22, maxCalibrationFrames: 90 },
  heel_raise: { minVisibleLandmarks: 4, minLandmarkConfidence: 0.5, minFrameConfidence: 0.55, minRange: 0.03, calibrationFrames: 20, maxCalibrationFrames: 80 },
  knee_extension: { minVisibleLandmarks: 6, minLandmarkConfidence: 0.55, minFrameConfidence: 0.6, minRange: 35, calibrationFrames: 24, maxCalibrationFrames: 90 },
  plank_hold: { minVisibleLandmarks: 6, minLandmarkConfidence: 0.55, minFrameConfidence: 0.6, minRange: 8, calibrationFrames: 24, maxCalibrationFrames: 90 },
};
