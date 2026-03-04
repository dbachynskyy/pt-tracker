import { StabilizedRepCounter } from '../calibrationStabilization';
import { EXERCISE_IDS, createAnalyzer, type ExerciseId } from '../exerciseRegistry';
import { driveCounter, plankRepSequence, pushupRepSequence, sitToStandRepSequence, squatRepSequence } from './fixtures/frameBuilders';
import { abductionCycle, ankleCycle, bridgeCycle, kneeCycle } from './fixtures/moreExerciseBuilders';

type Seq = Array<{ frame: any; ms: number }>;

function seqFor(id: ExerciseId): Seq {
  switch (id) {
    case 'squat': return squatRepSequence(2, 1200);
    case 'pushup': return pushupRepSequence(2, 1200);
    case 'sit_to_stand': return sitToStandRepSequence(2, 1400);
    case 'lunge': return kneeCycle(2, 1300, 170, 85);
    case 'calf_raise': return ankleCycle(2, 900);
    case 'glute_bridge': return bridgeCycle(2, 1200);
    case 'shoulder_abduction': return abductionCycle(2, 1000);
    case 'heel_raise': return ankleCycle(2, 900);
    case 'knee_extension': return kneeCycle(2, 1000, 170, 95);
    case 'plank_hold': return plankRepSequence(2, 1500);
  }
}

describe('runtime smoke scenarios for all canonical exercises', () => {
  it.each(EXERCISE_IDS)('%s calibrates to READY and emits at least one count/hold event', (id) => {
    const counter = new StabilizedRepCounter(createAnalyzer(id), 5, {
      requiredFrames: 8,
      maxFrames: 50,
      minRangeByExercise: {
        squat: 5, pushup: 5, sit_to_stand: 5, lunge: 5,
        calf_raise: 0.002, glute_bridge: 0.002, shoulder_abduction: 5,
        heel_raise: 0.002, knee_extension: 5, plank_hold: 2,
      },
      occlusionRecoveryFrames: 2,
    });

    const events = driveCounter(counter as any, seqFor(id));
    expect(counter.getCalibrationState().status).toBe('READY');
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});
