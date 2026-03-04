import fs from 'node:fs';
import path from 'node:path';
import { CANONICAL_EXERCISES, validateBundle } from './native-capture-schema.mjs';
import { assertCapturePackComplete } from './capture-pack-completeness.mjs';

const bundlePath = process.argv[2] ?? path.resolve('fixtures/native-frame-bundles/atlas-captures.v1.json');
const outPath = process.argv[3] ?? path.resolve('artifacts/atlas.native-readiness.v1.json');

const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
validateBundle(bundle);
assertCapturePackComplete(bundle);
const captures = Array.isArray(bundle.captures) ? bundle.captures : [];

const exercises = CANONICAL_EXERCISES.map((exercise) => {
  const capture = captures.find((c) => c.exercise === exercise);
  const evidence_source = capture?.source ?? 'placeholder';

  if (!capture || !Array.isArray(capture.frames) || capture.frames.length === 0) {
    return {
      exercise,
      status: 'blocked',
      blocked_reason: 'missing_capture_frames',
      frameCount: capture?.frames?.length ?? 0,
      successFrames: 0,
      evidence_source,
    };
  }

  const successFrames = capture.frames.filter((f) =>
    f && f.nativePoseResult && Array.isArray(f.nativePoseResult.landmarks) && f.nativePoseResult.landmarks.length >= 4
  ).length;

  return {
    exercise,
    status: successFrames > 0 ? 'ready' : 'blocked',
    blocked_reason: successFrames > 0 ? null : 'native_payload_missing_or_invalid',
    frameCount: capture.frames.length,
    successFrames,
    evidence_source,
  };
});

const artifact = {
  version: 'atlas.native-readiness.v1',
  generatedAt: new Date().toISOString(),
  sourceBundle: path.basename(bundlePath),
  exercises,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(`wrote ${outPath}`);
