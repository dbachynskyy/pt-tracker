import { RepCounter } from '../repCounter';
import { PlankHoldAnalyzer } from '../exercises/plankHold';
import { plankRepSequence, driveCounter } from './fixtures/frameBuilders';

describe('PlankHoldAnalyzer',()=>{
  it('counts holds and uses plank_hold id',()=>{
    const counter=new RepCounter(new PlankHoldAnalyzer(),2);
    const ev=driveCounter(counter,plankRepSequence(2,1500));
    expect(ev).toHaveLength(2);
    expect(counter.getSession().exerciseId).toBe('plank_hold');
  });
});
