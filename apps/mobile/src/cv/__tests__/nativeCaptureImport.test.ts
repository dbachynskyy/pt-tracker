import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

describe('capture import tool', () => {
  const root = path.resolve(__dirname, '../../..');

  it('imports valid raw captures into canonical schema', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-import-'));
    const rawPath = path.join(dir, 'raw.json');
    const outPath = path.join(dir, 'out.json');

    fs.writeFileSync(rawPath, JSON.stringify({
      captures: [
        {
          exercise: 'squat',
          source: 'raw-sample',
          frames: [
            {
              base64: 'aGVsbG8=',
              timestampMs: 1772600000100,
              expectedExercise: 'squat',
              nativePoseResult: {
                confidence: 0.9,
                landmarks: [
                  { index: 11, x: 0.2, y: 0.3 },
                  { index: 12, x: 0.3, y: 0.3 },
                  { index: 23, x: 0.4, y: 0.5 },
                  { index: 24, x: 0.5, y: 0.5 }
                ]
              }
            }
          ]
        }
      ]
    }), 'utf8');

    execSync(`node scripts/import-native-captures.mjs "${rawPath}" "${outPath}"`, { cwd: root, stdio: 'pipe' });
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    expect(out.version).toBe('atlas.native.capture.v1');
    expect(out.captures).toHaveLength(10);
    expect(out.captures.find((c: any) => c.exercise === 'squat').frames.length).toBe(1);
  });

  it('rejects invalid schema (bad base64)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-import-'));
    const rawPath = path.join(dir, 'raw-bad.json');
    const outPath = path.join(dir, 'out.json');

    fs.writeFileSync(rawPath, JSON.stringify({
      captures: [
        {
          exercise: 'squat',
          frames: [
            { base64: 'not_base64$$$', timestampMs: 1772600000100, expectedExercise: 'squat' }
          ]
        }
      ]
    }), 'utf8');

    expect(() => {
      execSync(`node scripts/import-native-captures.mjs "${rawPath}" "${outPath}"`, { cwd: root, stdio: 'pipe' });
    }).toThrow();
  });
});
