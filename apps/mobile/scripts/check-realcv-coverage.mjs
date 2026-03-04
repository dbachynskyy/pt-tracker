import fs from 'node:fs';
import path from 'node:path';
import { buildCaptureValidationReport } from './capture-bundle-validation.mjs';

const REQUIRED = [
  'squat','pushup','sit_to_stand','plank','lunge',
  'glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction'
];

export function buildCoverageGate(attestation, captureValidation) {
  if (attestation?.version !== 'atlas-provenance-attestation.v1') throw new Error('invalid attestation version');
  if (!Array.isArray(attestation.exercises)) throw new Error('attestation.exercises must be array');

  const byId = new Map(attestation.exercises.map((e) => [e.exercise, e]));
  const byValidation = new Map((captureValidation?.exercises ?? []).map((e) => [e.exercise, e]));

  const unknown = attestation.exercises.map((e) => e.exercise).filter((id) => !REQUIRED.includes(id));

  const exercises = REQUIRED.map((id) => {
    const row = byId.get(id);
    const val = byValidation.get(id);
    const reasons = [];

    if (!row) reasons.push('missing_exercise');
    if (row && row.pass !== true) reasons.push('exercise_not_attested', ...(row.reasons ?? []));
    if (!val || val.valid_capture_count < 1) reasons.push('no_valid_capture_bundle');
    if (val && !val.valid && Array.isArray(val.reasons)) reasons.push(...val.reasons);

    return {
      exercise: id,
      present: !!row,
      pass: row?.pass === true,
      valid_capture_bundle: !!val && val.valid_capture_count >= 1,
      gate_pass: reasons.length === 0,
      reasons,
    };
  });

  if (unknown.length > 0) {
    exercises.push({ exercise: '__unknown__', present: true, pass: false, valid_capture_bundle: false, gate_pass: false, reasons: ['unexpected_exercise_ids', ...unknown] });
  }

  const passed = exercises.filter((e) => e.gate_pass && e.exercise !== '__unknown__').length;
  const gate_pass = passed === REQUIRED.length && unknown.length === 0;

  return {
    version: 'atlas-coverage-gate.v1',
    generatedAt: new Date().toISOString(),
    aggregate: {
      required_exercises: REQUIRED.length,
      passed_exercises: passed,
      failed_exercises: REQUIRED.length - passed,
      unknown_exercise_ids: unknown,
      gate_pass,
    },
    exercises,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const attPath = process.argv[2] ?? path.resolve('artifacts/atlas-provenance-attestation.v1.json');
  const outPath = process.argv[3] ?? path.resolve('artifacts/atlas-coverage-gate.v1.json');
  const bundlePath = process.argv[4] ?? path.resolve('fixtures/native-frame-bundles/atlas-captures.v1.json');
  const capValPath = process.argv[5] ?? path.resolve('artifacts/atlas-capture-validation.v1.json');

  const att = JSON.parse(fs.readFileSync(attPath, 'utf8'));
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const captureValidation = buildCaptureValidationReport(bundle);
  fs.mkdirSync(path.dirname(capValPath), { recursive: true });
  fs.writeFileSync(capValPath, `${JSON.stringify(captureValidation, null, 2)}\n`, 'utf8');

  const report = buildCoverageGate(att, captureValidation);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (!report.aggregate.gate_pass) {
    const failed = report.exercises.find((e) => !e.gate_pass);
    console.error(`coverage-gate-failed: ${failed.exercise} -> ${failed.reasons.join(',')}`);
    console.error(`wrote ${capValPath}`);
    console.error(`wrote ${outPath}`);
    process.exit(1);
  }

  console.log(`coverage-gate-pass: ${report.aggregate.passed_exercises}/${report.aggregate.required_exercises}`);
  console.log(`wrote ${capValPath}`);
  console.log(`wrote ${outPath}`);
}
