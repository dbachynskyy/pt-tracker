import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const EXERCISES = [
  'squat','pushup','sit_to_stand','plank','lunge',
  'glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction'
];

function validCapture(exercise: string, idx: number) {
  return {
    exercise,
    source: `real-device-${exercise}`,
    device_id: `iphone15-${exercise}`,
    os_version: 'iOS 18.1',
    app_version: 'v1.2.0',
    capture_ts: 1772600000000 + idx * 1000,
    frames: [
      {
        base64: 'aGVsbG8=',
        timestampMs: 1772600000000 + idx * 1000,
        expectedExercise: exercise,
        nativePoseResult: {
          confidence: 0.9,
          landmarks: [
            { index: 11, x: 0.2, y: 0.3 },
            { index: 12, x: 0.3, y: 0.3 },
            { index: 23, x: 0.4, y: 0.5 },
            { index: 24, x: 0.5, y: 0.5 },
          ],
        },
      },
    ],
  };
}

describe('capture import tool', () => {
  const root = path.resolve(__dirname, '../../..');

  it('imports valid raw captures into canonical schema', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-import-'));
    const rawPath = path.join(dir, 'raw.json');
    const outPath = path.join(dir, 'out.json');

    fs.writeFileSync(rawPath, JSON.stringify({ captures: EXERCISES.map(validCapture) }), 'utf8');

    execSync(`node scripts/import-native-captures.mjs "${rawPath}" "${outPath}"`, { cwd: root, stdio: 'pipe' });
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    expect(out.version).toBe('atlas.native.capture.v1');
    expect(out.captures).toHaveLength(10);
    expect(out.captures.find((c: any) => c.exercise === 'squat').device_id).toContain('iphone15');
  });

  it('rejects invalid schema (bad base64)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-import-'));
    const rawPath = path.join(dir, 'raw-bad.json');
    const outPath = path.join(dir, 'out.json');

    const captures = EXERCISES.map(validCapture);
    captures[0].frames[0].base64 = 'not_base64$$$';
    fs.writeFileSync(rawPath, JSON.stringify({ captures }), 'utf8');

    expect(() => {
      execSync(`node scripts/import-native-captures.mjs "${rawPath}" "${outPath}"`, { cwd: root, stdio: 'pipe' });
    }).toThrow();
  });
});
