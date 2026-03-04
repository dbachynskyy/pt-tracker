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
      confidence: 0.9,
      landmarks: [
        { index: 11, x: 0.2, y: 0.2 },
        { index: 12, x: 0.3, y: 0.2 },
        { index: 23, x: 0.4, y: 0.5 },
        { index: 24, x: 0.5, y: 0.5 },
      ],
    },
  };
}

function writeBundle(tmp: string, mutator?: (bundle: any) => void) {
  const bundle = {
    version: 'atlas.native.capture.v1',
    generatedAt: new Date().toISOString(),
    captures: EXERCISES.map((exercise, i) => ({
      exercise,
      source: `real-device-${exercise}`,
      device_id: `iphone15-${exercise}`,
      capture_ts: 1772600000000 + i * 1000,
      collector_version: 'v1.2.0',
      frames: [makeFrame(exercise, 1772600000000 + i * 1000), makeFrame(exercise, 1772600000033 + i * 1000), makeFrame(exercise, 1772600000066 + i * 1000)],
    })),
  };
  if (mutator) mutator(bundle);
  const p = path.join(tmp, 'bundle.json');
  fs.writeFileSync(p, JSON.stringify(bundle), 'utf8');
  return p;
}

function runAndReadReport(root: string, bundle: string, reportV2Path: string, reportV1Path: string, expectPass: boolean) {
  const cmd = `node scripts/capture-pack-completeness.mjs "${bundle}" "${reportV2Path}" "${reportV1Path}"`;
  if (expectPass) {
    execSync(cmd, { cwd: root, stdio: 'pipe' });
  } else {
    expect(() => execSync(cmd, { cwd: root, stdio: 'pipe' })).toThrow();
  }
  return {
    v2: JSON.parse(fs.readFileSync(reportV2Path, 'utf8')),
    v1: JSON.parse(fs.readFileSync(reportV1Path, 'utf8')),
  };
}

describe('capture-pack completeness CLI + report', () => {
  const root = path.resolve(__dirname, '../../..');

  it('passes and writes v2 + v1 alias reports on complete capture pack', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-complete-'));
    const bundle = writeBundle(dir);
    const reportV2 = path.join(dir, 'atlas-completeness-report.v2.json');
    const reportV1 = path.join(dir, 'atlas-completeness-report.v1.json');
    const { v2, v1 } = runAndReadReport(root, bundle, reportV2, reportV1, true);

    expect(v2.version).toBe('atlas-completeness-report.v2');
    expect(v1.version).toBe('atlas-completeness-report.v1');
    expect(v2.aggregate.total_exercises).toBe(10);
    expect(v2.aggregate.passed_exercises).toBe(10);
    for (const ex of v2.exercises) {
      expect(ex.gate_pass).toBe(true);
      expect(ex.source_attested).toBe(true);
      expect(ex.attestation_reasons).toHaveLength(0);
    }
  });

  it('records missing exercise failure mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-missing-'));
    const bundle = writeBundle(dir, (b) => { b.captures = b.captures.filter((c: any) => c.exercise !== 'plank'); });
    const reportV2 = path.join(dir, 'r.v2.json');
    const reportV1 = path.join(dir, 'r.v1.json');
    const { v2 } = runAndReadReport(root, bundle, reportV2, reportV1, false);
    const plank = v2.exercises.find((e: any) => e.exercise === 'plank');
    expect(plank.failure_reasons).toContain('missing_exercise_capture');
  });

  it('records attestation failure: missing device_id', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-attest-device-'));
    const bundle = writeBundle(dir, (b) => { delete b.captures[0].device_id; });
    const reportV2 = path.join(dir, 'r.v2.json');
    const reportV1 = path.join(dir, 'r.v1.json');
    const { v2 } = runAndReadReport(root, bundle, reportV2, reportV1, false);
    const squat = v2.exercises.find((e: any) => e.exercise === 'squat');
    expect(squat.source_attested).toBe(false);
    expect(squat.attestation_reasons).toContain('device_id_missing');
    expect(squat.failure_reasons).toContain('attestation_failed');
  });

  it('records attestation failure: invalid capture_ts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-attest-ts-'));
    const bundle = writeBundle(dir, (b) => { b.captures[0].capture_ts = 0; });
    const reportV2 = path.join(dir, 'r.v2.json');
    const reportV1 = path.join(dir, 'r.v1.json');
    const { v2 } = runAndReadReport(root, bundle, reportV2, reportV1, false);
    const squat = v2.exercises.find((e: any) => e.exercise === 'squat');
    expect(squat.attestation_reasons).toContain('capture_ts_invalid');
  });

  it('records attestation failure: invalid collector_version', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-attest-ver-'));
    const bundle = writeBundle(dir, (b) => { b.captures[0].collector_version = 'beta'; });
    const reportV2 = path.join(dir, 'r.v2.json');
    const reportV1 = path.join(dir, 'r.v1.json');
    const { v2 } = runAndReadReport(root, bundle, reportV2, reportV1, false);
    const squat = v2.exercises.find((e: any) => e.exercise === 'squat');
    expect(squat.attestation_reasons).toContain('collector_version_invalid');
  });

  it('records invalid source failure mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-source-'));
    const bundle = writeBundle(dir, (b) => { b.captures[0].source = 'placeholder'; });
    const reportV2 = path.join(dir, 'r.v2.json');
    const reportV1 = path.join(dir, 'r.v1.json');
    const { v2 } = runAndReadReport(root, bundle, reportV2, reportV1, false);
    const squat = v2.exercises.find((e: any) => e.exercise === 'squat');
    expect(squat.failure_reasons).toContain('invalid_or_placeholder_source');
  });

  it('records insufficient frame-count failure mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-frames-'));
    const bundle = writeBundle(dir, (b) => { b.captures[0].frames = b.captures[0].frames.slice(0, 2); });
    const reportV2 = path.join(dir, 'r.v2.json');
    const reportV1 = path.join(dir, 'r.v1.json');
    const { v2 } = runAndReadReport(root, bundle, reportV2, reportV1, false);
    const squat = v2.exercises.find((e: any) => e.exercise === 'squat');
    expect(squat.failure_reasons).toContain('insufficient_frame_count');
  });

  it('records invalid native payload failure mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-invalid-'));
    const bundle = writeBundle(dir, (b) => { b.captures[0].frames[0].nativePoseResult.landmarks = [{ index: 11, x: 0.2, y: 0.2 }]; });
    const reportV2 = path.join(dir, 'r.v2.json');
    const reportV1 = path.join(dir, 'r.v1.json');
    const { v2 } = runAndReadReport(root, bundle, reportV2, reportV1, false);
    const squat = v2.exercises.find((e: any) => e.exercise === 'squat');
    expect(squat.failure_reasons).toContain('invalid_native_pose_payload');
  });
});
