import fs from 'node:fs';
import path from 'node:path';
import { CANONICAL_EXERCISES, validateBundle } from './native-capture-schema.mjs';

const MIN_FRAMES = 3;
const MIN_LANDMARKS = 4;

function hasValidPoseFrame(frame) {
  return !!(
    frame?.nativePoseResult &&
    Array.isArray(frame.nativePoseResult.landmarks) &&
    frame.nativePoseResult.landmarks.length >= MIN_LANDMARKS &&
    (frame.nativePoseResult.confidence === undefined || Number.isFinite(frame.nativePoseResult.confidence))
  );
}

export function buildCompletenessReport(bundle) {
  validateBundle(bundle);

  const byExercise = new Map((bundle.captures ?? []).map((c) => [c.exercise, c]));
  const exercises = CANONICAL_EXERCISES.map((exercise) => {
    const capture = byExercise.get(exercise);
    const present = !!capture;
    const source_valid = !!(capture?.source && capture.source !== 'placeholder');
    const frame_count = Array.isArray(capture?.frames) ? capture.frames.length : 0;
    const min_landmarks_ok = !!capture?.frames?.every((f) => hasValidPoseFrame(f));

    const failure_reasons = [];
    if (!present) failure_reasons.push('missing_exercise_capture');
    if (present && !source_valid) failure_reasons.push('invalid_or_placeholder_source');
    if (present && frame_count < MIN_FRAMES) failure_reasons.push('insufficient_frame_count');
    if (present && !min_landmarks_ok) failure_reasons.push('invalid_native_pose_payload');

    return {
      exercise,
      present,
      source_valid,
      frame_count,
      min_landmarks_ok,
      gate_pass: failure_reasons.length === 0,
      failure_reasons,
    };
  });

  const passCount = exercises.filter((e) => e.gate_pass).length;

  return {
    version: 'atlas-completeness-report.v1',
    generatedAt: new Date().toISOString(),
    aggregate: {
      total_exercises: CANONICAL_EXERCISES.length,
      passed_exercises: passCount,
      blocked_exercises: CANONICAL_EXERCISES.length - passCount,
      coverage_ratio: Number((passCount / CANONICAL_EXERCISES.length).toFixed(3)),
      min_required_frames: MIN_FRAMES,
      min_required_landmarks: MIN_LANDMARKS,
    },
    exercises,
  };
}

export function assertCapturePackComplete(bundle) {
  const report = buildCompletenessReport(bundle);
  const failed = report.exercises.filter((e) => !e.gate_pass);
  if (failed.length > 0) {
    const first = failed[0];
    throw new Error(`capture-pack incomplete: ${first.exercise} -> ${first.failure_reasons.join(',')}`);
  }
  return {
    ok: true,
    exerciseCount: report.aggregate.total_exercises,
    minFramesPerExercise: report.aggregate.min_required_frames,
    report,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bundlePath = process.argv[2] ?? path.resolve('fixtures/native-frame-bundles/atlas-captures.v1.json');
  const reportPath = process.argv[3] ?? path.resolve('artifacts/atlas-completeness-report.v1.json');

  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const report = buildCompletenessReport(bundle);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const failed = report.exercises.filter((e) => !e.gate_pass);
  if (failed.length > 0) {
    console.error(`capture-pack-incomplete: ${failed[0].exercise} -> ${failed[0].failure_reasons.join(',')}`);
    console.error(`wrote ${reportPath}`);
    process.exit(1);
  }

  console.log(`capture-pack-complete: ${report.aggregate.total_exercises} exercises, min ${report.aggregate.min_required_frames} frames each`);
  console.log(`wrote ${reportPath}`);
}
