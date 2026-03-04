import fs from 'node:fs';
import path from 'node:path';
import { CANONICAL_EXERCISES, validateBundle } from './native-capture-schema.mjs';

function fail(msg) {
  throw new Error(msg);
}

export function assertCapturePackComplete(bundle) {
  validateBundle(bundle);

  const captures = bundle.captures;
  for (const exercise of CANONICAL_EXERCISES) {
    const capture = captures.find((c) => c.exercise === exercise);
    if (!capture) fail(`missing exercise capture: ${exercise}`);
    if (!capture.source || capture.source === 'placeholder') {
      fail(`exercise ${exercise} missing real evidence_source`);
    }
    if (!Array.isArray(capture.frames) || capture.frames.length < 3) {
      fail(`exercise ${exercise} requires >=3 frames`);
    }

    for (const [idx, frame] of capture.frames.entries()) {
      if (!frame.nativePoseResult || !Array.isArray(frame.nativePoseResult.landmarks)) {
        fail(`exercise ${exercise} frame ${idx} missing nativePoseResult.landmarks`);
      }
      if (frame.nativePoseResult.landmarks.length < 4) {
        fail(`exercise ${exercise} frame ${idx} has insufficient landmarks`);
      }
      if (frame.nativePoseResult.confidence !== undefined && !Number.isFinite(frame.nativePoseResult.confidence)) {
        fail(`exercise ${exercise} frame ${idx} invalid confidence`);
      }
    }
  }

  return {
    ok: true,
    exerciseCount: CANONICAL_EXERCISES.length,
    minFramesPerExercise: 3,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bundlePath = process.argv[2] ?? path.resolve('fixtures/native-frame-bundles/atlas-captures.v1.json');
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const result = assertCapturePackComplete(bundle);
  console.log(`capture-pack-complete: ${result.exerciseCount} exercises, min ${result.minFramesPerExercise} frames each`);
}
