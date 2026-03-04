import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const EXERCISES = [
  'squat','pushup','sit_to_stand','plank','lunge',
  'glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction'
];

function makeFrame(exercise: string, ts: number) {
  return {
    base64: 'aGVsbG8=',
    timestampMs: ts,
    expectedExercise: exercise,
    nativePoseResult: {
      confidence: 0.91,
      landmarks: [
        { index: 11, x: 0.2, y: 0.2 },
        { index: 12, x: 0.3, y: 0.2 },
        { index: 23, x: 0.4, y: 0.5 },
        { index: 24, x: 0.5, y: 0.5 },
      ],
    },
  };
}

function writeBundle(tmp: string, mutator?: (b: any) => void) {
  const bundle = {
    version: 'atlas.native.capture.v1',
    generatedAt: new Date().toISOString(),
    captures: EXERCISES.map((exercise, i) => ({
      exercise,
      source: `real-device-${exercise}`,
      device_id: `iphone15-${exercise}`,
      os_version: 'iOS 18.1',
      app_version: 'v1.2.0',
      capture_ts: 1772600000000 + i * 1000,
      frames: [makeFrame(exercise, 1772600000000 + i * 1000)],
    })),
  };
  mutator?.(bundle);
  const p = path.join(tmp, 'bundle.json');
  fs.writeFileSync(p, JSON.stringify(bundle), 'utf8');
  return p;
}

function run(root: string, bundlePath: string, expectPass: boolean) {
  const outPath = path.join(path.dirname(bundlePath), 'attestation.json');
  const cmd = `node scripts/provenance-attestation.mjs "${bundlePath}" "${outPath}"`;
  if (expectPass) {
    execSync(cmd, { cwd: root, stdio: 'pipe' });
  } else {
    expect(() => execSync(cmd, { cwd: root, stdio: 'pipe' })).toThrow();
  }
  return JSON.parse(fs.readFileSync(outPath, 'utf8'));
}

describe('provenance attestation report', () => {
  const root = path.resolve(__dirname, '../../..');

  it('passes all exercises with valid provenance metadata', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-prov-pass-'));
    const bundle = writeBundle(dir);
    const report = run(root, bundle, true);
    expect(report.version).toBe('atlas-provenance-attestation.v1');
    expect(report.aggregate.passed_exercises).toBe(10);
    for (const ex of report.exercises) expect(ex.pass).toBe(true);
  });

  it('fails placeholder/simulated source', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-prov-src-'));
    const bundle = writeBundle(dir, (b) => { b.captures[0].source = 'simulated-camera'; });
    const report = run(root, bundle, false);
    expect(report.exercises.find((e: any) => e.exercise === 'squat').reasons).toContain('source_placeholder_or_simulated');
  });

  it('fails missing device_id', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-prov-dev-'));
    const bundle = writeBundle(dir, (b) => { delete b.captures[0].device_id; });
    const report = run(root, bundle, false);
    expect(report.exercises.find((e: any) => e.exercise === 'squat').reasons).toContain('device_id_missing');
  });

  it('fails invalid os_version', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-prov-os-'));
    const bundle = writeBundle(dir, (b) => { b.captures[0].os_version = 'ios_latest'; });
    const report = run(root, bundle, false);
    expect(report.exercises.find((e: any) => e.exercise === 'squat').reasons).toContain('os_version_invalid');
  });

  it('fails invalid app_version', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-prov-app-'));
    const bundle = writeBundle(dir, (b) => { b.captures[0].app_version = '1'; });
    const report = run(root, bundle, false);
    expect(report.exercises.find((e: any) => e.exercise === 'squat').reasons).toContain('app_version_invalid');
  });

  it('fails invalid capture_ts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-prov-ts-'));
    const bundle = writeBundle(dir, (b) => { b.captures[0].capture_ts = 0; });
    const report = run(root, bundle, false);
    expect(report.exercises.find((e: any) => e.exercise === 'squat').reasons).toContain('capture_ts_invalid');
  });
});
