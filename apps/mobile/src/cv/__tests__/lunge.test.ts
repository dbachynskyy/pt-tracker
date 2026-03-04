import { RepCounter } from '../repCounter';
import { LungeAnalyzer } from '../exercises/lunge';
import { kneeCycle } from './fixtures/moreExerciseBuilders';
import { driveCounter } from './fixtures/frameBuilders';

describe('LungeAnalyzer',()=>{
  it('counts clean reps',()=>{const ev=driveCounter(new RepCounter(new LungeAnalyzer(),3),kneeCycle(3,1200));expect(ev).toHaveLength(3);});
  it('flags fast reps',()=>{const ev=driveCounter(new RepCounter(new LungeAnalyzer(),2),kneeCycle(2,500));expect(ev[0].flags).toContain('TOO_FAST');});
});
