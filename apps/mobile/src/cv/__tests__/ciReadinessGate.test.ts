import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const SCRIPT = join(__dirname, '..', '..', '..', 'scripts', 'check-readiness-gate.js');
const EX = ['squat','pushup','sit_to_stand','lunge','calf_raise','glute_bridge','shoulder_abduction','heel_raise','knee_extension','plank_hold'];

function passArtifact() {
  const byExercise: any = {};
  for (const e of EX) {
    byExercise[e] = {
      failures: 0,
      reasons: {},
      quality: {
        sample_count: 3,
        confidence_p50: e.includes('raise') || e === 'glute_bridge' ? 0.56 : 0.61,
        confidence_p90: e.includes('raise') || e === 'glute_bridge' ? 0.66 : 0.71,
        rep_signal_present: true,
        status_reason: 'READY',
        gate_pass: true,
        gate_fail_reasons: [],
      },
    };
  }
  return {
    schemaVersion: 'orion.readiness.v1',
    threshold_profile_version: 'readiness-thresholds.v1',
    generatedAt: '1970-01-01T00:00:00.000Z',
    totals: { sessions: 1, exercisesObserved: 10, failures: 0 },
    byExercise,
  };
}

function runWith(obj: any) {
  const d = mkdtempSync(join(tmpdir(), 'gate-'));
  const art = join(d, 'artifact.json');
  const summary = join(d, 'summary.json');
  writeFileSync(art, JSON.stringify(obj, null, 2));
  const res = spawnSync(process.execPath, [SCRIPT, art, summary], { encoding: 'utf8' });
  return { ...res, summaryPath: summary };
}

describe('CI readiness gate script', () => {
  it('passes full-pass artifact and emits compact summary', () => {
    const res = runWith(passArtifact());
    expect(res.status).toBe(0);
    const summary = JSON.parse(readFileSync(res.summaryPath, 'utf8'));
    expect(summary.schemaVersion).toBe('orion.readiness.gate.v1');
    expect(summary.exercises).toHaveLength(10);
    expect(summary.exercises.every((e: any) => e.gate_pass)).toBe(true);
  });

  it('fails when one exercise fails gate', () => {
    const art = passArtifact();
    art.byExercise.pushup.quality.rep_signal_present = false;
    const res = runWith(art);
    expect(res.status).toBe(3);
    expect(res.stderr).toContain('pushup');
  });

  it('fails when threshold config missing exercise', () => {
    const d = mkdtempSync(join(tmpdir(), 'gate-missing-thr-'));
    const art = join(d, 'artifact.json');
    writeFileSync(art, JSON.stringify(passArtifact(), null, 2));

    // patch script copy with missing threshold entry
    const scriptCopy = join(d, 'script.js');
    const src = readFileSync(SCRIPT, 'utf8').replace("knee_extension: { minSamples: 1, minConfidenceP50: 0.6, minConfidenceP90: 0.7, requireRepSignal: true, allowedStatus: ['READY'] },\n", '');
    writeFileSync(scriptCopy, src);

    const res = spawnSync(process.execPath, [scriptCopy, art], { encoding: 'utf8' });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('missing threshold config');
  });


  it('emits blocker catalog + fallback options for auth/credits/rate-limit blockers', () => {
    const art = passArtifact();
    art.byExercise.squat.quality.status_reason = 'AUTH_UNAUTHORIZED_401';
    art.byExercise.pushup.quality.status_reason = 'CREDITS_QUOTA_EXCEEDED';
    art.byExercise.lunge.quality.status_reason = 'RATE_LIMIT_429';
    const res = runWith(art);
    expect(res.status).not.toBe(0);
    const summary = JSON.parse(readFileSync(res.summaryPath, 'utf8'));
    expect(summary.blocker_catalog).toEqual(expect.arrayContaining(['AUTH_BLOCKER','CREDITS_BLOCKER','RATE_LIMIT_BLOCKER']));
    expect(summary.fallback_options.length).toBeGreaterThan(0);
  });

  it('fails when threshold_profile_version is missing', () => {
    const art = passArtifact();
    delete (art as any).threshold_profile_version;
    const res = runWith(art);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('missing threshold_profile_version');
  });
});
