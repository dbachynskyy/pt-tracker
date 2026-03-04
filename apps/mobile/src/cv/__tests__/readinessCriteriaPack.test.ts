import { StabilizedRepCounter } from '../calibrationStabilization';
import { EXERCISE_IDS, createAnalyzer, type ExerciseId } from '../exerciseRegistry';
import { READINESS_CRITERIA } from '../readinessCriteria';
import { driveCounter, plankRepSequence, pushupRepSequence, sitToStandRepSequence, squatRepSequence } from './fixtures/frameBuilders';
import { abductionCycle, ankleCycle, bridgeCycle, kneeCycle } from './fixtures/moreExerciseBuilders';

function seqFor(id: ExerciseId): Array<{ frame: any; ms: number }> {
  switch (id) {
    case 'squat': return squatRepSequence(1, 1200);
    case 'pushup': return pushupRepSequence(1, 1200);
    case 'sit_to_stand': return sitToStandRepSequence(1, 1400);
    case 'lunge': return kneeCycle(1, 1300, 170, 85);
    case 'calf_raise': return ankleCycle(1, 900);
    case 'glute_bridge': return bridgeCycle(1, 1200);
    case 'shoulder_abduction': return abductionCycle(1, 1000);
    case 'heel_raise': return ankleCycle(1, 900);
    case 'knee_extension': return kneeCycle(1, 1000, 170, 95);
    case 'plank_hold': return plankRepSequence(1, 1500);
  }
}

function lowSignal(frame: any) {
  const copy = frame.map((lm: any) => ({ ...lm, visibility: 0.1 }));
  return Object.assign(copy, { source: 'real' });
}

describe('readiness criteria pack', () => {
  it('has criteria for all 10 canonical exercises', () => {
    expect(Object.keys(READINESS_CRITERIA)).toHaveLength(10);
    EXERCISE_IDS.forEach((id) => expect(READINESS_CRITERIA[id]).toBeTruthy());
  });

  it.each(EXERCISE_IDS)('%s reaches READY with valid signal', (id) => {
    const counter = new StabilizedRepCounter(createAnalyzer(id), 5, {
      readinessOverrides: {
        [id]: {
          calibrationFrames: 8,
          maxCalibrationFrames: 40,
          minRange: id.includes('raise') || id === 'glute_bridge' ? 0.001 : 2,
          minLandmarkConfidence: 0.3,
          minFrameConfidence: 0.3,
          minVisibleLandmarks: 2,
        },
      },
    });
    driveCounter(counter as any, seqFor(id));
    expect(counter.getCalibrationState().status).toBe('READY');
  });

  it.each(EXERCISE_IDS)('%s blocks and rejects with insufficient signal', (id) => {
    const counter = new StabilizedRepCounter(createAnalyzer(id), 5, {
      readinessOverrides: {
        [id]: {
          calibrationFrames: 8,
          maxCalibrationFrames: 12,
          minLandmarkConfidence: 0.8,
          minFrameConfidence: 0.8,
          minVisibleLandmarks: 6,
        },
      },
    });

    const seq = seqFor(id).slice(0, 20);
    for (const s of seq) counter.processFrame(lowSignal(s.frame), s.ms);

    const st = counter.getCalibrationState();
    expect(st.status).toBe('REJECTED');
    expect(st.reason).toBe('INSUFFICIENT_SIGNAL');
  });
});
