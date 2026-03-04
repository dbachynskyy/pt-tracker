import { RepCounter } from '../repCounter';
import { CalfRaiseAnalyzer } from '../exercises/calfRaise';
import { ankleCycle } from './fixtures/moreExerciseBuilders';
import { driveCounter } from './fixtures/frameBuilders';

describe('CalfRaiseAnalyzer',()=>{
  it('counts reps',()=>{const ev=driveCounter(new RepCounter(new CalfRaiseAnalyzer(),4),ankleCycle(4,900));expect(ev).toHaveLength(4);});
});
