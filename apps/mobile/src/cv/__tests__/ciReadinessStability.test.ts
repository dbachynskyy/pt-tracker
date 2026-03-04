import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const SCRIPT = join(__dirname, '..', '..', '..', 'scripts', 'check-readiness-stability.js');
const FIX = join(__dirname, 'fixtures', 'stability');

function run(history: string) {
  const d = mkdtempSync(join(tmpdir(), 'stability-'));
  const out = join(d, 'stability-summary.json');
  const res = spawnSync(process.execPath, [SCRIPT, history, out], { encoding: 'utf8' });
  return { ...res, out };
}

describe('CI readiness stability guard', () => {
  it('passes stable history', () => {
    const res = run(join(FIX, 'stable.json'));
    expect(res.status).toBe(0);
    const out = JSON.parse(readFileSync(res.out, 'utf8'));
    expect(out.schemaVersion).toBe('helios-stability-summary.v1');
    expect(out.severe_instability_incidents).toHaveLength(0);
  });

  it('passes mildly noisy history', () => {
    const res = run(join(FIX, 'mildly_noisy.json'));
    expect(res.status).toBe(0);
  });


  it('emits blocker catalog/fallback options for all blocker classes', () => {
    const res = run(join(FIX, 'blockers_all.json'));
    expect(res.status).toBe(0);
    const out = JSON.parse(readFileSync(res.out, 'utf8'));
    expect(out.blocker_catalog).toEqual(expect.arrayContaining(['AUTH_BLOCKER','CREDITS_BLOCKER','RATE_LIMIT_BLOCKER']));
    expect(out.fallback_options.length).toBeGreaterThan(0);
  });

  it('emits mixed blocker catalog deterministically', () => {
    const res = run(join(FIX, 'blockers_mixed.json'));
    expect(res.status).toBe(0);
    const out = JSON.parse(readFileSync(res.out, 'utf8'));
    expect(out.blocker_catalog).toEqual(expect.arrayContaining(['AUTH_BLOCKER','RATE_LIMIT_BLOCKER']));
  });

  it('fails severe unstable history', () => {
    const res = run(join(FIX, 'severe_unstable.json'));
    expect(res.status).toBe(7);
    expect(res.stderr).toContain('pushup');
  });

  it('passes mixed history when unstable exercise is currently gate_pass=false', () => {
    const res = run(join(FIX, 'mixed.json'));
    expect(res.status).toBe(0);
    const out = JSON.parse(readFileSync(res.out, 'utf8'));
    expect(out.exercises).toHaveLength(10);
  });
});
