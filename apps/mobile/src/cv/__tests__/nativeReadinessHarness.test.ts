import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

describe('native readiness fallback harness', () => {
  const root = path.resolve(__dirname, '../../..');
  const bundlePath = path.resolve(root, 'fixtures/native-frame-bundles/atlas-captures.v1.json');
  const outPath = path.resolve(root, 'artifacts/atlas.native-readiness.v1.json');

  it('writes atlas.native-readiness.v1.json with all 10 exercises', () => {
    execSync(`node scripts/generate-native-readiness.mjs "${bundlePath}" "${outPath}"`, { cwd: root, stdio: 'pipe' });
    const artifact = JSON.parse(fs.readFileSync(outPath, 'utf8'));

    expect(artifact.version).toBe('atlas.native-readiness.v1');
    expect(Array.isArray(artifact.exercises)).toBe(true);
    expect(artifact.exercises).toHaveLength(10);
  });

  it('marks missing captures as blocked with explicit reason', () => {
    const artifact = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    for (const ex of artifact.exercises) {
      expect(ex.status).toBe('blocked');
      expect(ex.reason).toBe('missing_capture_frames');
    }
  });
});
