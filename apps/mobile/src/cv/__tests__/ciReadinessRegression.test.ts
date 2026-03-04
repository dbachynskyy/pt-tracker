import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const SCRIPT = join(__dirname, '..', '..', '..', 'scripts', 'check-readiness-regression.js');
const FIX = join(__dirname, 'fixtures', 'regression');

function run(current: string, baseline: string, outName = 'out.json') {
  const d = mkdtempSync(join(tmpdir(), 'reg-'));
  const out = join(d, outName);
  const res = spawnSync(process.execPath, [SCRIPT, current, baseline, out], { encoding: 'utf8' });
  return { ...res, out };
}

describe('CI readiness regression guard', () => {
  it('passes on improve scenario', () => {
    const res = run(join(FIX, 'current_improve.json'), join(FIX, 'baseline.json'));
    expect(res.status).toBe(0);
    const out = JSON.parse(readFileSync(res.out, 'utf8'));
    expect(out.schemaVersion).toBe('orion.readiness.regression.v1');
    expect(out.regressions).toHaveLength(0);
  });

  it('passes on no-change scenario', () => {
    const res = run(join(FIX, 'current_nochange.json'), join(FIX, 'baseline.json'));
    expect(res.status).toBe(0);
  });

  it('fails on per-exercise regression scenario', () => {
    const res = run(join(FIX, 'current_regression.json'), join(FIX, 'baseline.json'));
    expect(res.status).toBe(4);
    expect(res.stderr).toContain('pushup');
    expect(res.stderr).toContain('GATE_PASS_FLIP');
  });

  it('fails when baseline is missing', () => {
    const res = run(join(FIX, 'current_nochange.json'), join(FIX, 'does_not_exist.json'));
    expect(res.status).toBe(5);
    expect(res.stderr).toContain('missing baseline');
  });
});
