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
    exercises: REQUIRED.map((exercise) => ({ exercise, pass: passAll, reasons: passAll ? [] : ['synthetic_fail'], metadata: {} })),
  };
}

function bundleAllValid() {
  return {
    version: 'atlas.native.capture.v1',
    generatedAt: new Date().toISOString(),
    captures: REQUIRED.map((exercise, i) => ({
      exercise,
      exercise_id: exercise,
      capture_id: `cap-${exercise}`,
      device_id: `iphone15-${exercise}`,
      ts: 1772600000000 + i * 1000,
      source: `real-device-${exercise}`,
      frames: [
        { base64: 'aGVsbG8=', timestampMs: 1772600000000 + i * 1000, expectedExercise: exercise, rep_count: 1, confidence: 0.91, nativePoseResult: { confidence: 0.91, landmarks: [{ index: 11, x: 0.2, y: 0.2 }, { index: 12, x: 0.3, y: 0.2 }, { index: 23, x: 0.4, y: 0.5 }, { index: 24, x: 0.5, y: 0.5 }] } },
        { base64: 'aGVsbG8=', timestampMs: 1772600000033 + i * 1000, expectedExercise: exercise, rep_count: 2, confidence: 0.88, nativePoseResult: { confidence: 0.88, landmarks: [{ index: 11, x: 0.2, y: 0.2 }, { index: 12, x: 0.3, y: 0.2 }, { index: 23, x: 0.4, y: 0.5 }, { index: 24, x: 0.5, y: 0.5 }] } },
        { base64: 'aGVsbG8=', timestampMs: 1772600000066 + i * 1000, expectedExercise: exercise, rep_count: 3, confidence: 0.85, nativePoseResult: { confidence: 0.85, landmarks: [{ index: 11, x: 0.2, y: 0.2 }, { index: 12, x: 0.3, y: 0.2 }, { index: 23, x: 0.4, y: 0.5 }, { index: 24, x: 0.5, y: 0.5 }] } },
      ],
    })),
  };
}

function run(root: string, att: any, bundle: any, expectPass: boolean) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-gate-'));
  const attPath = path.join(dir, 'att.json');
  const bundlePath = path.join(dir, 'bundle.json');
  const gatePath = path.join(dir, 'gate.json');
  const capValPath = path.join(dir, 'capture-validation.json');
  fs.writeFileSync(attPath, JSON.stringify(att), 'utf8');
  fs.writeFileSync(bundlePath, JSON.stringify(bundle), 'utf8');

  const cmd = `node scripts/check-realcv-coverage.mjs "${attPath}" "${gatePath}" "${bundlePath}" "${capValPath}"`;
  if (expectPass) execSync(cmd, { cwd: root, stdio: 'pipe' });
  else expect(() => execSync(cmd, { cwd: root, stdio: 'pipe' })).toThrow();

  return {
    gate: JSON.parse(fs.readFileSync(gatePath, 'utf8')),
    cap: JSON.parse(fs.readFileSync(capValPath, 'utf8')),
  };
}

describe('real CV coverage gate with capture validation', () => {
  const root = path.resolve(__dirname, '../../..');

  it('passes when all 10 required exercises are attested and have valid bundle captures', () => {
    const { gate, cap } = run(root, attestation(true), bundleAllValid(), true);
    expect(gate.aggregate.gate_pass).toBe(true);
    expect(cap.aggregate.valid_exercises).toBe(10);
  });

  it('fails when required exercise capture metadata is missing', () => {
    const b = bundleAllValid();
    delete b.captures.find((c: any) => c.exercise === 'plank').capture_id;
    const { gate, cap } = run(root, attestation(true), b, false);
    expect(cap.exercises.find((e: any) => e.exercise === 'plank').reasons).toContain('capture_id_missing');
    expect(gate.exercises.find((e: any) => e.exercise === 'plank').reasons).toContain('no_valid_capture_bundle');
  });

  it('fails when exercise_id mismatches canonical id', () => {
    const b = bundleAllValid();
    b.captures.find((c: any) => c.exercise === 'lunge').exercise_id = 'lunges';
    const { cap } = run(root, attestation(true), b, false);
    expect(cap.exercises.find((e: any) => e.exercise === 'lunge').reasons).toContain('exercise_id_mismatch');
  });

  it('fails when capture bundle is empty', () => {
    const b = bundleAllValid();
    b.captures.find((c: any) => c.exercise === 'pushup').frames = [];
    const { cap } = run(root, attestation(true), b, false);
    expect(cap.exercises.find((e: any) => e.exercise === 'pushup').reasons).toContain('empty_bundle');
  });

  it('fails on mixed validity (one failing capture among valid set)', () => {
    const b = bundleAllValid();
    const row = b.captures.find((c: any) => c.exercise === 'heel_raise');
    row.device_id = 'placeholder';
    const { gate } = run(root, attestation(true), b, false);
    expect(gate.exercises.find((e: any) => e.exercise === 'heel_raise').gate_pass).toBe(false);
  });
});
