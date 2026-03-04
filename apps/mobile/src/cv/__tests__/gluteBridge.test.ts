import { RepCounter } from '../repCounter';
import { GluteBridgeAnalyzer } from '../exercises/gluteBridge';
import { bridgeCycle } from './fixtures/moreExerciseBuilders';
import { driveCounter } from './fixtures/frameBuilders';

describe('GluteBridgeAnalyzer',()=>{
  it('counts bridge reps',()=>{const ev=driveCounter(new RepCounter(new GluteBridgeAnalyzer(),3),bridgeCycle(3,1200));expect(ev).toHaveLength(3);});
});
