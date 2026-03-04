import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const SCRIPT = join(__dirname, '..', '..', '..', 'scripts', 'emit-exercise-readiness-matrix.js');
const EVID = join(__dirname, 'fixtures', 'evidence');
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

function run(obj: any, evidencePath?: string) {
  const d = mkdtempSync(join(tmpdir(), 'ex-readiness-'));
  const input = join(d, 'in.json');
  const output = join(d, 'out.json');
  const evidenceOut = join(d, 'evidence-out.json');
  writeFileSync(input, JSON.stringify(obj, null, 2));
  const args = [SCRIPT, input, output];
  if (evidencePath) args.push(evidencePath, evidenceOut);
  const res = spawnSync(process.execPath, args, { encoding: 'utf8' });
  return { ...res, output, evidenceOut };
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
    ['AUTH_BLOCKER', 'AUTH_UNAUTHORIZED_401', join(EVID, 'auth.log')],
    ['CREDITS_BLOCKER', 'CREDITS_QUOTA_EXCEEDED', join(EVID, 'credits.log')],
    ['RATE_LIMIT_BLOCKER', 'RATE_LIMIT_429', join(EVID, 'rate.log')],
  ])('flags single-exercise %s with evidence + fallback options', (blocker, status, evidencePath) => {
    const art = baseArtifact();
    art.byExercise.squat.quality.status_reason = status;
    art.byExercise.squat.quality.gate_pass = false;
    art.byExercise.squat.quality.gate_fail_reasons = ['STATUS_' + status];
    const res = run(art, evidencePath);
    expect(res.status).toBe(0);
    const out = JSON.parse(readFileSync(res.output, 'utf8'));
    const sq = out.exercises.find((e: any) => e.exercise === 'squat');
    expect(sq.blockers).toEqual(expect.arrayContaining([blocker, 'QUALITY_BLOCKER']));
    expect(sq.fallback_options.length).toBeGreaterThan(0);
    expect(sq.blocker_catalog.find((b: any) => b.blocker === blocker).evidence.source).toContain('.log');

    const ev = JSON.parse(readFileSync(res.evidenceOut, 'utf8'));
    expect(ev.schemaVersion).toBe('helios-exercise-readiness-evidence.v1');
  });

  it('handles mixed blocker evidence', () => {
    const art = baseArtifact();
    art.byExercise.squat.quality.status_reason = 'AUTH_UNAUTHORIZED_401';
    art.byExercise.pushup.quality.status_reason = 'CREDITS_QUOTA_EXCEEDED';
    art.byExercise.lunge.quality.status_reason = 'RATE_LIMIT_429';
    art.byExercise.squat.quality.gate_pass = false;
    art.byExercise.pushup.quality.gate_pass = false;
    art.byExercise.lunge.quality.gate_pass = false;
    const res = run(art, join(EVID, 'mixed.log'));
    expect(res.status).toBe(0);
    const out = JSON.parse(readFileSync(res.output, 'utf8'));
    const blocked = out.exercises.flatMap((e: any) => e.blockers);
    expect(blocked).toEqual(expect.arrayContaining(['AUTH_BLOCKER','CREDITS_BLOCKER','RATE_LIMIT_BLOCKER']));
  });

  it('fails malformed id set', () => {
    const art = baseArtifact();
    delete art.byExercise.plank_hold;
    const res = run(art);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('malformed id set');
  });

  it('fails malformed evidence input', () => {
    const res = run(baseArtifact(), join(EVID, 'malformed.json'));
    expect(res.status).toBe(8);
    expect(res.stderr).toContain('malformed evidence input');
  });
});
