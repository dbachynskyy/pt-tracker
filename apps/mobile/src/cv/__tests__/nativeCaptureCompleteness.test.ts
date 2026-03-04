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

describe('capture-pack completeness CLI', () => {
  const root = path.resolve(__dirname, '../../..');

  it('passes on complete capture pack', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-complete-'));
    const bundle = writeBundle(dir);
    const out = execSync(`node scripts/capture-pack-completeness.mjs "${bundle}"`, { cwd: root, stdio: 'pipe' }).toString();
    expect(out).toContain('capture-pack-complete');
  });

  it('fails when exercise missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-missing-'));
    const bundle = writeBundle(dir, (b) => {
      b.captures = b.captures.filter((c: any) => c.exercise !== 'plank');
    });
    expect(() => execSync(`node scripts/capture-pack-completeness.mjs "${bundle}"`, { cwd: root, stdio: 'pipe' })).toThrow();
  });

  it('fails when frame payload invalid', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-invalid-'));
    const bundle = writeBundle(dir, (b) => {
      b.captures[0].frames[0].nativePoseResult.landmarks = [{ index: 11, x: 0.2, y: 0.2 }];
    });
    expect(() => execSync(`node scripts/capture-pack-completeness.mjs "${bundle}"`, { cwd: root, stdio: 'pipe' })).toThrow();
  });
});
