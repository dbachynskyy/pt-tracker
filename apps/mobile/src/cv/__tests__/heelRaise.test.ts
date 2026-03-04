import { RepCounter } from '../repCounter';
import { HeelRaiseAnalyzer } from '../exercises/heelRaise';
import { ankleCycle } from './fixtures/moreExerciseBuilders';
import { driveCounter } from './fixtures/frameBuilders';

describe('HeelRaiseAnalyzer',()=>{
  it('counts reps',()=>{const ev=driveCounter(new RepCounter(new HeelRaiseAnalyzer(),2),ankleCycle(2,900));expect(ev).toHaveLength(2);});
});
