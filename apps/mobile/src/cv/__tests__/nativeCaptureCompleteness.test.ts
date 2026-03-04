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
      frames: [makeFrame(exercise, 1772600000000 + i * 1000), makeFrame(exercise, 1772600000033 + i * 1000), makeFrame(exercise, 1772600000066 + i * 1000)],
    })),
  };
  if (mutator) mutator(bundle);
  const p = path.join(tmp, 'bundle.json');
  fs.writeFileSync(p, JSON.stringify(bundle), 'utf8');
  return p;
}

function runAndReadReport(root: string, bundle: string, reportPath: string, expectPass: boolean) {
  const cmd = `node scripts/capture-pack-completeness.mjs "${bundle}" "${reportPath}"`;
  if (expectPass) {
    execSync(cmd, { cwd: root, stdio: 'pipe' });
  } else {
    expect(() => execSync(cmd, { cwd: root, stdio: 'pipe' })).toThrow();
  }
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
}

describe('capture-pack completeness CLI + report', () => {
  const root = path.resolve(__dirname, '../../..');

  it('passes and writes completeness report on complete capture pack', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-complete-'));
    const bundle = writeBundle(dir);
    const reportPath = path.join(dir, 'atlas-completeness-report.v1.json');
    const report = runAndReadReport(root, bundle, reportPath, true);

    expect(report.version).toBe('atlas-completeness-report.v1');
    expect(report.aggregate.total_exercises).toBe(10);
    expect(report.aggregate.passed_exercises).toBe(10);
    expect(report.aggregate.coverage_ratio).toBe(1);
    for (const ex of report.exercises) expect(ex.gate_pass).toBe(true);
  });

  it('records missing exercise failure mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-missing-'));
    const bundle = writeBundle(dir, (b) => { b.captures = b.captures.filter((c: any) => c.exercise !== 'plank'); });
    const reportPath = path.join(dir, 'atlas-completeness-report.v1.json');
    const report = runAndReadReport(root, bundle, reportPath, false);
    const plank = report.exercises.find((e: any) => e.exercise === 'plank');
    expect(plank.failure_reasons).toContain('missing_exercise_capture');
  });

  it('records invalid source failure mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-source-'));
    const bundle = writeBundle(dir, (b) => { b.captures[0].source = 'placeholder'; });
    const reportPath = path.join(dir, 'atlas-completeness-report.v1.json');
    const report = runAndReadReport(root, bundle, reportPath, false);
    const squat = report.exercises.find((e: any) => e.exercise === 'squat');
    expect(squat.failure_reasons).toContain('invalid_or_placeholder_source');
  });

  it('records insufficient frame-count failure mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-frames-'));
    const bundle = writeBundle(dir, (b) => { b.captures[0].frames = b.captures[0].frames.slice(0, 2); });
    const reportPath = path.join(dir, 'atlas-completeness-report.v1.json');
    const report = runAndReadReport(root, bundle, reportPath, false);
    const squat = report.exercises.find((e: any) => e.exercise === 'squat');
    expect(squat.failure_reasons).toContain('insufficient_frame_count');
  });

  it('records invalid native payload failure mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-invalid-'));
    const bundle = writeBundle(dir, (b) => { b.captures[0].frames[0].nativePoseResult.landmarks = [{ index: 11, x: 0.2, y: 0.2 }]; });
    const reportPath = path.join(dir, 'atlas-completeness-report.v1.json');
    const report = runAndReadReport(root, bundle, reportPath, false);
    const squat = report.exercises.find((e: any) => e.exercise === 'squat');
    expect(squat.failure_reasons).toContain('invalid_native_pose_payload');
  });
});
