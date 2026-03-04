import fs from 'node:fs';
import path from 'node:path';

const CANONICAL = [
  'squat','pushup','sit_to_stand','plank','lunge',
  'glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction'
];

function isNum(n) { return Number.isFinite(n); }

function validateCapture(capture, expectedExercise) {
  const reasons = [];
  if (!capture || typeof capture !== 'object') return { valid: false, reasons: ['capture_missing'] };

  if (!capture.capture_id || typeof capture.capture_id !== 'string') reasons.push('capture_id_missing');
  if (!capture.device_id || typeof capture.device_id !== 'string' || capture.device_id === 'placeholder') reasons.push('device_id_missing');
  if (!isNum(capture.ts) || capture.ts <= 0) reasons.push('ts_invalid');
  if (!capture.exercise_id || capture.exercise_id !== expectedExercise) reasons.push('exercise_id_mismatch');

  if (!Array.isArray(capture.frames) || capture.frames.length === 0) {
    reasons.push('empty_bundle');
  } else {
    const hasRep = capture.frames.some((f) => isNum(f?.rep_count));
    const hasConfidence = capture.frames.some((f) => isNum(f?.confidence) || isNum(f?.nativePoseResult?.confidence));
    if (!hasRep) reasons.push('rep_count_missing');
    if (!hasConfidence) reasons.push('confidence_missing');
  }

  return { valid: reasons.length === 0, reasons };
}

export function buildCaptureValidationReport(bundle) {
  const captures = Array.isArray(bundle?.captures) ? bundle.captures : [];
  const byExercise = new Map(captures.map((c) => [c.exercise ?? c.exercise_id, c]));

  const exercises = CANONICAL.map((exercise) => {
    const capture = byExercise.get(exercise);
    const { valid, reasons } = validateCapture(capture, exercise);
    return {
      exercise,
      has_capture: !!capture,
      valid_capture_count: valid ? 1 : 0,
      valid,
      reasons,
    };
  });

  const validExercises = exercises.filter((e) => e.valid).length;
  return {
    version: 'atlas-capture-validation.v1',
    generatedAt: new Date().toISOString(),
    aggregate: {
      total_exercises: CANONICAL.length,
      valid_exercises: validExercises,
      invalid_exercises: CANONICAL.length - validExercises,
      coverage_ratio: Number((validExercises / CANONICAL.length).toFixed(3)),
    },
    exercises,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bundlePath = process.argv[2] ?? path.resolve('fixtures/native-frame-bundles/atlas-captures.v1.json');
  const outPath = process.argv[3] ?? path.resolve('artifacts/atlas-capture-validation.v1.json');
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const report = buildCaptureValidationReport(bundle);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const failed = report.exercises.find((e) => !e.valid);
  if (failed) {
    console.error(`capture-validation-failed: ${failed.exercise} -> ${failed.reasons.join(',')}`);
    console.error(`wrote ${outPath}`);
    process.exit(1);
  }

  console.log(`capture-validation-pass: ${report.aggregate.valid_exercises}/${report.aggregate.total_exercises}`);
  console.log(`wrote ${outPath}`);
}
