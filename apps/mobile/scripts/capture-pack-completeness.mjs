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

function isCollectorVersionValid(v) {
  return typeof v === 'string' && /^v?\d+\.\d+\.\d+$/.test(v);
}

function attestCapture(capture) {
  const reasons = [];
  if (!capture?.source || capture.source === 'placeholder') reasons.push('source_missing_or_placeholder');
  if (!capture?.device_id || capture.device_id === 'placeholder') reasons.push('device_id_missing');
  if (!Number.isFinite(capture?.capture_ts) || capture.capture_ts <= 0) reasons.push('capture_ts_invalid');
  if (!isCollectorVersionValid(capture?.collector_version)) reasons.push('collector_version_invalid');
  return { source_attested: reasons.length === 0, attestation_reasons: reasons };
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

    const { source_attested, attestation_reasons } = present
      ? attestCapture(capture)
      : { source_attested: false, attestation_reasons: ['capture_missing'] };

    const failure_reasons = [];
    if (!present) failure_reasons.push('missing_exercise_capture');
    if (present && !source_valid) failure_reasons.push('invalid_or_placeholder_source');
    if (present && frame_count < MIN_FRAMES) failure_reasons.push('insufficient_frame_count');
    if (present && !min_landmarks_ok) failure_reasons.push('invalid_native_pose_payload');
    if (present && !source_attested) failure_reasons.push('attestation_failed');

    return {
      exercise,
      present,
      source_valid,
      source_attested,
      attestation_reasons,
      frame_count,
      min_landmarks_ok,
      gate_pass: failure_reasons.length === 0,
      failure_reasons,
    };
  });

  const passCount = exercises.filter((e) => e.gate_pass).length;

  return {
    version: 'atlas-completeness-report.v2',
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
  const reportV2Path = process.argv[3] ?? path.resolve('artifacts/atlas-completeness-report.v2.json');
  const reportV1AliasPath = process.argv[4] ?? path.resolve('artifacts/atlas-completeness-report.v1.json');

  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const report = buildCompletenessReport(bundle);
  fs.mkdirSync(path.dirname(reportV2Path), { recursive: true });
  fs.writeFileSync(reportV2Path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const v1Alias = { ...report, version: 'atlas-completeness-report.v1' };
  fs.mkdirSync(path.dirname(reportV1AliasPath), { recursive: true });
  fs.writeFileSync(reportV1AliasPath, `${JSON.stringify(v1Alias, null, 2)}\n`, 'utf8');

  const failed = report.exercises.filter((e) => !e.gate_pass);
  if (failed.length > 0) {
    console.error(`capture-pack-incomplete: ${failed[0].exercise} -> ${failed[0].failure_reasons.join(',')}`);
    console.error(`wrote ${reportV2Path}`);
    console.error(`wrote ${reportV1AliasPath}`);
    process.exit(1);
  }

  console.log(`capture-pack-complete: ${report.aggregate.total_exercises} exercises, min ${report.aggregate.min_required_frames} frames each`);
  console.log(`wrote ${reportV2Path}`);
  console.log(`wrote ${reportV1AliasPath}`);
}
