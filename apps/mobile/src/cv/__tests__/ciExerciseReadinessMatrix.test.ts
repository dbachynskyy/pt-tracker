import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const SCRIPT = join(__dirname, '..', '..', '..', 'scripts', 'emit-exercise-readiness-matrix.js');
const SRC_IDS = ['squat','pushup','sit_to_stand','plank_hold','lunge','glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction'];

function baseArtifact() {
  const byExercise: any = {};
  for (const id of SRC_IDS) {
    byExercise[id] = {
      failures: 0,
      reasons: {},
      quality: {
        sample_count: 5,
        confidence_p50: 0.8,
        confidence_p90: 0.9,
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

function run(obj: any) {
  const d = mkdtempSync(join(tmpdir(), 'ex-readiness-'));
  const input = join(d, 'in.json');
  const output = join(d, 'out.json');
  writeFileSync(input, JSON.stringify(obj, null, 2));
  const res = spawnSync(process.execPath, [SCRIPT, input, output], { encoding: 'utf8' });
  return { ...res, output };
}

describe('exercise readiness matrix emitter', () => {
  it('emits all-pass matrix with exact 10 output exercise IDs (includes plank)', () => {
    const res = run(baseArtifact());
    expect(res.status).toBe(0);
    const out = JSON.parse(readFileSync(res.output, 'utf8'));
    expect(out.schemaVersion).toBe('helios-exercise-readiness.v1');
    const ids = out.exercises.map((e: any) => e.exercise).sort();
    expect(ids).toEqual(['calf_raise','glute_bridge','heel_raise','knee_extension','lunge','plank','pushup','shoulder_abduction','sit_to_stand','squat'].sort());
    expect(out.exercises.every((e: any) => e.gate_pass === true)).toBe(true);
  });

  it.each([
    ['AUTH_BLOCKER', 'AUTH_UNAUTHORIZED_401'],
    ['CREDITS_BLOCKER', 'CREDITS_QUOTA_EXCEEDED'],
    ['RATE_LIMIT_BLOCKER', 'RATE_LIMIT_429'],
  ])('flags single-exercise %s with fallback options', (blocker, status) => {
    const art = baseArtifact();
    art.byExercise.squat.quality.status_reason = status;
    art.byExercise.squat.quality.gate_pass = false;
    art.byExercise.squat.quality.gate_fail_reasons = ['STATUS_' + status];
    const res = run(art);
    expect(res.status).toBe(0);
    const out = JSON.parse(readFileSync(res.output, 'utf8'));
    const sq = out.exercises.find((e: any) => e.exercise === 'squat');
    expect(sq.blockers).toEqual(expect.arrayContaining([blocker, 'QUALITY_BLOCKER']));
    expect(sq.fallback_options.length).toBeGreaterThan(0);
  });

  it('fails malformed id set', () => {
    const art = baseArtifact();
    delete art.byExercise.plank_hold;
    const res = run(art);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('malformed id set');
  });
});
