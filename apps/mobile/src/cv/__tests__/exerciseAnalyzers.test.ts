import { pushupStep, sitToStandStep, squatStep } from '../exerciseAnalyzers';
import { PoseLandmarks } from '../types';

function pose(landmarks: PoseLandmarks['landmarks']): PoseLandmarks {
  return { landmarks, confidence: 0.95 };
}

describe('exercise analyzers', () => {
  it('counts squat rep on down->up transition', () => {
    const down = pose([
      { name: 'left_hip', x: 0, y: 0 }, { name: 'left_knee', x: 0, y: 1 }, { name: 'left_ankle', x: 1, y: 1 },
      { name: 'right_hip', x: 2, y: 0 }, { name: 'right_knee', x: 2, y: 1 }, { name: 'right_ankle', x: 3, y: 1 },
    ]);
    const up = pose([
      { name: 'left_hip', x: 0, y: 0 }, { name: 'left_knee', x: 0, y: 1 }, { name: 'left_ankle', x: 0, y: 2 },
      { name: 'right_hip', x: 2, y: 0 }, { name: 'right_knee', x: 2, y: 1 }, { name: 'right_ankle', x: 2, y: 2 },
    ]);
    const s1 = squatStep(down, { phase: 'up', repStartMs: 0 });
    const s2 = squatStep(up, s1.state);
    expect(s2.didRep).toBe(true);
  });

  it('counts pushup rep', () => {
    const down = pose([
      { name: 'left_shoulder', x: 0, y: 0 }, { name: 'left_elbow', x: 0, y: 1 }, { name: 'left_wrist', x: 1, y: 1 },
      { name: 'right_shoulder', x: 2, y: 0 }, { name: 'right_elbow', x: 2, y: 1 }, { name: 'right_wrist', x: 3, y: 1 },
    ]);
    const up = pose([
      { name: 'left_shoulder', x: 0, y: 0 }, { name: 'left_elbow', x: 0, y: 1 }, { name: 'left_wrist', x: 0, y: 2 },
      { name: 'right_shoulder', x: 2, y: 0 }, { name: 'right_elbow', x: 2, y: 1 }, { name: 'right_wrist', x: 2, y: 2 },
    ]);
    const s1 = pushupStep(down, { phase: 'up', repStartMs: 0 });
    const s2 = pushupStep(up, s1.state);
    expect(s2.didRep).toBe(true);
  });

  it('counts sit_to_stand rep', () => {
    const down = pose([
      { name: 'left_hip', x: 0.4, y: 0.85 }, { name: 'left_knee', x: 0.42, y: 0.7 },
      { name: 'right_hip', x: 0.6, y: 0.85 }, { name: 'right_knee', x: 0.58, y: 0.7 },
    ]);
    const up = pose([
      { name: 'left_hip', x: 0.4, y: 0.5 }, { name: 'left_knee', x: 0.42, y: 0.7 },
      { name: 'right_hip', x: 0.6, y: 0.5 }, { name: 'right_knee', x: 0.58, y: 0.7 },
    ]);
    const s1 = sitToStandStep(down, { phase: 'up', repStartMs: 0 });
    const s2 = sitToStandStep(up, s1.state);
    expect(s2.didRep).toBe(true);
  });
});
