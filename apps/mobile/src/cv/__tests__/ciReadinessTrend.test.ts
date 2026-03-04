import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const SCRIPT = join(__dirname, '..', '..', '..', 'scripts', 'check-readiness-trend.js');
const FIX = join(__dirname, 'fixtures', 'trend');

function run(current: string, baseline: string) {
  const d = mkdtempSync(join(tmpdir(), 'trend-'));
  const trendOut = join(d, 'trend.json');
  const summaryOut = join(d, 'trend-summary.json');
  const res = spawnSync(process.execPath, [SCRIPT, current, baseline, trendOut, summaryOut], { encoding: 'utf8' });
  return { ...res, trendOut, summaryOut };
}

describe('CI readiness trend guard', () => {
  it('passes improving case and emits lane summary artifact', () => {
    const res = run(join(FIX, 'current_improving.json'), join(FIX, 'baseline.json'));
    expect(res.status).toBe(0);
    const trend = JSON.parse(readFileSync(res.trendOut, 'utf8'));
    const summary = JSON.parse(readFileSync(res.summaryOut, 'utf8'));
    expect(trend.schemaVersion).toBe('helios-readiness-trend.v1');
    expect(summary.schemaVersion).toBe('helios-readiness-trend-summary.v1');
    expect(summary.totals.improved_count).toBeGreaterThan(0);
    expect(summary.gated_degrade_incidents).toHaveLength(0);
  });

  it('passes clean/no-change case', () => {
    const res = run(join(FIX, 'current_clean.json'), join(FIX, 'baseline.json'));
    expect(res.status).toBe(0);
    const summary = JSON.parse(readFileSync(res.summaryOut, 'utf8'));
    expect(summary.totals.flat_count).toBe(10);
    expect(summary.median_delta).toBe(0);
  });

  it('fails degraded incidents case and records gated incidents', () => {
    const res = run(join(FIX, 'current_degraded_incidents.json'), join(FIX, 'baseline.json'));
    expect(res.status).toBe(6);
    const summary = JSON.parse(readFileSync(res.summaryOut, 'utf8'));
    expect(summary.gated_degrade_incidents.length).toBeGreaterThan(0);
    expect(summary.gated_degrade_incidents[0].exercise).toBe('pushup');
  });

  it('passes mixed case and reports counts/rates/worst deltas', () => {
    const res = run(join(FIX, 'current_mixed.json'), join(FIX, 'baseline.json'));
    expect(res.status).toBe(0);
    const summary = JSON.parse(readFileSync(res.summaryOut, 'utf8'));
    expect(summary.totals.exercises).toBe(10);
    expect(summary.totals.improved_count + summary.totals.flat_count + summary.totals.degraded_count).toBe(10);
    expect(summary.worst_deltas.length).toBeLessThanOrEqual(3);
  });

  it('fails missing baseline', () => {
    const res = run(join(FIX, 'current_clean.json'), join(FIX, 'missing.json'));
    expect(res.status).toBe(5);
    expect(res.stderr).toContain('missing baseline');
  });
});
