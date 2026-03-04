import { StabilizedRepCounter } from '../calibrationStabilization';
import { EXERCISE_IDS, createAnalyzer, type ExerciseId } from '../exerciseRegistry';
import { plankFrame, plankRepSequence, pushupFrame, pushupRepSequence, sitToStandRepSequence, squatFrame, squatRepSequence } from './fixtures/frameBuilders';
import { abductionCycle, ankleCycle, bridgeCycle, kneeCycle } from './fixtures/moreExerciseBuilders';

function movingSequence(id: ExerciseId): Array<{ frame: any; ms: number }> {
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

function staticFrameFor(id: ExerciseId): any {
  switch (id) {
    case 'squat':
    case 'sit_to_stand':
    case 'lunge':
    case 'knee_extension':
      return squatFrame(170);
    case 'pushup':
      return pushupFrame(165);
    case 'calf_raise':
    case 'heel_raise':
      return ankleCycle(1, 900)[0].frame;
    case 'glute_bridge':
      return bridgeCycle(1, 1200)[0].frame;
    case 'shoulder_abduction':
      return abductionCycle(1, 1000)[0].frame;
    case 'plank_hold':
      return plankFrame(120);
  }
}

describe('exercise readiness criteria pack', () => {
  it.each(EXERCISE_IDS)('%s reaches READY with sufficient deterministic movement signal', (id) => {
    const counter = new StabilizedRepCounter(createAnalyzer(id), 5);
    const seq = movingSequence(id);

    for (const { frame, ms } of seq) {
      counter.processFrame(frame, ms);
      if (counter.getCalibrationState().status === 'READY') break;
    }

    const state = counter.getCalibrationState();
    expect(state.status).toBe('READY');
    expect(state.reason).toBe('READY_THRESHOLD_MET');
  });

  it.each(EXERCISE_IDS)('%s rejects with insufficient signal on static stream', (id) => {
    const counter = new StabilizedRepCounter(createAnalyzer(id), 5);
    const frame = staticFrameFor(id);

    for (let i = 0; i < 140; i++) {
      counter.processFrame(frame, i * 33);
      if (counter.getCalibrationState().status === 'REJECTED') break;
    }

    const state = counter.getCalibrationState();
    expect(state.status).toBe('REJECTED');
    expect(state.reason).toBe('NO_SIGNAL');
  });
});
