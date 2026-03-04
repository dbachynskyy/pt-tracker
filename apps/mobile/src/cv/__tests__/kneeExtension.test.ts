import { RepCounter } from '../repCounter';
import { KneeExtensionAnalyzer } from '../exercises/kneeExtension';
import { kneeCycle } from './fixtures/moreExerciseBuilders';
import { driveCounter } from './fixtures/frameBuilders';

describe('KneeExtensionAnalyzer',()=>{
  it('counts reps',()=>{const ev=driveCounter(new RepCounter(new KneeExtensionAnalyzer(),3),kneeCycle(3,1000,170,95));expect(ev).toHaveLength(3);});
});
