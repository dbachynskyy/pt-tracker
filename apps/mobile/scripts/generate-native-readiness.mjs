import fs from 'node:fs';
import path from 'node:path';

const canonical = [
  'squat','pushup','sit_to_stand','plank','lunge',
  'glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction'
];

const bundlePath = process.argv[2] ?? path.resolve('fixtures/native-frame-bundles/atlas-captures.v1.json');
const outPath = process.argv[3] ?? path.resolve('artifacts/atlas.native-readiness.v1.json');

const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
const captures = Array.isArray(bundle.captures) ? bundle.captures : [];

const exercises = canonical.map((exercise) => {
  const capture = captures.find((c) => c.exercise === exercise);
  if (!capture || !Array.isArray(capture.frames) || capture.frames.length === 0) {
    return { exercise, status: 'blocked', reason: 'missing_capture_frames', frameCount: capture?.frames?.length ?? 0, successFrames: 0 };
  }
  const successFrames = capture.frames.filter((f) => f && f.nativePoseResult && Array.isArray(f.nativePoseResult.landmarks) && f.nativePoseResult.landmarks.length >= 4).length;
  return {
    exercise,
    status: successFrames > 0 ? 'ready' : 'blocked',
    reason: successFrames > 0 ? 'ok' : 'native_payload_missing_or_invalid',
    frameCount: capture.frames.length,
    successFrames,
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
