export const CANONICAL_EXERCISES = [
  'squat','pushup','sit_to_stand','plank','lunge',
  'glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction'
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function isValidBase64(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (!/^[A-Za-z0-9+/=\n\r]+$/.test(value)) return false;
  try {
    const normalized = value.replace(/\s+/g, '');
    const decoded = Buffer.from(normalized, 'base64');
    if (decoded.length === 0) return false;
    return Buffer.from(decoded).toString('base64').replace(/=+$/,'') === normalized.replace(/=+$/,'');
  } catch {
    return false;
  }
}

function validateLandmark(lm, idx, e) {
  assert(lm && typeof lm === 'object', `${e}: landmarks[${idx}] must be object`);
  assert(Number.isFinite(lm.x) && Number.isFinite(lm.y), `${e}: landmarks[${idx}] x/y must be finite numbers`);
  assert(typeof lm.index === 'number' || typeof lm.name === 'string', `${e}: landmarks[${idx}] must have index or name`);
}

export function validateBundle(bundle) {
  assert(bundle?.version === 'atlas.native.capture.v1', 'bundle.version must be atlas.native.capture.v1');
  assert(Array.isArray(bundle.captures), 'bundle.captures must be array');

  const seen = new Set();
  for (const [i, capture] of bundle.captures.entries()) {
    assert(capture && typeof capture === 'object', `captures[${i}] must be object`);
    const ex = capture.exercise;
    assert(CANONICAL_EXERCISES.includes(ex), `captures[${i}].exercise invalid: ${ex}`);
    assert(!seen.has(ex), `duplicate exercise capture: ${ex}`);
    seen.add(ex);
    assert(Array.isArray(capture.frames), `captures[${i}].frames must be array`);

    for (const [j, frame] of capture.frames.entries()) {
      assert(frame && typeof frame === 'object', `captures[${i}].frames[${j}] must be object`);
      assert(isValidBase64(frame.base64), `captures[${i}].frames[${j}].base64 invalid`);
      assert(Number.isFinite(frame.timestampMs) && frame.timestampMs > 0, `captures[${i}].frames[${j}].timestampMs invalid`);
      assert(frame.expectedExercise === ex, `captures[${i}].frames[${j}].expectedExercise must equal ${ex}`);
      if (frame.nativePoseResult != null) {
        const r = frame.nativePoseResult;
        assert(Array.isArray(r.landmarks), `captures[${i}].frames[${j}].nativePoseResult.landmarks must be array`);
        if (r.confidence !== undefined) assert(Number.isFinite(r.confidence), `captures[${i}].frames[${j}].nativePoseResult.confidence invalid`);
        r.landmarks.forEach((lm, k) => validateLandmark(lm, k, `captures[${i}].frames[${j}]`));
      }
    }
  }

  return true;
}
