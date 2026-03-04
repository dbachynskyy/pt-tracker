import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const EXERCISES = [
  'squat','pushup','sit_to_stand','plank','lunge',
  'glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction'
];

function makeFullBundle(tmpDir: string) {
  const bundlePath = path.join(tmpDir, 'full-bundle.json');
  const bundle = {
    version: 'atlas.native.capture.v1',
    generatedAt: new Date().toISOString(),
    captures: EXERCISES.map((exercise, i) => ({
      exercise,
      source: `real-${exercise}`,
      device_id: `iphone15-${exercise}`,
      capture_ts: 1772600000000 + i * 1000,
      collector_version: 'v1.2.0',
      frames: [0, 1, 2].map((k) => ({
        base64: 'aGVsbG8=',
        timestampMs: 1772600000000 + i * 1000 + k * 33,
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
      })),
    })),
  };
  fs.writeFileSync(bundlePath, JSON.stringify(bundle), 'utf8');
  return bundlePath;
}

describe('native readiness harness with hard completeness precheck', () => {
  const root = path.resolve(__dirname, '../../..');
  const placeholderBundlePath = path.resolve(root, 'fixtures/native-frame-bundles/atlas-captures.v1.json');

  it('fails readiness generation for incomplete placeholder pack', () => {
    const outPath = path.resolve(root, 'artifacts/atlas.native-readiness.v1.json');
    expect(() => {
      execSync(`node scripts/generate-native-readiness.mjs "${placeholderBundlePath}" "${outPath}"`, { cwd: root, stdio: 'pipe' });
    }).toThrow();
  });

  it('writes readiness artifact when all 10 exercises are complete', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-ready-'));
    const bundlePath = makeFullBundle(tmp);
    const outPath = path.join(tmp, 'atlas.native-readiness.v1.json');

    execSync(`node scripts/generate-native-readiness.mjs "${bundlePath}" "${outPath}"`, { cwd: root, stdio: 'pipe' });
    const artifact = JSON.parse(fs.readFileSync(outPath, 'utf8'));

    expect(artifact.version).toBe('atlas.native-readiness.v1');
    expect(artifact.exercises).toHaveLength(10);
    for (const ex of artifact.exercises) {
      expect(ex.status).toBe('ready');
      expect(ex.blocked_reason).toBeNull();
      expect(ex.frameCount).toBeGreaterThanOrEqual(3);
    }
  });
});
