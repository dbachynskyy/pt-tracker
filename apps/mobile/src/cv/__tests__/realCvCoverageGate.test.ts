import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const REQUIRED = [
  'squat','pushup','sit_to_stand','plank','lunge',
  'glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction'
];

function attestation(passAll = true) {
  return {
    version: 'atlas-provenance-attestation.v1',
    generatedAt: new Date().toISOString(),
    aggregate: { total_exercises: 10, passed_exercises: passAll ? 10 : 9, failed_exercises: passAll ? 0 : 1, coverage_ratio: passAll ? 1 : 0.9 },
    exercises: REQUIRED.map((exercise) => ({
      exercise,
      pass: passAll,
      reasons: passAll ? [] : ['synthetic_fail'],
      metadata: {},
    })),
  };
}

function run(root: string, att: any, expectPass: boolean) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-gate-'));
  const inPath = path.join(dir, 'att.json');
  const outPath = path.join(dir, 'gate.json');
  fs.writeFileSync(inPath, JSON.stringify(att), 'utf8');

  const cmd = `node scripts/check-realcv-coverage.mjs "${inPath}" "${outPath}"`;
  if (expectPass) execSync(cmd, { cwd: root, stdio: 'pipe' });
  else expect(() => execSync(cmd, { cwd: root, stdio: 'pipe' })).toThrow();

  return JSON.parse(fs.readFileSync(outPath, 'utf8'));
}

describe('real CV coverage gate', () => {
  const root = path.resolve(__dirname, '../../..');

  it('passes when all 10 required exercises are present and pass=true', () => {
    const gate = run(root, attestation(true), true);
    expect(gate.version).toBe('atlas-coverage-gate.v1');
    expect(gate.aggregate.gate_pass).toBe(true);
    expect(gate.aggregate.passed_exercises).toBe(10);
  });

  it('fails when one required exercise is missing', () => {
    const a = attestation(true);
    a.exercises = a.exercises.filter((e: any) => e.exercise !== 'plank');
    const gate = run(root, a, false);
    const plank = gate.exercises.find((e: any) => e.exercise === 'plank');
    expect(plank.gate_pass).toBe(false);
    expect(plank.reasons).toContain('missing_exercise');
  });

  it('fails when one required exercise has pass=false', () => {
    const a = attestation(true);
    a.exercises.find((e: any) => e.exercise === 'lunge').pass = false;
    a.exercises.find((e: any) => e.exercise === 'lunge').reasons = ['camera_denied'];
    const gate = run(root, a, false);
    const lunge = gate.exercises.find((e: any) => e.exercise === 'lunge');
    expect(lunge.reasons).toContain('exercise_not_attested');
  });

  it('fails when unexpected exercise id is present', () => {
    const a = attestation(true);
    a.exercises.push({ exercise: 'burpee', pass: true, reasons: [], metadata: {} });
    const gate = run(root, a, false);
    const extra = gate.exercises.find((e: any) => e.exercise === '__unknown__');
    expect(extra.reasons).toContain('unexpected_exercise_ids');
    expect(extra.reasons).toContain('burpee');
  });
});
