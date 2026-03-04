import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const EX = ['squat','pushup','sit_to_stand','plank','lunge','glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction'];

function mkFrame(ex: string, t: number, rep = 1, conf = 0.9) {
  return { base64: 'aGVsbG8=', timestampMs: t, expectedExercise: ex, rep_count: rep, confidence: conf, nativePoseResult: { confidence: conf, landmarks: [{index:11,x:0.1,y:0.1},{index:12,x:0.2,y:0.1},{index:23,x:0.3,y:0.4},{index:24,x:0.4,y:0.4}] } };
}

function bundle() {
  return {
    version: 'atlas.native.capture.v1',
    generatedAt: new Date().toISOString(),
    captures: EX.map((ex, i) => ({
      exercise: ex,
      exercise_id: ex,
      capture_id: `cap-${ex}`,
      device_id: i < 5 ? 'iphone15-a' : 'iphone15-b',
      ts: 1772600000000 + i * 1000,
      source: `real-camera-${ex}`,
      frames: [mkFrame(ex, 1772600000000 + i * 1000), mkFrame(ex, 1772600000033 + i * 1000), mkFrame(ex, 1772600000066 + i * 1000)],
    })),
  };
}

function run(root: string, b: any, expectPass: boolean) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-realpack-'));
  const inPath = path.join(d, 'bundle.json');
  const outPath = path.join(d, 'gate.json');
  fs.writeFileSync(inPath, JSON.stringify(b), 'utf8');
  const cmd = `node scripts/validate-realcv-capture-pack.mjs "${inPath}" "${outPath}"`;
  if (expectPass) execSync(cmd, { cwd: root, stdio: 'pipe' });
  else expect(() => execSync(cmd, { cwd: root, stdio: 'pipe' })).toThrow();
  return JSON.parse(fs.readFileSync(outPath, 'utf8'));
}

describe('real capture pack quality gate', () => {
  const root = path.resolve(__dirname, '../../..');

  it('passes with all thresholds satisfied', () => {
    const r = run(root, bundle(), true);
    expect(r.aggregate.gate_pass).toBe(true);
  });

  it('fails frame threshold', () => {
    const b = bundle();
    b.captures[0].frames = b.captures[0].frames.slice(0, 2);
    const r = run(root, b, false);
    expect(r.exercises.find((e: any) => e.exercise === 'squat').reasons).toContain('insufficient_frames');
  });

  it('fails rep observation threshold', () => {
    const b = bundle();
    b.captures[0].frames.forEach((f: any) => delete f.rep_count);
    const r = run(root, b, false);
    expect(r.exercises.find((e: any) => e.exercise === 'squat').reasons).toContain('insufficient_rep_observations');
  });

  it('fails malformed metadata', () => {
    const b = bundle();
    delete b.captures[0].capture_id;
    const r = run(root, b, false);
    expect(r.exercises.find((e: any) => e.exercise === 'squat').reasons).toContain('capture_id_missing');
  });

  it('fails single-device pack', () => {
    const b = bundle();
    b.captures.forEach((c: any) => (c.device_id = 'iphone15-only'));
    const r = run(root, b, false);
    expect(r.aggregate.gate_reasons).toContain('single_device_pack');
  });
});
