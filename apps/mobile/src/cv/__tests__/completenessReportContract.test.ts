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

function writeBundle(tmp: string, blocked = false) {
  const captures = EXERCISES.map((exercise, i) => ({
    exercise,
    source: `real-device-${exercise}`,
    device_id: `iphone15-${exercise}`,
    capture_ts: 1772600000000 + i * 1000,
    collector_version: 'v1.2.0',
    frames: [0,1,2].map((k) => makeFrame(exercise, 1772600000000 + i * 1000 + k * 33)),
  }));
  if (blocked) {
    captures[1].source = 'placeholder';
  }
  const bundle = { version: 'atlas.native.capture.v1', generatedAt: new Date().toISOString(), captures };
  const p = path.join(tmp, blocked ? 'blocked.json' : 'pass.json');
  fs.writeFileSync(p, JSON.stringify(bundle), 'utf8');
  return p;
}

function normalize(report: any) {
  return { ...report, generatedAt: '<redacted-timestamp>' };
}

describe('completeness report dual-output contract', () => {
  const root = path.resolve(__dirname, '../../..');
  const snapDir = path.resolve(__dirname, 'fixtures/completeness-report-snapshots');

  it('writes canonical v2 and v1 alias with required fields for all exercises (pass)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-contract-pass-'));
    const bundle = writeBundle(dir, false);
    const v2Path = path.join(dir, 'report.v2.json');
    const v1Path = path.join(dir, 'report.v1.json');

    execSync(`node scripts/capture-pack-completeness.mjs "${bundle}" "${v2Path}" "${v1Path}"`, { cwd: root, stdio: 'pipe' });

    const v2 = JSON.parse(fs.readFileSync(v2Path, 'utf8'));
    const v1 = JSON.parse(fs.readFileSync(v1Path, 'utf8'));

    expect(v2.version).toBe('atlas-completeness-report.v2');
    expect(v1.version).toBe('atlas-completeness-report.v1');
    expect(v2.exercises).toHaveLength(10);
    expect(v1.exercises).toHaveLength(10);

    for (const ex of v2.exercises) {
      expect(ex).toEqual(expect.objectContaining({
        present: expect.any(Boolean),
        source_valid: expect.any(Boolean),
        source_attested: expect.any(Boolean),
        attestation_reasons: expect.any(Array),
        frame_count: expect.any(Number),
        min_landmarks_ok: expect.any(Boolean),
        gate_pass: expect.any(Boolean),
        failure_reasons: expect.any(Array),
      }));
      expect(ex.gate_pass).toBe(true);
      expect(ex.source_attested).toBe(true);
    }

    // compatibility mapping: content same except version
    const v1AsV2 = { ...v1, version: 'atlas-completeness-report.v2' };
    expect(v1AsV2).toEqual(v2);

    const expected = JSON.parse(fs.readFileSync(path.join(snapDir, 'pass.v2.snapshot.json'), 'utf8'));
    expect(normalize(v2)).toEqual(expected);
  });

  it('writes blocked report snapshot with attestation semantics', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-contract-blocked-'));
    const bundle = writeBundle(dir, true);
    const v2Path = path.join(dir, 'report.v2.json');
    const v1Path = path.join(dir, 'report.v1.json');

    expect(() => execSync(`node scripts/capture-pack-completeness.mjs "${bundle}" "${v2Path}" "${v1Path}"`, { cwd: root, stdio: 'pipe' })).toThrow();

    const v2 = JSON.parse(fs.readFileSync(v2Path, 'utf8'));
    const blocked = v2.exercises.find((e: any) => e.exercise === 'pushup');
    expect(blocked.gate_pass).toBe(false);
    expect(blocked.source_attested).toBe(false);
    expect(blocked.attestation_reasons).toContain('source_missing_or_placeholder');
    expect(blocked.failure_reasons).toContain('attestation_failed');

    const expected = JSON.parse(fs.readFileSync(path.join(snapDir, 'blocked.v2.snapshot.json'), 'utf8'));
    expect(normalize(v2)).toEqual(expected);
  });
});
