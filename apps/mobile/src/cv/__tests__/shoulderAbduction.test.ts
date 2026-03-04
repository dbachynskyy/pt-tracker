import { RepCounter } from '../repCounter';
import { ShoulderAbductionAnalyzer } from '../exercises/shoulderAbduction';
import { abductionCycle } from './fixtures/moreExerciseBuilders';
import { driveCounter } from './fixtures/frameBuilders';

describe('ShoulderAbductionAnalyzer',()=>{
  it('counts reps',()=>{const ev=driveCounter(new RepCounter(new ShoulderAbductionAnalyzer(),3),abductionCycle(3,1000));expect(ev).toHaveLength(3);});
});
