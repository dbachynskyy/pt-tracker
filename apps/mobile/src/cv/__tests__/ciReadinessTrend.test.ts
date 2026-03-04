import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const SCRIPT = join(__dirname, '..', '..', '..', 'scripts', 'check-readiness-trend.js');
const FIX = join(__dirname, 'fixtures', 'trend');

function run(current: string, baseline: string, outName = 'trend.json') {
  const d = mkdtempSync(join(tmpdir(), 'trend-'));
  const out = join(d, outName);
  const res = spawnSync(process.execPath, [SCRIPT, current, baseline, out], { encoding: 'utf8' });
  return { ...res, out };
}

describe('CI readiness trend guard', () => {
  it('passes improved case and emits trend artifact', () => {
    const res = run(join(FIX, 'current_improved.json'), join(FIX, 'baseline.json'));
    expect(res.status).toBe(0);
    const trend = JSON.parse(readFileSync(res.out, 'utf8'));
    expect(trend.schemaVersion).toBe('helios-readiness-trend.v1');
    const push = trend.exercises.find((e: any) => e.exercise === 'pushup');
    expect(push.band).toBe('improved');
  });

  it('passes flat case', () => {
    const res = run(join(FIX, 'current_flat.json'), join(FIX, 'baseline.json'));
    expect(res.status).toBe(0);
  });

  it('fails degraded case when gate_pass remains true and drop exceeds threshold', () => {
    const res = run(join(FIX, 'current_degraded.json'), join(FIX, 'baseline.json'));
    expect(res.status).toBe(6);
    expect(res.stderr).toContain('pushup:score_drop:80->70');
  });

  it('passes mixed case when degradation does not exceed threshold', () => {
    const res = run(join(FIX, 'current_mixed.json'), join(FIX, 'baseline.json'));
    expect(res.status).toBe(0);
  });

  it('fails missing baseline', () => {
    const res = run(join(FIX, 'current_flat.json'), join(FIX, 'missing.json'));
    expect(res.status).toBe(5);
    expect(res.stderr).toContain('missing baseline');
  });
});
